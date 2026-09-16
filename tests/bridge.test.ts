import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserBridge } from '../src/desktop/browser-bridge';

let directory: string;
let bridge: BrowserBridge;
afterEach(async () => {
  await bridge?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function start() {
  directory = await mkdtemp(join(tmpdir(), 'latch-bridge-test-'));
  let called = 0;
  bridge = new BrowserBridge({
    dataDir: directory,
    extensionId: 'a'.repeat(32),
    executable: '/usr/bin/false',
    hostScript: '/not-executed',
    handle: () => {
      called++;
      return 'locked';
    },
  });
  await bridge.start();
  const config = JSON.parse(await readFile(join(directory, 'bridge.json'), 'utf8')) as {
    token: string;
  };
  return { config, called: () => called };
}

function send(payload: unknown) {
  return new Promise<{ ok: boolean; value?: unknown; error?: string }>((resolve, reject) => {
    const socket = connect(bridge.socketPath);
    let output = '';
    socket.on('connect', () => socket.write(`${JSON.stringify(payload)}\n`));
    socket.on('data', (chunk) => {
      output += chunk.toString();
    });
    socket.on('end', () => resolve(JSON.parse(output)));
    socket.on('error', reject);
  });
}

describe('native messaging boundary', () => {
  it('rejects missing or forged pairing secrets before touching the vault', async () => {
    const instance = await start();
    expect((await send({ token: '0'.repeat(64), request: { type: 'status' } })).ok).toBe(false);
    expect((await send({ request: { type: 'status' } })).ok).toBe(false);
    expect(instance.called()).toBe(0);
    expect(await send({ token: instance.config.token, request: { type: 'status' } })).toEqual({
      ok: true,
      value: 'locked',
    });
    expect(instance.called()).toBe(1);
  });
  it('rejects a paired browser trying to read the full vault', async () => {
    const instance = await start();
    expect((await send({ token: instance.config.token, request: { type: 'items' } })).ok).toBe(
      false,
    );
    expect(instance.called()).toBe(0);
  });
  it('restricts socket and pairing-file access to the owner', async () => {
    await start();
    expect((await stat(bridge.socketPath)).mode & 0o777).toBe(0o600);
    expect((await stat(join(directory, 'bridge.json'))).mode & 0o777).toBe(0o600);
  });
});
