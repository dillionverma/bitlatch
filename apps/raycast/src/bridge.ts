import type { LauncherRequest } from '@latch/shared/protocol';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

const MAX_RESPONSE = 1024 * 1024;
type Pending = {
  finish: (error?: Error, value?: unknown) => void;
  done: boolean;
};
let host: ChildProcessWithoutNullStreams | undefined;
let hostPath = '';
let output = Buffer.alloc(0);
let pending: Pending[] = [];

function closeHost(error: Error, source = host) {
  if (source !== host) return;
  const previous = host;
  host = undefined;
  output = Buffer.alloc(0);
  for (const entry of pending) entry.finish(error);
  pending = [];
  previous?.kill();
}

function requestThroughHost<T>(
  path: string,
  request: LauncherRequest,
  signal?: AbortSignal,
): Promise<T> {
  if (!host || hostPath !== path) {
    if (host) closeHost(new Error('Bitlatch connection changed. Try again.'));
    hostPath = path;
    const child = spawn(path, ['--raycast'], {
      stdio: 'pipe',
      windowsHide: true,
      env: { PATH: '/usr/bin:/bin', HOME: homedir() },
    });
    host = child;
    child.stderr.resume();
    child.on('error', () => closeHost(new Error('Open the updated Bitlatch app first.'), child));
    child.on('exit', () => closeHost(new Error('Bitlatch disconnected.'), child));
    child.stdin.on('error', () => closeHost(new Error('Bitlatch disconnected.'), child));
    child.stdout.on('data', (chunk: Buffer) => {
      if (host !== child) return;
      output = Buffer.concat([output, chunk]);
      while (output.length >= 4) {
        const size = output.readUInt32LE(0);
        if (size > MAX_RESPONSE) {
          closeHost(new Error('Bitlatch response is too large.'));
          return;
        }
        if (output.length < size + 4) break;
        const body = output.subarray(4, size + 4);
        output = output.subarray(size + 4);
        const entry = pending.shift();
        if (!entry) {
          closeHost(new Error('Unexpected Bitlatch response.'));
          return;
        }
        try {
          const result = JSON.parse(body.toString());
          if (result.ok === true) entry.finish(undefined, result.value);
          else
            entry.finish(
              new Error(
                typeof result.error === 'string' ? result.error : 'Bitlatch request failed.',
              ),
            );
        } catch {
          entry.finish(new Error('Invalid Bitlatch response.'));
        }
      }
      if (output.length > MAX_RESPONSE + 4) closeHost(new Error('Bitlatch response is too large.'));
    });
  }
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Request cancelled.'));
      return;
    }
    const body = Buffer.from(JSON.stringify(request));
    if (body.length > MAX_RESPONSE) {
      reject(new Error('Bitlatch request is too large.'));
      return;
    }
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length);
    let timer: ReturnType<typeof setTimeout>;
    const entry: Pending = {
      done: false,
      finish(error, value) {
        if (entry.done) return;
        entry.done = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(value as T);
      },
    };
    const abort = () => entry.finish(new Error('Request cancelled.'));
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => closeHost(new Error('Bitlatch did not respond.')), 120_000);
    pending.push(entry);
    host!.stdin.write(Buffer.concat([header, body]));
  });
}

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
  let config: { socketPath: string; token: string; hostPath?: string };
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
  if (config.hostPath) return requestThroughHost<T>(config.hostPath, request, signal);
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
    socket.setTimeout(request.type === 'biometricUnlock' ? 120_000 : 5000, () =>
      finish(new Error('Bitlatch did not respond. Reopen Bitlatch.')),
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
