# MVP decisions

The original plan described a multi-week product. This first implementation proves the daily password workflow in a single Mac session.

## Keep

- A compact Mac desktop interface and a real Chrome/Aside inline picker.
- Existing Bitwarden vaults and official upstream cryptography.
- Fast local search, bounded lists, native messaging, and strict lock boundaries.
- Real integration tests using disposable data.

## Simplify

The desktop owns the decrypted session. The extension is a thin companion and requires the Mac process to remain running. Closing the window leaves it running; quitting locks it and stops filling. An independent extension engine is later work.

Instead of extracting Bitwarden's Angular service graph in this first milestone, a small adapter invokes a separately installed official CLI. Search and matching run against an in-memory projection, so ordinary selections and fills do not spawn a CLI process. Authentication, sync, and writes do. No `bw serve` or localhost HTTP vault endpoint is used.

The published npm CLI includes `bitwarden_license` code. It is a development-only test dependency, excluded from packaged releases. A distributable standalone engine needs a proper upstream licensing/dependency inventory or an OSS-only build.

No Jotai, Query cache, router, or component framework is needed for this small UI. Explicit React state and a typed bridge keep it understandable. The extension has no React runtime.

## Defer

- Passkey registration/assertion, Touch ID, independent extension unlock.
- Automatic save/update prompts, TOTP, folders, multi-account switching, import/export, deletes/trash, offline edits.
- Shared-organization and reprompt-protected secret access, enterprise policies.
- Safari/system credential-provider integrations, signing/notarization, updates, store publishing.

The web page never receives the vault or passkey private keys. Unsupported functionality is explicit in the UI rather than approximated.

## Next milestone

First stabilize real Cloud-account authentication and representative personal sites through owner-driven testing. Then choose and prove an upstream passkey-provider integration with correct presence/verification semantics. Follow with automatic save prompts, Touch ID, and a distributable engine. Do not expand feature parity before those foundations work.
