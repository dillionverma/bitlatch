# macOS AutoFill

The containing app calls Apple's `ASSettingsHelper` API to show **Turn on AutoFill from “Bitlatch”?** on macOS 15 or later. macOS 14 opens AutoFill settings instead. This requires a signed Credential Provider extension; an Electron dialog cannot enable it.

## Implementation

A small Swift 6 credential-provider extension handles Apple's callbacks and user
verification, then forwards requests to the existing TypeScript vault over an
authenticated app-group socket. This follows [Bitwarden's desktop architecture](https://github.com/bitwarden/clients/blob/main/apps/desktop/macos/autofill-extension/CredentialProviderViewController.swift);
it is a Bitlatch implementation, not a copied SDK or a second passkey store.

- `Provider.swift`: password picker, passkey registration/assertion, and system authentication.
- `VaultClient.swift`: asynchronous, cancellable IPC with a 20-second deadline and bounded replies.
- `AutoFill.swift`: settings, enablement, and Apple's credential suggestion index inside Electron.
- `bridge.c`: only the Node-API adapter; no Apple UI or vault logic.
- `Encoding.swift` and `main.swift`: shared byte encoding and extension entry point.

Builds use Xcode's Swift compiler and system frameworks; no new packages or Xcode
project are needed. The supported baseline remains macOS 14. Swift compilation
uses strict Swift 6 concurrency checks and warnings as errors.

Sources live in `apps/desktop/native/autofill`; the build entry point is
`apps/desktop/build/build-autofill.mjs`, with output in `apps/desktop/dist/native/`.
Run commands below from the repository root after `pnpm install --frozen-lockfile`.
All apps and `packages/shared` use that single install and root lockfile.
`pnpm dev` builds native output when missing and otherwise reuses it. After native
changes, run `pnpm --filter @latch/desktop build`, then restart development.

Apple's [supporting passkeys](https://developer.apple.com/documentation/authenticationservices/supporting-passkeys)
article covers apps requesting credentials. Bitlatch implements the other side using
[ASCredentialProviderViewController](https://developer.apple.com/documentation/authenticationservices/ascredentialproviderviewcontroller).

## Signed build

Create macOS provisioning profiles for these explicit identifiers, with **AutoFill Credential Provider** enabled on both:

- `app.latch.vault`
- `app.latch.vault.autofill`

Use the same Apple team and signing certificate for both. The build uses the macOS-only `<TEAM_ID>.app.latch.vault` app group. Apple permits this team-prefixed group without registering a separate group. No vault key or password is stored in this group.

```sh
LATCH_SIGN_IDENTITY='Apple Development: Your Name (CERTIFICATE_ID)' \
LATCH_APP_PROFILE='/absolute/path/Bitlatch.provisionprofile' \
LATCH_AUTOFILL_PROFILE='/absolute/path/LatchAutoFill.provisionprofile' \
pnpm run package:autofill
```

The command delegates to `apps/desktop/build/package-autofill.mjs`: it checks the profiles, builds both native binaries, embeds the extension, applies separate app/extension entitlements, and verifies the signatures. The result is `apps/desktop/release/mac-arm64/Bitlatch.app`. It does not install, notarize, or publish the app. Development profiles must include the target Mac. Distribution needs suitable Developer ID profiles and notarization. Use `pnpm run package:mac:signed` with `LATCH_NOTARY_PROFILE` and Developer ID signing inputs.

Root `pnpm run check` checks formatting and workspace source. `pnpm run build` builds desktop, Chrome/Firefox/Safari web extensions, native AutoFill/Safari on macOS, and Raycast. Native compilation uses Xcode's SDK and treats warnings as errors. `pnpm run package:dir` remains unsigned; its AutoFill control explains that a signed build is required. `LATCH_DATA_DIR` disables the native integration for isolated fixtures.

Use the same signing certificate for updates to retain the app's Keychain identity.
Install one copy at `/Applications/Bitlatch.app`. If Xcode created a temporary app
with either production bundle identifier to generate profiles, unregister and
remove that app before installing Bitlatch. Duplicate apps can make the system
passkey chooser show the wrong provider name and icon.

## Behavior and limits

- Settings → AutoFill → **Turn on…** invokes Apple's prompt. **Not Now** leaves it off. Requests are limited to one per ten seconds, including while a prompt is open.
- **Manage in Settings** opens Apple's provider settings. Bitlatch rereads the system state when its window gains focus.
- Only fillable personal password items enter Apple's suggestion index. The index contains website origins, usernames and record IDs, not passwords or URL paths. Exact/prefix URI rules stay in the picker because a selected suggestion does not include the current page URL. Apple handles the association of indexed suggestions with apps and websites. Locking queues index removal and immediately denies new credential reads.
- A sandboxed AppKit extension offers matching logins for the service identifiers provided by macOS. Selection requests one credential through a bounded, authenticated Unix socket in the app group. Bitlatch rechecks the current vault and URI rules before releasing it.
- Bitlatch must be running and unlocked. The extension tells the user to unlock Bitlatch and retry. It cannot unlock the vault or run the Bitwarden CLI itself.
- Passkeys stay in the Bitwarden vault; Bitlatch has no separate passkey store. Personal items with a P-256 passkey are indexed by relying party and credential ID, so the system passkey sheet lists them in Safari, Chromium browsers and apps. Sign-in and registration ask for Touch ID or the login password in the extension unless the site marks verification as discouraged. The app signs with the stored key, using the same authenticator data, `none` attestation and counter rule as Bitwarden's clients, and writes new passkeys and counter changes back through the CLI, so nothing is released or created if the write fails. Bitlatch creates discoverable ES256 passkeys only; requests that exclude ES256 or that name an already-saved credential are refused.
- Dismissing or replacing a request cancels native IPC and user verification; late replies cannot fill. Oversized passkey allow/exclude lists are rejected, never truncated.
- OTPs and native save prompts are not implemented. Passkey registration does not receive the relying party's display name from macOS, so a new item is named after the relying party identifier.

## Manual acceptance (synthetic vault only)

1. Install a signed build. Verify it appears in System Settings → General → AutoFill & Passwords.
2. With a synthetic login, choose **Turn on…**. Check both **Not Now** and **Turn On**, including a retry within ten seconds.
3. Verify suggestions and the picker in Safari and an app with a matching associated domain. Check wrong-domain, Never-match, trashed and restricted items.
4. Lock while the picker is open. Filling must fail. Unlock in Bitlatch and retry. Repeat after deleting the selected item.
   4a. With a synthetic account on a passkey test site (for example webauthn.io), register a passkey through the system sheet, confirm the new item appears in Bitlatch and Bitwarden with the key, then sign in with it in Safari and a Chromium browser. Cancel Touch ID once and confirm nothing is created or released. Repeat sign-in after locking Bitlatch.
5. Change and sync a synthetic login, then confirm the refreshed suggestion fills the new value.
6. Disable Bitlatch in System Settings, return to Bitlatch and confirm the control updates. Quit Bitlatch and confirm the extension cannot fill.

Build checks cannot establish that macOS accepts the profiles or that a real AutoFill interaction works. Complete these checks on the signed app before release.

References: [enable prompt](https://developer.apple.com/documentation/authenticationservices/assettingshelper), [provider entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.authentication-services.autofill-credential-provider), [macOS app groups](https://developer.apple.com/documentation/xcode/accessing-app-group-containers).
