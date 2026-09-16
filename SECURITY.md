# Security and current boundaries

Latch 0.1 is a private prototype, not an audited password manager.

## Implemented boundaries

- The official Bitwarden CLI performs authentication, password derivation, encryption, decryption, and sync. Production code contains no custom vault cryptography.
- CLI data uses a separate `BITWARDENCLI_APPDATA_DIR` within Latch's application data. It never opens the user's default CLI vault.
- The master password and session key are supplied through the child-process environment, not command arguments or logs. New/edited item data goes through stdin. The session key is held in memory and discarded at lock. The CLI's own encrypted cache and authentication state remain on disk.
- Searchable item metadata and selected supported secrets are cached in the main process while unlocked. The renderer gets summaries and explicitly selected details. The website gets only the selected username and password.
- Browser requests use native messaging, then a Unix socket with owner-only permissions and a random pairing token. There is no HTTP vault service. Only the pinned extension origin is allowed by the native host manifest.
- Browser code derives the URL from trusted sender metadata, rejects cross-origin frames, and re-checks URL matching immediately before returning a selected credential. HTTPS is required except for loopback test websites. Server connections always require HTTPS.
- Regex URI rules, shared organization items, and master-password-reprompt items fail closed in this MVP. Passkey-bearing items are read-only. Deleted items are excluded.
- An unset/default URI match uses the exact host and port. Only an explicit base-domain rule includes sibling subdomains; client-wide matching preferences are not exposed by the CLI. This may show fewer suggestions than the official extension.
- Lock clears Latch's cache, cancels CLI operations, invalidates pending reads, clears the renderer, and clears the clipboard if it still contains the copied value. Screen lock/sleep also locks the vault; idle timeout is five minutes.
- Electron uses a sandboxed renderer, context isolation, no Node integration, a restrictive Content Security Policy, denied web permissions/navigation/new windows, and a small validated IPC interface.

## Limits

- Processes running as the same macOS user can inspect process memory/environments or impersonate local software. This is not a defense against a compromised Mac. JavaScript garbage collection does not guarantee immediate secret zeroization.
- Filling intentionally exposes the chosen password to the destination page. Page-load filling is opt-in per origin, only with one matching account, and does not submit forms.
- Inline page UI is not a browser-owned trusted surface. Sites may obscure or imitate it. The matching and secret-release decisions remain outside page JavaScript.
- This is a limited field detector: complex pages, closed shadow DOM forms, unusual multi-step flows, and accessibility-only controls are not guaranteed. Signup/password-change forms are refused.
- No Touch ID, passkey provider, SSO flow, automatic save prompts, system-wide autofill, enterprise policy engine, or full vault feature parity.
- Editing performs a pre-write sync and revision check. This reduces stale edits; it is not a general offline conflict-resolution engine. Passkey-bearing, shared, and reprompt-protected items cannot be edited.
- Releases are development builds with local ad-hoc signing, not Developer ID notarization. Browser installation uses Developer mode.
- Cloud account flows depend on Bitwarden's authentication policy. Additional verification may require personal API-key sign-in followed by master-password unlock. No production Cloud account or personal vault was accessed in automated tests.

Please report potential vulnerabilities privately to the repository owner. Do not include credentials or vault exports in issues.
