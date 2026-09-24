const { cp, mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

exports.default = async function ({ appOutDir, electronPlatformName, packager }) {
  if (electronPlatformName !== 'darwin') return;
  const plist = await import('plist');
  const contents = path.join(appOutDir, 'Latch.app/Contents');
  const iconResources = path.join(
    packager.projectDir,
    'dist/native/LatchAutoFill.appex/Contents/Resources',
  );
  for (const name of ['Assets.car', 'Latch.icns']) {
    await cp(path.join(iconResources, name), path.join(contents, 'Resources', name));
  }
  await cp(
    path.join(packager.projectDir, 'assets/icon.png'),
    path.join(contents, 'Resources/latch-dock.png'),
  );
  const infoPath = path.join(contents, 'Info.plist');
  const info = plist.parse(await readFile(infoPath, 'utf8'));
  info.CFBundleIconName = 'Latch';
  info.CFBundleIconFile = 'Latch.icns';
  await writeFile(infoPath, plist.build(info));
  const plugins = path.join(appOutDir, 'Latch.app/Contents/PlugIns');
  await mkdir(plugins, { recursive: true });
  await cp(
    path.join(packager.projectDir, 'dist/native/LatchAutoFill.appex'),
    path.join(plugins, 'LatchAutoFill.appex'),
    { recursive: true },
  );
  if (process.env.LATCH_SAFARI_PROFILE) {
    await cp(
      path.join(packager.projectDir, 'dist/native/LatchSafari.appex'),
      path.join(plugins, 'LatchSafari.appex'),
      { recursive: true },
    );
  }
};
