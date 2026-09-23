import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

export async function buildAutoFill(root) {
  if (process.platform !== 'darwin') return;
  const require = createRequire(import.meta.url);
  const include = require('node-api-headers').include_dir;
  const output = resolve(root, 'dist/native');
  const contents = resolve(output, 'LatchAutoFill.appex/Contents');
  await mkdir(resolve(contents, 'MacOS'), { recursive: true });
  const common = [
    '-fobjc-arc',
    '-fblocks',
    '-mmacosx-version-min=14.0',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-Wno-unused-parameter',
    '-framework',
    'Foundation',
    '-framework',
    'AuthenticationServices',
  ];
  execFileSync(
    'xcrun',
    [
      'clang++',
      ...common,
      '-std=c++17',
      '-bundle',
      '-undefined',
      'dynamic_lookup',
      '-I',
      include,
      '-framework',
      'Security',
      resolve(root, 'native/autofill/addon.mm'),
      '-o',
      resolve(output, 'latch-autofill.node'),
    ],
    { stdio: 'inherit' },
  );
  execFileSync(
    'xcrun',
    [
      'clang',
      ...common,
      '-fapplication-extension',
      '-framework',
      'AppKit',
      '-framework',
      'LocalAuthentication',
      resolve(root, 'native/autofill/Provider.m'),
      '-o',
      resolve(contents, 'MacOS/LatchAutoFill'),
    ],
    { stdio: 'inherit' },
  );
  const group = process.env.LATCH_APP_GROUP ?? 'UNCONFIGURED.app.latch.vault';
  if (!/^[A-Z0-9]+\.app\.latch\.vault$/.test(group)) throw new Error('Invalid LATCH_APP_GROUP');
  const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid native bundle version');
  await writeFile(
    resolve(contents, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>app.latch.vault.autofill</string>
<key>CFBundleName</key><string>Latch</string>
<key>CFBundleDisplayName</key><string>Latch</string>
<key>CFBundleExecutable</key><string>LatchAutoFill</string>
<key>CFBundlePackageType</key><string>XPC!</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LatchAppGroup</key><string>${group}</string>
<key>NSExtension</key><dict>
<key>NSExtensionPointIdentifier</key><string>com.apple.AuthenticationServices.CredentialProvider</string>
<key>NSExtensionPrincipalClass</key><string>LatchCredentialProvider</string>
<key>NSExtensionAttributes</key><dict><key>ASCredentialProviderExtensionCapabilities</key><dict>
<key>ProvidesPasswords</key><true/>
<key>ProvidesPasskeys</key><true/>
<key>ShowsConfigurationUI</key><true/>
</dict></dict></dict>
</dict></plist>`,
  );
}
