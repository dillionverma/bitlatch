<p align="center">
  <img src="assets/brand/macos/icon-256.png" alt="Latch icon" width="88" />
</p>

<h1 align="center">Latch</h1>

<p align="center">
  <strong>Your Bitwarden vault. A better way to use it.</strong>
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#development">Development</a>
</p>

<p align="center">
  <img src="assets/readme/vault.png" alt="Latch with a glass window over a macOS wallpaper: a clean sidebar, vault items, and a selected login with its password hidden. All accounts shown are demo data." width="1080" />
</p>

Latch is a desktop and browser client for your existing Bitwarden vault. Keep your account and passwords; there's nothing to migrate. Authentication and encryption use the official Bitwarden CLI.

- Search, copy, and generate passwords from the keyboard.
- Browse and filter your vault in the browser extension, then fill logins on websites.
- Use light and dark themes, with a glass finish and Touch ID on supported Macs.
- Access your vault from [Raycast](apps/raycast/README.md).

## Installation

| Platform                  | Download                                                                                            | Status       |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ------------ |
| macOS 14+ · Apple Silicon | [DMG](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-mac-arm64.dmg)     | Preview      |
| Windows · x64             | [Installer](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-win-x64.exe) | Experimental |
| Linux · x64 and arm64     | [AppImage / deb](https://github.com/dillionverma/latch/releases/tag/v0.3.0)                         | Experimental |

1. Install the [Bitwarden CLI](https://bitwarden.com/help/cli/): `brew install bitwarden-cli` on Mac, or `npm install -g @bitwarden/cli` with Node.js and npm on Windows or Linux.
2. Download and install Latch. On Mac, move it to **Applications**.
3. Open Latch and sign in to your Bitwarden account.

Mac previews are not notarized. If macOS blocks Latch, try opening it once, then use **System Settings → Privacy & Security → Open Anyway**. Windows previews are unsigned. Updates are manual.

[Full setup and upgrade guide](INSTALL.md) · [All downloads and checksums](https://github.com/dillionverma/latch/releases/tag/v0.3.0)

Downloads require repository access while Latch is private.

### Browser extensions

For **Chrome or Aside**, keep Latch running and unlock your vault:

1. In Latch, choose **Settings → Browser → Developer installation → Open extension folder**.
2. On your browser's extensions page, enable **Developer mode**.
3. Choose **Load unpacked**, select that folder, and open the Latch extension.

Reload the extension and refresh website tabs after updating Latch. Firefox supports temporary installation only. Safari and macOS AutoFill aren't included in this preview. [Browser setup and availability](INSTALL.md#browser-extensions).

## Development

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

[Development, checks, and releases](CONTRIBUTING.md) · [MIT license](LICENSE)
