const { cp, mkdir, readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');

exports.default = async function ({ appOutDir, electronPlatformName, packager }) {
  if (electronPlatformName !== 'darwin') return;
  const plist = await import('plist');
  const contents = join(appOutDir, 'Latch.app/Contents');
  const iconResources = join(
    packager.projectDir,
    'dist/native/LatchAutoFill.appex/Contents/Resources',
  );
  for (const name of ['Assets.car', 'Latch.icns']) {
    await cp(join(iconResources, name), join(contents, 'Resources', name));
  }
  await cp(
    join(packager.projectDir, 'assets/icon.png'),
    join(contents, 'Resources/latch-dock.png'),
  );
  const infoPath = join(contents, 'Info.plist');
  const info = plist.parse(await readFile(infoPath, 'utf8'));
  info.CFBundleIconName = 'Latch';
  info.CFBundleIconFile = 'Latch.icns';
  await writeFile(infoPath, plist.build(info));
  const plugins = join(appOutDir, 'Latch.app/Contents/PlugIns');
  await mkdir(plugins, { recursive: true });
  await cp(
    join(packager.projectDir, 'dist/native/LatchAutoFill.appex'),
    join(plugins, 'LatchAutoFill.appex'),
    { recursive: true },
  );
  if (process.env.LATCH_SAFARI_PROFILE) {
    await cp(
      join(packager.projectDir, 'dist/native/LatchSafari.appex'),
      join(plugins, 'LatchSafari.appex'),
      { recursive: true },
    );
  }
};
