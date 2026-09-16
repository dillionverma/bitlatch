# MVP verification

Tested on September 15–16, 2026, on an **Apple M5 Max**, macOS **26.6.2**.

## Environments

| Component                                         | Tested version                                            |
| ------------------------------------------------- | --------------------------------------------------------- |
| Latch                                             | 0.1.0, production renderer and packaged arm64 application |
| Electron                                          | 44.4.1                                                    |
| Official CLI, development fixture                 | 2026.8.0                                                  |
| Official CLI, separately installed / packaged app | 2026.7.0                                                  |
| Chrome for Testing                                | 153.0.8010.12                                             |
| Aside                                             | 1.0.914.1, isolated test browser profile                  |
| Local test vault                                  | Vaultwarden 1.37.3, pinned container digest               |

No personal vault or production Cloud account was used. The actual installed Aside executable was driven with a separate temporary profile. Native messaging installation is redirected to a disposable root with `LATCH_BROWSER_ROOT`; tests never replace the user's installed Latch bridge.

## Checks

- TypeScript strict checking, unused-code checking, and production build.
- 18 focused tests: safe site matching, private-domain boundaries, HTTPS/port checks, locked access, protected/shared item rejection, unknown-field preservation, stale writes, passkey edit restriction, pending unlock/lock races, CLI cancellation and Unicode output, validated IPC, native pairing authentication, and owner-only socket/config permissions.
- Actual Electron UI: sign in, create a favorite login, reveal/copy, edit notes, preserve through server sync, lock, reject a wrong password, unlock offline, quit/restart, unlock the cached vault again.
- Personal API-key sign-in followed by master-password unlock; possession of the API key does not bypass password unlock.
- Actual browser extension in Chrome for Testing and Aside: native host connection, inline account selection, filling both fields, successful server-validated login, per-site page-load filling without submission, and mismatched-origin rejection.
- Lock removes match results, clears copied credentials, and rejects further secret access. The on-disk CLI cache is checked for absence of the synthetic login and master passwords in plaintext.
- Local ad-hoc code-signature verification of the packaged application. No Developer ID notarization claim.
- Installed application smoke test: launches signed out, discovers the separately installed official CLI, and registers the native browser bridge.
- [GitHub Actions](https://github.com/dillionverma/latch/actions/runs/35050528081) independently passed a clean dependency install, formatting, strict type checking, all 18 focused tests, and the production build on macOS with Node 22.
- `npm audit`: zero reported vulnerabilities in the repository dependency tree at verification time. This does not audit the separately installed CLI or replace a security audit.

## Performance

The production React renderer was loaded with **10,000 synthetic summaries** behind a test IPC adapter. Only **17 rows** were mounted. Twenty searches measured approximately **16 ms p95** from the input event to matching DOM output and the next animation frame on this machine.

[Raw benchmark record](verification/search-performance.json).

This is a renderer measurement. It excludes real IPC, decryption, server sync, and network time. Authentication and writes use CLI subprocesses and are substantially slower than cached search/fill. No universal latency or memory guarantee is made.

The extension content script is approximately **9 KB minified**; it has no React runtime. Screenshots are real test runs using disposable credentials:

- [Mac, light](screenshots/desktop-light.png)
- [Mac, dark](screenshots/desktop-dark.png)
- [Chrome inline picker](screenshots/inline-chromium.png)
- [Aside inline picker](screenshots/inline-aside.png)

## What these tests do not prove

Cloud US/EU accounts, CAPTCHA/production 2FA policies, Argon2 account settings, organization policies, and a broad set of real-world websites still need a compatibility matrix. Passkeys and Touch ID are not implemented. The browser extension is loaded unpacked; there is no store approval. This prototype has not received an independent security review.

## Maintainability review

Self-review: **8/10 for this bounded MVP**, not a security rating. The CLI, vault lifecycle, browser bridge, validation, renderer, and tests have distinct modules; secrets do not flow through generic command APIs. To improve further, split the remaining application view and inline detector/picker as those grow, add real-site regression fixtures, and replace the CLI process dependency with a proven, distributable upstream engine before expanding functionality.
