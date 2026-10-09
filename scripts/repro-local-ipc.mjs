import { readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { isAbsolute, join } from 'node:path';

const dataDir = process.argv[2];
if (!dataDir || !isAbsolute(dataDir))
  throw new Error('Pass the absolute data directory of a running signed fixture.');
const syntheticId = '00000000-0000-4000-8000-000000000001';
const channels = [
  {
    name: 'browser fill',
    file: join(dataDir, 'bridge.json'),
    request: { type: 'fill', id: syntheticId, url: 'https://example.invalid/' },
  },
  {
    name: 'raycast copy',
    file: join(dataDir, 'raycast-bridge.json'),
    request: { type: 'copy', id: syntheticId, field: 'password' },
  },
];
if (process.env.LATCH_AUTOFILL_DIR)
  channels.push({
    name: 'autofill assertion',
    file: join(process.env.LATCH_AUTOFILL_DIR, 'autofill.json'),
    request: {
      type: 'assert',
      id: syntheticId,
      rpId: 'example.invalid',
      credentialId: 'AA',
      clientDataHash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      userVerified: true,
    },
  });

for (const channel of channels) {
  const config = JSON.parse(await readFile(channel.file, 'utf8'));
  const socketPath = config.socketPath ?? join(process.env.LATCH_AUTOFILL_DIR, 'autofill.sock');
  const result = await new Promise((resolve) => {
    const socket = createConnection(socketPath);
    socket.setTimeout(3000, () => socket.destroy(new Error('timeout')));
    socket.on('connect', () =>
      socket.write(JSON.stringify({ token: config.token, request: channel.request }) + '\n'),
    );
    socket.on('data', () => {
      socket.destroy();
      resolve('accepted');
    });
    socket.on('end', () => resolve('rejected'));
    socket.on('error', (error) =>
      resolve(error.code === 'ECONNRESET' ? 'rejected' : `unavailable: ${error.code ?? 'error'}`),
    );
  });
  console.log(`${channel.name}: ${result}`);
  if (result !== 'rejected') process.exitCode = 1;
}
