# Security

Latch is a private, unaudited prototype. Report vulnerabilities privately to the repository owner without credentials or vault data.

- The official Bitwarden CLI handles authentication, cryptography, and sync. Latch supplies a separate data directory and uses a private socket pair for its CLI worker.
- Lock clears cached secrets, rejects pending reads/fills, and clears the clipboard if it still holds a copied credential. Screen lock, sleep, and five minutes of inactivity lock the vault.
- Browser origins come from Chrome sender metadata and are checked again before credential release. Inline page UI remains untrusted; filling exposes the selected password to the destination page.
- Shared, reprompt-protected, and passkey-bearing items have restricted access. Trash is reversible; permanent deletion is unavailable.
- Touch ID is optional. Its saved session key uses Electron safeStorage, but the biometric prompt is app-enforced, not a biometry-protected Keychain entry. Enabling it retains a valid CLI session across locks.
- Browser offers clear on the next status response, not instantly. The backend rejects locked operations; the UI cannot distinguish replacement offers with identical metadata.
- Account hints store email and server only. They do not authorize access. Writes check revisions; offline conflict resolution is unsupported.
- Website icons send public website hostnames to Bitwarden's icon service. They never send credentials or URL paths. Disable them in Settings → Appearance. The bounded memory cache and pending requests clear on lock; IP addresses and local hostnames are skipped.
- Packaged account isolation needs further verification after an unexpected startup identity. A separate direct CLI check confirmed isolation. Real vault/browser flows and native biometric behavior remain incompletely verified.
- Same-user processes can inspect memory. JavaScript cannot guarantee secret zeroization. Local packages are unsigned and not notarized.
