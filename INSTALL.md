# Install Latch

[Back to README](README.md) · [Downloads and checksums](https://github.com/dillionverma/latch/releases/tag/v0.3.0)

## Desktop

Install the [official Bitwarden CLI](https://bitwarden.com/help/cli/) separately. Latch uses it for authentication and vault cryptography.

- On Mac, run `brew install bitwarden-cli`.
- On Windows or Linux with Node.js and npm installed, run `npm install -g @bitwarden/cli`.

Keep `bw` on your PATH, or set `LATCH_BW_PATH` to its full path in the environment used to launch Latch. If Latch was open during CLI installation, quit and reopen it.

### macOS

Requires macOS 14+ on Apple Silicon. There is no Intel Mac package.

1. Download the [DMG](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-mac-arm64.dmg) or [ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-mac-arm64.zip).
2. Open the DMG or extract the ZIP, then move `Latch.app` to **Applications**.
3. Open Latch. If macOS blocks it, use **System Settings → Privacy & Security → Open Anyway**, then confirm **Open**. See [Apple's instructions](https://support.apple.com/en-us/102445).
4. Sign in to your Bitwarden account.

Mac previews are ad-hoc signed, without Developer ID signing or notarization.

### Windows and Linux

These packages are experimental. Builds pass, but end-to-end verification is pending.

- **Windows x64:** run the [installer](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-win-x64.exe). The unsigned preview may show an unrecognized-app warning.
- **Linux x64 or arm64:** download the matching deb or AppImage from the [release page](https://github.com/dillionverma/latch/releases/tag/v0.3.0). Install the deb with your package manager. For an AppImage, run `chmod +x Latch-0.3.0-linux-*.AppImage`, then open the file.

Start Latch and sign in after installing the CLI and app.

## Browser extensions

Keep the desktop app running and unlock your vault in Latch. There are no public browser-store listings for this preview, so the store-install buttons are unavailable.

### Chrome, Aside, and other Chromium browsers

Chrome and Aside have been verified. Brave, Edge, Arc, Vivaldi, and Chromium still need end-to-end verification.

1. Install Latch in its permanent location. In Latch, choose **Settings → Browser → Developer installation → Open extension folder**.
2. Open your browser's extensions page, such as `chrome://extensions`, and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Pin Latch to the toolbar and open the extension. Desktop setup is automatic. Latch shows **Connected** in Settings when the extension connects.

Alternatively, extract the [Chrome ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-chrome.zip) into a permanent folder and load that folder. Keep it at the same path.

Search, filter, and copy from the popup. To fill a login, use the Latch button inside a website's login field.

### Firefox

Requires Firefox 140+. This unsigned developer build still needs end-to-end verification.

1. Extract the [Firefox ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-firefox.zip) and start Latch.
2. Open **about:debugging → This Firefox → Load Temporary Add-on**.
3. Select `manifest.json` from the extracted folder.

Repeat after each Firefox restart. No signed download is available.

### Safari and macOS AutoFill

The preview desktop package does not include these integrations. They require a signed app with matching Apple provisioning profiles. The [Safari ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-safari.zip) contains developer web assets, not an installable extension.

For a provisioned build, follow the [signing and setup guide](apps/desktop/native/autofill/README.md). To include Safari, provide `LATCH_SAFARI_PROFILE` alongside the app and AutoFill profiles when running `pnpm run package:autofill`. All profiles must use the same Apple team and matching app group. Safari end-to-end verification is pending.

## Raycast

Raycast currently requires a source checkout and development import. There is no packaged download or public store listing. Follow the [Raycast setup guide](apps/raycast/README.md).

## Upgrade

Preview releases do not update automatically.

1. Quit Latch.
2. Replace the Mac app or Linux AppImage, or run the newer Windows installer or Linux package update.
3. Start Latch again.
4. Reload the browser extension and refresh open website tabs. If you loaded a separate Chrome ZIP folder, replace its contents first. For Firefox, extract the newer ZIP and load its `manifest.json` again.

## Locking and Touch ID

On supported Macs, a password unlock enables Touch ID unless you turned it off in Settings. The locked app requests Touch ID when brought to the front.

Auto-lock defaults to **Never**, including sleep and screen lock. Choose an idle timeout in Settings to enable automatic locking, including locking on sleep and screen lock. Manual lock and quitting lock the vault immediately.

## Troubleshooting

- **CLI not found:** check the `bw` installation or `LATCH_BW_PATH`, then quit and reopen Latch.
- **Extension disconnected:** start Latch, then reload and open its browser extension. Check **Settings → Browser** for connection status.
- **Old extension appearance:** reload the extension, then refresh website tabs. If using a ZIP, confirm the loaded folder contains the new release.
- **Download unavailable:** while the repository is private, sign in to a GitHub account with repository access.
