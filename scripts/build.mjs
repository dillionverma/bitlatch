import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist/desktop'), { recursive: true });
await mkdir(resolve(root, 'dist/extension'), { recursive: true });

const bundledPackages = [
  'electron-liquid-glass',
  'node-gyp-build',
  'react',
  'react-dom',
  'scheduler',
  '@tanstack/react-virtual',
  '@tanstack/virtual-core',
  'lucide-react',
  'zod',
  'tldts',
  'tldts-core',
  'radix-ui',
  'class-variance-authority',
  'clsx',
  'tailwind-merge',
  'sonner',
  'tailwindcss',
  'tw-animate-css',
];
// Include runtime dependency notices transitively, including nested package versions.
const notices = [await readFile(resolve(root, 'licenses/shadcn-ui-LICENSE.txt'), 'utf8')];
const visited = new Set();
async function addNotice(name, from = root) {
  const require = createRequire(join(from, 'package.json'));
  let directory;
  // Resolve package roots without requiring a JS entry (CSS-only packages have none).
  for (const modules of require.resolve.paths(name) ?? []) {
    try {
      const candidate = join(modules, name);
      const info = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'));
      if (info.name === name) {
        directory = candidate;
        break;
      }
    } catch {}
  }
  if (!directory) throw new Error(`Cannot locate notice for ${name}`);
  if (visited.has(directory)) return;
  visited.add(directory);
  const info = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  let license;
  for (const filename of [
    'LICENSE',
    'LICENSE.md',
    'LICENSE.txt',
    'LICENSE-MIT',
    'license',
    'license.md',
  ]) {
    try {
      license = await readFile(join(directory, filename), 'utf8');
      break;
    } catch {}
  }
  if (!license && name === 'react-remove-scroll-bar') {
    license = await readFile(resolve(root, 'licenses/react-remove-scroll-bar-LICENSE.txt'), 'utf8');
  }
  if (!license) throw new Error(`Missing license notice for ${name}`);
  notices.push(`${name} ${info.version}\n${'='.repeat(60)}\n${license}`);
  for (const dependency of Object.keys(info.dependencies ?? {}))
    await addNotice(dependency, directory);
}
for (const name of bundledPackages) await addNotice(name);
await writeFile(resolve(root, 'dist/THIRD_PARTY_NOTICES.txt'), notices.join('\n\n'));

let identity;
try {
  identity = JSON.parse(await readFile(resolve(root, 'assets/extension.json'), 'utf8'));
} catch {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const bytes = publicKey.export({ type: 'spki', format: 'der' });
  const hex = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  identity = {
    key: bytes.toString('base64'),
    extensionId: [...hex]
      .map((char) => String.fromCharCode(97 + Number.parseInt(char, 16)))
      .join(''),
  };
  await writeFile(
    resolve(root, 'assets/extension.json'),
    JSON.stringify(identity, null, 2) + '\n',
    { flag: 'wx' },
  );
}

await build({
  entryPoints: ['main', 'preload', 'native-host'].map((name) => `src/desktop/${name}.ts`),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outdir: 'dist/desktop',
  outExtension: { '.js': '.cjs' },
  external: ['electron', 'electron-liquid-glass'],
  sourcemap: false,
  logLevel: 'info',
});
await copyFile(
  resolve(root, 'assets/extension.json'),
  resolve(root, 'dist/desktop/extension.json'),
);
await build({
  entryPoints: ['background', 'content', 'popup'].map((name) => `src/extension/${name}.ts`),
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  format: 'iife',
  // CSS imports in content.ts become strings for its closed shadow root.
  loader: { '.css': 'text' },
  outdir: 'dist/extension',
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});
await copyFile(
  resolve(root, 'src/extension/popup.html'),
  resolve(root, 'dist/extension/popup.html'),
);
// Bundle static tokens and popup styles; imports must resolve before extension packaging.
await build({
  stdin: {
    contents: '@import "./src/shared/theme.css";\n@import "./src/extension/popup.css";',
    resolveDir: root,
    loader: 'css',
  },
  bundle: true,
  outfile: 'dist/extension/popup.css',
  minify: true,
  target: 'chrome120',
  logLevel: 'info',
});
await writeFile(
  resolve(root, 'dist/extension/manifest.json'),
  JSON.stringify(
    {
      manifest_version: 3,
      name: 'Latch — your vault, within reach',
      version: '0.1.0',
      description:
        'A quiet inline password picker for the Latch Mac app. Connects to your existing Bitwarden vault.',
      key: identity.key,
      permissions: ['nativeMessaging', 'activeTab', 'storage'],
      host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
      background: { service_worker: 'background.js' },
      action: { default_popup: 'popup.html', default_title: 'Latch' },
      content_scripts: [
        {
          matches: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
          js: ['content.js'],
          run_at: 'document_idle',
          all_frames: true,
        },
      ],
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'",
      },
    },
    null,
    2,
  ) + '\n',
);
await viteBuild({
  root: resolve(root, 'src/renderer'),
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(root, 'src/renderer') } },
  build: {
    outDir: resolve(root, 'dist/renderer'),
    emptyOutDir: false,
    target: 'chrome120',
    sourcemap: false,
  },
});
console.log(`Extension ID: ${identity.extensionId}`);
