import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Install the approved Icon Composer exports. Do not regenerate the old green lock.
const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'design/latch-glass-icon');
await copyFile(resolve(source, 'macos/Latch.icns'), resolve(root, 'assets/icon.icns'));
await copyFile(resolve(source, 'macos/default-1024.png'), resolve(root, 'assets/icon.png'));
await mkdir(resolve(root, 'assets/extension-public'), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await copyFile(
    resolve(source, `chrome/icon-${size}.png`),
    resolve(root, `assets/icon-${size}.png`),
  );
  await copyFile(
    resolve(root, `assets/icon-${size}.png`),
    resolve(root, `assets/extension-public/icon-${size}.png`),
  );
}
