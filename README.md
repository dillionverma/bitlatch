<p align="center">
  <img src="assets/brand/macos/icon-256.png" alt="Latch icon" width="88" />
</p>

<h1 align="center">Latch</h1>

<p align="center">
  <strong>Your Bitwarden vault. A better way to use it.</strong>
</p>

<p align="center">
  <a href="#highlights">Highlights</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#development">Development</a>
</p>

<p align="center">
  <img src="assets/readme/vault.png" alt="Latch with a glass window over a macOS wallpaper: a clean sidebar, vault items, and a selected login with its password hidden. All accounts shown are demo data." width="1080" />
</p>

Latch is an alternative client for your existing Bitwarden vault, designed around a cleaner interface and quicker workflows. Search from the keyboard, fill logins in your browser, and access credentials from Raycast. Keep your account and vault; there's nothing to migrate.

## Highlights

- ✨ **A more considered interface.** Clear layouts, light and dark themes, and a glass finish on macOS.
- ⚡ **Keep your hands on the keyboard.** Jump to search with ⌘K / Ctrl+K, find a login, and copy what you need.
- 🌐 **Fill where you browse.** Bring Latch to Chrome, Aside, and other browsers. [See browser availability](#browser-extensions).
- 🚀 **Your vault in Raycast.** Search, unlock, and copy credentials straight from your launcher on Mac.
- 👆 **Less typing, more control.** Unlock with Touch ID on Mac, choose when your vault locks, and configure generated passwords.
- 🔑 **Keep Bitwarden underneath.** Your existing account and vault, with authentication and cryptography handled by the official Bitwarden CLI.

## Installation

### Desktop

| Platform                                                                                                                                                                                                                                                                                                                                                                        | Availability                 | Get Latch                                                                                                                                                                                                                                                                             |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/apple_dark.svg" /><img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/apple.svg" width="20" height="20" alt="" /></picture> **macOS 14+** · Apple Silicon | Preview                      | [DMG](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-mac-arm64.dmg) · [ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-mac-arm64.zip)                                                                                     |
| <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/linux.svg" width="20" height="20" alt="" /> **Linux**                                                                                                                                                                                                                | Experimental · AppImage, deb | [x64](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-linux-x86_64.AppImage) · [arm64](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-linux-arm64.AppImage) · [deb](https://github.com/dillionverma/latch/releases/tag/v0.3.0) |
| <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/windows.svg" width="20" height="20" alt="" /> **Windows**                                                                                                                                                                                                            | Experimental · x64           | [Installer](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-win-x64.exe)                                                                                                                                                                                   |

Preview builds. Mac packages are ad-hoc signed and not notarized. Windows packages are unsigned. Linux and Windows are experimental. [All downloads and checksums →](https://github.com/dillionverma/latch/releases/tag/v0.3.0)

While this repository is private, sign in to a GitHub account with repository access to download releases.

<details>
<summary><strong>Set up Latch</strong></summary>

1. Install the [official Bitwarden CLI](https://bitwarden.com/help/cli/) separately. On Mac, run `brew install bitwarden-cli`. On Windows or Linux with Node.js and npm installed, run `npm install -g @bitwarden/cli`.
2. Install Latch for your platform:
   - **Mac:** open the DMG and drag Latch to **Applications**, or extract the ZIP and move `Latch.app` there. Open Latch once. If macOS blocks the non-notarized app, open **System Settings → Privacy & Security → Open Anyway**, then confirm **Open**. See [Apple's instructions](https://support.apple.com/en-us/102445).
   - **Windows:** run the x64 installer. This preview is not code-signed, so Windows may show an unrecognized-app warning.
   - **Linux:** install the deb for your architecture with your package manager. For an AppImage, run `chmod +x Latch-0.3.0-linux-*.AppImage`, then open the downloaded file.
3. Start Latch and sign in to your Bitwarden account. If Latch was already open when you installed the CLI, quit and reopen it first.

Keep `bw` on your PATH, or set `LATCH_BW_PATH` to its full path in the environment used to launch Latch. Mac previews are not notarized. Windows and Linux packages still need end-to-end verification.

**Upgrading a preview.** Preview releases do not update automatically. Quit Latch, replace the Mac app or Linux AppImage, or run the newer Windows installer or Linux package update. Start Latch again. Update and reload the browser extension as described below, then refresh open website tabs.

</details>

### Browser extensions

Search and autofill from your browser. Keep Latch running and your vault unlocked.

<details>
<summary><img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/chrome.svg" width="20" height="20" alt="" /> <strong>Chrome & Chromium browsers</strong></summary>

<img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/chrome.svg" width="20" height="20" alt="" /> Chrome · <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/brave.svg" width="20" height="20" alt="" /> Brave · <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/edge.svg" width="20" height="20" alt="" /> Edge · <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/arc_browser.svg" width="20" height="20" alt="" /> Arc · <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/vivaldi.svg" width="20" height="20" alt="" /> Vivaldi · <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/chromium.svg" width="20" height="20" alt="" /> Chromium · Aside

1. Install Latch in its permanent location first. In Latch, open **Settings → Browser → Developer installation → Open extension folder**. This bundled folder is the recommended source. Alternatively, extract the [Chrome ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-chrome.zip) into a permanent folder that you will keep.
2. Open your browser's extensions page, such as `chrome://extensions`, and enable **Developer mode**. It is required for this installation method.
3. Choose **Load unpacked** and select the folder containing `manifest.json`, either the folder Latch opened or your extracted ZIP folder.
4. Pin Latch to the browser toolbar and open the extension. Latch handles desktop setup automatically and shows **Connected** in Settings.

After updating the desktop app, reload Latch on the browser's extensions page, then refresh open website tabs. If you loaded a separate ZIP folder, replace its contents with the new Chrome ZIP before reloading. Keep the folder at the same path.

Chrome and Aside have been verified; the other Chromium browsers still need end-to-end verification.

</details>

<details>
<summary><img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/firefox.svg" width="20" height="20" alt="" /> <strong>Firefox</strong> · developer preview</summary>

Requires Firefox 140+.

1. Extract the [Firefox ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-firefox.zip) and start Latch.
2. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on**.
3. Select `manifest.json` from the extracted folder.

Temporary installation lasts until Firefox restarts. Repeat these steps after each restart. To upgrade, extract the newer Firefox ZIP and load its `manifest.json` again, then refresh open website tabs. No signed download is available; end-to-end verification is pending.

</details>

<details>
<summary><img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/safari.svg" width="20" height="20" alt="" /> <strong>Safari</strong> · signed builds</summary>

The non-notarized preview does not include a working Safari integration. Safari and native macOS AutoFill require a signed app with matching Apple provisioning profiles. The [Safari ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-safari.zip) contains web assets for developers, not an installable app.

- **Safari extension:** build with `pnpm run package:autofill` and provide `LATCH_SAFARI_PROFILE` alongside the app and AutoFill profiles. Its app group must match Latch's. End-to-end verification is pending.
- **macOS AutoFill:** follow the [signing and setup guide](apps/desktop/native/autofill/README.md).

</details>

### Raycast

<img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/raycast.svg" width="20" height="20" alt="" /> **Latch for Raycast** brings vault search, unlocking, and copying to your launcher on Mac. [Download the source ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-raycast.zip) · [Setup instructions](apps/raycast/README.md#install-from-source). Raycast Store installation is coming soon.

## Development

Node **24.11+ or 22.18+**, pnpm **11.25.0**, and Xcode for Mac builds.

```sh
git clone https://github.com/dillionverma/latch.git
cd latch
pnpm install --frozen-lockfile
pnpm run dev
```

Run `pnpm run check` and `pnpm run build` before submitting changes.

[Contributing](CONTRIBUTING.md) · [Release workflow](.github/workflows/release.yml)

## License

[MIT](LICENSE).
