import { createServer, type Server, type Socket } from 'node:net';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { safely, UserError } from '@latch/shared/protocol';
import type { ZodType } from 'zod';

import { MAX_MESSAGE_BYTES } from './native-config';

export interface LocalTransportOptions<Request> {
  channel?: 'raycast' | 'safari';
  socketDirectory?: string;
  schema: ZodType<Request>;
  dataDir: string;
  requestTimeout?: (request: Request) => number;
  handle: (request: Request) => unknown;
  responseGuard?: (request: Request) => () => void;
}

export class LocalTransport<Request> {
  private server?: Server;
  private sockets = new Set<Socket>();
  private readonly token = randomBytes(32).toString('hex');
  readonly socketPath: string;

  constructor(private readonly options: LocalTransportOptions<Request>) {
    const name = createHash('sha256').update(options.dataDir).digest('hex').slice(0, 16);
    const basename = `latch-${options.channel ? `${options.channel}-` : ''}${name}`;
    this.socketPath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\${basename}`
        : options.socketDirectory
          ? join(options.socketDirectory, 'safari.sock')
          : join(tmpdir(), `${basename}.sock`);
    if (process.platform !== 'win32' && Buffer.byteLength(this.socketPath) >= 104)
      throw new UserError('Native socket path is too long.');
  }

  async start() {
    await mkdir(this.options.dataDir, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') await rm(this.socketPath, { force: true });
    this.server = createServer((socket) => this.accept(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.socketPath, resolve);
    });
    if (process.platform !== 'win32') await chmod(this.socketPath, 0o600);
    await writeFile(
      join(
        this.options.dataDir,
        this.options.channel ? `${this.options.channel}-bridge.json` : 'bridge.json',
      ),
      JSON.stringify({ socketPath: this.socketPath, token: this.token }),
      { mode: 0o600 },
    );
  }

  async stop() {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
    if (process.platform !== 'win32') await rm(this.socketPath, { force: true });
    await rm(
      join(
        this.options.dataDir,
        this.options.channel ? `${this.options.channel}-bridge.json` : 'bridge.json',
      ),
      { force: true },
    );
  }

  private accept(socket: Socket) {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.setEncoding('utf8');
    socket.setTimeout(10_000, () => socket.destroy());
    let buffer = '';
    let processed = false;
    socket.on('data', (chunk) => {
      if (processed) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) {
        socket.destroy();
        return;
      }
      if (!buffer.includes('\n')) return;
      processed = true;
      let guard: (() => void) | undefined;
      void safely(async () => {
        const message: unknown = JSON.parse(buffer.slice(0, buffer.indexOf('\n')));
        buffer = '';
        if (
          !message ||
          typeof message !== 'object' ||
          !('token' in message) ||
          !('request' in message)
        )
          throw new UserError('Invalid bridge request.');
        const token =
          typeof message.token === 'string' ? Buffer.from(message.token) : Buffer.alloc(0);
        const expected = Buffer.from(this.token);
        if (token.length !== expected.length || !timingSafeEqual(token, expected))
          throw new UserError('Browser pairing failed. Restart Bitlatch and reload the extension.');
        const parsed = this.options.schema.safeParse(message.request);
        if (!parsed.success) throw new UserError('Unsupported browser request.');
        if (this.options.requestTimeout)
          socket.setTimeout(this.options.requestTimeout(parsed.data));
        guard = this.options.responseGuard?.(parsed.data);
        return this.options.handle(parsed.data);
      }).then((response) => {
        try {
          guard?.();
        } catch {
          response = { ok: false, error: 'Vault locked. Try again after unlocking.' };
        }
        let body = JSON.stringify(response);
        if (Buffer.byteLength(body) >= MAX_MESSAGE_BYTES)
          body = JSON.stringify({
            ok: false,
            error: 'This item is too large for the browser. Open it in the desktop app.',
          });
        if (!socket.destroyed) socket.end(`${body}\n`);
      });
    });
  }
}
