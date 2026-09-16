import { spawn, type ChildProcess } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { mkdir } from 'node:fs/promises';
import { UserError } from '../shared/protocol';

export interface CliOptions {
  dataDir: string;
  executable: string;
  script?: string;
}

export interface RunOptions {
  session?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  input?: string;
}

export interface CliPort {
  run(args: string[], options?: RunOptions): Promise<string>;
  cancel(): void;
}

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 60_000;

export class BitwardenCli implements CliPort {
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private child?: ChildProcess;

  constructor(private readonly options: CliOptions) {}

  cancel() {
    this.generation += 1;
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
      const child = spawn(
        this.options.executable,
        [...(this.options.script ? [this.options.script] : []), ...args, '--nointeraction'],
        {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            PATH: process.env.PATH ?? '',
            HOME: homedir(),
            TMPDIR: tmpdir(),
            LANG: 'en_US.UTF-8',
            ELECTRON_RUN_AS_NODE: '1',
            BITWARDENCLI_APPDATA_DIR: this.options.dataDir,
            BW_NOINTERACTION: 'true',
            BW_SESSION: options.session ?? '',
            LATCH_MASTER_PASSWORD: options.password ?? '',
            BW_CLIENTID: options.clientId ?? '',
            BW_CLIENTSECRET: options.clientSecret ?? '',
            ...(process.env.NODE_EXTRA_CA_CERTS
              ? { NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS }
              : {}),
          },
        },
      );
      this.child = child;
      let stdout = '';
      let stderr = '';
      let outputBytes = 0;
      let overflow = false;
      const timer = setTimeout(() => child.kill('SIGKILL'), COMMAND_TIMEOUT_MS);
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
      });
      child.stdin.on('error', () => undefined);
      child.on('error', () =>
        reject(
          new UserError(
            'The Bitwarden CLI could not start. Check its installation, then restart Latch.',
          ),
        ),
      );
      child.on('close', (code) => {
        clearTimeout(timer);
        if (this.child === child) this.child = undefined;
        if (code === 0 && !overflow) resolve(stdout.trim());
        else reject(cliError(stderr || stdout, overflow));
        stdout = '';
        stderr = '';
      });
      child.stdin.end(options.input ?? '');
    });
  }
}

function cliError(output: string, overflow: boolean) {
  if (overflow) return new UserError('This vault is too large for the current preview.');
  if (/invalid master password|invalid password|username or password is incorrect/i.test(output)) {
    return new UserError('That password did not unlock the vault. Please try again.');
  }
  if (/two.?step|two.?factor|captcha|bot|verification|api key|client_secret/i.test(output)) {
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
