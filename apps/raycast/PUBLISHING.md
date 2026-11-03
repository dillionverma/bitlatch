# Publishing the Raycast extension

This file is for maintainers. `scripts/package-raycast.mjs` does not copy it into the Store export.

## Develop in the repository

Run `pnpm install --frozen-lockfile` and `pnpm --filter bitlatch dev`.

## Prepare a Store submission

From the Bitlatch repository, run `pnpm run package:raycast`. This creates a standalone extension in `release/raycast/bitlatch` and a source ZIP in `release`. It installs locked dependencies, builds, and lints the exported extension without publishing it.

When dependencies change, run `pnpm run package:raycast --update-lock` and commit `apps/raycast/store/package-lock.json` with the manifest and pnpm lockfile.

Before submitting, make the Bitlatch download accessible, capture Raycast screenshots using synthetic data, and manually check unlock, search, copy, lock, and reconnection. Store submission requires Dillion’s approval. After approval and review of the exported files, run `npm run publish` from `release/raycast/bitlatch` to open the public Raycast Store pull request.
