import { execFileSync } from 'node:child_process';
import { renameSync } from 'node:fs';
import type { BuildResult, Configuration } from 'electron-builder';

/**
 * Recompresses each DMG with LZMA, about 24% smaller than the default zlib. Remove this
 * once electron-builder 27 is stable and offers `dmg: { format: 'ULMO' }`.
 */
function compressDmgs({ artifactPaths }: BuildResult) {
  for (const dmg of artifactPaths.filter((path) => path.endsWith('.dmg'))) {
    const packed = dmg.replace(/\.dmg$/, '.ulmo.dmg');
    execFileSync('hdiutil', ['convert', dmg, '-format', 'ULMO', '-ov', '-quiet', '-o', packed]);
    renameSync(packed, dmg);
  }
  return [];
}

export default {
  appId: 'app.latch.vault',
  productName: 'Bitlatch',
  artifactName: 'Bitlatch-${version}-${os}-${arch}.${ext}',
  publish: null,
  directories: { output: 'release' },
  files: [
    'dist/**/*',
    // afterPack embeds the macOS extensions from dist/native; app.asar needs only the addon.
    '!dist/native/{*.appex,Icons.xcassets}{,/**}',
    '!dist/native/icon-info.plist',
    'package.json',
  ],
  // Bitlatch is English-only; other Chromium locales are about 45 MB per app.
  electronLanguages: ['en', 'en-US'],
  asar: true,
  asarUnpack: [
    'dist/native/*.node',
    'dist/extension/**/*',
    'dist/desktop/native-host.cjs',
    'node_modules/electron-liquid-glass/prebuilds/**/*',
  ],
  afterPack: 'build/embed-autofill.cjs',
  mac: {
    target: ['dmg', 'zip'],
    icon: 'dist/native/LatchAutoFill.appex/Contents/Resources/Latch.icns',
    category: 'public.app-category.productivity',
    identity: '-',
    minimumSystemVersion: '14.0',
    hardenedRuntime: true,
    publish:
      process.env.LATCH_RELEASE === '1'
        ? { provider: 'github', owner: 'dillionverma', repo: 'latch' }
        : null,
  },
  // The updater downloads the zip, so the DMG needs no update metadata that
  // compressDmgs would invalidate.
  dmg: { writeUpdateInfo: false },
  afterAllArtifactBuild: compressDmgs,
  linux: {
    target: ['AppImage', 'deb'],
    icon: '../../assets/brand/macos/icon-1024.png',
    category: 'Utility',
    executableName: 'bitlatch',
    maintainer: 'Dillion Verma <hello@dillion.io>',
    // Matches the .desktop file to Electron's app ID, which Wayland shortcuts need.
    syncDesktopName: true,
  },
  win: {
    target: 'nsis',
    icon: '../../assets/brand/macos/icon-1024.png',
  },
} satisfies Configuration;
