# Latch for Raycast

Search your Latch vault, copy credentials and secure notes, and lock your vault from Raycast.

## Setup

1. [Download Latch](https://github.com/dillionverma/latch/releases) for macOS 14 or later on Apple Silicon.
2. Install Latch in `/Applications`, open it, and complete sign-in.
3. Keep Latch running, then open **Search Vault** in Raycast.

Unlock with your master password or use Touch ID when enabled in Latch. No separate Bitwarden login is needed.

## Commands

- **Search Vault** searches personal logins and secure notes. Open an item to view details or copy a field.
- **Lock Vault** locks Latch immediately.

Latch clears copied values after 30 seconds or when locked, if the clipboard still contains that value. The extension connects to Latch locally and does not save a vault cache. Website logos use Bitwarden's icon service when enabled in Latch.

## Install from source

With Node.js 22.22.2 or later installed, open the standalone source download and run:

```sh
npm ci
npm run dev
```

Raycast imports the extension. You can stop the development command after the initial build.

From the Latch repository, use `pnpm install --frozen-lockfile` and `pnpm --filter latch dev` instead.

## Prepare a Store submission

From the Latch repository, run `pnpm run package:raycast`. This creates a standalone extension in `release/raycast/latch` and a source ZIP in `release`. It installs locked dependencies, builds, and lints the exported extension without publishing it.

When dependencies change, run `pnpm run package:raycast --update-lock` and commit `apps/raycast/store/package-lock.json` with the manifest and pnpm lockfile.

Before submitting, make the Latch download accessible, capture Raycast screenshots using synthetic data, and manually check unlock, search, copy, lock, and reconnection. After reviewing the exported files, run `npm run publish` from `release/raycast/latch` to open the public Raycast Store pull request.
