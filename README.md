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

### Homebrew

_Coming soon. Planned command:_

```sh
brew install --cask dillionverma/tap/latch
```

### Prerequisites

A Bitwarden account and the [official Bitwarden CLI](https://bitwarden.com/help/cli/). On macOS:

```sh
brew install bitwarden-cli
```

### Direct download

- **macOS 14+ · Apple Silicon:** [DMG](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-mac-arm64.dmg)
- **Windows · x64:** [Installer](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-win-x64.exe) · experimental
- **Linux · x64 / ARM64:** [AppImage & deb](https://github.com/dillionverma/latch/releases/tag/v0.3.0) · experimental

Install Latch, open it, and sign in. On Mac, move it to Applications first.

Mac previews are not notarized ([first-launch help](https://support.apple.com/en-us/102445)); Windows builds are unsigned. [All downloads & checksums](https://github.com/dillionverma/latch/releases/tag/v0.3.0).

### Browser extensions

- **Chrome, Edge, Brave, Arc, Aside, Vivaldi & Chromium:** [Download](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-chrome.zip) · [Setup](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)
- **Firefox preview:** [Download](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-firefox.zip) · [Setup](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)

Extract the ZIP before setup. Keep Latch running and your vault unlocked. Safari is not available in this preview.

### Raycast

Search your vault, copy credentials, and lock Latch from Raycast on macOS.

[Download source ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-raycast.zip) · [Setup](apps/raycast/README.md#install-from-source). Store installation coming soon.

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
