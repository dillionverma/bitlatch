import { execFileSync } from 'node:child_process';
import { build as viteBuild } from 'vite-plus';
import { mkdir, readFile, writeFile, copyFile, rm, cp } from 'node:fs/promises';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { buildSafari } from './build-safari.mjs';
import { buildAutoFill } from './build-autofill.mjs';

const root = resolve(import.meta.dirname, '..');
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist/desktop'), { recursive: true });
await mkdir(resolve(root, 'dist/extension'), { recursive: true });
await buildAutoFill(root);

const bundledPackages = [
  'node-api-headers',
  'electron-liquid-glass',
  'electron-updater',
  'node-gyp-build',
  'react',
  'react-dom',
  'motion',
  'scheduler',
  '@tanstack/react-virtual',
  '@tanstack/virtual-core',
  '@phosphor-icons/react',
  'shadcn',
  'zod',
  'tldts',
  'tldts-core',
  'radix-ui',
  'class-variance-authority',
  'clsx',
  'tailwind-merge',
  'sonner',
  'cmdk',
  'tailwindcss',
  'tw-animate-css',
];
// Include runtime dependency notices transitively, including nested package versions.
const notices = [await readFile(resolve(root, 'THIRD_PARTY.md'), 'utf8')];
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
    'OFL.txt',
    'license',
    'license.md',
  ]) {
    try {
      license = await readFile(join(directory, filename), 'utf8');
      break;
    } catch {}
  }
  if (!license && ['react-remove-scroll-bar', 'lazy-val'].includes(name)) {
    license = 'MIT notice included above in THIRD_PARTY.md.';
  }
  if (!license) throw new Error(`Missing license notice for ${name}`);
  notices.push(`${name} ${info.version}\n${'='.repeat(60)}\n${license}`);
  // Only shadcn's static CSS ships; its CLI dependencies do not.
  for (const dependency of Object.keys(name === 'shadcn' ? {} : (info.dependencies ?? {})))
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
    extensionId: hex
      .split('')
      .map((char) => String.fromCharCode(97 + Number.parseInt(char, 16)))
      .join(''),
  };
  await writeFile(
    resolve(root, 'assets/extension.json'),
    JSON.stringify(identity, null, 2) + '\n',
    { flag: 'wx' },
  );
}

execFileSync(resolve(root, 'node_modules/.bin/vp'), ['pack'], { cwd: root, stdio: 'inherit' });
await copyFile(
  resolve(root, 'assets/extension.json'),
  resolve(root, 'dist/desktop/extension.json'),
);
execFileSync(process.execPath, ['scripts/build-extensions.mjs'], { cwd: root, stdio: 'inherit' });
await cp(resolve(root, '.output/chrome-mv3'), resolve(root, 'dist/extension'), { recursive: true });
await buildSafari(root);
await viteBuild({ configFile: resolve(root, 'vite.config.mjs') });
console.log(`Extension ID: ${identity.extensionId}`);
