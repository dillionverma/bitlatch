# Latch

A private macOS app and Chrome/Aside extension for Bitwarden vaults.

## Run

Requires Apple Silicon macOS, Node 22, and the official Bitwarden CLI.

```sh
brew install bitwarden-cli
npm ci
npm run dev
```

Sign in, then use Settings to connect the browser. Load `dist/extension` as an unpacked extension from `chrome://extensions`.

## Build

```sh
npm run check
npm run format:check
npm run package
```

The app is built at `release/mac-arm64/Latch.app`. Local packages are unsigned and not notarized.

Shortcuts: ⌘K search, ⌘N new login, ⌘L lock, ⌘, Settings.

Solid navigation is the default. `LATCH_MATERIAL=glass npm run dev` enables experimental native glass on macOS 27.0. Contrast and accessibility verification are incomplete.

See [security limits](SECURITY.md) and [third-party notices](THIRD_PARTY.md).
