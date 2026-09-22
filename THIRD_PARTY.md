# Third-party software

Latch's original source is licensed under GPL-3.0-only. See [LICENSE](LICENSE).

## Bitwarden

Latch communicates with the user's **separately installed official Bitwarden CLI**. It does not redistribute that CLI in the packaged Mac application. The npm CLI and the historical automated test dependencies have been removed from the project.

The npm CLI bundle contains modules from `bitwarden_license`. Its package declares `SEE LICENSE IN LICENSE.txt`. Do not assume that all of that bundle is GPL or include it in a public release without a license inventory and the necessary rights.

- [CLI source at the tested release](https://github.com/bitwarden/clients/tree/77d62ade0fe91a502b7cfb9d8d894c2746c5609a/apps/cli)
- [Upstream license](https://github.com/bitwarden/clients/blob/77d62ade0fe91a502b7cfb9d8d894c2746c5609a/LICENSE.txt)
- [Separately licensed modules](https://github.com/bitwarden/clients/blob/77d62ade0fe91a502b7cfb9d8d894c2746c5609a/LICENSE_BITWARDEN.txt)
- [Official CLI installation](https://bitwarden.com/help/cli/)

Latch is independent and is not affiliated with or endorsed by Bitwarden.

## Other components

Electron, React, TanStack Virtual, Lucide, Zod, tldts, Radix Primitives, Sonner, class-variance-authority, clsx, and tailwind-merge are used under their respective licenses. Tailwind CSS and tw-animate-css supply bundled CSS. Build dependencies and exact resolved versions are recorded in `package-lock.json`. Electron includes Chromium and its third-party notices in the application bundle. The JS dependencies retain license comments in the generated bundles.

The visual direction takes inspiration from [Monocode](https://github.com/hardbeat920/monocode); Latch's interface and icon are original implementations.

The controls in `src/renderer/components/ui` were generated from the official shadcn registry with shadcn CLI 4.21.0, Radix Nova, neutral base and Lucide icons. They are adapted for Latch sizing, focus, system appearance and immediate overlay removal. The upstream MIT notice is retained in `licenses/shadcn-ui-LICENSE.txt`.

The build emits `dist/THIRD_PARTY_NOTICES.txt`, included by the existing `dist/**/*` packaging rule. It includes shadcn source, bundled package notices and their declared runtime dependency notices, including nested versions. This conservative notice set can include unused exports of Radix's aggregate package; tree shaking determines which code ships. Missing notices fail the build.

`react-remove-scroll-bar@2.3.8` omits its license file from npm. Its upstream MIT notice is retained in `licenses/react-remove-scroll-bar-LICENSE.txt`, retrieved from [the upstream license](https://github.com/theKashey/react-remove-scroll-bar/blob/master/LICENSE) (Git blob `7c08c3990396ecefd90f99ff5d9a34f26f5b5616`). Dependency versions are pinned by `package-lock.json`.

No Radix Themes, next-themes, remote fonts, Bitwarden npm bundle, or automated test runtime is shipped.

## Optional native appearance

`electron-liquid-glass` 1.1.1 and `node-gyp-build` 4.8.4 are pinned runtime dependencies. The addon is external to the main bundle; its arm64 N-API prebuild is unpacked under `app.asar.unpacked/node_modules/electron-liquid-glass/prebuilds/darwin-arm64/`. The build notice inventory includes the addon, loader and declared transitive dependencies. Only public `addView` is used. No unstable APIs are called. Glass is developer opt-in; solid is the default.
