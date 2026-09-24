import { mkdir, readFile, writeFile, copyFile, rm, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { buildSafari } from './build-safari.mjs';
import { buildAutoFill } from './build-autofill.mjs';

const root = resolve(import.meta.dirname, '..');
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist/desktop'), { recursive: true });
await mkdir(resolve(root, 'dist/extension'), { recursive: true });
await buildAutoFill(root);
await copyFile(resolve(root, '../../LICENSE'), resolve(root, 'dist/LICENSE'));

const bundledPackages = [
  'electron-liquid-glass',
  'electron-updater',
  'react',
  'react-dom',
  'motion',
  '@tanstack/react-virtual',
  '@phosphor-icons/react',
  'zod',
  'tldts',
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
const notices = [await readFile(resolve(root, '../../LICENSE'), 'utf8')];
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
    license = 'MIT notice included above in LICENSE.';
  }
  if (!license) throw new Error(`Missing license notice for ${name}`);
  notices.push(`${name} ${info.version}\n${'='.repeat(60)}\n${license}`);
  for (const dependency of Object.keys(info.dependencies ?? {}))
    await addNotice(dependency, directory);
}
for (const name of bundledPackages) await addNotice(name);
await writeFile(resolve(root, 'dist/THIRD_PARTY_NOTICES.txt'), notices.join('\n\n'));

// The checked-in identity is stable across installs; missing data is a build error.
const identityPath = resolve(root, '../../packages/shared/extension.json');
const identity = JSON.parse(await readFile(identityPath, 'utf8'));
await copyFile(identityPath, resolve(root, 'dist/desktop/extension.json'));
await cp(resolve(root, '../extension/.output/chrome-mv3'), resolve(root, 'dist/extension'), {
  recursive: true,
});
await buildSafari(root);
console.log(`Extension ID: ${identity.extensionId}`);
