<p align="center">
  <img src="assets/brand/macos/icon-256.png" alt="Latch icon" width="88" />
</p>

<h1 align="center">Latch</h1>

<p align="center">
  <strong>Your Bitwarden vault, at home on Mac.</strong>
</p>

<p align="center">
  <a href="#highlights">Highlights</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#integrations">Integrations</a> ·
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
- 🌐 **Bring your browser.** One extension for Chrome, Aside, Brave, Edge, Arc, Vivaldi, and Chromium, plus Firefox and Safari build targets. [Setup and availability](#browser-extensions).
- 🚀 **Raycast, too.** Search, unlock with Touch ID, read secure notes, and copy credentials from your launcher. [Set it up](#raycast).
- 🔑 **Your existing Bitwarden account.** Keep using your vault and the official Bitwarden CLI.

## Installation

| Platform                  | Install                                                                                                                                                        | Availability          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **macOS · Apple Silicon** | [Download ZIP](https://github.com/dillionverma/latch/releases/download/v0.1.0/Latch-0.1.0-macos-arm64.zip), unzip, and move **Latch.app** to **Applications**. | Early preview, v0.1.0 |
| **Linux · x64 / arm64**   | [Build an AppImage or .deb](#development) with `pnpm run package:linux`.                                                                                       | Experimental          |
| **Windows**               | [Build an .exe installer](#development) with `pnpm run package:win`.                                                                                           | Runtime port pending  |

The published macOS preview predates the current interface, Touch ID, and Raycast integration. [Build from source](#development) for the features shown here. Linux and Windows do not have published downloads yet. Linux still needs CLI discovery and browser integration work; Windows needs a local transport port before the app can run.

On macOS, install the official Bitwarden CLI before opening Latch:

```sh
brew install bitwarden-cli
```

Open Latch, sign in to your Bitwarden account, and unlock your vault. The current download is ad-hoc signed, not notarized; see the [release notes](https://github.com/dillionverma/latch/releases/tag/v0.1.0).

## Integrations

### Browser extensions

Fill matching logins from your unlocked vault. Browser connections currently require the Mac app.

| Browser                                     | Extension                                    | Availability                                                       |
| ------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| **Chrome · Aside**                          | Chromium extension                           | Verified with the desktop app                                      |
| **Brave · Edge · Arc · Vivaldi · Chromium** | Same Chromium extension                      | Native bridge included; verification pending                       |
| **Firefox 140+**                            | Firefox extension                            | Build and native bridge included; temporary development install    |
| **Safari**                                  | Safari web extension embedded in the Mac app | Signing and provisioning required; end-to-end verification pending |

For Chromium browsers, open **Settings → Browser → Connect browser** in Latch, then **Open folder**. In your browser's extensions page, enable **Developer mode**, choose **Load unpacked**, and select that folder. Keep Latch running for autofill. In source builds, the folder is `apps/desktop/dist/extension`.

<details>
<summary>Firefox and Safari setup</summary>

**Firefox:** build the extension with `pnpm run extension:build` and connect the browser from Latch's Settings. Open `about:debugging`, choose **This Firefox → Load Temporary Add-on**, and select `apps/extension/.output/firefox-mv3/manifest.json`. This development installation lasts until Firefox restarts; see [Mozilla's instructions](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/). No signed Firefox download is published yet.

**Safari:** the desktop build embeds `LatchSafari.appex`. It requires Apple signing and a Safari provisioning profile through `LATCH_SAFARI_PROFILE`; the shared app group must match Latch's. It is not installed by loading the browser ZIP. The [signing script](apps/desktop/build/package-autofill.mjs) contains the current setup requirements.

</details>

### Raycast

Search your vault, read secure notes, copy a username or password, and lock Latch from Raycast. Unlock with your master password or Touch ID when enabled—no second Bitwarden login.

Install a current source build at `/Applications/Latch.app`, then run from the repository root:

```sh
pnpm --filter latch dev
```

Raycast imports the local extension with **Search Vault** and **Lock Vault** commands. There is no Raycast Store listing yet. See [Raycast setup and shortcuts](apps/raycast/README.md).

### macOS AutoFill

Native AutoFill connects Latch to Safari and supported Mac apps, separately from the browser extension. It requires a signed app and Credential Provider extension with Apple provisioning profiles. Follow the [AutoFill setup](apps/desktop/native/autofill/README.md).

macOS 15+ can show the system enable prompt; macOS 14 opens System Settings instead. An unsigned build does not verify system AutoFill or passkey support.

### Keyboard shortcuts

| Shortcut | Action            |
| -------- | ----------------- |
| ⌘K       | Search your vault |
| ⌘N       | Create a login    |
| ⌘L       | Lock your vault   |
| ⌘,       | Open Settings     |

## Development

Requires Node **24.11+ or 22.18+** and pnpm **11.25.0**. Mac builds also require Xcode. Use the official Bitwarden CLI for vault access.

```sh
git clone https://github.com/dillionverma/latch.git
cd latch
pnpm install --frozen-lockfile
```

One pnpm workspace and lockfile. Run commands from the repository root. Build packages on their target operating system; the Linux and Windows limitations above still apply.

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
