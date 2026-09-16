import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { BitwardenCli, type CliPort } from './cli';
import { UserError } from '../shared/protocol';

export const ENGINE_SETUP_MESSAGE =
  'Install the official Bitwarden CLI with “brew install bitwarden-cli”, then restart Latch.';

export async function localEngine(options: {
  dataDir: string;
  appPath: string;
  packaged: boolean;
}): Promise<{ cli: CliPort; setupError?: string }> {
  if (!options.packaged && process.env.LATCH_TEST_BUNDLED_CLI === '1') {
    return {
      cli: new BitwardenCli({
        dataDir: options.dataDir,
        executable: process.execPath,
        script: join(options.appPath, 'node_modules/@bitwarden/cli/build/bw.js'),
      }),
    };
  }
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
      return { cli: new BitwardenCli({ dataDir: options.dataDir, executable }) };
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
