import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const zip = process.argv.includes('--zip');
for (const browser of ['chrome', 'firefox', 'safari']) {
  execFileSync(
    resolve(root, 'node_modules/.bin/wxt'),
    [zip ? 'zip' : 'build', '-b', browser, '--mv3'],
    { cwd: root, stdio: 'inherit' },
  );
}
