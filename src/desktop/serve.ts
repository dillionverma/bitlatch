import { spawn, type ChildProcess } from 'node:child_process';
import { connect, createServer, type Socket } from 'node:net';
import { Agent, request as httpRequest, type ClientRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliError, type CliOptions, type CliPort, type RunOptions } from './cli';
import { UserError } from '../shared/protocol';

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

  constructor(
    private readonly cold: CliPort,
    private readonly options: CliOptions,
  ) {}

  async run(args: string[], options: RunOptions = {}): Promise<string> {
    const route = routeFor(args, options);
    // Signing in, locking and signing out rewrite the data directory the
    // server is holding open, so they get it to themselves. Unlocking is the
    // exception: the server can do it, which saves starting a second CLI.
    if (!route || (!options.session && !route.unlocks)) {
      await this.stop();
      return this.cold.run(args, options);
    }
    try {
      await this.ensureRunning(route.unlocks ? undefined : options.session);
    } catch {
      return this.cold.run(args, options);
    }
    try {
      // What the vault held before a sync, so a half-loaded reply is spotted.
      const known = route.syncs ? await this.count() : 0;
      const output = await this.send(route);
      if (route.unlocks) {
        if (!output) throw new Error('The vault server unlocked without returning a key.');
        // The server now holds this key, so later calls must not restart it.
        this.session = output;
      }
      if (route.settles) await this.settle(output);
      if (route.syncs) await this.settleSync(known);
      if (route.removes) await this.settleListing(route.removes, false);
      if (route.restores) await this.settleListing(route.restores, true);
      return output;
    } catch (error) {
      // A verdict from the server stands. A broken connection does not.
      if (error instanceof UserError) throw error;
      await this.stop();
      return this.cold.run(args, options);
    }
  }

  cancel() {
    void this.stop().catch(() => undefined);
    this.cold.cancel();
  }

  stop() {
    this.stopping ??= this.shutdown().finally(() => {
      this.stopping = undefined;
    });
    return this.stopping;
  }

  /** `undefined` takes whatever server is already running, used when unlocking. */
  private async ensureRunning(session: string | undefined) {
    if (session !== undefined) {
      if (this.session !== session) await this.stop();
      this.session = session;
    }
    const starting = (this.starting ??= this.start(this.session));
    try {
      await starting;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  private async start(session: string) {
    const { ours, theirs } = await socketPair();
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
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe', theirs],
        env: {
          PATH: process.env.PATH ?? '',
          HOME: homedir(),
          TMPDIR: tmpdir(),
          LANG: 'en_US.UTF-8',
          ELECTRON_RUN_AS_NODE: '1',
          BITWARDENCLI_APPDATA_DIR: this.options.dataDir,
          BW_NOINTERACTION: 'true',
          BW_SESSION: session,
          ...(process.env.NODE_EXTRA_CA_CERTS
            ? { NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS }
            : {}),
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
    // Reading the vault proves it is unlocked and decrypted, which a status
    // check does not, and it leaves the items loaded for the first real call.
    // A server started to perform an unlock has no vault to read yet.
    await this.send(session ? ITEMS : STATUS, START_TIMEOUT_MS);
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
    const abandon = new Promise<void>((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS));
    await Promise.race([exited, abandon]);
    clearTimeout(insist);
  }

  /**
   * Waits for a write to become visible to reads. Every one-shot CLI run
   * re-read the data directory, so a save was always visible to the next
   * command. The warm server keeps the vault in memory and can still answer a
   * read from a snapshot taken just before the write landed.
   */
  private async settle(saved: string) {
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
      try {
        const current = JSON.parse(await this.send(route)) as SavedCipher;
        if (current?.id === written.id && current.revisionDate === written.revisionDate) return;
      } catch {
        /* Still catching up, or gone again. Either way the wait below decides. */
      }
      // The write itself succeeded, so a slow settle is not a failed save.
      if (Date.now() >= deadline) return;
      await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
    }
  }

  /**
   * Everything the vault holds, trash included. A sync empties both listings
   * while it reloads, so counting only one of them misses the case where the
   * other is the one with something to lose.
   */
  private async count() {
    try {
      const active = (JSON.parse(await this.send(ITEMS)) as unknown[]).length;
      const trashed = (JSON.parse(await this.send(TRASH)) as unknown[]).length;
      return active + trashed;
    } catch {
      return 0;
    }
  }

  /**
   * Waits for a sync to finish coming into view. The server empties its vault
   * while it reloads, so a read taken mid-sync can report no items at all.
   * A vault that never comes back gets a server that reloads it from disk.
   */
  /** Waits for a trashed or restored item to move, as a fresh CLI would see it. */
  private async settleListing(id: string, listed: boolean) {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    for (;;) {
      try {
        const items = JSON.parse(await this.send(ITEMS)) as { id?: string }[];
        if (items.some((item) => item.id === id) === listed) return;
      } catch {
        /* Mid-change reads can fail outright; the wait below decides. */
      }
      if (Date.now() >= deadline) return;
      await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
    }
  }

  private async settleSync(known: number) {
    if (known === 0) return;
    const deadline = Date.now() + SYNC_SETTLE_TIMEOUT_MS;
    for (;;) {
      try {
        if ((await this.count()) >= known) return;
      } catch {
        /* Mid-reload reads can fail outright; the wait below decides. */
      }
      if (Date.now() >= deadline) return this.stop();
      await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
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
              return reject(new Error('The vault server sent a reply Latch could not read.'));
            }
            if (envelope.success === false || (response.statusCode ?? 0) >= 400)
              return reject(cliError(envelope.message ?? '', false));
            resolve(route.pick(envelope.data));
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
const SYNC_SETTLE_TIMEOUT_MS = 2_000;
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
const STATUS: Route = { method: 'GET', path: '/status', pick: json };
const UNLOCK: Route = {
  method: 'POST',
  path: '/unlock',
  pick: (data) => String((data as { raw?: string } | null)?.raw ?? ''),
  unlocks: true,
};
const SYNC: Route = { method: 'POST', path: '/sync', pick: json, syncs: true };

/**
 * Maps the vault commands Latch runs often onto the server's REST API. Anything
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
 * only ever be reached by the end Latch keeps.
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
