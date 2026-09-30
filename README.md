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

| Platform                                                                                                                                                                                                                                                                                                                                                                    | Availability                 | Get Latch                                                                                                                                                                                                                                                                             |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/apple_dark.svg" /><img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/apple.svg" width="20" height="20" alt="" /></picture> **macOS** · Apple Silicon | Preview                      | [DMG](https://github.com/dillionverma/latch/releases/download/v0.2.1/Latch-0.2.1-mac-arm64.dmg) · [ZIP](https://github.com/dillionverma/latch/releases/download/v0.2.1/Latch-0.2.1-mac-arm64.zip)                                                                                     |
| <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/linux.svg" width="20" height="20" alt="" /> **Linux**                                                                                                                                                                                                            | Experimental · AppImage, deb | [x64](https://github.com/dillionverma/latch/releases/download/v0.2.1/Latch-0.2.1-linux-x86_64.AppImage) · [arm64](https://github.com/dillionverma/latch/releases/download/v0.2.1/Latch-0.2.1-linux-arm64.AppImage) · [deb](https://github.com/dillionverma/latch/releases/tag/v0.2.1) |
| <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/windows.svg" width="20" height="20" alt="" /> **Windows**                                                                                                                                                                                                        | Experimental · x64           | [Installer](https://github.com/dillionverma/latch/releases/download/v0.2.1/Latch-0.2.1-win-x64.exe)                                                                                                                                                                                   |

Unsigned previews. Linux and Windows are experimental. [All downloads and checksums →](https://github.com/dillionverma/latch/releases/tag/v0.2.1)

<details>
<summary><strong>Set up Latch</strong></summary>

1. Install Latch: move the Mac app to **Applications**, run the Windows installer, or install the Linux deb / mark the AppImage executable.
2. Install the [official Bitwarden CLI](https://bitwarden.com/help/cli/): `brew install bitwarden-cli` on Mac, or `npm install -g @bitwarden/cli` on Windows and Linux.
3. Restart Latch and sign in to your Bitwarden account.

Keep `bw` on your PATH, or point `LATCH_BW_PATH` to it. Mac previews are not notarized; Windows previews are not code-signed.

</details>

### Browser extensions

Search your vault from the extension, filter by favorites, website, or item type, and copy login fields or secure notes. Use the Latch button in a login field to fill an account. Keep the desktop app running. **Settings → Browser** has separate Safari, Chrome, and Firefox setup buttons. Safari opens its extension settings in supported signed builds. Chrome and Firefox installation buttons become available when their published install links are configured; the current preview still uses the developer setup below.

<details>
<summary><img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/chrome.svg" width="20" height="20" alt="" /> <strong>Chrome & Chromium browsers</strong></summary>

<img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/chrome.svg" width="20" height="20" alt="" /> Chrome · <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/brave.svg" width="20" height="20" alt="" /> Brave · <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/edge.svg" width="20" height="20" alt="" /> Edge · <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/arc_browser.svg" width="20" height="20" alt="" /> Arc · <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/vivaldi.svg" width="20" height="20" alt="" /> Vivaldi · <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/chromium.svg" width="20" height="20" alt="" /> Chromium · Aside

1. In Latch, open **Settings → Browser → Developer installation → Open extension folder**, or extract the [Chrome ZIP](https://github.com/dillionverma/latch/releases/download/v0.2.1/latch-0.2.1-chrome.zip).
2. Open your browser's extensions page and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder Latch opened.

Open the extension to connect. Latch handles desktop setup automatically and shows **Connected** in Settings. Reload the extension after updating Latch.

Chrome and Aside have been verified; the other Chromium browsers still need end-to-end verification.

</details>

<details>
<summary><img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/firefox.svg" width="20" height="20" alt="" /> <strong>Firefox</strong> · developer preview</summary>

Requires Firefox 140+.

1. Extract the [Firefox ZIP](https://github.com/dillionverma/latch/releases/download/v0.2.1/latch-0.2.1-firefox.zip) and start Latch.
2. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on**.
3. Select `manifest.json` from the extracted folder.

Temporary installation lasts until Firefox restarts. No signed download is available; end-to-end verification is pending.

</details>

<details>
<summary><img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/safari.svg" width="20" height="20" alt="" /> <strong>Safari</strong> · signed builds</summary>

The unsigned preview does not include a working Safari integration. Safari and native macOS AutoFill require a signed app with matching Apple provisioning profiles. The [Safari ZIP](https://github.com/dillionverma/latch/releases/download/v0.2.1/latch-0.2.1-safari.zip) contains web assets for developers, not an installable app.

- **Safari extension:** build with `pnpm run package:autofill` and provide `LATCH_SAFARI_PROFILE` alongside the app and AutoFill profiles. Its app group must match Latch's. End-to-end verification is pending.
- **macOS AutoFill:** follow the [signing and setup guide](apps/desktop/native/autofill/README.md).

</details>

### Raycast

<img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/raycast.svg" width="20" height="20" alt="" /> **Latch for Raycast** brings vault search, unlocking, and copying to your launcher on Mac. [Install the extension →](apps/raycast/README.md)

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

**Releases.** `pnpm run package:dir` creates an unsigned, non-notarized Mac app. `pnpm run package:mac:signed` requires Apple signing inputs and notarizes without publishing. The [release workflow](.github/workflows/release.yml) checks, builds, and publishes all desktop and browser packages with SHA-256 checksums. Push a matching `vX.Y.Z` tag or run it manually with the version; manual runs create the tag only after successful builds. The separate [signed macOS workflow](.github/workflows/release-macos-signed.yml) produces notarized artifacts for an existing tag without modifying published releases. Add `LATCH_SAFARI_PROFILE_BASE64` to include Safari.

Release logic lives in `scripts/release.mjs`; `.github/release-notes.md` holds the preview notes. Artifact checks run locally without publishing:

```sh
node scripts/release.mjs validate v0.2.1
node scripts/release.mjs verify v0.2.1 /path/to/collected-artifacts
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
