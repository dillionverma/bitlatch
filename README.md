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

Install the desktop app first, then add the browser extension if you want autofill.

### Desktop

| Platform                                                                                                                                                                                                                                                                                                                                                                        | Download                                                                                                                                                                                                         |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/apple_dark.svg" /><img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/apple.svg" width="20" height="20" alt="" /></picture> **macOS 14+** · Apple Silicon | [DMG](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-mac-arm64.dmg) · [ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-mac-arm64.zip)                |
| <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/windows.svg" width="20" height="20" alt="" /> **Windows** · x64                                                                                                                                                                                                      | [Installer (.exe)](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-win-x64.exe)                                                                                                       |
| <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/linux.svg" width="20" height="20" alt="" /> **Linux** · x64                                                                                                                                                                                                          | [AppImage](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-linux-x86_64.AppImage) · [deb](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-linux-amd64.deb) |
| <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/linux.svg" width="20" height="20" alt="" /> **Linux** · arm64                                                                                                                                                                                                        | [AppImage](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-linux-arm64.AppImage) · [deb](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-linux-arm64.deb)  |

[All downloads and checksums](https://github.com/dillionverma/latch/releases/tag/v0.3.0). Windows and Linux are experimental. Downloads require repository access while Latch is private.

#### Set up your vault

1. Install the [official Bitwarden CLI](https://bitwarden.com/help/cli/) using the command for your computer:

   | Platform        | Command                                                    |
   | :-------------- | :--------------------------------------------------------- |
   | macOS           | `brew install bitwarden-cli`                               |
   | Windows / Linux | `npm install -g @bitwarden/cli` · requires Node.js and npm |

2. Install Latch. On Mac, drag it to **Applications**. On Windows, run the installer. On Linux, install the deb or mark the AppImage executable.
3. Open Latch and sign in to your Bitwarden account. If Latch was already open when you installed the CLI, quit and reopen it.

**Mac won't open Latch?** This preview is not notarized. Try opening it once, then choose **System Settings → Privacy & Security → Open Anyway**. [Apple's instructions](https://support.apple.com/en-us/102445).

<details>
<summary>Windows / Linux setup and CLI troubleshooting</summary>

- Windows previews are unsigned, so Windows may show an unrecognized-app warning.
- For a Linux AppImage, run `chmod +x Latch-0.3.0-linux-*.AppImage`, then open the file. Choose the download matching your computer's architecture.
- If Latch cannot find the CLI, keep `bw` on your PATH or set `LATCH_BW_PATH` to its full path in the environment used to launch Latch. Restart Latch afterward.
- Windows and Linux packages still need end-to-end verification.

</details>

#### Homebrew tap · coming soon

The tap is not published yet. Use the GitHub downloads above for now.

Planned command:

```sh
brew install --cask dillionverma/tap/latch
```

### Browser extensions

Keep Latch running and your vault unlocked. Browser installation is manual for this preview.

#### <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/chrome.svg" width="20" height="20" alt="" /> Chrome & Aside

1. In Latch, choose **Settings → Browser → Developer installation → Open extension folder**.
2. Open your browser's extensions page, such as `chrome://extensions`, and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder Latch opened.
4. Pin Latch to the toolbar and open it. **Settings → Browser** in the desktop app shows **Connected** when setup succeeds.

You can now search and copy from the popup, or fill a login using the Latch button inside a website's login field.

Prefer a separate download? Extract the [Chrome ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-chrome.zip) to a permanent folder and load that folder instead. Keep it at the same path.

<details>
<summary>Firefox, other Chromium browsers, Safari & Raycast</summary>

**<img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/firefox.svg" width="20" height="20" alt="" /> Firefox 140+ · temporary install**

1. Extract the [Firefox ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-firefox.zip) and start Latch.
2. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on**.
3. Select `manifest.json` from the extracted folder.

Repeat after each Firefox restart. No signed download is available; end-to-end verification is pending.

**Other Chromium browsers**

Brave, Edge, Arc, Vivaldi, and Chromium use the Chrome instructions above. Chrome and Aside have been verified; the others still need end-to-end verification.

**<img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/safari.svg" width="20" height="20" alt="" /> Safari & macOS AutoFill · not included in the preview**

These require a signed app with matching Apple provisioning profiles. Follow the [signing and setup guide](apps/desktop/native/autofill/README.md). To include Safari, provide `LATCH_SAFARI_PROFILE` alongside the app and AutoFill profiles when running `pnpm run package:autofill`. Its app group must match Latch's. Safari end-to-end verification is pending.

The [Safari ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-safari.zip) contains developer web assets, not an installable app.

**<img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/raycast.svg" width="20" height="20" alt="" /> Raycast · development install**

Requires a source checkout and development import. [Set up Latch for Raycast](apps/raycast/README.md). No packaged download or public store listing is available.

</details>

<details>
<summary>Update Latch and its extensions</summary>

Preview releases do not update automatically.

1. Quit Latch and replace the Mac app or Linux AppImage, or run the newer Windows installer or Linux package update.
2. Reopen Latch. Reload the extension on your browser's extensions page, then refresh open website tabs.

If you loaded a separate Chrome ZIP folder, replace its contents before reloading. For Firefox, extract the newer ZIP and load its `manifest.json` again.

</details>

## Development

Node **24.11+ or 22.18+**, pnpm **11.25.0**, and Xcode for Mac builds.

```sh
git clone https://github.com/dillionverma/latch.git
cd latch
pnpm install --frozen-lockfile
pnpm run dev
```

Run `pnpm run check` and `pnpm run build` before submitting changes. The first checks formatting, lint, and types; the second builds all targets. The workspace uses Electron, [Vite+](https://viteplus.dev), and WXT with one install and lockfile.

`pnpm run test:matcher` runs the synthetic URL-matching suite and is included in `pnpm run check`. Default and Host matching require the same hostname. Base domain also includes subdomains under recognized public or private suffixes. An omitted port matches any port; an explicit port stays restrictive, including `:443` and `:80`. Explicit schemes must match. Scheme-less host/domain entries allow HTTPS or approved local HTTP. Ambiguous single-label names with ports need an explicit scheme, except `localhost:port`. Exact and Starts with retain full-URL and same-origin restrictions. Regex and Never do not autofill.

On supported Macs, a password unlock enables Touch ID unless it was turned off in Settings. The locked app requests Touch ID when brought to the front. Auto-lock defaults to Never, including sleep and screen lock; manual lock and quitting still lock immediately. Selecting an idle timeout also enables locking on sleep and screen lock.

<details>
<summary>Packaging and release notes</summary>

**Packages.** Run on the target operating system. Output is written to `apps/desktop/release/`.

```sh
pnpm run package:mac    # DMG and ZIP, Apple Silicon
pnpm run package:linux  # AppImage and deb
pnpm run package:win    # NSIS installer
```

The [desktop workflow](.github/workflows/desktop.yml) builds macOS arm64, Windows x64, and Linux x64 / arm64 packages on their native runners.

**Development builds.** Desktop hot reload reuses native and browser assets after building missing outputs. Run `pnpm --filter @latch/desktop build` and restart development after changing those assets. `pnpm run check` regenerates WXT types before checking the workspace.

Desktop builds depend only on Chrome assets. The root build adds Firefox, Safari, the native Safari wrapper on macOS, and Raycast. WXT targets run sequentially because they share generated types. Signed packaging builds Safari only when its profile is supplied. Build caching remains disabled for host- and signing-dependent tasks.

**Releases.** `pnpm run package:dir` creates an ad-hoc signed, non-notarized Mac app without the provisioned macOS extensions. `pnpm run package:mac:signed` requires Apple signing inputs and notarizes without publishing. The [release workflow](.github/workflows/release.yml) checks, builds, and publishes all desktop and browser packages with SHA-256 checksums. Push a matching `vX.Y.Z` tag or run it manually with the version; manual runs create the tag only after successful builds. The separate [signed macOS workflow](.github/workflows/release-macos-signed.yml) produces notarized artifacts for an existing tag without modifying published releases. Add `LATCH_SAFARI_PROFILE_BASE64` to include Safari.

Release logic lives in `scripts/release.mjs`; `.github/release-notes.md` holds the preview notes. Artifact checks run locally without publishing:

```sh
node scripts/release.mjs validate v0.3.0
node scripts/release.mjs verify v0.3.0 /path/to/collected-artifacts
```

Validation requires matching desktop/extension versions and rejects a local tag pointing at another commit. Artifact verification requires all eleven expected payloads, rejects empty or unexpected files, and writes `SHA256SUMS`. Publication is a separate workflow step that preserves draft and tag checks. The internal shared package is not release-versioned with the apps.

**Browser install buttons.** Set `extensionUrls` in `apps/desktop/src/main/browser-setup.ts` to the published Chrome Web Store listing and Firefox listing or Mozilla-signed HTTPS XPI download. Keep the Chrome store ID aligned with `packages/shared/extension.json` and Firefox's ID with `packages/shared/src/browser-targets.ts` so native messaging remains authorized. URLs stay in the main process; buttons open the selected browser, not the default browser. Safari uses Apple's extension-settings API and is available only when Safari recognizes the bundled extension. Connection status remains shared across browsers.

**Browser packages.** Run `pnpm run extension:zip` for Chrome, Firefox, Safari web assets, and Firefox sources. To rebuild the downloaded sources archive, extract it and run from its root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec wxt build apps/extension -b firefox
```

Verified with Node 24.20.0, pnpm 11.25.0, and WXT 0.21.4. Output: `apps/extension/.output/firefox-mv3/`.

</details>

## License

[MIT](LICENSE).
