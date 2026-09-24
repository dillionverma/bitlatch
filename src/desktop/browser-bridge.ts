import { createServer, type Server, type Socket } from 'node:net';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { safely, UserError } from '../shared/protocol';
import type { ZodType } from 'zod';

import { FIREFOX_EXTENSION_ID } from '../shared/browser-targets';
import { NATIVE_HOST, MAX_MESSAGE_BYTES } from './native-config';

export interface BridgeOptions<Request> {
  channel?: 'raycast' | 'safari';
  socketDirectory?: string;
  schema: ZodType<Request>;
  dataDir: string;
  extensionId: string;
  executable: string;
  hostScript: string;
  handle: (request: Request) => unknown;
}

export class BrowserBridge<Request> {
  private server?: Server;
  private sockets = new Set<Socket>();
  private readonly token = randomBytes(32).toString('hex');
  readonly socketPath: string;

  constructor(private readonly options: BridgeOptions<Request>) {
    const name = createHash('sha256').update(options.dataDir).digest('hex').slice(0, 16);
    this.socketPath = options.socketDirectory
      ? join(options.socketDirectory, 'safari.sock')
      : join(tmpdir(), `latch-${options.channel ? `${options.channel}-` : ''}${name}.sock`);
    if (Buffer.byteLength(this.socketPath) >= 104)
      throw new UserError('Native socket path is too long.');
  }

  async start() {
    await mkdir(this.options.dataDir, { recursive: true, mode: 0o700 });
    await rm(this.socketPath, { force: true });
    this.server = createServer((socket) => this.accept(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.socketPath, resolve);
    });
    await chmod(this.socketPath, 0o600);
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
    await rm(this.socketPath, { force: true });
    await rm(
      join(
        this.options.dataDir,
        this.options.channel ? `${this.options.channel}-bridge.json` : 'bridge.json',
      ),
      { force: true },
    );
  }

  async install(root = homedir()) {
    if (this.options.channel)
      throw new UserError('Only the browser bridge can be installed in a browser.');
    const launcher = join(this.options.dataDir, 'latch-native-host');
    const configPath = join(this.options.dataDir, 'bridge.json');
    const script = `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec ${shellQuote(this.options.executable)} ${shellQuote(this.options.hostScript)} ${shellQuote(configPath)} ${shellQuote(this.options.extensionId)} "$@"\n`;
    await writeFile(launcher, script, { mode: 0o700 });
    await chmod(launcher, 0o700);
    const manifest = JSON.stringify(
      {
        name: NATIVE_HOST,
        description: 'Latch vault bridge',
        path: launcher,
        type: 'stdio',
        allowed_origins: [`chrome-extension://${this.options.extensionId}/`],
      },
      null,
      2,
    );
    for (const browser of [
      'Google/Chrome',
      'Google/Chrome for Testing',
      'Chromium',
      'Aside',
      'BraveSoftware/Brave-Browser',
      'Microsoft Edge',
      'Arc',
      'Vivaldi',
    ]) {
      const directory = join(root, 'Library/Application Support', browser, 'NativeMessagingHosts');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `${NATIVE_HOST}.json`), manifest, { mode: 0o600 });
    }
    const firefoxDirectory = join(root, 'Library/Application Support/Mozilla/NativeMessagingHosts');
    await mkdir(firefoxDirectory, { recursive: true });
    await writeFile(
      join(firefoxDirectory, `${NATIVE_HOST}.json`),
      JSON.stringify(
        {
          name: NATIVE_HOST,
          description: 'Latch vault bridge',
          path: launcher,
          type: 'stdio',
          allowed_extensions: [FIREFOX_EXTENSION_ID],
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    return this.options.extensionId;
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
          throw new UserError('Browser pairing failed. Reconnect in Latch.');
        const parsed = this.options.schema.safeParse(message.request);
        if (!parsed.success) throw new UserError('Unsupported browser request.');
        return this.options.handle(parsed.data);
      }).then((response) => socket.end(`${JSON.stringify(response)}\n`));
    });
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
