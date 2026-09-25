import { execFileSync } from 'node:child_process';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as plist from 'plist';

export async function buildSafari(
  root,
  group = process.env.LATCH_APP_GROUP ?? 'UNCONFIGURED.app.latch.vault',
) {
  if (process.platform !== 'darwin') return;
  const contents = resolve(root, 'dist/native/LatchSafari.appex/Contents');
  await mkdir(resolve(contents, 'MacOS'), { recursive: true });
  await cp(resolve(root, '../extension/.output/safari-mv3'), resolve(contents, 'Resources'), {
    recursive: true,
  });
  execFileSync(
    'xcrun',
    [
      'clang',
      '-fobjc-arc',
      '-fblocks',
      '-fapplication-extension',
      '-mmacosx-version-min=14.0',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-framework',
      'Foundation',
      '-framework',
      'SafariServices',
      resolve(root, 'native/safari/Handler.m'),
      '-o',
      resolve(contents, 'MacOS/LatchSafari'),
    ],
    { stdio: 'inherit' },
  );
  const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  await writeFile(
    resolve(contents, 'Info.plist'),
    plist.build({
      CFBundleIdentifier: 'app.latch.vault.safari',
      CFBundleName: 'Latch',
      CFBundleDisplayName: 'Latch',
      CFBundleInfoDictionaryVersion: '6.0',
      CFBundleSupportedPlatforms: ['MacOSX'],
      CFBundleExecutable: 'LatchSafari',
      CFBundlePackageType: 'XPC!',
      CFBundleVersion: version,
      CFBundleShortVersionString: version,
      LSMinimumSystemVersion: '14.0',
      LatchAppGroup: group,
      NSExtension: {
        NSExtensionPointIdentifier: 'com.apple.Safari.web-extension',
        NSExtensionPrincipalClass: 'LatchSafariHandler',
      },
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildSafari(resolve(import.meta.dirname, '..'));
