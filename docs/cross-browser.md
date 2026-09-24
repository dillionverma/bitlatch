# Cross-browser extension design

Research checked 2026-09-24 against WXT, Mozilla, Chrome, and Apple documentation. These are implementation requirements and release checks, not a claim that every browser has passed runtime verification.

## Shared WXT build

- Keep one implementation with small browser-specific transport adapters. Use WXT entrypoints (`defineBackground`, `defineContentScript`) and explicit imports. Move manifest metadata into `wxt.config.ts`, preserve production permissions, and compare generated manifests after migration. Generate WXT types with `wxt prepare`; run this in installation/CI before typechecking. [Migration guide](https://wxt.dev/guide/resources/migrate.html)
- Explicitly select MV3 for each supported build. WXT defaults Firefox and Safari to MV2, so the browser flag alone does not mean MV3. Target-specific outputs should remain separate. [Browser targets](https://wxt.dev/guide/essentials/target-different-browsers.html)
- Import `browser` and `Browser` from `wxt/browser`. This selects the native namespace; it does not make every API exist. Feature-detect cosmetic optional methods such as badge text color. Register browser listeners inside the WXT entrypoint, synchronously before asynchronous setup. WXT evaluates entrypoints outside the browser during builds. [Extension APIs](https://wxt.dev/guide/essentials/extension-apis.html)
- Chromium MV3 uses a service worker; Firefox MV3 uses a nonpersistent background script/event page. Let WXT generate the appropriate manifest. Losing background memory must fail pending requests safely, never preserve a previously unlocked state as authority. [Background environments](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)

## Native messaging and identity

Chromium and Firefox can share the framed-JSON native executable, but need different host manifests and startup validation:

|                                             | Chromium                                          | Firefox                                              |
| ------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Host allowlist                              | `allowed_origins`: exact `chrome-extension://ID/` | `allowed_extensions`: exact add-on ID                |
| Browser-provided startup arguments on macOS | Extension origin                                  | Host manifest path, then add-on ID                   |
| Extension identity                          | Preserve existing manifest public key/ID          | Explicit stable `browser_specific_settings.gecko.id` |

The desktop installer must register each browser's documented host-manifest location. Never treat an arbitrary command-line string or an extension-supplied website URL as authenticated origin metadata. [Mozilla native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging), [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)

Latch security invariants during migration:

- Derive website URLs from trusted runtime sender/tab metadata; retain same-origin frame checks and reject unsupported schemes.
- Verify sender ID against the current extension, and accept privileged popup operations only from the exact extension popup URL. Do not hardcode Chromium's URL scheme for Firefox popup recognition.
- Recheck vault lock state and site matching when releasing credentials, including requests that were pending when the vault locked.
- Keep native allowlists narrow. Do not add `externally_connectable`, all-extension access, broader host matches, or new permissions to work around a porting failure.
- Keep secrets out of logs, source archives, persisted browser storage, and build-time environment variables. These are Latch project requirements, independent of WXT.

## Safari is a separate native integration

Build web files with WXT, then package them in a native Safari extension. Apple's `xcrun safari-web-extension-packager` can generate an Xcode app/extension wrapper; it does not implement Latch's native bridge. Latch instead compiles the small wrapper directly alongside its existing AutoFill extension in `scripts/build-safari.mjs`, embedding WXT's output as resources. [Apple packaging](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)

Safari JavaScript-to-native requests use `runtime.sendNativeMessage` and an `NSExtensionRequestHandling.beginRequest` handler. Safari ignores the application ID argument and routes to its containing native extension. Apple's `connectNative` example handles containing-app-to-JavaScript notifications, so Chromium's bidirectional stdio port request code cannot be assumed compatible. Data sharing between app and extension uses App Groups. [Apple messaging](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)

For Latch's signed distribution, create a dedicated Safari extension bundle identifier, enable the shared App Group for that target, and obtain signing assets covering its identity and entitlements. The existing AutoFill extension profile belongs to a different bundle and cannot stand in for the Safari target. Regenerate the containing app profile if its capabilities change. Sign the embedded extension and app; distribute through the App Store or Developer ID signing plus notarization. Unsigned local testing is distinct from distribution readiness. [App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups), [Safari distribution](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)

## Release automation

Build/typecheck and archive artifacts in CI without publishing automatically. WXT can ZIP Chrome/Firefox and submit updates to Chrome, Firefox, and Edge; first listings remain manual. `wxt submit --dry-run` checks submission configuration. WXT does not automate Safari publishing. Inspect Firefox's source ZIP, extract it into a clean directory, rebuild, and compare output; include rebuild instructions and exclude unrelated desktop assets, provisioning profiles, and secrets. [WXT publishing](https://wxt.dev/guide/essentials/publishing.html)

New Firefox submissions require a data-transmission declaration. Mozilla's definition includes data handled outside the add-on or browser. For Latch's credential and URL relay to its native app, `authenticationInfo` and `browsingActivity` are the appropriate starting categories by that definition, not `none`; reassess against the final actual data flow before submission. Firefox 140+ provides the built-in consent experience. This disclosure describes native relay, not telemetry. [Firefox consent requirements](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)

Before declaring a browser supported, manually verify with synthetic credentials: native connection, locked reads denied, matching and nonmatching origins, same- and cross-origin frames, fill, save confirmation, navigation during a pending fill, background restart, and extension update. Passkey behavior and macOS Credential Provider integration require separate checks; a successful WXT build proves neither.

## Implemented commands and output

- `npm run extension:dev` / `extension:dev:firefox`: WXT development with reload support.
- `npm run extension:build`: Chromium, Firefox 140+, Safari MV3 builds in `.output/{browser}-mv3`.
- `npm run extension:zip`: browser ZIPs and a narrowly allowlisted Firefox source ZIP. Rebuild Firefox from the source archive with `npm ci && npx wxt build -b firefox --mv3`.
- `npm run build`: also compiles the Safari native handler on macOS and keeps the Chromium install path at `dist/extension`.
- `npm run extension:submit -- --help`: WXT submission tooling. No store accounts, signing credentials, or publication are automatically configured. The artifact workflow only builds/uploads private repository artifacts.

The native host installer now registers Chrome, Chrome for Testing, Chromium, Aside, Brave, Edge, Arc, Vivaldi, and Firefox on macOS. These are integration targets, not a claim of completed live testing in every browser. Chromium retains its existing public key and ID. Firefox's stable ID is `latch@latch.local`; temporary installations use `.output/firefox-mv3/manifest.json`, while normal distribution requires Mozilla signing. Firefox's consent declarations describe the credential and site data relayed locally to Latch, not analytics.

Safari's request handler is `native/safari/Handler.m`, embedded as `LatchSafari.appex` only when `LATCH_SAFARI_PROFILE` is supplied to `npm run package:autofill`. Create a macOS profile for `app.latch.vault.safari` with the same team and App Group as the host. Keep the existing host and AutoFill profiles. This wrapper uses the same strict browser request schema through a separate app-group socket/token; it does not expose the launcher protocol. Safari's native AutoFill credential provider is a different extension.

A successful compile is not Safari installation verification: the signed Safari profile, Safari enablement/site permission, and a live fill/save test are still required. Keep all vault cryptography and locking in Latch/Bitwarden; the web extension only selects and relays requests. Check both iframe and navigation behavior in each browser before releasing.
