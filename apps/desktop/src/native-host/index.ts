import { basename, isAbsolute } from 'node:path';
import { FIREFOX_EXTENSION_ID } from '@latch/shared/browser-targets';
import { createConnection } from 'node:net';
import { readBridgeConfig, MAX_MESSAGE_BYTES } from '../main/native-config';
import type { Result } from '@latch/shared/types';

const [configPath, extensionId, origin, callerArgument, ...extraArguments] = process.argv.slice(2);
const chromiumCaller =
  origin === `chrome-extension://${extensionId}/` &&
  (!callerArgument ||
    (process.platform === 'win32' && /^--parent-window=\d+$/.test(callerArgument)));
const firefoxCaller =
  callerArgument === FIREFOX_EXTENSION_ID &&
  typeof origin === 'string' &&
  isAbsolute(origin) &&
  basename(origin) === 'app.latch.vault.json';
if (!configPath || !extensionId || extraArguments.length || (!chromiumCaller && !firefoxCaller))
  process.exit(1);

let buffer = Buffer.alloc(0);
let sequence = Promise.resolve();
process.stdin.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const size = buffer.readUInt32LE(0);
    if (size > MAX_MESSAGE_BYTES) process.exit(1);
    if (buffer.length < size + 4) return;
    const payload = buffer.subarray(4, size + 4).toString();
    buffer = buffer.subarray(size + 4);
    sequence = sequence.then(async () => {
      let response: Result<unknown>;
      try {
        response = await forward(JSON.parse(payload));
      } catch {
        response = { ok: false, error: 'Open Bitlatch on your computer to connect your vault.' };
      }
      const body = Buffer.from(JSON.stringify(response));
      const header = Buffer.alloc(4);
      header.writeUInt32LE(body.length);
      process.stdout.write(Buffer.concat([header, body]));
    });
  }
});

process.stdin.on('end', () => {
  void sequence.then(() => process.exit(0));
});
process.stdout.on('error', () => process.exit(0));

async function forward(request: unknown): Promise<Result<unknown>> {
  const config = await readBridgeConfig(configPath!);
  return new Promise((resolve, reject) => {
    const socket = createConnection(config.socketPath);
    socket.setEncoding('utf8');
    let output = '';
    const unlocking =
      request !== null &&
      typeof request === 'object' &&
      'type' in request &&
      request.type === 'biometricUnlock';
    const writing =
      request !== null &&
      typeof request === 'object' &&
      'type' in request &&
      ['save', 'delete', 'restore', 'setFavorite', 'sync', 'commitCapture'].includes(
        String(request.type),
      );
    const readingTrash =
      request !== null &&
      typeof request === 'object' &&
      'type' in request &&
      request.type === 'browse' &&
      'query' in request &&
      request.query !== null &&
      typeof request.query === 'object' &&
      'scope' in request.query &&
      request.query.scope === 'trash';
    socket.setTimeout(unlocking || writing || readingTrash ? 120_000 : 8_000, () =>
      socket.destroy(new Error('Timed out')),
    );
    socket.on('connect', () =>
      socket.write(`${JSON.stringify({ token: config.token, request })}\n`),
    );
    socket.on('data', (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output) > MAX_MESSAGE_BYTES) {
        socket.destroy(new Error('Oversized response'));
        return;
      }
      if (!output.includes('\n')) return;
      try {
        resolve(JSON.parse(output.slice(0, output.indexOf('\n'))));
      } catch {
        reject(new Error('Invalid response'));
      }
      socket.destroy();
    });
    socket.on('error', reject);
    socket.on('end', () => {
      if (!output.includes('\n')) reject(new Error('Bridge disconnected'));
    });
  });
}
