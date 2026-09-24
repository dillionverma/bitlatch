# macOS releases

The supported release target is Apple Silicon macOS. The **macOS release draft**
workflow checks the tagged source, signs and notarizes the app, packages a DMG
and updater ZIP, and creates a **draft** GitHub Release. It never publishes the
release or changes repository visibility. The separate **Desktop packages**
workflow is for manually requested unsigned development artifacts.

## Apple setup

Create a Developer ID Application certificate and **Developer ID distribution**
profiles for `app.latch.vault` and `app.latch.vault.autofill`, with AutoFill enabled
on both. Development profiles tied to specific Macs are rejected for releases.
Use the same team and signing identity for subsequent updates.

Configure these GitHub Actions repository secrets:

| Secret                          | Value                                                            |
| ------------------------------- | ---------------------------------------------------------------- |
| `LATCH_CERTIFICATE_P12`         | Base64-encoded exported Developer ID certificate and private key |
| `LATCH_CERTIFICATE_PASSWORD`    | Password for the exported P12                                    |
| `LATCH_SIGN_IDENTITY`           | Full `Developer ID Application: …` identity                      |
| `LATCH_APP_PROFILE_BASE64`      | Base64-encoded app distribution profile                          |
| `LATCH_AUTOFILL_PROFILE_BASE64` | Base64-encoded AutoFill distribution profile                     |
| `APPLE_ID`                      | Apple account used for notarization                              |
| `APPLE_TEAM_ID`                 | Ten-character Apple team ID                                      |
| `APPLE_APP_SPECIFIC_PASSWORD`   | App-specific password for notarization                           |

The workflow uses a temporary keychain and removes the imported files and keychain
after building. Safari is omitted from this initial release workflow. Local
builds may include it with `LATCH_SAFARI_PROFILE` and a matching distribution profile.

For a local release, save notarization credentials with
`xcrun notarytool store-credentials latch-notary` (interactive), then run:

```sh
LATCH_SIGN_IDENTITY='Developer ID Application: Your Name (TEAM_ID)' \
LATCH_APP_PROFILE='/absolute/path/Latch.provisionprofile' \
LATCH_AUTOFILL_PROFILE='/absolute/path/LatchAutoFill.provisionprofile' \
LATCH_NOTARY_PROFILE='latch-notary' \
pnpm run package:release
```

The build signs the app and extensions, notarizes a temporary ZIP, staples the
app, and checks Gatekeeper acceptance. It then archives that exact app, generating
`latest-mac.yml` and the ZIP blockmap. Finally it signs, notarizes and staples the
compressed DMG. The DMG is excluded from updater metadata because compression and
stapling change its bytes. Final artifacts are in `release/distribution/`.

## Draft and publish

1. Finish the app changes and bump `package.json` to a new stable version.
2. Push the corresponding `vX.Y.Z` tag. The workflow requires the tag and package
   version to match. It can also be run manually with an existing tag.
3. Review the draft's DMG, ZIP, blockmap and `latest-mac.yml`. An existing release
   is never overwritten; reruns require resolving the existing draft explicitly.
4. Download the DMG on another Mac and verify Gatekeeper, launch, CLI discovery,
   sign-in and [browser acceptance](cross-browser.md), plus the
   [native AutoFill checklist](../native/autofill/README.md#manual-acceptance-synthetic-vault-only).
   Use synthetic credentials. Verify offline launch after installation too.
5. Test an upgrade between two signed versions: background/manual checks,
   download failure, restart, quitting with an unlocked synthetic vault, and
   preservation of settings and AutoFill registration. Confirm bridge requests
   fail during shutdown and no copied secret remains on the clipboard.
6. Publish only after acceptance. GitHub downloads and the unauthenticated updater
   require this repository to be public. Making it public remains an owner decision;
   no GitHub token is shipped to users. A private repo or draft release is not a
   working public download/update channel.

## Update behavior

Only packaged macOS releases containing `app-update.yml` check for updates.
Development builds, unsigned packages and `LATCH_DATA_DIR` fixtures do not.
Latch checks 30 seconds after startup and every six hours, downloads stable
updates, and changes **Latch → Check for Updates…** to **Restart to Update…**.
Manual failures show a generic error; background failures are quiet. Updater
logs are disabled.

Downloaded updates install after the normal quit path locks the vault, clears
copied secrets, stops bridges and stops the Bitwarden CLI. Installation failure
falls back to quitting. There is no forced restart while the user is working.
macOS verifies the downloaded app's signature during installation. Keep the ZIP,
blockmap and `latest-mac.yml` together and never modify an archive after metadata
generation.

Builds and unsigned packaging checks do not establish notarization, profile
acceptance or a working upgrade. Those require Apple credentials and the manual
checks above. See [Electron updater documentation](https://www.electron.build/v26/docs/features/auto-update/)
and [Apple's notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow).
