import type { LauncherRequest } from '@latch/shared/protocol';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';

export interface VaultItem {
  id: string;
  name: string;
  username: string;
  website: string;
  iconUrl?: string;
  type: number;
}
export interface SearchResult {
  status: string;
  email?: string;
  canUseBiometrics?: boolean;
  items: VaultItem[];
}
export interface ItemDetail extends VaultItem {
  notes: string;
  hasPassword: boolean;
}
export type CopyField = Extract<LauncherRequest, { type: 'copy' }>['field'];

// Read the rotating token per request. Never persist vault data or secrets in Raycast.
export async function request<T = void>(
  request: LauncherRequest,
  signal?: AbortSignal,
): Promise<T> {
  let config: { socketPath: string; token: string };
  try {
    config = JSON.parse(
      await readFile(
        join(homedir(), 'Library/Application Support/Latch/raycast-bridge.json'),
        'utf8',
      ),
    );
    if (typeof config.socketPath !== 'string' || !/^[a-f0-9]{64}$/.test(config.token))
      throw new Error();
  } catch {
    throw new Error('Open the updated Bitlatch app first.');
  }
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const socket = createConnection(config.socketPath);
    let buffer = '';
    let finished = false;
    const finish = (error?: Error, value?: T) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', abort);
      socket.destroy();
      if (error) reject(error);
      else resolve(value as T);
    };
    const abort = () => finish(new Error('Request cancelled.'));
    signal?.addEventListener('abort', abort, { once: true });
    socket.setEncoding('utf8');
    socket.setTimeout(
      request.type === 'unlock' || request.type === 'biometricUnlock' ? 120_000 : 5000,
      () => finish(new Error('Bitlatch did not respond. Reopen Bitlatch.')),
    );
    socket.on('error', () => finish(new Error('Open the updated Bitlatch app first.')));
    socket.on('end', () => finish(new Error('Bitlatch disconnected.')));
    socket.on('connect', () =>
      socket.write(JSON.stringify({ token: config.token, request }) + '\n'),
    );
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 1024 * 1024)
        return finish(new Error('Bitlatch response is too large.'));
      if (!buffer.includes('\n')) return;
      try {
        const result = JSON.parse(buffer.slice(0, buffer.indexOf('\n')));
        if (result.ok === true) finish(undefined, result.value);
        else
          finish(
            new Error(typeof result.error === 'string' ? result.error : 'Bitlatch request failed.'),
          );
      } catch {
        finish(new Error('Invalid Bitlatch response.'));
      }
    });
  });
}
