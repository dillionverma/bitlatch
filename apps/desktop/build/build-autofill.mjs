import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

export async function buildAutoFill(root) {
  if (process.platform !== 'darwin') return;
  const require = createRequire(import.meta.url);
  const include = require('node-api-headers').include_dir;
  const output = resolve(root, 'dist/native');
  const verifiedServer = resolve(output, 'verified-server.o');
  await mkdir(output, { recursive: true });
  execFileSync(
    'xcrun',
    [
      'clang',
      '-c',
      '-mmacosx-version-min=14.0',
      '-Wall',
      '-Wextra',
      '-Werror',
      resolve(root, 'native/VerifyServer.c'),
      '-o',
      verifiedServer,
    ],
    { stdio: 'inherit' },
  );
  const bridgeHost = resolve(output, 'LatchBridgeHost.app/Contents');
  await mkdir(resolve(bridgeHost, 'MacOS'), { recursive: true });
  const extension = JSON.parse(
    await readFile(resolve(root, '../../packages/shared/extension.json'), 'utf8'),
  );
  const source = await readFile(resolve(root, 'native/bridge-host/main.swift'), 'utf8');
  if (!source.includes(`chrome-extension://${extension.extensionId}/`))
    throw new Error('The browser host must use the published extension ID.');
  execFileSync(
    'xcrun',
    [
      'swiftc',
      '-swift-version',
      '6',
      '-target',
      `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx14.0`,
      '-warnings-as-errors',
      '-O',
      resolve(root, 'native/bridge-host/main.swift'),
      verifiedServer,
      '-framework',
      'Security',
      '-o',
      resolve(bridgeHost, 'MacOS/LatchBridgeHost'),
    ],
    { stdio: 'inherit' },
  );
  await writeFile(
    resolve(bridgeHost, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>app.latch.vault.bridgehost</string>
<key>CFBundleExecutable</key><string>LatchBridgeHost</string>
<key>CFBundleName</key><string>Bitlatch Bridge Host</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
</dict></plist>`,
  );
  const contents = resolve(output, 'LatchAutoFill.appex/Contents');
  await mkdir(resolve(contents, 'MacOS'), { recursive: true });
  await mkdir(resolve(contents, 'Resources'), { recursive: true });
  // Use the approved default appearance in a conventional macOS icon catalog.
  const catalog = resolve(output, 'Icons.xcassets');
  const iconset = resolve(catalog, 'Latch.appiconset');
  await mkdir(iconset, { recursive: true });
  const images = [];
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const filename = `icon_${size}x${size}@${scale}x.png`;
      await copyFile(
        resolve(root, `../../assets/brand/macos/icon-${size * scale}.png`),
        resolve(iconset, filename),
      );
      images.push({ idiom: 'mac', size: `${size}x${size}`, scale: `${scale}x`, filename });
    }
  }
  await writeFile(
    resolve(iconset, 'Contents.json'),
    JSON.stringify({ images, info: { author: 'xcode', version: 1 } }),
  );
  execFileSync(
    'xcrun',
    [
      'actool',
      catalog,
      '--compile',
      resolve(contents, 'Resources'),
      '--platform',
      'macosx',
      '--minimum-deployment-target',
      '14.0',
      '--app-icon',
      'Latch',
      '--output-partial-info-plist',
      resolve(output, 'icon-info.plist'),
    ],
    { stdio: 'inherit' },
  );
  const native = resolve(root, 'native/autofill');
  const run = (args) => execFileSync('xcrun', args, { stdio: 'inherit' });
  const common = [
    '-swift-version',
    '6',
    '-target',
    `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx14.0`,
    '-warnings-as-errors',
    '-O',
  ];
  const bridge = resolve(output, 'bridge.o');
  const verifiedSocket = resolve(output, 'verified-socket.o');
  run([
    'clang',
    '-c',
    '-mmacosx-version-min=14.0',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-Wno-unused-parameter',
    '-I',
    include,
    resolve(native, 'bridge.c'),
    '-o',
    bridge,
  ]);
  run([
    'clang',
    '-c',
    '-mmacosx-version-min=14.0',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-O2',
    '-I',
    include,
    resolve(native, 'VerifiedSocket.c'),
    '-o',
    verifiedSocket,
  ]);
  run([
    'swiftc',
    ...common,
    '-emit-library',
    '-import-objc-header',
    resolve(native, 'Bridge.h'),
    resolve(native, 'AutoFill.swift'),
    resolve(native, 'Encoding.swift'),
    bridge,
    verifiedSocket,
    '-Xlinker',
    '-undefined',
    '-Xlinker',
    'dynamic_lookup',
    '-Xlinker',
    '-install_name',
    '-Xlinker',
    '@rpath/latch-autofill.node',
    '-o',
    resolve(output, 'latch-autofill.node'),
  ]);
  await rm(bridge);
  await rm(verifiedSocket);
  run([
    'swiftc',
    ...common,
    '-application-extension',
    resolve(native, 'Provider.swift'),
    resolve(native, 'VaultClient.swift'),
    resolve(native, 'Encoding.swift'),
    resolve(native, 'main.swift'),
    verifiedServer,
    '-framework',
    'Security',
    '-o',
    resolve(contents, 'MacOS/LatchAutoFill'),
  ]);
  await rm(verifiedServer);
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
<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
<key>CFBundleDevelopmentRegion</key><string>en</string>
<key>CFBundleSupportedPlatforms</key><array><string>MacOSX</string></array>
<key>CFBundleName</key><string>Bitlatch</string>
<key>CFBundleDisplayName</key><string>Bitlatch</string>
<key>CFBundleExecutable</key><string>LatchAutoFill</string>
<key>CFBundleIconName</key><string>Latch</string>
<key>CFBundleIconFile</key><string>Latch.icns</string>
<key>CFBundlePackageType</key><string>XPC!</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LatchAppGroup</key><string>${group}</string>
<key>NSExtension</key><dict>
<key>NSExtensionPointIdentifier</key><string>com.apple.authentication-services-credential-provider-ui</string>
<key>NSExtensionPrincipalClass</key><string>LatchCredentialProvider</string>
<key>NSExtensionAttributes</key><dict><key>ASCredentialProviderExtensionCapabilities</key><dict>
<key>ProvidesPasswords</key><true/>
<key>ProvidesPasskeys</key><true/>
</dict>
<key>ASCredentialProviderExtensionShowsConfigurationUI</key><true/>
</dict></dict>
</dict></plist>`,
  );
}
