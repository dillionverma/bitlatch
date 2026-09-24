import { spawn, execFileSync } from 'node:child_process';
import { watch, existsSync } from 'node:fs';
import { copyFile, cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite-plus';
import { buildAutoFill } from './build-autofill.mjs';

const root = resolve(import.meta.dirname, '..');
const desktop = resolve(root, 'dist/desktop');
await mkdir(desktop, { recursive: true });
// Native and browser development have their own rebuild commands. Reuse their outputs.
if (!existsSync(resolve(root, 'dist/native/latch-autofill.node'))) await buildAutoFill(root);
if (!existsSync(resolve(root, '../extension/.output/chrome-mv3/manifest.json')))
  execFileSync('pnpm', ['--filter', '@latch/extension', 'build:chrome'], {
    cwd: root,
    stdio: 'inherit',
  });
await cp(resolve(root, '../extension/.output/chrome-mv3'), resolve(root, 'dist/extension'), {
  recursive: true,
});
await copyFile(
  resolve(root, '../../packages/shared/extension.json'),
  resolve(desktop, 'extension.json'),
);
execFileSync('pnpm', ['exec', 'vp', 'pack'], { cwd: root, stdio: 'inherit' });
const server = await createServer({
  configFile: resolve(root, 'vite.config.mjs'),
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
await server.listen();
server.printUrls();
const electronPath = createRequire(import.meta.url)('electron');
const env = { ...process.env, LATCH_RENDERER_URL: 'http://127.0.0.1:5173/' };
delete env.ELECTRON_RUN_AS_NODE;
let electron;
let stopping = false;
let restarting = false;
let restart;
function launch() {
  const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  electron = child;
  child.on('error', (error) => {
    console.error(error.message);
    void stop(1);
  });
  child.on('exit', (code) => {
    if (electron === child && !restarting) void stop(code ?? 0);
  });
}
const watcher = watch(desktop, (_, filename) => {
  if (!filename?.endsWith('.cjs') || stopping) return;
  clearTimeout(restart);
  restart = setTimeout(() => {
    if (stopping || restarting) return;
    restarting = true;
    const previous = electron;
    const start = () => {
      clearTimeout(restart);
      restarting = false;
      if (!stopping) launch();
    };
    // Keep the exiting child tracked so repeated builds and shutdown cannot orphan it.
    if (previous && previous.exitCode === null && previous.signalCode === null) {
      previous.once('exit', start);
      previous.kill();
    } else start();
  }, 150);
});
const pack = spawn('pnpm', ['exec', 'vp', 'pack', '--watch'], { cwd: root, stdio: 'inherit' });
pack.on('error', (error) => {
  console.error(error.message);
  void stop(1);
});
pack.on('exit', (code) => {
  if (!stopping) void stop(code ?? 1);
});
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(restart);
  watcher.close();
  if (electron && !electron.killed) electron.kill();
  pack.kill();
  await server.close();
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void stop());
launch();
