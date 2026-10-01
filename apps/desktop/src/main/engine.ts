import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { delimiter, dirname, extname, join, isAbsolute, resolve, sep } from 'node:path';
import { BitwardenCli, type CliOptions, type CliPort } from './cli';
import { WarmBitwardenCli } from './serve';
import { UserError } from '@latch/shared/protocol';

export const ENGINE_SETUP_MESSAGE =
  process.platform === 'darwin'
    ? 'Install the official Bitwarden CLI with “brew install bitwarden-cli”, then restart Bitlatch.'
    : 'Install the official Bitwarden CLI and add it to PATH, or set LATCH_BW_PATH to its full path, then restart Bitlatch.';

/**
 * Puts a warm vault server in front of the one-shot CLI, so reads and writes
 * skip a CLI start. Set LATCH_DISABLE_SERVE=1 to run every command one-shot.
 */
function engineCli(options: CliOptions): CliPort {
  const cold = new BitwardenCli(options);
  // Node cannot pass connected sockets to a child on Windows. Never replace
  // descriptor mode with a listening, unauthenticated bw serve port.
  return process.platform === 'win32' || process.env.LATCH_DISABLE_SERVE === '1'
    ? cold
    : new WarmBitwardenCli(cold, options);
}

export async function localEngine(options: {
  dataDir: string;
}): Promise<{ cli: CliPort; setupError?: string }> {
  const windows = process.platform === 'win32';
  const names = windows ? ['bw.exe', 'bw.cmd'] : ['bw'];
  const directories = windows
    ? [join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm')]
    : [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        `/etc/profiles/per-user/${userInfo().username}/bin`,
        join(homedir(), '.nix-profile/bin'),
        join(homedir(), '.local/bin'),
        '/usr/bin',
        '/bin',
      ];
  directories.push(...(process.env.PATH ?? '').split(delimiter));
  const candidates = new Set([
    process.env.LATCH_BW_PATH,
    ...directories
      .filter(isAbsolute)
      .flatMap((directory) => names.map((name) => join(directory, name))),
  ]);
  for (const executable of candidates) {
    if (!executable || !isAbsolute(executable)) continue;
    try {
      await access(executable, windows ? constants.R_OK : constants.X_OK);
      if (!(await stat(executable)).isFile()) continue;
      let cliOptions: CliOptions = { dataDir: options.dataDir, executable };
      if (windows && extname(executable).toLowerCase() === '.cmd') {
        // npm's shim needs cmd.exe, whose argument expansion is unsuitable for
        // vault commands. Run only the installed official package's JS entry.
        const packageDir = join(dirname(executable), 'node_modules', '@bitwarden', 'cli');
        const info = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')) as {
          name?: string;
          bin?: { bw?: string };
        };
        if (info.name !== '@bitwarden/cli' || typeof info.bin?.bw !== 'string') continue;
        const script = resolve(packageDir, info.bin.bw);
        if (!script.startsWith(`${packageDir}${sep}`) || !/\.[cm]?js$/i.test(script)) continue;
        await access(script, constants.R_OK);
        if (!(await stat(script)).isFile()) continue;
        cliOptions = { dataDir: options.dataDir, executable: process.execPath, script };
      } else if (windows && extname(executable).toLowerCase() !== '.exe') continue;
      return { cli: engineCli(cliOptions) };
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
