import {
  spawn,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
  type StdioOptions,
} from 'node:child_process';
import type { Writable } from 'node:stream';
import { homedir, tmpdir } from 'node:os';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { UserError } from '@latch/shared/protocol';
import type { TwoStepMethod } from '@latch/shared/types';
import { BOOTSTRAP_MARKER, type BootstrapPayload, type SecretName } from '../cli-bootstrap/payload';

export interface CliOptions {
  dataDir: string;
  executable: string;
  script?: string;
  /** The CLI preload that takes secrets over a pipe; see `spawnCli`. */
  bootstrap: string;
}

type CliSecrets = Partial<Record<SecretName, string | undefined>>;

/**
 * Starts the CLI. Any process running as this user can read a child's starting
 * environment with `ps -E`, so secrets never go there: they travel over an extra
 * pipe to the bootstrap, which hands them to the CLI inside its process.
 */
export function spawnCli(
  options: CliOptions,
  args: string[],
  env: NodeJS.ProcessEnv,
  secrets: CliSecrets,
  stdio: Extract<StdioOptions, unknown[]>,
  probe = false,
): ChildProcess {
  const values = Object.fromEntries(
    Object.entries(secrets).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const fd = stdio.length;
  const child = spawn(
    options.executable,
    options.script ? [options.bootstrap, options.script, ...args] : args,
    {
      shell: false,
      windowsHide: true,
      stdio: [...stdio, 'pipe'],
      env: {
        ...env,
        LATCH_SECRET_FD: String(fd),
        ...(options.script
          ? {}
          : { NODE_OPTIONS: `--require ${JSON.stringify(options.bootstrap)}` }),
      },
    },
  );
  const channel = child.stdio[fd] as Writable;
  channel.on('error', () => undefined);
  channel.end(
    JSON.stringify({ env: values, ...(probe ? { probe: true } : {}) } satisfies BootstrapPayload),
  );
  return child;
}

/** Whether this CLI runs the bootstrap; a standalone binary may ignore NODE_OPTIONS. */
export function bootstrapRuns(options: CliOptions) {
  return new Promise<boolean>((settle) => {
    const child = spawnCli(
      options,
      ['--version'],
      cliEnvironment(options.dataDir),
      {},
      ['ignore', 'pipe', 'ignore'],
      true,
    );
    let output = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => (output = (output + chunk).slice(0, 256)));
    child.on('error', () => settle(false));
    child.on('close', () => {
      clearTimeout(timer);
      settle(output === BOOTSTRAP_MARKER);
    });
  });
}

/** Only the environment needed by the CLI, without inherited secrets or Node hooks. */
export function cliEnvironment(dataDir: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '',
    HOME: homedir(),
    TMPDIR: tmpdir(),
    LANG: 'en_US.UTF-8',
    ELECTRON_RUN_AS_NODE: '1',
    BITWARDENCLI_APPDATA_DIR: dataDir,
    ...(process.platform === 'win32'
      ? {
          SystemRoot: process.env.SystemRoot,
          USERPROFILE: homedir(),
          APPDATA: process.env.APPDATA,
          LOCALAPPDATA: process.env.LOCALAPPDATA,
          TEMP: tmpdir(),
          TMP: tmpdir(),
        }
      : {}),
    ...(process.env.NODE_EXTRA_CA_CERTS
      ? { NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS }
      : {}),
  };
}

/** A question the CLI asks while it runs interactively. */
export type CliPrompt =
  | { kind: 'two-step-code' }
  | { kind: 'two-step-method'; methods: TwoStepMethod[] }
  | { kind: 'new-device-code' }
  | { kind: 'unknown' };

export interface RunOptions {
  session?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  input?: string;
  /**
   * Lets the CLI ask questions and types the answers for it. Resolve with the
   * text to send, or with undefined to abandon the command. Without a handler
   * the CLI runs non-interactively and never prompts.
   */
  prompt?: (prompt: CliPrompt) => Promise<string | undefined>;
}

export interface CliPort {
  run(args: string[], options?: RunOptions): Promise<string>;
  cancel(): void;
  /** Releases anything held between commands, such as a warm vault server. */
  stop?(): Promise<void>;
  /** Prepare a worker without unlocking or retaining a vault key. */
  prepare?(): Promise<void>;
  /** Cancel pending work and lock, retaining only an idle, locked worker. */
  lock?(): Promise<void>;
  /** Checks the master password without touching the running session. */
  verifyPassword?(password: string): Promise<boolean>;
}

/** Bitwarden rejected a two-step or new-device verification code. */
export class CodeRejectedError extends UserError {}

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 60_000;
const ANSWER_TIMEOUT_MS = 5 * 60_000;
const LIST_RENDER_MS = 200;
const TIMED_OUT = Symbol('timed out');
const ANSI_SEQUENCE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g');

const WRONG_PASSWORD = /decryption operation failed|invalid master password/i;
/** Nothing listens on the discard port, so every request from the CLI fails at once. */
const OFFLINE_PROXY = 'http://127.0.0.1:9';

/** Removes password-check copies a crash left behind; they hold encrypted account state. */
export async function removeVerifyCopies(dataDir: string) {
  const parent = dirname(dataDir);
  const entries = await readdir(parent).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((name) => /^verify-[A-Za-z0-9]{6}$/.test(name))
      .map((name) => rm(join(parent, name), { recursive: true, force: true })),
  );
}

export class BitwardenCli implements CliPort {
  private verifying?: ChildProcess;
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private child?: ChildProcess;
  private abandon?: (error: UserError) => void;

  constructor(private readonly options: CliOptions) {}

  /**
   * `bw unlock` replaces the session key before it checks the password, so it
   * runs against a private copy of the CLI's state. The copy's new session key
   * is discarded with the copy; the running session never changes.
   */
  async verifyPassword(password: string): Promise<boolean> {
    for (let attempt = 0; ; attempt++) {
      const directory = await mkdtemp(join(dirname(this.options.dataDir), 'verify-'));
      try {
        await copyFile(join(this.options.dataDir, 'data.json'), join(directory, 'data.json'));
        const { code, stderr } = await this.unlockCopy(directory, password);
        if (code === 0) return true;
        if (WRONG_PASSWORD.test(stderr)) return false;
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
      // The copy can catch the CLI mid-write; one more try reads a settled file.
      // A copy that needs an account migration fails offline until a real unlock runs it.
      if (attempt)
        throw new UserError(
          'Could not check your master password. Lock Bitlatch, unlock it, and try again.',
        );
    }
  }

  private unlockCopy(directory: string, password: string) {
    return new Promise<{ code: number | null; stderr: string }>((settle) => {
      const child = spawnCli(
        { ...this.options, dataDir: directory },
        ['unlock', '--passwordenv', 'LATCH_MASTER_PASSWORD', '--raw', '--nointeraction'],
        {
          ...cliEnvironment(directory),
          BW_NOINTERACTION: 'true',
          // Unlock can run account migrations that write to the server, such as
          // a key rotation. A dead proxy keeps the copy offline so it never can.
          https_proxy: OFFLINE_PROXY,
          http_proxy: OFFLINE_PROXY,
        },
        { LATCH_MASTER_PASSWORD: password },
        ['ignore', 'ignore', 'pipe'],
      );
      this.verifying = child;
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), COMMAND_TIMEOUT_MS);
      child.stderr!.setEncoding('utf8');
      child.stderr!.on('data', (chunk: string) => (stderr = (stderr + chunk).slice(-4_096)));
      child.on('error', () => settle({ code: null, stderr }));
      child.on('close', (code) => {
        clearTimeout(timer);
        if (this.verifying === child) this.verifying = undefined;
        settle({ code, stderr });
      });
    });
  }

  cancel() {
    this.verifying?.kill('SIGKILL');
    this.generation += 1;
    this.abandon?.(new UserError('Vault locked. Try again after unlocking.'));
    this.child?.kill('SIGKILL');
  }

  run(args: string[], options: RunOptions = {}): Promise<string> {
    const generation = this.generation;
    const task = this.queue.then(async () => {
      if (generation !== this.generation)
        throw new UserError('Vault locked. Try again after unlocking.');
      await mkdir(this.options.dataDir, { recursive: true, mode: 0o700 });
      if (generation !== this.generation)
        throw new UserError('Vault locked. Try again after unlocking.');
      return this.execute(args, options);
    });
    this.queue = task.catch(() => undefined);
    return task;
  }

  private execute(args: string[], options: RunOptions) {
    return new Promise<string>((resolve, reject) => {
      const interactive = Boolean(options.prompt);
      const child = spawnCli(
        this.options,
        [...args, ...(interactive ? [] : ['--nointeraction'])],
        {
          ...cliEnvironment(this.options.dataDir),
          BW_NOINTERACTION: interactive ? 'false' : 'true',
        },
        {
          BW_SESSION: options.session,
          LATCH_MASTER_PASSWORD: options.password,
          BW_CLIENTID: options.clientId,
          BW_CLIENTSECRET: options.clientSecret,
        },
        ['pipe', 'pipe', 'pipe'],
      ) as ChildProcessWithoutNullStreams;
      let stdout = '';
      let stderr = '';
      let outputBytes = 0;
      let overflow = false;
      let abandoned: UserError | undefined;
      let timer: NodeJS.Timeout | undefined;
      let answerTimer: NodeJS.Timeout | undefined;
      const abandon = (error: UserError) => {
        abandoned ??= error;
        child.kill('SIGKILL');
      };
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(
          () => abandon(new UserError('Bitwarden took too long to respond. Please try again.')),
          COMMAND_TIMEOUT_MS,
        );
      };
      this.child = child;
      this.abandon = abandon;
      arm();

      // The CLI prints questions to stderr. Recognize each once, pause the
      // command timer while the user answers, then type the answer on stdin.
      let promptOutput = '';
      let waiting = false;
      const handled = new Set<CliPrompt['kind']>();
      const ask = async (prompt: CliPrompt) => {
        const answer = await Promise.race([
          options.prompt!(prompt).catch(() => undefined),
          new Promise<typeof TIMED_OUT>((settle) => {
            answerTimer = setTimeout(() => settle(TIMED_OUT), ANSWER_TIMEOUT_MS);
          }),
        ]);
        clearTimeout(answerTimer);
        if (child.exitCode !== null || child.signalCode !== null) return;
        if (answer === TIMED_OUT)
          return abandon(new UserError('Sign-in timed out. Please try again.'));
        if (answer === undefined) return abandon(new UserError('Sign-in canceled.'));
        promptOutput = '';
        waiting = false;
        child.stdin.write(`${answer}\n`);
        arm();
      };
      const watch = (chunk: string) => {
        if (!interactive) return;
        promptOutput = (promptOutput + stripAnsi(chunk)).slice(-8_192);
        if (waiting) return;
        const prompt = detectPrompt(promptOutput, handled);
        if (!prompt) return;
        waiting = true;
        handled.add(prompt.kind);
        clearTimeout(timer);
        if (prompt.kind !== 'two-step-method') return void ask(prompt);
        // The list of methods renders just after its title; let it finish before reading it.
        setTimeout(() => void ask(detectPrompt(promptOutput) ?? prompt), LIST_RENDER_MS);
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        outputBytes += Buffer.byteLength(chunk);
        if (outputBytes > MAX_OUTPUT_BYTES) {
          overflow = true;
          child.kill('SIGKILL');
        } else stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        if (stderr.length < 16_384) stderr += chunk;
        watch(chunk);
      });
      child.stdin.on('error', () => undefined);
      child.on('error', () =>
        reject(
          new UserError(
            'The Bitwarden CLI could not start. Check its installation, then restart Bitlatch.',
          ),
        ),
      );
      child.on('close', (code) => {
        clearTimeout(timer);
        clearTimeout(answerTimer);
        if (this.child === child) {
          this.child = undefined;
          this.abandon = undefined;
        }
        if (abandoned) reject(abandoned);
        else if (code === 0 && !overflow) resolve(stdout.trim());
        else reject(cliError(stderr || stdout, overflow));
        stdout = '';
        stderr = '';
      });
      if (!interactive) child.stdin.end(options.input ?? '');
    });
  }
}

const KNOWN_QUESTIONS = {
  'new-device-code': /New device verification required/,
  'two-step-method': /Two-step login method:/,
  'two-step-code': /Two-step login code:/,
} as const;

/** Finds the first question in the CLI's terminal output that has not been answered yet. */
export function detectPrompt(output: string, handled = new Set<CliPrompt['kind']>()) {
  const text = stripAnsi(output);
  const prompts: CliPrompt[] = [];
  if (KNOWN_QUESTIONS['new-device-code'].test(text)) prompts.push({ kind: 'new-device-code' });
  if (KNOWN_QUESTIONS['two-step-method'].test(text))
    prompts.push({ kind: 'two-step-method', methods: listedMethods(text) });
  if (KNOWN_QUESTIONS['two-step-code'].test(text)) prompts.push({ kind: 'two-step-code' });
  // Any other question is one Bitlatch cannot answer. Echoes of answered
  // questions are still recognized, so they never count as unknown.
  const questions = text.match(/(^|\n)\? [^\n]*/g) ?? [];
  if (
    questions.some((line) => !Object.values(KNOWN_QUESTIONS).some((pattern) => pattern.test(line)))
  )
    prompts.push({ kind: 'unknown' });
  return prompts.find((prompt) => !handled.has(prompt.kind));
}

function listedMethods(text: string) {
  const list = text.slice(text.indexOf('Two-step login method:'));
  const methods: TwoStepMethod[] = [];
  if (/Authenticator/i.test(list)) methods.push('authenticator');
  if (/Yubi/i.test(list)) methods.push('yubikey');
  if (/\bEmail\b/.test(list)) methods.push('email');
  return methods;
}

function stripAnsi(text: string) {
  return text.replace(ANSI_SEQUENCE, '');
}

export function cliError(rawOutput: string, overflow: boolean) {
  // Drop echoed questions so the answer is judged on the CLI's verdict alone.
  const output = stripAnsi(rawOutput).replace(/^\? .*$/gm, '');
  if (overflow) return new UserError('This vault is too large for the current preview.');
  if (
    /invalid totp|token is invalid|invalid two-step|two-step token|invalid (email or )?verification code/i.test(
      output,
    )
  )
    return new CodeRejectedError('That code did not work. Check it and try again.');
  if (/invalid master password|invalid password|username or password is incorrect/i.test(output)) {
    return new UserError('That password did not unlock the vault. Please try again.');
  }
  // Bitwarden refuses a write whose revision is older than the stored item.
  if (/last known revision|revision date|has been modified|out of date|conflict/i.test(output))
    return new UserError('This item changed elsewhere. Sync, reopen it, and try again.');
  if (/rate limit/i.test(output))
    return new UserError('Too many sign-in attempts. Wait a minute, then try again.');
  if (/no providers available/i.test(output))
    return new UserError(
      'The Bitwarden CLI cannot use your two-step method, such as a WebAuthn security key or Duo. Add an authenticator app in the web vault, or use Personal API key sign-in.',
    );
  if (/code is required|no provider selected/i.test(output))
    return new UserError(
      'Bitwarden asked for a verification code that Bitlatch could not collect. Try again, or use Personal API key sign-in.',
    );
  if (/two.?step|two.?factor|captcha|\bbot\b|verification|api key|client_secret/i.test(output)) {
    return new UserError(
      'Bitwarden requires additional verification. Use Personal API key sign-in below, then your master password.',
    );
  }
  if (/fetch|ENOTFOUND|ECONNREFUSED|network|ETIMEDOUT|connect/i.test(output)) {
    return new UserError(
      'Could not reach your Bitwarden server. Check your connection and server address.',
    );
  }
  if (/not logged in|unauthorized|invalid_grant|expired/i.test(output)) {
    return new UserError('Your session has expired. Sign out and sign in again.');
  }
  return new UserError(
    'Bitwarden could not complete the request. Check your details and try again.',
  );
}
