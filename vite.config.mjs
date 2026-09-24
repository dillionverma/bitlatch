import { defineConfig, lazyPlugins } from 'vite-plus';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
    sortPackageJson: false,
    ignorePatterns: ['design/**', 'raycast/raycast-env.d.ts'],
  },
  // Independent bundles keep the sandboxed preload and unpacked native host self-contained.
  pack: ['main', 'preload', 'native-host'].map((name) => ({
    entry: [`src/desktop/${name}.ts`],
    outDir: 'dist/desktop',
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    dts: false,
    clean: false,
    sourcemap: false,
    deps: {
      neverBundle: ['electron', 'electron-liquid-glass'],
      onlyBundle: name === 'main' ? ['zod', 'tldts'] : [],
    },
  })),
  root: resolve(import.meta.dirname, 'src/renderer'),
  base: './',
  plugins: lazyPlugins(() => [react(), tailwindcss()]),
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src/renderer') } },
  build: {
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: false,
    target: 'chrome120',
    sourcemap: false,
  },
});
