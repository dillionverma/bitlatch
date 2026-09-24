import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { FIREFOX_EXTENSION_ID } from '@latch/shared/browser-targets';
import { NATIVE_HOST } from './native-config';

interface BrowserRegistration {
  dataDir: string;
  extensionId: string;
  executable: string;
  hostScript: string;
}

export async function installBrowser(options: BrowserRegistration, root = homedir()) {
  const launcher = join(options.dataDir, 'latch-native-host');
  const configPath = join(options.dataDir, 'bridge.json');
  const script = `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec ${shellQuote(options.executable)} ${shellQuote(options.hostScript)} ${shellQuote(configPath)} ${shellQuote(options.extensionId)} "$@"\n`;
  await writeFile(launcher, script, { mode: 0o700 });
  await chmod(launcher, 0o700);
  const manifest = JSON.stringify(
    {
      name: NATIVE_HOST,
      description: 'Latch vault bridge',
      path: launcher,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${options.extensionId}/`],
    },
    null,
    2,
  );
  for (const browser of [
    'Google/Chrome',
    'Google/Chrome for Testing',
    'Chromium',
    'Aside',
    'BraveSoftware/Brave-Browser',
    'Microsoft Edge',
    'Arc',
    'Vivaldi',
  ]) {
    const directory = join(root, 'Library/Application Support', browser, 'NativeMessagingHosts');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${NATIVE_HOST}.json`), manifest, { mode: 0o600 });
  }
  const firefoxDirectory = join(root, 'Library/Application Support/Mozilla/NativeMessagingHosts');
  await mkdir(firefoxDirectory, { recursive: true });
  await writeFile(
    join(firefoxDirectory, `${NATIVE_HOST}.json`),
    JSON.stringify(
      {
        name: NATIVE_HOST,
        description: 'Latch vault bridge',
        path: launcher,
        type: 'stdio',
        allowed_extensions: [FIREFOX_EXTENSION_ID],
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  return options.extensionId;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
