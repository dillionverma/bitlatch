import { defineConfig } from 'wxt';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EXTENSION_MATCHES, FIREFOX_EXTENSION_ID } from '@latch/shared/browser-targets';
const identity = JSON.parse(
  readFileSync(new URL('../../packages/shared/extension.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
export default defineConfig({
  imports: false,
  hooks: {
    'build:publicAssets': (_wxt, files) => {
      files.push({
        absoluteSrc: fileURLToPath(new URL('../../LICENSE', import.meta.url)),
        relativeDest: 'LICENSE',
      });
    },
  },
  zip: {
    name: 'latch',
    sourcesRoot: fileURLToPath(new URL('../..', import.meta.url)),
    includeSources: [
      'apps/extension/**',
      'packages/shared/**',
      'apps/desktop/package.json',
      'apps/raycast/package.json',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'tsconfig.json',
      'vite.config.mjs',
      'LICENSE',
      'README.md',
    ],
    excludeSources: ['**/node_modules/**', '**/.output/**', '**/.wxt/**'],
  },
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Latch — your vault, within reach',
    version: pkg.version,
    description:
      'A quiet inline password picker for the Latch Mac app. Connects to your existing Bitwarden vault.',
    ...(browser === 'chrome' || browser === 'edge' ? { key: identity.key } : {}),
    permissions: ['nativeMessaging', 'activeTab', 'storage'],
    host_permissions: EXTENSION_MATCHES,
    action: {
      default_title: 'Latch',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'",
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: FIREFOX_EXTENSION_ID,
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['authenticationInfo', 'browsingActivity'] },
            },
          },
        }
      : {}),
  }),
});
