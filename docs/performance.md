# CLI lifecycle performance

Measured September 21, 2026 with the official Bitwarden CLI 2026.8.0, Electron 44.4.1, and a disposable Vaultwarden 1.37.3 account on this Mac. No personal vault was used.

## Changes

- Reuse a locked CLI worker for status and password unlock. Reuse an idle worker after the official lock command confirms it is locked. Cancel and stop a worker with pending work.
- Paint a remembered account's locked screen while CLI status loads. The hint contains only email/server metadata; it cannot unlock anything.
- Load active items first and fetch trash when opened. Show loading and retry states. Ignore duplicate or older state replies. Refresh a selected item's details after data changes.
- Reset list scrolling when search or filters change. Keep the existing virtualized list and precomputed search text.
- Compare sync results with the saved CLI item metadata. This handles remote deletions and an empty vault without the old two-second wait for the previous item count. Restart a worker whose decrypted view is stale.
- Reject canceled requests before fallback, stop write-settling loops on cancellation, avoid replaying writes with lost replies, and clear shutdown timers. Lock also cancels pending biometric unlock and sign-in prompts.

## Measurements

Three samples per backend operation, 400 synthetic logins. Baseline is commit `e4532b8`, which preserves the original checkout's current implementation. Times are medians in milliseconds. Initialization is CLI account status, not total Electron launch time.

| Operation                             | Before | After |
| ------------------------------------- | -----: | ----: |
| Initialize CLI account status         |  1,282 |   295 |
| Password unlock to loaded items       |  1,208 | 1,035 |
| Idle lock completed by CLI            |  1,605 |   125 |
| Unlock again with the worker retained |      — |   554 |
| Sync without server changes           |    134 |    37 |

[Raw timing samples](verification/performance-2026-09-21.json). The sample set is small and local network timings vary. It does not establish Cloud server latency or an absolute speed limit.

The real Electron app showed the remembered lock screen in 416 ms on a repeat launch; its first observed launch took 2,429 ms. Password submission to visible rows took 1,019 ms. Lock removed the item UI in 4 ms, before CLI cleanup completed. These are individual UI observations, not medians.

The final ad-hoc-signed package also passed the UI checks. Its first launch after packaging took 40,276 ms; repeat launch took 408 ms. The cause of that first-launch delay was not isolated. Packaged unlock to visible rows took 962–1,124 ms, and lock cleared the screen in 4–5 ms. CLI timing improvements do not remove every cold application-launch delay.

A separate production-renderer profile used 10,000 synthetic summaries and a fixture IPC adapter. Only 16 rows mounted. Twenty searches measured 7.3 ms median and 8.9 ms p95 from the input event to matching DOM output at the next animation frame. This excludes real IPC and decryption. Initial display fetched active items once and trash zero times. A duplicate state event caused no extra fetch. Opening trash caused one trash fetch and no active-list refresh.

## Verification

- Type checking, production build, formatting, macOS arm64 packaging, and strict ad-hoc code-signature verification.
- Visible Electron UI: lock screen, unlock, item selection, search after scrolling, lazy trash, immediate lock clearing, and unlock after scrolling/filter changes. Light and dark large-vault views inspected.
- Disposable account: wrong password, edit, delete, restore, five remote deletions from 400 to 395 items, and removal of the last item from a separate vault. Sync returned the correct counts.
- Offline unlock, cancellation during unlock, and direct read rejection by the retained locked worker. Canceled unlock stayed locked with zero browser matches.
- A deferred synthetic biometric prompt resolved after lock: the unlock was rejected, no items were requested, and browser matches stayed empty.
- Renderer fixture: delayed trash loading, duplicate states, and an older unlocked reply arriving after lock. The UI stayed locked.

No automated test suite was added. Biometric hardware prompts, real Cloud accounts, and a fresh browser-extension end-to-end run were not part of this pass. Remaining large waits are CLI password derivation/decryption, first sign-in, OS process startup, and network sync. Further reductions need upstream engine changes or different authentication behavior; this pass keeps the official CLI and its security settings.
