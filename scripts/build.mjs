import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist/desktop'), { recursive: true });
await mkdir(resolve(root, 'dist/extension'), { recursive: true });

const bundledPackages = [
  'react',
  'react-dom',
  'scheduler',
  '@tanstack/react-virtual',
  '@tanstack/virtual-core',
  'lucide-react',
  'zod',
  'tldts',
  'tldts-core',
];
const notices = [];
for (const name of bundledPackages) {
  const directory = resolve(root, 'node_modules', name);
  const info = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  let license;
  for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    try {
      license = await readFile(resolve(directory, filename), 'utf8');
      break;
    } catch {}
  }
  if (!license) throw new Error(`Missing license notice for ${name}`);
  notices.push(`${name} ${info.version}\n${'='.repeat(60)}\n${license}`);
}
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
  external: ['electron'],
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
  outdir: 'dist/extension',
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});
for (const file of ['popup.html', 'popup.css'])
  await copyFile(resolve(root, `src/extension/${file}`), resolve(root, `dist/extension/${file}`));
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
  plugins: [react()],
  build: {
    outDir: resolve(root, 'dist/renderer'),
    emptyOutDir: false,
    target: 'chrome120',
    sourcemap: false,
  },
});
console.log(`Extension ID: ${identity.extensionId}`);
