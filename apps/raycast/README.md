# Bitlatch for Raycast

Search your Bitlatch vault, copy credentials and secure notes, and lock your vault from Raycast.

## Setup

1. [Download Bitlatch](https://github.com/dillionverma/latch/releases) for macOS 14 or later on Apple Silicon.
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

From the Bitlatch repository, use `pnpm install --frozen-lockfile` and `pnpm --filter bitlatch dev` instead.

## Prepare a Store submission

From the Bitlatch repository, run `pnpm run package:raycast`. This creates a standalone extension in `release/raycast/bitlatch` and a source ZIP in `release`. It installs locked dependencies, builds, and lints the exported extension without publishing it.

When dependencies change, run `pnpm run package:raycast --update-lock` and commit `apps/raycast/store/package-lock.json` with the manifest and pnpm lockfile.

Before submitting, make the Bitlatch download accessible, capture Raycast screenshots using synthetic data, and manually check unlock, search, copy, lock, and reconnection. After reviewing the exported files, run `npm run publish` from `release/raycast/bitlatch` to open the public Raycast Store pull request.
