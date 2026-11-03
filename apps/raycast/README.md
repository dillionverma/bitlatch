# Bitlatch for Raycast

Search your Bitlatch vault, copy credentials and secure notes, and lock your vault from Raycast.

Bitlatch is a separate desktop app. This extension requires it to run. Bitlatch is an independent client for Bitwarden and is not affiliated with Bitwarden.

## Setup

1. [Download Bitlatch](https://github.com/dillionverma/bitlatch/releases) for macOS 14 or later on Apple Silicon.
2. Install Bitlatch in `/Applications`, open it, and complete sign-in.
3. Keep Bitlatch running, then open **Search Vault** in Raycast.

Unlock with your master password or use Touch ID when enabled in Bitlatch. No separate Bitwarden login is needed.

## Commands

- **Search Vault** searches personal logins and secure notes. Open an item to view details or copy a field.
- **Lock Vault** locks Bitlatch immediately.

Bitlatch clears copied values after 30 seconds or when locked, if the clipboard still contains that value. The extension connects to Bitlatch locally and does not save a vault cache. Website logos use Bitwarden's icon service when enabled in Bitlatch.

## Install from source

With Node.js 22.22.2 or later installed, open the standalone source download and run:

```sh
npm ci
npm run dev
```

Raycast imports the extension. You can stop the development command after the initial build.
