import type { Configuration } from 'electron-builder';

// Signing stays outside this file: macOS AutoFill builds are signed by
// scripts/package-autofill.mjs, and other packages are unsigned for now.
export default {
  appId: 'app.latch.vault',
  productName: 'Latch',
  directories: { output: 'release' },
  files: [
    'dist/**/*',
    // afterPack embeds the macOS extensions from dist/native; app.asar needs only the addon.
    '!dist/native/{*.appex,Icons.xcassets}{,/**}',
    '!dist/native/icon-info.plist',
    'package.json',
    'LICENSE',
    'THIRD_PARTY.md',
  ],
  // Latch is English-only; other Chromium locales are about 45 MB per app.
  electronLanguages: ['en', 'en-US'],
  asar: true,
  asarUnpack: [
    'dist/native/*.node',
    'dist/extension/**/*',
    'dist/desktop/native-host.cjs',
    'node_modules/electron-liquid-glass/prebuilds/**/*',
  ],
  // Embeds the macOS AutoFill and Safari extensions; a no-op elsewhere.
  afterPack: 'scripts/embed-autofill.cjs',
  mac: {
    target: ['dmg', 'zip'],
    icon: 'assets/icon.icns',
    category: 'public.app-category.productivity',
    identity: null,
    hardenedRuntime: true,
  },
  // bzip2 is about 9 MB smaller than the default zlib. Switch to LZMA (`ULMO`) with electron-builder 27.
  dmg: { format: 'UDBZ' },
  linux: {
    target: ['AppImage', 'deb'],
    icon: 'assets/icon.png',
    category: 'Utility',
    executableName: 'latch',
    maintainer: 'Dillion Verma <hello@dillion.io>',
    // Matches the .desktop file to Electron's app ID, which Wayland shortcuts need.
    syncDesktopName: true,
  },
  win: {
    target: 'nsis',
    icon: 'assets/icon.png',
  },
} satisfies Configuration;
