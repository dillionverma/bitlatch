import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { BitwardenCli, type CliOptions, type CliPort } from './cli';
import { WarmBitwardenCli } from './serve';
import { UserError } from '../shared/protocol';

export const ENGINE_SETUP_MESSAGE =
  'Install the official Bitwarden CLI with “brew install bitwarden-cli”, then restart Latch.';

/**
 * Puts a warm vault server in front of the one-shot CLI, so reads and writes
 * skip a CLI start. Set LATCH_DISABLE_SERVE=1 to run every command one-shot.
 */
function engineCli(options: CliOptions): CliPort {
  const cold = new BitwardenCli(options);
  return process.env.LATCH_DISABLE_SERVE === '1' ? cold : new WarmBitwardenCli(cold, options);
}

export async function localEngine(options: {
  dataDir: string;
}): Promise<{ cli: CliPort; setupError?: string }> {
  const candidates = [
    process.env.LATCH_BW_PATH,
    '/opt/homebrew/bin/bw',
    '/usr/local/bin/bw',
    `/etc/profiles/per-user/${userInfo().username}/bin/bw`,
    join(homedir(), '.nix-profile/bin/bw'),
    ...(process.env.PATH ?? '')
      .split(':')
      .filter(isAbsolute)
      .map((directory) => join(directory, 'bw')),
  ];
  for (const executable of candidates) {
    if (!executable || !isAbsolute(executable)) continue;
    try {
      await access(executable, constants.X_OK);
      return { cli: engineCli({ dataDir: options.dataDir, executable }) };
    } catch {
      /* Try the next standard installation path. */
    }
  }
  return {
    setupError: ENGINE_SETUP_MESSAGE,
    cli: {
      cancel() {},
      async run() {
        throw new UserError(ENGINE_SETUP_MESSAGE);
      },
    },
  };
}
