# Contributing

- Keep changes small and follow existing conventions.
- Use the official Bitwarden CLI for authentication and cryptography.
- Never log secrets or real vault data.
- Preserve vault locking and browser-origin checks.
- Verify manually with synthetic data. Do not add automated tests.

Before submitting:

```sh
pnpm run check
pnpm run build
```
