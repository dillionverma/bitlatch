# Working on Latch

- Keep the MVP small. `npm run check` runs type checking, unit tests, and a release build.
- `npm run test:e2e` exercises real encryption/sync against a disposable local Vaultwarden server. See README for setup.
- Authentication and vault cryptography belong to the official Bitwarden CLI. Do not add a custom production crypto implementation.
- Packaged releases use a separately installed official CLI. Never bundle the npm CLI without resolving its mixed licensing.
- Never log passwords, vault contents, session keys, API keys, native pairing tokens, or raw CLI output. Test fixtures must remain synthetic and isolated.
- A locked vault must reject reads and fills immediately, including pending operations. Preserve this behavior with regression tests.
- Derive browser origins from Chrome's trusted sender metadata. Re-check matching when releasing the selected credential.
- Keep unknown item fields intact. Restrict edits and autofill to the supported personal-vault subset.
- Keep the repository private until the owner asks to publish it.
