# Latch

A private macOS app and Chrome/Aside extension for Bitwarden vaults.

## Run

Requires Apple Silicon macOS, Node 24.11+ (or 22.18+), pnpm 11.25.0, and the official Bitwarden CLI.

```sh
brew install bitwarden-cli
pnpm install --frozen-lockfile
pnpm -C raycast install --frozen-lockfile
pnpm run dev
```

Sign in, then use Settings to connect the browser. Load `dist/extension` as an unpacked extension from `chrome://extensions`.

Both projects pin pnpm in `package.json`. Install pnpm with Corepack (`corepack enable`), then use the commands above. The root and `raycast/` retain separate lockfiles. `pnpm-workspace.yaml` holds package-manager settings, including the hoisted layout used by Electron packaging.

## Build

```sh
pnpm run check
pnpm run package
```

Vite+ owns renderer builds, desktop bundling (tsdown/Rolldown), formatting (Oxfmt), and type-aware lint/type checks (Oxlint/TypeScript Go). Configuration lives in `vite.config.mjs`; the published `1.0.0-rc.0` toolchain is pinned exactly. `pnpm run check` checks source and builds the desktop plus all browser targets. Install Raycast dependencies first so its source is also checked.

Use `pnpm run format`, `pnpm run lint`, or `pnpm run typecheck` for individual checks. `pnpm run desktop:build` runs `vp pack`; `pnpm run renderer:build` runs `vp build`. WXT, Raycast CLI, electron-builder, and Apple signing remain responsible for their platform-specific outputs. Vite+ is project-local; no global installation is needed.

The app is built at `release/mac-arm64/Latch.app`. Local packages are unsigned and not notarized.

Native macOS AutoFill needs Xcode to build and Apple provisioning profiles for the app and its Credential Provider extension. See [AutoFill setup](native/autofill/README.md). The system enable prompt requires macOS 15 or later; macOS 14 opens System Settings instead.

Shortcuts: ⌘K search, ⌘N new login, ⌘L lock, ⌘, Settings.

The desktop uses Electron's native sidebar vibrancy, macOS system colors, native text context menus, and confirmation sheets. Content panes stay opaque. Light/dark appearance, accent colors, and inactive selections follow macOS. Reduce Transparency or Increase Contrast uses a solid background. `LATCH_MATERIAL=solid pnpm run dev` forces a solid background. The existing glass addon is optional: `LATCH_MATERIAL=glass pnpm run dev` enables it on the supported macOS 27.0 build.

See [security limits](SECURITY.md) and [third-party notices](THIRD_PARTY.md).
