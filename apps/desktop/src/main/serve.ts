import { spawn, type ChildProcess } from 'node:child_process';
import { connect, createServer, type Socket } from 'node:net';
import { Agent, request as httpRequest, type ClientRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliEnvironment, cliError, type CliOptions, type CliPort, type RunOptions } from './cli';
import { UserError } from '@latch/shared/protocol';
import { listingVersion, syncedVersions } from './sync-metadata';

/**
 * Keeps one unlocked `bw serve` process warm and speaks to it over HTTP, so a
 * read or a write costs a local round trip instead of a fresh CLI start.
 *
 * The server is reached through a single connected socket handed to it as a
 * file descriptor. It never listens on a port and leaves no socket file behind,
 * so nothing else on this Mac can reach the unlocked vault. Anything the server
 * cannot answer, and every command that changes which account is signed in,
 * falls back to a one-shot CLI run with the server stopped.
 */
export class WarmBitwardenCli implements CliPort {
  private child?: ChildProcess;
  private socket?: Socket;
  private agent?: Agent;
  private readonly inFlight = new Set<ClientRequest>();
  private session = '';
  private starting?: Promise<void>;
  private stopping?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private processGeneration = 0;
  private activeOperations = 0;

  constructor(
    private readonly cold: CliPort,
    private readonly options: CliOptions,
  ) {}

  run(args: string[], options: RunOptions = {}): Promise<string> {
    const generation = this.generation;
    const task = this.queue.then(async () => {
      ++this.activeOperations;
      try {
        return await this.execute(args, options, generation);
      } finally {
        --this.activeOperations;
      }
    });
    this.queue = task.catch(() => undefined);
    return task;
  }

  private assertCurrent(generation: number) {
    if (generation !== this.generation)
      throw new UserError('Vault locked. Try again after unlocking.');
  }

  private async execute(args: string[], options: RunOptions, generation: number) {
    this.assertCurrent(generation);
    const route = routeFor(args, options);
    if (!route || (!options.session && !route.unlocks && !route.status)) {
      await this.reset();
      this.assertCurrent(generation);
      const output = await this.cold.run(args, options);
      this.assertCurrent(generation);
      return output;
    }
    try {
      await this.ensureRunning(
        route.unlocks || route.status ? undefined : options.session,
        generation,
      );
    } catch {
      this.assertCurrent(generation);
      const output = await this.cold.run(args, options);
      this.assertCurrent(generation);
      return output;
    }
    this.assertCurrent(generation);
    try {
      const output = await this.send(route);
      this.assertCurrent(generation);
      if (route.unlocks) {
        if (!output) throw new Error('The vault server unlocked without returning a key.');
        this.session = output;
      }
      if (route.settles) await this.settle(output, generation);
      if (route.syncs) await this.settleSync(generation);
      if (route.removes) await this.settleListing(route.removes, false, generation);
      if (route.restores) await this.settleListing(route.restores, true, generation);
      this.assertCurrent(generation);
      return output;
    } catch (error) {
      this.assertCurrent(generation);
      if (error instanceof UserError) throw error;
      await this.reset();
      this.assertCurrent(generation);
      // Never replay a write whose reply was lost: it may already have succeeded.
      if (route.method !== 'GET' && !route.unlocks && !route.syncs)
        throw new UserError('Could not confirm the change. Sync your vault before trying again.');
      const output = await this.cold.run(args, options);
      this.assertCurrent(generation);
      return output;
    }
  }

  cancel() {
    ++this.generation;
    this.cold.cancel();
    void this.reset().catch(() => undefined);
  }

  async stop() {
    this.cancel();
    await this.reset();
  }

  lock(): Promise<void> {
    const reusable = Boolean(
      this.child && this.session && !this.activeOperations && !this.stopping && !this.inFlight.size,
    );
    const generation = ++this.generation;
    this.cold.cancel();
    const task = (async () => {
      if (reusable) {
        try {
          await this.send(LOCK);
          this.assertCurrent(generation);
          this.session = '';
          const status = JSON.parse(await this.send(STATUS)) as { status: string };
          this.assertCurrent(generation);
          if (status.status === 'locked') return;
        } catch {
          this.assertCurrent(generation);
        }
      }
      // An operation in progress must be terminated, never allowed to finish
      // unlocking or writing after the UI has locked.
      await this.reset();
      this.assertCurrent(generation);
      await this.cold.run(['lock']);
      this.assertCurrent(generation);
    })();
    this.queue = task.catch(() => undefined);
    return task;
  }

  /** Starts without a session key; only a locked worker may be prepared. */
  async prepare() {
    const status = JSON.parse(await this.run(['status'])) as { status: string };
    if (status.status !== 'locked') await this.stop();
  }

  private reset() {
    this.stopping ??= this.shutdown().finally(() => {
      this.stopping = undefined;
    });
    return this.stopping;
  }

  private async ensureRunning(session: string | undefined, generation: number) {
    await this.stopping;
    this.assertCurrent(generation);
    if (session !== undefined) {
      if (this.session !== session) await this.reset();
      this.assertCurrent(generation);
      this.session = session;
    }
    const starting = (this.starting ??= this.start(this.session));
    try {
      await starting;
    } catch (error) {
      await this.reset();
      throw error;
    }
  }

  private async start(session: string) {
    const generation = this.processGeneration;
    const { ours, theirs } = await socketPair();
    if (generation !== this.processGeneration) {
      ours.destroy();
      theirs.destroy();
      throw new UserError('Vault locked. Try again after unlocking.');
    }
    const child = spawn(
      this.options.executable,
      [
        ...(this.options.script ? [this.options.script] : []),
        'serve',
        '--hostname',
        `fd+connected://${SERVE_FD}`,
        '--port',
        String(SERVE_PORT),
      ],
      {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe', theirs],
        env: {
          ...cliEnvironment(this.options.dataDir),
          BW_NOINTERACTION: 'true',
          BW_SESSION: session,
        },
      },
    );
    this.child = child;
    this.socket = ours;
    this.agent = new PinnedAgent(ours);
    running.add(child);
    // The server dup'd the descriptor during spawn; this end is no longer ours.
    theirs.destroy();
    child.stderr?.resume();
    const forget = () => this.forget(child);
    child.once('error', forget);
    child.once('exit', forget);
    ours.once('close', forget);
    // The first real listing verifies decryption. Probing with a full listing
    // here would decrypt and transfer the entire vault twice on session restore.
    await this.send(STATUS, START_TIMEOUT_MS);
  }

  /** Drops a server that died on its own, so the next call starts a fresh one. */
  private forget(child: ChildProcess) {
    running.delete(child);
    if (this.child !== child) return;
    this.socket?.destroy();
    this.child = undefined;
    this.socket = undefined;
    this.agent = undefined;
    this.starting = undefined;
    this.session = '';
  }

  private async shutdown() {
    ++this.processGeneration;
    const child = this.child;
    const socket = this.socket;
    this.child = undefined;
    this.socket = undefined;
    this.agent = undefined;
    this.starting = undefined;
    this.session = '';
    // Requests still waiting on the stopped server have to fail, not hang.
    for (const request of this.inFlight) {
      request.destroy(new Error('The vault server stopped.'));
    }
    this.inFlight.clear();
    socket?.destroy();
    if (!child) return;
    running.delete(child);
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    // Ask first, so it releases its hold on the data directory, then insist.
    child.kill('SIGTERM');
    const insist = setTimeout(() => child.kill('SIGKILL'), STOP_GRACE_MS);
    let deadline: NodeJS.Timeout | undefined;
    const abandon = new Promise<void>((resolve) => {
      deadline = setTimeout(resolve, STOP_TIMEOUT_MS);
    });
    await Promise.race([exited, abandon]);
    clearTimeout(insist);
    clearTimeout(deadline);
  }

  /**
   * Waits for a write to become visible to reads. Every one-shot CLI run
   * re-read the data directory, so a save was always visible to the next
   * command. The warm server keeps the vault in memory and can still answer a
   * read from a snapshot taken just before the write landed.
   */
  private async settle(saved: string, generation: number) {
    let written: SavedCipher;
    try {
      written = JSON.parse(saved) as SavedCipher;
    } catch {
      return;
    }
    const route = written?.id ? routeFor(['get', 'item', written.id]) : undefined;
    if (!route) return;
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    for (;;) {
      this.assertCurrent(generation);
      try {
        const current = JSON.parse(await this.send(route)) as SavedCipher;
        if (current?.id === written.id && current.revisionDate === written.revisionDate) return;
      } catch {
        this.assertCurrent(generation);
        /* Still catching up, or gone again. Either way the wait below decides. */
      }
      // The write itself succeeded, so a slow settle is not a failed save.
      if (Date.now() >= deadline) return;
      await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
    }
  }

  /** Waits for a trashed or restored item to move, as a fresh CLI would see it. */
  private async settleListing(id: string, listed: boolean, generation: number) {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    for (;;) {
      this.assertCurrent(generation);
      try {
        const items = JSON.parse(await this.send(ITEMS)) as { id?: string }[];
        if (items.some((item) => item.id === id) === listed) return;
      } catch {
        this.assertCurrent(generation);
        /* Mid-change reads can fail outright; the wait below decides. */
      }
      if (Date.now() >= deadline) return;
      await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
    }
  }

  private async settleSync(generation: number) {
    const expected = await syncedVersions(this.options.dataDir);
    this.assertCurrent(generation);
    if (expected) {
      const active = listingVersion(JSON.parse(await this.send(ITEMS)));
      const trash = listingVersion(JSON.parse(await this.send(TRASH)));
      this.assertCurrent(generation);
      if (active === expected.active && trash === expected.trash) return;
    }
    // A mismatched decrypted view can remain stale indefinitely. Reload from
    // the official CLI's saved cache immediately; never wait for an old count.
    const session = this.session;
    await this.reset();
    this.assertCurrent(generation);
    await this.ensureRunning(session, generation);
    if (expected) {
      const active = listingVersion(JSON.parse(await this.send(ITEMS)));
      const trash = listingVersion(JSON.parse(await this.send(TRASH)));
      this.assertCurrent(generation);
      if (active !== expected.active || trash !== expected.trash)
        throw new UserError(
          'Bitwarden could not finish loading the synced vault. Lock and unlock to try again.',
        );
    }
  }

  private send(route: Route, timeoutMs = REQUEST_TIMEOUT_MS) {
    const agent = this.agent;
    if (!agent) return Promise.reject(new Error('The vault server is not running.'));
    return new Promise<string>((succeed, fail) => {
      // Exactly one outcome per request, whoever gets there first.
      let settled = false;
      const resolve = (value: string) => {
        if (settled) return;
        settled = true;
        succeed(value);
      };
      const reject = (error: Error) => {
        if (settled) return;
        settled = true;
        fail(error);
      };
      const payload =
        route.body === undefined ? undefined : Buffer.from(JSON.stringify(route.body));
      const request = httpRequest(
        {
          agent,
          method: route.method,
          path: route.path,
          host: SERVE_HOST,
          port: SERVE_PORT,
          headers: {
            host: `${SERVE_HOST}:${SERVE_PORT}`,
            ...(payload
              ? { 'content-type': 'application/json', 'content-length': String(payload.length) }
              : {}),
          },
        },
        (response) => {
          let text = '';
          let bytes = 0;
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => {
            bytes += Buffer.byteLength(chunk);
            if (bytes > MAX_RESPONSE_BYTES) {
              request.destroy();
              reject(new UserError('This vault is too large for the current preview.'));
            } else text += chunk;
          });
          response.on('end', () => {
            let envelope: Envelope;
            try {
              envelope = JSON.parse(text) as Envelope;
            } catch {
              return reject(new Error('The vault server sent a reply Bitlatch could not read.'));
            }
            if (envelope.success === false || (response.statusCode ?? 0) >= 400)
              return reject(cliError(envelope.message ?? '', false));
            try {
              resolve(route.pick(envelope.data));
            } catch {
              reject(new Error('The vault server sent an invalid result.'));
            }
          });
        },
      );
      // A request can wait in the agent's queue without ever being given a
      // socket, where a socket timeout would never fire and the vault
      // operation behind it would never finish.
      const deadline = setTimeout(
        () => request.destroy(new Error('The vault server took too long to answer.')),
        timeoutMs,
      );
      this.inFlight.add(request);
      request.on('close', () => {
        clearTimeout(deadline);
        this.inFlight.delete(request);
        // Only reaches the caller if the request ended without an answer.
        reject(new Error('The vault server closed the request.'));
      });
      request.on('error', reject);
      request.end(payload);
    });
  }
}

interface SavedCipher {
  id?: string;
  revisionDate?: string | null;
}

interface Envelope {
  success?: boolean;
  data?: unknown;
  message?: string;
}

/** One call to the vault server, and how to read its reply as CLI output. */
interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  pick: (data: unknown) => string;
  /** Whether reads have to catch up with this call before it returns. */
  settles?: boolean;
  /** Whether this call reloads the whole vault, emptying it on the way. */
  syncs?: boolean;
  /** Status is available before unlocking. */
  status?: boolean;
  /** The id this call removes, which reads have to stop returning. */
  removes?: string;
  /** The id this call brings back, which reads have to start returning. */
  restores?: string;
  /** Whether this call opens a locked vault and hands back its session key. */
  unlocks?: boolean;
}

// `bw serve` binds nothing in descriptor mode, but it still checks the Host
// header against this name and port, so both ends have to agree on them.
const SERVE_HOST = 'localhost';
const SERVE_PORT = 8087;
const SERVE_FD = 3;
const START_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 60_000;
const SETTLE_TIMEOUT_MS = 5_000;
const SETTLE_INTERVAL_MS = 20;
const STOP_GRACE_MS = 2_000;
const STOP_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

/** Servers still alive, so a quit never leaves an unlocked vault behind. */
const running = new Set<ChildProcess>();
process.once('exit', () => {
  for (const child of running) child.kill('SIGKILL');
});

const json = (value: unknown) => JSON.stringify(value ?? null);
const listed = (data: unknown) => json((data as { data?: unknown } | null)?.data ?? []);

const ITEMS: Route = { method: 'GET', path: '/list/object/items', pick: listed };
const TRASH: Route = { method: 'GET', path: '/list/object/items?trash=true', pick: listed };
const STATUS: Route = {
  method: 'GET',
  path: '/status',
  status: true,
  pick: (data) => {
    const status = (data as { template?: { status?: string } } | null)?.template;
    if (!status || !['locked', 'unlocked', 'unauthenticated'].includes(status.status ?? ''))
      throw new Error('The vault server sent an invalid status.');
    return json(status);
  },
};
const LOCK: Route = { method: 'POST', path: '/lock', pick: json };
const UNLOCK: Route = {
  method: 'POST',
  path: '/unlock',
  pick: (data) => String((data as { raw?: string } | null)?.raw ?? ''),
  unlocks: true,
};
const SYNC: Route = { method: 'POST', path: '/sync', pick: json, syncs: true };

/**
 * Maps the vault commands Bitlatch runs often onto the server's REST API. Anything
 * not listed here keeps using a one-shot CLI run.
 */
export function routeFor(args: string[], options: RunOptions = {}): Route | undefined {
  if (options.prompt || options.clientId) return undefined;
  const [command, object, id] = args;
  // Unlocking is the only routed command that carries a master password.
  if (
    command === 'unlock' &&
    options.password &&
    args.includes('--passwordenv') &&
    args.includes('--raw')
  )
    return { ...UNLOCK, body: { password: options.password } };
  if (options.password) return undefined;
  if (args.length === 1 && command === 'status') return { ...STATUS };
  if (args.length === 1 && command === 'sync') return { ...SYNC };
  if (args.length === 2 && command === 'list' && object === 'items') return { ...ITEMS };
  if (args.length === 3 && command === 'list' && object === 'items' && args[2] === '--trash')
    return { ...TRASH };
  if (args.length === 3 && command === 'get' && object === 'item' && id)
    return { method: 'GET', path: `/object/item/${encodeURIComponent(id)}`, pick: json };
  if (args.length === 3 && command === 'restore' && object === 'item' && id)
    return {
      method: 'POST',
      path: `/restore/item/${encodeURIComponent(id)}`,
      pick: json,
      restores: id,
    };
  // Without --permanent this moves the item to Bitwarden's trash.
  if (args.length === 3 && command === 'delete' && object === 'item' && id)
    return {
      method: 'DELETE',
      path: `/object/item/${encodeURIComponent(id)}`,
      pick: json,
      removes: id,
    };
  const body = options.input ? decode(options.input) : undefined;
  if (body === undefined) return undefined;
  if (args.length === 2 && command === 'create' && object === 'item')
    return { method: 'POST', path: '/object/item', body, pick: json, settles: true };
  if (args.length === 3 && command === 'edit' && object === 'item' && id)
    return {
      method: 'PUT',
      path: `/object/item/${encodeURIComponent(id)}`,
      body,
      pick: json,
      settles: true,
    };
  return undefined;
}

function decode(input: string) {
  try {
    return JSON.parse(Buffer.from(input, 'base64').toString('utf8')) as unknown;
  } catch {
    return undefined;
  }
}

/** Sends every request over the one socket the vault server was handed. */
class PinnedAgent extends Agent {
  constructor(private readonly pinned: Socket) {
    super({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 });
  }
  override createConnection() {
    if (this.pinned.destroyed) throw new Error('The vault server connection closed.');
    return this.pinned;
  }
}

/**
 * Joins two sockets to each other and removes the directory that introduced
 * them. What is left has no port and no name on disk, so the vault server can
 * only ever be reached by the end Bitlatch keeps.
 */
async function socketPair() {
  const directory = await mkdtemp(join(tmpdir(), 'latch-serve-'));
  const path = join(directory, 's');
  const listener = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      listener.once('error', reject);
      listener.listen(path, resolve);
    });
    const accepted = new Promise<Socket>((resolve) => listener.once('connection', resolve));
    const ours = connect(path);
    await new Promise<void>((resolve, reject) => {
      ours.once('error', reject);
      ours.once('connect', resolve);
    });
    return { ours, theirs: await accepted };
  } finally {
    listener.close();
    await rm(directory, { recursive: true, force: true });
  }
}
