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

**macOS · Apple Silicon:** [Download the preview](https://github.com/dillionverma/latch/releases/download/v0.1.0/Latch-0.1.0-macos-arm64.zip), unzip it, and move **Latch.app** to **Applications**. Install the official Bitwarden CLI, then open Latch and sign in.

```sh
brew install bitwarden-cli
```

**Linux:** experimental AppImage and .deb builds. **Windows:** installer packaging exists; app support is still in progress. Neither has a published download yet. See [development](#development) for build commands.

The macOS download is the older v0.1.0 preview, before the interface and integrations shown here. [Build from source](#development) for the current app. The preview is ad-hoc signed, not notarized.

## Integrations

### Browser extensions

Fill logins in Chrome and Aside, with the same extension available for Brave, Edge, Arc, Vivaldi, and Chromium. Firefox and Safari builds are also included; setup and verification status are in the notes below.

In Latch, choose **Settings → Browser → Connect browser**, then **Open folder**. Enable **Developer mode** in your browser's extensions page and choose **Load unpacked**. Keep Latch running for autofill.

### Raycast

Search your vault, unlock with Touch ID, read secure notes, and copy credentials from your launcher. **Search Vault** and **Lock Vault** use the same Latch account. [Install the Raycast extension →](apps/raycast/README.md)

### macOS AutoFill

Fill logins in Safari and supported Mac apps through the system's AutoFill interface. Requires a signed build and Apple provisioning profiles. [Set up AutoFill →](apps/desktop/native/autofill/README.md)

## Development

Node **24.11+ or 22.18+**, pnpm **11.25.0**, and Xcode for Mac builds.

```sh
git clone https://github.com/dillionverma/latch.git
cd latch
pnpm install --frozen-lockfile
pnpm run dev
```

Run `pnpm run check` before submitting changes. It checks formatting, lint, types, and all builds. The workspace uses Electron, [Vite+](https://viteplus.dev), and WXT with one install and lockfile.

<details>
<summary>Build, browser, and release notes</summary>

**Packages.** Run on the target operating system. Output is written to `apps/desktop/release/`.

```sh
pnpm run package:mac    # DMG and ZIP, Apple Silicon
pnpm run package:linux  # AppImage and deb
pnpm run package:win    # NSIS installer
```

Linux still needs CLI discovery and browser registration work. Windows needs a local transport port before the app can run. The manual [desktop workflow](.github/workflows/desktop.yml) builds unsigned macOS and Linux artifacts.

**Browsers.** Connections currently require the Mac app. Chrome and Aside have been verified; the other Chromium registrations and Firefox/Safari still need end-to-end verification. Use `pnpm run extension:dev` for Chrome development or `pnpm run extension:zip` for browser ZIPs.

For Firefox 140+, run `pnpm run extension:build`, connect the browser in Latch, and temporarily load `apps/extension/.output/firefox-mv3/manifest.json` from `about:debugging`. [Temporary installs](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) last until Firefox restarts. No signed Firefox download is published yet.

Safari's extension is embedded in the Mac app. The [signing script](apps/desktop/build/package-autofill.mjs) accepts `LATCH_SAFARI_PROFILE`; its app group must match Latch's. Native AutoFill has [separate provisioning requirements](apps/desktop/native/autofill/README.md).

**Development builds.** Desktop hot reload reuses native and browser assets after building missing outputs. Run `pnpm --filter @latch/desktop build` and restart development after changing those assets. `pnpm run check` regenerates WXT types before checking and building the workspace.

The root build selects desktop and Raycast; desktop depends on the extension build. Keep that selection to avoid duplicate extension builds in Vite+ rc.0. WXT targets run sequentially because they share generated types. Build caching is disabled for host- and signing-dependent tasks.

**Releases.** `pnpm run package` creates an unsigned, non-notarized Mac app. `pnpm run package:release` requires Apple signing inputs and notarizes without publishing. Matching stable version tags trigger the [macOS draft-release workflow](.github/workflows/release.yml).

</details>

## License

[MIT](LICENSE). Third-party notices are included in build output.
