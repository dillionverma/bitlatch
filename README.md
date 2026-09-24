<p align="center">
  <img src="assets/brand/macos/icon-256.png" alt="Latch icon" width="88" />
</p>

<h1 align="center">Latch</h1>

<p align="center">
  <strong>Your Bitwarden vault, at home on Mac.</strong>
</p>

<p align="center">
  <a href="#highlights">Highlights</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#development">Development</a>
</p>

<p align="center">
  <img src="assets/readme/vault.png" alt="Latch in dark mode: a sidebar, a list of vault items, and a selected login with its password hidden. All accounts shown are demo data." width="1080" />
</p>

Latch is a focused Mac companion for Bitwarden. Find a login, copy a password, or fill it in your browser. Your existing vault stays with Bitwarden; Latch uses the official CLI for authentication and vault cryptography.

## Highlights

- ⚡ **A shortcut to your vault.** Press ⌘K to search logins and secure notes from the keyboard.
- 🍎 **At home on macOS.** System colors, light and dark appearance, sidebar vibrancy, and native menus.
- 👆 **Touch ID unlock.** Enable biometrics to unlock without retyping your master password.
- 🌐 **Browser autofill.** Connect Chrome or Aside to fill matching logins from your unlocked vault.
- 🚀 **Raycast, too.** Search, unlock, and copy credentials without opening the main window.
- 🔑 **Your existing Bitwarden account.** Keep using your vault and the official Bitwarden CLI.

## Getting started

The current app targets **Apple Silicon macOS**. Start from source with Node **24.11+ or 22.18+**, pnpm **11.25.0**, and Xcode for the native components.

```sh
brew install bitwarden-cli
git clone https://github.com/dillionverma/latch.git
cd latch
pnpm install --frozen-lockfile
pnpm run dev
```

Sign in to your Bitwarden account, then unlock your vault.

**Connect your browser:** use Latch's Settings to register the browser connection, then load `apps/desktop/dist/extension` as an unpacked extension from `chrome://extensions`.

**Connect Raycast:** follow the [Raycast setup](apps/raycast/README.md).

| Shortcut | Action            |
| -------- | ----------------- |
| ⌘K       | Search your vault |
| ⌘N       | Create a login    |
| ⌘L       | Lock your vault   |
| ⌘,       | Open Settings     |

<details>
<summary>Platform support and macOS AutoFill</summary>

Linux and Windows packaging is experimental. Linux packages build, but CLI discovery and browser registration still use macOS-specific paths. Windows packages build, but the app's local connections currently depend on Unix sockets. Neither platform is ready for everyday use.

Native macOS AutoFill requires Apple provisioning profiles for both the app and its Credential Provider extension. Follow the [AutoFill setup](apps/desktop/native/autofill/README.md). macOS 15+ can show the system enable prompt; macOS 14 opens System Settings instead. A successful unsigned build does not verify system AutoFill or passkey support.

</details>

## Development

One pnpm workspace and lockfile. Run commands from the repository root.

```sh
pnpm run dev       # Desktop development with hot reload
pnpm run check     # Formatting, lint, types, and all builds
pnpm run package   # Unsigned macOS app
```

| Location                             | Purpose                                    |
| ------------------------------------ | ------------------------------------------ |
| [`apps/desktop`](apps/desktop)       | Electron app and native macOS integrations |
| [`apps/extension`](apps/extension)   | Browser extension, built with WXT          |
| [`apps/raycast`](apps/raycast)       | Raycast commands                           |
| [`packages/shared`](packages/shared) | Shared types, protocols, and branding      |

[Vite+](https://viteplus.dev) handles workspace tasks, formatting, linting, type checks, and desktop builds. WXT, Raycast CLI, and electron-builder handle their platform outputs. All tools are installed locally with the workspace.

<details>
<summary>Development commands and build behavior</summary>

| Command                    | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `pnpm run format`          | Format source                                    |
| `pnpm run lint`            | Lint and check types                             |
| `pnpm run typecheck`       | Check types only                                 |
| `pnpm run build`           | Build desktop, browser extensions, and Raycast   |
| `pnpm run extension:dev`   | Develop the Chrome extension with reload support |
| `pnpm run extension:build` | Build Chrome, Firefox, and Safari web extensions |
| `pnpm run extension:zip`   | Package browser ZIPs                             |
| `pnpm --filter latch dev`  | Develop the Raycast extension                    |

Desktop development watches Electron bundles and serves the renderer with hot reload. It builds missing native AutoFill and Chrome assets, then reuses them. After native or browser changes, run `pnpm --filter @latch/desktop build` and restart development, or use the separate extension development command for browser work.

The root [package manifest](package.json) pins Vite+ at `1.0.0-rc.0`. Tooling lives in the root [configuration](vite.config.mjs), with builds in the [desktop configuration](apps/desktop/vite.config.mjs). `check` regenerates WXT types, checks workspace source, then runs the full build, including native AutoFill and Safari code on macOS.

The root build selects desktop and Raycast. Desktop depends on the extension build; the three WXT targets run sequentially because they share generated types. Keep this selection: recursively selecting every package also builds extensions through desktop's dependency, duplicating work in Vite+ rc.0. Caching is disabled for host- and signing-dependent tasks.

To rebuild a Firefox source ZIP after extraction, run `pnpm install --frozen-lockfile` followed by `pnpm --filter @latch/extension build:firefox`.

To inspect appearance variants, prefix `pnpm run dev` with `LATCH_MATERIAL=solid`, or use `LATCH_MATERIAL=glass` on the supported macOS 27.0 build. The default uses native sidebar vibrancy, with solid backgrounds when Reduce Transparency or Increase Contrast is enabled.

</details>

<details>
<summary>Packaging and releases</summary>

Build each platform on that platform. Configuration lives in [`apps/desktop/electron-builder.ts`](apps/desktop/electron-builder.ts).

```sh
pnpm run package:mac    # DMG and ZIP, Apple Silicon
pnpm run package:linux  # AppImage and deb, host architecture
pnpm run package:win    # NSIS installer, host architecture
```

Desktop build output goes to `apps/desktop/dist/`, browser output to `apps/extension/.output/`, and desktop packages to `apps/desktop/release/`. `pnpm run package` creates `apps/desktop/release/mac-arm64/Latch.app`, unsigned and not notarized.

The manual Desktop packages workflow produces unsigned macOS arm64 and Linux x64/arm64 artifacts. Packaging success does not establish runtime support; see the platform notes above.

Stable `vX.Y.Z` tags matching `apps/desktop/package.json` trigger the macOS release draft workflow. It requires Apple signing secrets and is configured to sign, notarize, and prepare a draft release with update metadata. Use `pnpm run package:release` for the same signing path locally without publishing. The workflow configuration alone does not establish successful notarization.

</details>

## License

[MIT](LICENSE). Dependency notices are generated into desktop builds; browser builds include the repository license and retained MIT attributions.
