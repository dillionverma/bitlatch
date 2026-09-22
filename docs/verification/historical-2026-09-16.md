# Historical verification — September 15–16, 2026

This is a preserved earlier report. Its test counts, feature statements, environment and performance describe that snapshot, not the current tree. Automated suites and their dependencies were removed by owner instruction on September 21. Do not run the old suites. Historical benchmark data is preserved separately. Screenshot paths are mutable and are not evidence for the old snapshot.

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
- 26 focused tests: safe site matching, private-domain boundaries, HTTPS/port checks, locked access, protected/shared item rejection, unknown-field preservation, stale writes, passkey edit restriction, pending unlock/lock races, CLI cancellation and Unicode output, validated IPC, native pairing authentication, owner-only socket/config permissions, and the two-step sign-in conversation with the CLI (code, method list, new-device, unknown questions, rejected codes, cancel, and lock).
- Actual Electron UI: sign in, create a favorite login, reveal/copy, edit notes, preserve through server sync, lock, reject a wrong password, unlock offline, quit/restart, unlock the cached vault again.
- Personal API-key sign-in followed by master-password unlock; possession of the API key does not bypass password unlock.
- Authenticator-app two-step login against the local vault: the real CLI's code prompt is answered from the app, a wrong code is rejected in place, the right one opens the vault, and the master password is absent from the CLI cache.
- Actual browser extension in Chrome for Testing and Aside: native host connection, inline account selection, filling both fields, successful server-validated login, per-site page-load filling without submission, and mismatched-origin rejection.
- A vault with many items keeps showing them: rows stay inside the scroll viewport when fresh, after scrolling, after a sync, and after a lock/unlock. This last one regressed once, because a virtualizer that outlived its scroll element kept the old scroll position and drew every row out of sight, leaving a correct item count above an empty list.
- A secure note created by another client opens, edits without offering login fields, and survives a reload from the server. Deleting asks first, then moves the item to the trash and it stays gone after a sync. The trash can be browsed, a trashed item cannot be edited, and restoring returns it to the vault. A dialog closes on a backdrop click and not on an inside one.
- Signing in on a real page with a password the vault has never seen offers to save it, the offer survives the navigation the sign-in causes, and accepting it from the page writes the login into the vault with the typed username.
- Touch ID unlock is covered against a stand-in for the Keychain, since the biometric prompt itself cannot be automated: the CLI is deliberately left unlocked while it is on, locked as usual while it is off, a refused prompt changes nothing, a key that no longer opens the vault is thrown away, and signing out forgets it.
- Lock removes match results, clears copied credentials, and rejects further secret access. The on-disk CLI cache is checked for absence of the synthetic login and master passwords in plaintext.
- Local ad-hoc code-signature verification of the packaged application. No Developer ID notarization claim.
- Installed application smoke test: launches signed out, discovers the separately installed official CLI, and registers the native browser bridge.
- [GitHub Actions](https://github.com/dillionverma/latch/actions/runs/35050528081) independently passed a clean dependency install, formatting, strict type checking, all 18 focused tests, and the production build on macOS with Node 22.
- `npm audit`: zero reported vulnerabilities in the repository dependency tree at verification time. This does not audit the separately installed CLI or replace a security audit.

## Performance

The production React renderer was loaded with **10,000 synthetic summaries** behind a test IPC adapter. Only **17 rows** were mounted. Twenty searches measured approximately **16 ms p95** from the input event to matching DOM output and the next animation frame on this machine.

[Raw benchmark record](historical-search-performance.json).

This is a renderer measurement. It excludes real IPC, decryption, server sync, and network time. No universal latency or memory guarantee is made.

Vault reads and writes were measured separately against the disposable local Vaultwarden, comparing the warm `bw serve` process against a one-shot CLI run for the same command. Medians on this machine: a vault read **3149 ms to 1 ms**, and saving a new login **3275 ms to 118 ms**. In the running app, saving an edit went from **1804 ms to 205 ms** once the full sync was dropped from the edit path, since Bitwarden checks the revision on the write itself.

Unlocking was profiled separately against a 400-item account, because it is the wait felt most often. It cost **3643 ms**, split between a one-shot `bw unlock` and the vault server starting afterwards: two CLI starts back to back, each paying process startup and WASM initialisation. Letting the already-starting server perform the unlock itself removed one of them, taking it to **1219 ms**. First sign-in is unchanged at roughly six seconds, dominated by `bw login` authenticating over the network, which cannot be served by a vault server that has to be signed in already. A real Bitwarden server adds its own network time to both. Signing in, unlocking, locking and signing out still start a CLI and are unchanged.

The extension content script is approximately **9 KB minified**; it has no React runtime. The original record referenced these screenshot names. Those mutable paths now reflect later work; they are not fresh evidence for this historical result:

- [Mac, light](../screenshots/desktop-light.png)
- [Mac, dark](../screenshots/desktop-dark.png)
- [Chrome inline picker](../screenshots/inline-chromium.png)
- [Aside inline picker](../screenshots/inline-aside.png)

## What these tests do not prove

The end-to-end tests drive a visible window, so a keystroke typed on the machine while they run lands in the app under test. That produced sign-in failures with a field a character or two off, which read like product bugs and were not; the sign-in helper now re-checks what it typed before submitting.

Cloud US/EU accounts, CAPTCHA policies, email and YubiKey two-step methods, new-device verification, Argon2 account settings, organization policies, and a broad set of real-world websites still need a compatibility matrix. The method list and the emailed code were additionally checked once by hand against the real CLI and an SMTP-enabled local Vaultwarden; YubiKey and new-device prompts are covered by emulated CLI prompts only. Passkeys and Touch ID are not implemented. The browser extension is loaded unpacked; there is no store approval. This prototype has not received an independent security review.

## Maintainability review

Self-review: **8/10 for this bounded MVP**, not a security rating. The CLI, vault lifecycle, browser bridge, validation, renderer, and tests have distinct modules; secrets do not flow through generic command APIs. To improve further, split the remaining application view and inline detector/picker as those grow, add real-site regression fixtures, and replace the CLI process dependency with a proven, distributable upstream engine before expanding functionality.
