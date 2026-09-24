# Latch

A private macOS app and Chrome/Aside extension for Bitwarden vaults.

## Run

Requires Apple Silicon macOS, Node 24.11+ (or 22.18+), pnpm 11.25.0, and the official Bitwarden CLI.

```sh
brew install bitwarden-cli
pnpm install --frozen-lockfile
pnpm run dev
```

Run these commands from the repository root. Sign in, then use Settings to connect the browser. Load `apps/desktop/dist/extension` as an unpacked extension from `chrome://extensions`.

The root `package.json` pins pnpm. The workspace uses one root install and `pnpm-lock.yaml` for `apps/desktop`, `apps/extension`, `apps/raycast`, and `packages/shared`. `pnpm-workspace.yaml` defines the packages and the hoisted layout used by Electron packaging. Desktop and extension versions live in their app manifests (currently `0.2.1`); the root package has no version.

`pnpm run dev` watches Electron bundles, restarts Electron when they change, and serves the renderer through Vite with hot reload. It builds native AutoFill and Chrome outputs when missing, then reuses them; it does not watch those targets. Run `pnpm --filter @latch/desktop build` to rebuild native code and Chrome assets, then restart development. For browser development with reload support, use `pnpm run extension:dev` separately.

## Build

```sh
pnpm run check
pnpm run package
```

Vite+ owns renderer builds, desktop bundling (tsdown/Rolldown), formatting (Oxfmt), and type-aware lint/type checks (Oxlint/TypeScript Go). Root tooling configuration lives in `vite.config.mjs`; desktop build configuration is in `apps/desktop/vite.config.mjs`. The `1.0.0-rc.0` toolchain is pinned exactly. `pnpm run check` checks formatting and workspace source, then runs the full build: desktop, Chrome, Firefox and Safari web extensions, native AutoFill and Safari code on macOS, and Raycast.

Use `pnpm run format`, `pnpm run lint`, or `pnpm run typecheck` for individual checks. `pnpm --filter @latch/desktop build` builds desktop, native AutoFill and Chrome; `pnpm run extension:build` builds all three web-extension targets. Raycast uses `pnpm --filter latch dev` and `pnpm --filter latch build`; see [Raycast setup](apps/raycast/README.md). WXT, Raycast CLI, electron-builder, and Apple signing remain responsible for their platform-specific outputs. Vite+ is project-local; no global installation is needed.

Browser ZIPs are built with `pnpm run extension:zip`. To rebuild the Firefox source ZIP after extraction, run `pnpm install --frozen-lockfile && pnpm --filter @latch/extension build:firefox`.

Desktop build output is in `apps/desktop/dist/`, browser output in `apps/extension/.output/`, and desktop packages in `apps/desktop/release/`. `pnpm run package` produces `apps/desktop/release/mac-arm64/Latch.app`, unsigned and not notarized.

Packaging is configured in `apps/desktop/electron-builder.ts`. Build each platform on that platform:

```sh
pnpm run package:mac    # DMG and zip, Apple Silicon
pnpm run package:linux  # AppImage and deb, host architecture
pnpm run package:win    # NSIS installer, host architecture
```

The Desktop packages workflow builds unsigned macOS arm64 and Linux x64/arm64 packages when run manually, and keeps them as workflow artifacts. Linux packages build, but the Bitwarden CLI lookup and browser registration are still macOS-only. The Windows package builds, but Windows cannot run Latch yet: its local connections use Unix sockets.

Stable `vX.Y.Z` tags matching `apps/desktop/package.json` run the separate macOS release draft workflow. It requires Apple signing secrets and is configured to sign, notarize, and create a draft release with update metadata; that configuration does not establish a successful notarization. `pnpm run package:release` runs the same signing/notarization path locally without publishing.

Native macOS AutoFill needs Xcode to build and Apple provisioning profiles for the app and its Credential Provider extension. See [AutoFill setup](apps/desktop/native/autofill/README.md). The system enable prompt requires macOS 15 or later; macOS 14 opens System Settings instead.

Shortcuts: ⌘K search, ⌘N new login, ⌘L lock, ⌘, Settings.

The desktop uses Electron's native sidebar vibrancy, macOS system colors, native text context menus, and confirmation sheets. Content panes stay opaque. Light/dark appearance, accent colors, and inactive selections follow macOS. Reduce Transparency or Increase Contrast uses a solid background. `LATCH_MATERIAL=solid pnpm run dev` forces a solid background. The existing glass addon is optional: `LATCH_MATERIAL=glass pnpm run dev` enables it on the supported macOS 27.0 build.

See [security limits](SECURITY.md) and the [MIT license](LICENSE). Dependency notices are generated into desktop build output; browser builds include the repository license and retained MIT attributions.
