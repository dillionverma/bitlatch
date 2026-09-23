const { cp, mkdir } = require('node:fs/promises');
const { join } = require('node:path');

exports.default = async function ({ appOutDir, electronPlatformName, packager }) {
  if (electronPlatformName !== 'darwin') return;
  const plugins = join(appOutDir, 'Latch.app/Contents/PlugIns');
  await mkdir(plugins, { recursive: true });
  await cp(
    join(packager.projectDir, 'dist/native/LatchAutoFill.appex'),
    join(plugins, 'LatchAutoFill.appex'),
    { recursive: true },
  );
};
