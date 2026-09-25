import { defineConfig, lazyPlugins } from 'vite-plus';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  run: {
    tasks: {
      bundle: {
        dependsOn: ['@latch/extension#build:chrome'],
        command: ['node build/prepare.mjs', 'vp pack', 'vp build'],
      },
    },
  },
  // Independent bundles keep the sandboxed preload and unpacked native host self-contained.
  pack: ['main', 'preload', 'native-host'].map((name) => ({
    entry: { [name]: name === 'main' ? 'src/main/main.ts' : `src/${name}/index.ts` },
    outDir: 'dist/desktop',
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    dts: false,
    clean: false,
    sourcemap: false,
    deps: {
      neverBundle: ['electron', 'electron-liquid-glass', 'electron-updater'],
      onlyBundle: name === 'main' ? ['zod', 'tldts'] : [],
    },
  })),
  root: resolve(import.meta.dirname, 'src/renderer'),
  base: './',
  plugins: lazyPlugins(() => [
    react(),
    tailwindcss(),
    {
      name: 'latch-dev-csp',
      apply: 'serve',
      transformIndexHtml: (html) =>
        html
          .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
          .replace("connect-src 'none'", "connect-src 'self' ws://127.0.0.1:5173"),
    },
  ]),
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src/renderer') } },
  build: {
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: false,
    target: 'chrome120',
    sourcemap: false,
  },
});
