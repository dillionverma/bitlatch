# Working on Bitlatch

- Keep the MVP small. `pnpm run check` runs static checks; `pnpm run build` builds all targets. Run both before shipping changes.
- Do not add automated tests. Verify with type checking, builds, and manual checks using synthetic data.
- Run development builds for checks with `LATCH_DATA_DIR` and `LATCH_BROWSER_ROOT` set to temporary directories. Without `LATCH_BROWSER_ROOT`, a run registers its native host in the real browser profiles and takes over the installed app's browser connection.
- Authentication and vault cryptography belong to the official Bitwarden CLI. Do not add a custom production crypto implementation.
- Packaged releases use a separately installed official CLI. Never bundle the npm CLI without resolving its mixed licensing.
- Never log passwords, vault contents, session keys, API keys, native pairing tokens, or raw CLI output. Test fixtures must remain synthetic and isolated.
- A locked vault must reject reads and fills immediately, including pending operations. Preserve this behavior during UI and lifecycle changes.
- Derive browser origins from Chrome's trusted sender metadata. Re-check matching when releasing the selected credential.
- Keep unknown item fields intact. Restrict edits and autofill to supported item types. Organization permissions are enforced by the Bitwarden server; never write back an item whose passwords the organization hides, because the CLI omits them.
- Agents may manage Bitlatch changes end to end without asking: push branches, open and update pull requests, resolve review feedback, and squash-merge once `pnpm run check`, `pnpm run build`, and CI pass. Ask before cutting a release.
