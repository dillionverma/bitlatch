import { readFile } from 'node:fs/promises';

export const NATIVE_HOST = 'app.latch.vault';
export const MAX_MESSAGE_BYTES = 65_536;

export async function readBridgeConfig(path: string) {
  const config = JSON.parse(await readFile(path, 'utf8')) as { socketPath: string; token: string };
  if (
    typeof config.socketPath !== 'string' ||
    typeof config.token !== 'string' ||
    config.token.length !== 64
  )
    throw new Error('Invalid bridge configuration');
  return config;
}
