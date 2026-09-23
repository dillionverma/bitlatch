# macOS AutoFill

The containing app calls Apple's `ASSettingsHelper` API to show **Turn on AutoFill from “Latch”?** on macOS 15 or later. macOS 14 opens AutoFill settings instead. This requires a signed Credential Provider extension; an Electron dialog cannot enable it.

## Signed build

Create macOS provisioning profiles for these explicit identifiers, with **AutoFill Credential Provider** enabled on both:

- `app.latch.vault`
- `app.latch.vault.autofill`

Use the same Apple team and signing certificate for both. The build uses the macOS-only `<TEAM_ID>.app.latch.vault` app group. Apple permits this team-prefixed group without registering a separate group. No vault key or password is stored in this group.

```sh
LATCH_SIGN_IDENTITY='Apple Development: Your Name (CERTIFICATE_ID)' \
LATCH_APP_PROFILE='/absolute/path/Latch.provisionprofile' \
LATCH_AUTOFILL_PROFILE='/absolute/path/LatchAutoFill.provisionprofile' \
npm run package:autofill
```

The command checks the profiles, builds both native binaries, embeds the extension, applies separate app/extension entitlements, and verifies the signatures. The result is `release/mac-arm64/Latch.app`. It does not install, notarize, or publish the app. Development profiles must include the target Mac. Distribution needs suitable Developer ID profiles and notarization.

`npm run check` compiles the native code on macOS with Xcode's SDK and treats warnings as errors. `npm run package` remains unsigned; its AutoFill control explains that a signed build is required. `LATCH_DATA_DIR` disables the native integration for isolated fixtures.

## Behavior and limits

- Settings → AutoFill → **Turn on…** invokes Apple's prompt. **Not Now** leaves it off. Requests are limited to one per ten seconds, including while a prompt is open.
- **Manage in Settings** opens Apple's provider settings. Latch rereads the system state when its window gains focus.
- Only fillable personal password items enter Apple's suggestion index. The index contains website origins, usernames and record IDs, not passwords or URL paths. Exact/prefix URI rules stay in the picker because a selected suggestion does not include the current page URL. Apple handles the association of indexed suggestions with apps and websites. Locking queues index removal and immediately denies new credential reads.
- A sandboxed AppKit extension offers matching logins for the service identifiers provided by macOS. Selection requests one credential through a bounded, authenticated Unix socket in the app group. Latch rechecks the current vault and URI rules before releasing it.
- Latch must be running and unlocked. The extension tells the user to unlock Latch and retry. It cannot unlock the vault or run the Bitwarden CLI itself.
- Apps that provide no website identifier require copying from Latch. Passkeys, OTPs and native save prompts are not implemented.

## Manual acceptance (synthetic vault only)

1. Install a signed build. Verify it appears in System Settings → General → AutoFill & Passwords.
2. With a synthetic login, choose **Turn on…**. Check both **Not Now** and **Turn On**, including a retry within ten seconds.
3. Verify suggestions and the picker in Safari and an app with a matching associated domain. Check wrong-domain, Never-match, trashed and restricted items.
4. Lock while the picker is open. Filling must fail. Unlock in Latch and retry. Repeat after deleting the selected item.
5. Change and sync a synthetic login, then confirm the refreshed suggestion fills the new value.
6. Disable Latch in System Settings, return to Latch and confirm the control updates. Quit Latch and confirm the extension cannot fill.

Build checks cannot establish that macOS accepts the profiles or that a real AutoFill interaction works. Complete these checks on the signed app before release.

References: [enable prompt](https://developer.apple.com/documentation/authenticationservices/assettingshelper), [provider entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.authentication-services.autofill-credential-provider), [macOS app groups](https://developer.apple.com/documentation/xcode/accessing-app-group-containers).
