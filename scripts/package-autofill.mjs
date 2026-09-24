import { execFileSync } from 'node:child_process';
import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { sign } from '@electron/osx-sign';
import * as plist from 'plist';

// Explicit signing inputs keep an unsigned development build from claiming a
// restricted capability, or silently choosing a different Apple team.
const root = resolve(import.meta.dirname, '..');
const identity = process.env.LATCH_SIGN_IDENTITY;
const appProfile = process.env.LATCH_APP_PROFILE;
const extensionProfile = process.env.LATCH_AUTOFILL_PROFILE;
let localDeviceIds;
if (process.platform !== 'darwin' || !identity || !appProfile || !extensionProfile)
  throw new Error(
    'Set LATCH_SIGN_IDENTITY, LATCH_APP_PROFILE and LATCH_AUTOFILL_PROFILE on a Mac. See native/autofill/README.md.',
  );

function profile(path, identifier, autofill = true) {
  const value = plist.parse(
    execFileSync('security', ['cms', '-D', '-i', resolve(path)], { encoding: 'utf8' }),
  );
  const team = value.TeamIdentifier?.[0];
  const entitlements = value.Entitlements;
  const applicationIdentifier = entitlements?.['com.apple.application-identifier'];
  if (
    !/^[A-Z0-9]{10}$/.test(team ?? '') ||
    !value.Platform?.includes('OSX') ||
    new Date(value.ExpirationDate).getTime() <= Date.now() ||
    applicationIdentifier !== `${value.ApplicationIdentifierPrefix?.[0]}.${identifier}` ||
    (autofill &&
      entitlements?.['com.apple.developer.authentication-services.autofill-credential-provider'] !==
        true)
  )
    throw new Error(
      `The profile for ${identifier} must be current, macOS-specific, and authorize AutoFill.`,
    );
  if (Array.isArray(value.ProvisionedDevices)) {
    if (!localDeviceIds) {
      const hardware = JSON.parse(
        execFileSync('system_profiler', ['SPHardwareDataType', '-json'], { encoding: 'utf8' }),
      ).SPHardwareDataType?.[0];
      localDeviceIds = [hardware?.provisioning_UDID, hardware?.platform_UUID]
        .filter(Boolean)
        .map((id) => id.toUpperCase());
    }
    if (!value.ProvisionedDevices.some((id) => localDeviceIds.includes(id.toUpperCase())))
      throw new Error(
        `The profile for ${identifier} does not include this Mac. Regenerate it for the My Mac destination in Xcode.`,
      );
  }
  return { team, applicationIdentifier };
}
const host = profile(appProfile, 'app.latch.vault');
const extension = profile(extensionProfile, 'app.latch.vault.autofill');
if (host.team !== extension.team)
  throw new Error('Both profiles must belong to the same Apple team.');
const group = `${host.team}.app.latch.vault`;
const safariProfile = process.env.LATCH_SAFARI_PROFILE;
const safari = safariProfile ? profile(safariProfile, 'app.latch.vault.safari', false) : undefined;
if (safari && safari.team !== host.team)
  throw new Error('Safari and Latch must use the same signing team.');
const env = { ...process.env, LATCH_APP_GROUP: group, CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
execFileSync('pnpm', ['run', 'build'], { cwd: root, env, stdio: 'inherit' });
execFileSync(join(root, 'node_modules/.bin/electron-builder'), ['--mac', 'dir', '--arm64'], {
  cwd: root,
  env,
  stdio: 'inherit',
});
const app = join(root, 'release/mac-arm64/Latch.app');
const appex = join(app, 'Contents/PlugIns/LatchAutoFill.appex');
const signing = join(root, 'release/autofill-signing');
await mkdir(signing, { recursive: true, mode: 0o700 });
const shared = {
  'com.apple.developer.team-identifier': host.team,
  'com.apple.developer.authentication-services.autofill-credential-provider': true,
  'com.apple.security.application-groups': [group],
};
const appEntitlements = join(signing, 'app.plist');
const extensionEntitlements = join(signing, 'extension.plist');
await writeFile(
  appEntitlements,
  plist.build({
    ...shared,
    'com.apple.application-identifier': host.applicationIdentifier,
    'com.apple.security.cs.allow-jit': true,
  }),
);
await writeFile(
  extensionEntitlements,
  plist.build({
    ...shared,
    'com.apple.application-identifier': extension.applicationIdentifier,
    'com.apple.security.app-sandbox': true,
    'com.apple.security.network.client': true,
  }),
);
const infoPath = join(app, 'Contents/Info.plist');
const info = plist.parse(await readFile(infoPath, 'utf8'));
info.LatchAppGroup = group;
await writeFile(infoPath, plist.build(info));
await copyFile(resolve(appProfile), join(app, 'Contents/embedded.provisionprofile'));
await copyFile(resolve(extensionProfile), join(appex, 'Contents/embedded.provisionprofile'));
const development = !identity.startsWith('Developer ID Application:');
// electron-builder does not sign our hand-built appex. Sign it first, then
// exclude it from Electron's signing pass so its entitlements stay intact.
execFileSync(
  'codesign',
  [
    '--force',
    '--sign',
    identity,
    '--options',
    'runtime',
    ...(development ? ['--timestamp=none'] : ['--timestamp']),
    '--entitlements',
    extensionEntitlements,
    appex,
  ],
  { stdio: 'inherit' },
);
const safariApp = join(app, 'Contents/PlugIns/LatchSafari.appex');
if (safari && safariProfile) {
  const safariEntitlements = join(signing, 'safari.plist');
  await writeFile(
    safariEntitlements,
    plist.build({
      'com.apple.developer.team-identifier': host.team,
      'com.apple.application-identifier': safari.applicationIdentifier,
      'com.apple.security.app-sandbox': true,
      'com.apple.security.network.client': true,
      'com.apple.security.application-groups': [group],
    }),
  );
  await copyFile(resolve(safariProfile), join(safariApp, 'Contents/embedded.provisionprofile'));
  execFileSync(
    'codesign',
    [
      '--force',
      '--sign',
      identity,
      '--options',
      'runtime',
      ...(development ? ['--timestamp=none'] : ['--timestamp']),
      '--entitlements',
      safariEntitlements,
      safariApp,
    ],
    { stdio: 'inherit' },
  );
}
await sign({
  app,
  identity,
  platform: 'darwin',
  type: development ? 'development' : 'distribution',
  preAutoEntitlements: false,
  preEmbedProvisioningProfile: false,
  ignore: (path) =>
    [appex, ...(safari ? [safariApp] : [])].some(
      (extension) => path === extension || path.startsWith(`${extension}/`),
    ),
  optionsForFile: (path) => ({
    ...(path === app ? { entitlements: appEntitlements } : {}),
    ...(development ? { timestamp: 'none' } : {}),
  }),
});
execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
console.log('Signed AutoFill build: release/mac-arm64/Latch.app. Not installed or notarized.');
