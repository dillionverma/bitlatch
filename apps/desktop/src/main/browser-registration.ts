import { execFile } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { FIREFOX_EXTENSION_ID } from '@latch/shared/browser-targets';
import { NATIVE_HOST } from './native-config';

interface BrowserRegistration {
  dataDir: string;
  extensionId: string;
  executable: string;
  hostScript: string;
}

export async function installBrowser(options: BrowserRegistration, root?: string) {
  const windows = process.platform === 'win32';
  // A filesystem sandbox cannot redirect HKCU. Never touch the user's registry
  // when LATCH_BROWSER_ROOT was supplied for an isolated run.
  if (windows && root !== undefined)
    throw new Error('Windows browser registration cannot use an isolated browser root.');
  const launcher = join(options.dataDir, windows ? 'latch-native-host.cmd' : 'latch-native-host');
  const configPath = join(options.dataDir, 'bridge.json');
  const args = [options.executable, options.hostScript, configPath, options.extensionId];
  // The browser launches the batch file through cmd.exe before its first line
  // can disable expansion. Decline paths that cmd would expand at that stage.
  if (windows && /[%!]/.test(launcher)) throw new Error('Unsupported native host launcher path.');
  const script = windows
    ? `@echo off\r\nsetlocal DisableDelayedExpansion\r\nchcp 65001 >nul\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n${args.map(windowsQuote).join(' ')} %*\r\n`
    : `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec ${args.map(shellQuote).join(' ')} "$@"\n`;
  await mkdir(options.dataDir, { recursive: true, mode: 0o700 });
  await writeFile(launcher, script, { mode: 0o700 });
  if (!windows) await chmod(launcher, 0o700);
  const common = {
    name: NATIVE_HOST,
    description: 'Bitlatch vault bridge',
    path: launcher,
    type: 'stdio',
  };
  const manifest = JSON.stringify(
    { ...common, allowed_origins: [`chrome-extension://${options.extensionId}/`] },
    null,
    2,
  );
  const firefoxManifest = JSON.stringify(
    { ...common, allowed_extensions: [FIREFOX_EXTENSION_ID] },
    null,
    2,
  );
  if (windows) {
    const systemRoot = process.env.SystemRoot;
    if (!systemRoot || !isAbsolute(systemRoot))
      throw new Error('Windows system directory unavailable.');
    const chromiumPath = await writeManifest(
      join(options.dataDir, 'native-messaging', 'chromium'),
      manifest,
    );
    const firefoxPath = await writeManifest(
      join(options.dataDir, 'native-messaging', 'firefox'),
      firefoxManifest,
    );
    for (const [browser, path] of [
      ['Google\\Chrome', chromiumPath],
      ['Chromium', chromiumPath],
      ['Microsoft\\Edge', chromiumPath],
      ['Mozilla', firefoxPath],
    ] as const) {
      await promisify(execFile)(
        join(systemRoot, 'System32', 'reg.exe'),
        [
          'ADD',
          `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${NATIVE_HOST}`,
          '/ve',
          '/t',
          'REG_SZ',
          '/d',
          path,
          '/f',
          '/reg:32',
        ],
        { windowsHide: true, timeout: 10_000 },
      );
    }
  } else {
    const home = root ?? homedir();
    const configHome =
      root === undefined
        ? ([process.env.CHROME_CONFIG_HOME, process.env.XDG_CONFIG_HOME].find(
            (path) => path && isAbsolute(path),
          ) ?? join(home, '.config'))
        : join(home, '.config');
    const directories =
      process.platform === 'darwin'
        ? [
            'Google/Chrome',
            'Google/ChromeForTesting',
            'Chromium',
            'Aside',
            'BraveSoftware/Brave-Browser',
            'Microsoft Edge',
            'Arc',
            'Vivaldi',
          ].map((browser) =>
            join(home, 'Library/Application Support', browser, 'NativeMessagingHosts'),
          )
        : [
            'google-chrome',
            'google-chrome-beta',
            'google-chrome-unstable',
            'google-chrome-for-testing',
            'chromium',
            'BraveSoftware/Brave-Browser',
            'microsoft-edge',
            'vivaldi',
          ].map((browser) => join(configHome, browser, 'NativeMessagingHosts'));
    for (const directory of directories) await writeManifest(directory, manifest);
    await writeManifest(
      process.platform === 'darwin'
        ? join(home, 'Library/Application Support/Mozilla/NativeMessagingHosts')
        : join(home, '.mozilla/native-messaging-hosts'),
      firefoxManifest,
    );
  }
  return options.extensionId;
}

async function writeManifest(directory: string, manifest: string) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${NATIVE_HOST}.json`);
  await writeFile(path, manifest, { mode: 0o600 });
  return path;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function windowsQuote(value: string) {
  if (/["\r\n\0]/.test(value)) throw new Error('Unsupported native host argument.');
  return `"${value.replaceAll('%', '%%')}"`;
}
