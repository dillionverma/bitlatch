# Design verification — September 21, 2026

The six-stage design is implemented. Release acceptance remains incomplete. Solid appearance is the default; native glass is developer opt-in. No automated tests were added, restored, or run. The owner's no-test instruction supersedes the original plan's test commands.

## Current checks

On macOS **27.0 build 26A428**, arm64, Electron **44.4.1**, electron-liquid-glass **1.1.1**:

- `npm run check`: passed strict type checking and production build.
- `npm run format:check`: passed after formatting the two updated evidence documents.
- `npm run package`: passed; output is `release/mac-arm64/Latch.app`.
- ASAR inspection: addon loader stays external; arm64 N-API binary is unpacked at `app.asar.unpacked/node_modules/electron-liquid-glass/prebuilds/darwin-arm64/node.napi.armv8.node`. Notices are included. No Bitwarden npm CLI or automated test runtime is packaged. Packaged extension JS/CSS byte-match `dist`.
- Signing is skipped by `identity: null`. `codesign --verify --deep --strict` fails (inherited signature has no sealed resources). This local package is **not distribution-signed or notarized**. The older private release has a separate signing history.

[Integration logs and observations](/Users/dillion/.bb/thread-storage/thr_nncmrbxxry/design/integration/final) · [Delivery report](/Users/dillion/.bb/thread-storage/thr_nncmrbxxry/design/DELIVERY.md)

## Screens and interaction

Fresh manual inspection loaded the production renderer with a disposable in-memory adapter. It did not authenticate or exercise production vault operations. Passwords remained masked or empty in captures.

| Viewport   | Light                                                             | Dark                                                             |
| ---------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1080 × 720 | [Workspace](screenshots/design-2026-09-21/desktop-light-1080.png) | [Workspace](screenshots/design-2026-09-21/desktop-dark-1080.png) |
| 820 × 550  | [Workspace](screenshots/design-2026-09-21/desktop-light-820.png)  | [Workspace](screenshots/design-2026-09-21/desktop-dark-820.png)  |

[Settings](screenshots/design-2026-09-21/settings-light-1080.png) · [Dirty discard](screenshots/design-2026-09-21/dirty-discard-light.png) · [Locked](screenshots/design-2026-09-21/locked-light-1080.png) · [Editor at 200% zoom](screenshots/design-2026-09-21/editor-light-200pct.png)

Observed: 56 px rows; mounted active descendant after long scroll and End; modal focus stays inside; New/Search commands do not escape an open task; dirty Escape focuses Keep editing; lock removes workspace, dialogs, field values and notifications; a deferred generation completion cannot restore them. The zoomed editor keeps its footer visible and scrolls its body. Workspace zoom uses horizontal scrolling to preserve its minimum pane widths.

The task packet supplies 42 synthetic captures, including auth/challenge, long content, notes, read-only, trash, errors, notifications and both themes. The browser packet supplies 50 synthetic popup/picker/save captures. These are UI observations, not proof of real authentication, saving, clipboard operations or native filling.

[Task observations](/Users/dillion/.bb/thread-storage/thr_nncmrbxxry/design/tasks-manual.md) · [Task gallery](/Users/dillion/.bb/thread-storage/thr_nncmrbxxry/design/tasks-gallery) · [Browser observations](/Users/dillion/.bb/thread-storage/thr_nncmrbxxry/design/browser/final/observations.json)

## Native shell

The actual packaged app loaded the arm64 addon through public `addView`. A host-version gate was corrected: Electron reports `27.0.0`, while `sw_vers` reports `27.0`. The gate accepts these equivalent forms only; it does not claim other macOS support.

A synthetic CLI plus an in-memory IPC adapter supplied synthetic rows to the unmodified packaged renderer/preload. Appearance snapshots still came from the real native controller. Native captures used Electron desktopCapturer window sources, not Chromium capturePage:

- [Light at 1080 × 720](screenshots/design-2026-09-21/native-glass-light-1080.png)
- [Dark at 820 × 550](screenshots/design-2026-09-21/native-glass-dark-820.png)
- [Opaque Settings](screenshots/design-2026-09-21/native-settings-dark-820.png)

Native resize, fullscreen entry/exit, hide/show, renderer reload, and app-local light/dark changes completed. Settings opened through the native menu; New/Search stayed gated behind it. The unavailable-addon override launched solid; the vibrancy override launched with Electron vibrancy. Explicit `acceptFirstMouse: false` preserves activation-only clicks; real inactive-window reveal/copy was not exercised.

The captured light glass sidebar appears flat gray and its secondary text is weak. The captures do not prove correct desktop blur/refraction or acceptable material contrast. **Keep solid as the default.** Real Reduce Transparency, Increase Contrast and Reduce Motion toggles; drag/double-click; Spaces; multi-display; sleep/wake; VoiceOver; sustained GPU/scroll performance; and macOS 26 remain unverified. Renderer-injected accessibility flags did produce opaque surfaces and stronger borders; that is not an OS-settings pass.

## Browser and account limits

Chrome is absent from `/Applications/Google Chrome.app`. Aside is installed. A fresh local synthetic page displayed the current picker, but the user's installed older Latch extension overlaid it. The page was closed without a fill attempt. Real Chrome/Aside fill, Save/Update persistence and native bridge races remain unverified.

The browser protocol remains request/response based. Visible offers clear on the next lock/status response, normally a one-second poll plus bridge latency. Instant push clearing, lock/unlock between polls and exact identity of replacement offers with the same metadata are not guaranteed. Backend lock and origin checks remain authoritative.

**Isolation issue:** the first packaged run supplied a new Latch data directory, yet the discovered Nix CLI reported an existing locked account. Its cause is unresolved. The account-identity capture was removed. No unlock or vault-item read was performed. Later checks explicitly used a synthetic CLI. Do not assume this installed CLI respects the requested data directory until separately investigated. No production authentication/crypto or trust-policy code was changed in this integration packet.

Cloud US/EU/self-hosted authentication, real save/sync/offline flows, Touch ID, OS clipboard expiry and real browser filling have no fresh end-to-end result. Touch ID and save/update prompts are implemented; their design-pass verification is limited to synthetic UI. See [security limits](../SECURITY.md).

## Performance and size

With 10,000 synthetic summaries, **19 rows** mounted initially and **28** after a long scroll with the active row retained. End selected item 10,000 with a mounted active descendant. Both counts remain below 40.

The workspace packet's comparable search samples were **17.2 ms before / 17.5 ms after p95** (+1.7%). Final integration measured **9.3 ms p95** over 24 input-to-matching-DOM/next-frame samples. Its frame cadence differs, so it is not a speedup claim. All are below 250 ms. Measurements exclude IPC, decryption, sync and network. [Current samples](verification/search-performance.json).

| Asset          | Supplied baseline |        Final |  Change |
| -------------- | ----------------: | -----------: | ------: |
| Renderer JS    |         282.13 kB |   460.319 kB |  +63.2% |
| Renderer CSS   |          18.16 kB |    55.683 kB | +206.6% |
| Content script |      12,383 bytes | 20,457 bytes |  +65.2% |

Renderer growth includes Radix controls, Sonner and generated utility CSS. The content script includes shared tokens and geometry/lifecycle handling; it has no React runtime or remote assets. The app occupies **297,348 KiB** by `du -sk`; ASAR is **2,121,512 bytes**. No comparable app-size baseline or cold-start benchmark exists, so no before/after claim is made.

## Historical evidence

[September 15–16 verification](verification/historical-2026-09-16.md), [earlier benchmark](verification/historical-search-performance.json), and [v0.1.0 release notes](releases/v0.1.0.md) describe older snapshots only. Their automated test counts are historical. Current verification uses type checking, production builds, packaging and manual synthetic inspection.
