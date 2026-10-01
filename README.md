<p align="center">
  <img src="assets/brand/macos/icon-256.png" alt="Bitlatch icon" width="88" />
</p>

<h1 align="center">Bitlatch</h1>

<p align="center">
  <strong>A modern, unofficial Bitwarden client.</strong>
</p>

<p align="center">
  <a href="https://bitlatch.app">Website</a> ·
  <a href="#highlights">Highlights</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#development">Development</a>
</p>

<p align="center">
  <img src="assets/readme/vault.webp" alt="Bitlatch with a glass window over a macOS wallpaper: a clean sidebar, vault items, and a selected login with its password hidden. All accounts shown are demo data." width="1080" />
</p>

Bitlatch is an alternative client for your existing Bitwarden vault, designed around a cleaner interface and quicker workflows. Search from the keyboard, fill logins in your browser, and access credentials from Raycast. Keep your account and vault; there's nothing to migrate.

Bitlatch is an independent project, not affiliated with or endorsed by Bitwarden.

## Highlights

- ✨ **A more considered interface.** Clear layouts, system colors, and native vibrancy on macOS.
- ⚡ **Keep your hands on the keyboard.** Jump to search with ⌘K / Ctrl+K, find a login, and copy what you need.
- 🌐 **Fill where you browse.** Bring Bitlatch to Chrome, Aside, and other browsers. [See browser availability](#browser-extensions).
- 🚀 **Your vault in Raycast.** Search, unlock, and copy credentials straight from your launcher on Mac.
- 👆 **Less typing, more control.** Unlock with Touch ID on Mac, choose when your vault locks, and configure generated passwords.
- 🔑 **Keep Bitwarden underneath.** Your existing account and vault, with authentication and cryptography handled by the official Bitwarden CLI.

## Screenshots

<p align="center">
  <img src="assets/readme/popup.webp" alt="Bitlatch extension popup in light mode with demo vault items." width="49%" />
  <img src="assets/readme/autofill.webp" alt="Bitlatch autofill suggestions in light mode on a demo sign-in page." width="49%" />
</p>

<p align="center">
  <img src="assets/readme/raycast.webp" alt="Bitlatch vault search in Raycast with synthetic demo accounts on the macOS Golden Gate wallpaper." width="720" />
</p>

## Installation

### Homebrew

```sh
brew install bitwarden-cli
brew install --cask dillionverma/tap/bitlatch
```

### Direct download

- <picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/apple_dark.svg" /><img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/apple.svg" width="20" height="20" alt="" /></picture> **macOS 14+ · Apple Silicon:** [DMG](https://github.com/dillionverma/latch/releases/download/v0.3.1/Bitlatch-0.3.1-mac-arm64.dmg)
- <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/windows.svg" width="20" height="20" alt="" /> **Windows · x64:** [Installer](https://github.com/dillionverma/latch/releases/download/v0.3.1/Bitlatch-0.3.1-win-x64.exe) · experimental
- <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/linux.svg" width="20" height="20" alt="" /> **Linux · x64 / ARM64:** [AppImage & deb](https://github.com/dillionverma/latch/releases/tag/v0.3.1) · experimental

### Browser extensions

- <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/chrome.svg" width="20" height="20" alt="" /> Chrome, <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/edge.svg" width="20" height="20" alt="" /> Edge, <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/brave.svg" width="20" height="20" alt="" /> Brave, <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/arc_browser.svg" width="20" height="20" alt="" /> Arc, Aside, <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/vivaldi.svg" width="20" height="20" alt="" /> Vivaldi & <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/chromium.svg" width="20" height="20" alt="" /> Chromium: [Download](https://github.com/dillionverma/latch/releases/download/v0.3.1/bitlatch-0.3.1-chrome.zip) · [Setup](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)
- <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/firefox.svg" width="20" height="20" alt="" /> **Firefox preview:** [Download](https://github.com/dillionverma/latch/releases/download/v0.3.1/bitlatch-0.3.1-firefox.zip) · [Setup](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)

### <img src="https://cdn.jsdelivr.net/gh/pheralb/svgl@ed75393dbe6eba6e446e208abb6826ecd1abd36d/static/library/raycast.svg" width="20" height="20" alt="" /> Raycast

[Download source ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.1/bitlatch-0.3.1-raycast.zip) · [Setup](apps/raycast/README.md#install-from-source). Store installation coming soon.

## Development

```sh
git clone https://github.com/dillionverma/latch.git
cd latch
pnpm install --frozen-lockfile
pnpm run dev
```

Run `pnpm run check` and `pnpm run build` before submitting changes.

[Release workflow](.github/workflows/release.yml)

## License

[MIT](LICENSE).
