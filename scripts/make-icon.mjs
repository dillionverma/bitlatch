import { execFileSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const iconset = resolve(root, 'assets/latch.iconset');
await mkdir(iconset, { recursive: true });
execFileSync('swift', [resolve(root, 'scripts/make-icon.swift'), resolve(root, 'assets/icon.png')]);
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    execFileSync(
      'sips',
      [
        '-z',
        String(size * scale),
        String(size * scale),
        resolve(root, 'assets/icon.png'),
        '--out',
        resolve(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`),
      ],
      { stdio: 'ignore' },
    );
  }
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', resolve(root, 'assets/icon.icns')]);
await rm(iconset, { recursive: true });
