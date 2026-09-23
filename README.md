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

Native macOS AutoFill needs Xcode to build and Apple provisioning profiles for the app and its Credential Provider extension. See [AutoFill setup](native/autofill/README.md). The system enable prompt requires macOS 15 or later; macOS 14 opens System Settings instead.

Shortcuts: ⌘K search, ⌘N new login, ⌘L lock, ⌘, Settings.

The desktop uses Electron's native sidebar vibrancy, macOS system colors, native text context menus, and confirmation sheets. Content panes stay opaque. Light/dark appearance, accent colors, and inactive selections follow macOS. Reduce Transparency or Increase Contrast uses a solid background. `LATCH_MATERIAL=solid npm run dev` forces a solid background. The existing glass addon is optional: `LATCH_MATERIAL=glass npm run dev` enables it on the supported macOS 27.0 build.

See [security limits](SECURITY.md) and [third-party notices](THIRD_PARTY.md).
