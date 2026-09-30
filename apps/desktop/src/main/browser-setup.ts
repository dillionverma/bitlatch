import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { UserError } from '@latch/shared/protocol';
import type { Browser, BrowserSetup } from '@latch/shared/types';
import type { MacAutoFill } from './macos-autofill';

// Set these to the published store listing / Mozilla-signed download when available.
// Keep destinations in the main process; renderer requests select a browser, never a URL.
const extensionUrls: Record<'chrome' | 'firefox', string | null> = {
  chrome: null,
  firefox: null,
};

export async function browserSetup(macAutoFill: MacAutoFill): Promise<BrowserSetup> {
  const safari = await macAutoFill.safariStatus().catch(() => ({ available: false }));
  return {
    safari: {
      available: safari.available,
      reason: safari.available
        ? undefined
        : process.platform === 'darwin'
          ? 'Requires a signed Latch app with the Safari extension.'
          : 'Safari is available on macOS.',
    },
    chrome: {
      available: !!extensionUrls.chrome,
      reason: extensionUrls.chrome
        ? undefined
        : 'No Chrome Web Store listing. Use Developer installation below.',
    },
    firefox: {
      available: !!extensionUrls.firefox,
      reason: extensionUrls.firefox
        ? undefined
        : 'No signed Firefox download. Load the GitHub preview as a temporary add-on.',
    },
  };
}

export async function connectBrowser(browser: Browser, macAutoFill: MacAutoFill) {
  if (browser === 'safari') return macAutoFill.safariSettings();
  const url = extensionUrls[browser];
  if (!url) throw new UserError('This extension is not published yet.');
  const destination = new URL(url);
  if (destination.protocol !== 'https:' || destination.username || destination.password)
    throw new UserError('The extension installation link is invalid.');
  const run = promisify(execFile);
  const name = browser === 'chrome' ? 'Chrome' : 'Firefox';
  if (process.platform === 'darwin') {
    try {
      await run(
        '/usr/bin/open',
        ['-b', browser === 'chrome' ? 'com.google.Chrome' : 'org.mozilla.firefox', url],
        { timeout: 10_000 },
      );
      return;
    } catch {
      throw new UserError(`Could not open ${name}. Check that it is installed and try again.`);
    }
  }
  const candidates =
    process.platform === 'win32'
      ? [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
          .filter((directory): directory is string => !!directory)
          .map((directory) =>
            join(
              directory,
              browser === 'chrome'
                ? 'Google/Chrome/Application/chrome.exe'
                : 'Mozilla Firefox/firefox.exe',
            ),
          )
          .filter(existsSync)
      : browser === 'chrome'
        ? ['google-chrome', 'google-chrome-stable']
        : ['firefox', 'firefox-esr'];
  for (const executable of candidates) {
    // A newly launched browser may stay running; resolve on spawn, not on its exit.
    const opened = await new Promise<boolean>((resolve) => {
      const child = spawn(executable, [url], { detached: true, stdio: 'ignore' });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    });
    if (opened) return;
  }
  throw new UserError(`Could not open ${name}. Check that it is installed and try again.`);
}
