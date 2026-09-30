import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'apps/raycast');
const output = resolve(root, 'release/raycast/latch');
const lockfile = resolve(source, 'store/package-lock.json');
const updateLock = process.argv.includes('--update-lock');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const run = (command, args) => execFileSync(command, args, { cwd: output, stdio: 'inherit' });

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of [
  'src',
  'assets',
  'README.md',
  'CHANGELOG.md',
  'eslint.config.mjs',
  '.prettierrc.json',
])
  cpSync(resolve(source, file), resolve(output, file), { recursive: true });
cpSync(resolve(root, 'LICENSE'), resolve(output, 'LICENSE'));
if (existsSync(resolve(source, 'metadata')))
  cpSync(resolve(source, 'metadata'), resolve(output, 'metadata'), { recursive: true });
for (const file of ['protocol.ts', 'types.ts'])
  cpSync(resolve(root, 'packages/shared/src', file), resolve(output, 'src', file));
const bridge = resolve(output, 'src/bridge.ts');
writeFileSync(bridge, readFileSync(bridge, 'utf8').replace('@latch/shared/protocol', './protocol'));

const manifest = readJson(resolve(source, 'package.json'));
delete manifest.dependencies['@latch/shared'];
delete manifest.scripts.typecheck;
manifest.access = 'public';
manifest.scripts.publish = 'npx @raycast/api@latest publish';
manifest.dependencies.zod = readJson(
  resolve(root, 'packages/shared/package.json'),
).dependencies.zod;
writeJson(resolve(output, 'package.json'), manifest);
const tsconfig = readJson(resolve(source, 'tsconfig.json'));
delete tsconfig.extends;
tsconfig.compilerOptions = {
  ...readJson(resolve(root, 'tsconfig.json')).compilerOptions,
  ...tsconfig.compilerOptions,
};
writeJson(resolve(output, 'tsconfig.json'), tsconfig);
writeFileSync(resolve(output, '.gitignore'), 'node_modules/\ndist/\n');

if (updateLock) {
  run('npm', ['install', '--package-lock-only', '--ignore-scripts']);
  mkdirSync(resolve(source, 'store'), { recursive: true });
  cpSync(resolve(output, 'package-lock.json'), lockfile);
} else {
  cpSync(lockfile, resolve(output, 'package-lock.json'));
}
run('npm', ['ci']);
run('npm', ['run', 'build']);
run('npm', ['run', 'lint']);
const { version } = readJson(resolve(root, 'apps/desktop/package.json'));
const archive = resolve(root, `release/latch-${version}-raycast.zip`);
rmSync(archive, { force: true });
execFileSync('zip', ['-qr', archive, 'latch', '-x', '*/node_modules/*', '*/dist/*'], {
  cwd: resolve(output, '..'),
  stdio: 'inherit',
});
console.log(`Raycast source package: ${archive}`);
console.log(`Store submission folder: ${output}`);
