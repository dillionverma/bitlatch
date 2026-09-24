import { defineConfig } from 'vite-plus';

export default defineConfig({
  // Native builds and signing depend on the host, provisioning profiles, and environment.
  run: { cache: false },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true, denyWarnings: true },
  },
  fmt: {
    singleQuote: true,
    sortPackageJson: false,
    ignorePatterns: ['assets/brand/**', 'apps/raycast/raycast-env.d.ts'],
  },
});
