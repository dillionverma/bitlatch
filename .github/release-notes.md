## What's new

- Browse your vault in the browser popup. Search logins and secure notes, filter by favorites, current website, or item type, and copy fields without switching to the desktop app.
- The popup and inline login picker now match Latch's neutral light and dark appearance and blue app icon.
- Browser Settings separates Safari, Chrome, and Firefox setup. Chrome and Aside use the bundled extension folder for manual installation.
- URL matching handles explicit schemes and ports, base domains, and ambiguous hostnames more consistently.
- On supported Macs, unlocking with your password enables Touch ID unless you turned it off. Auto-lock now defaults to Never, including sleep and screen lock. Choose an idle timeout in Settings to enable automatic locking, or lock manually at any time.

## Install

1. Download the package for your computer:
   - macOS 14+ on Apple Silicon: [DMG](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-mac-arm64.dmg) or [ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-mac-arm64.zip). Move Latch to Applications. There is no Intel Mac package.
   - Windows x64: [installer](https://github.com/dillionverma/latch/releases/download/v0.3.0/Latch-0.3.0-win-x64.exe).
   - Linux: use the AppImage or deb for x64 or arm64 from the assets below.
2. Install the [official Bitwarden CLI](https://bitwarden.com/help/cli/) separately. Use `brew install bitwarden-cli` on Mac, or `npm install -g @bitwarden/cli` with Node.js and npm on Windows or Linux.
3. Open Latch and sign in. On Mac, try opening Latch once, then use **System Settings → Privacy & Security → Open Anyway** if macOS blocks the unsigned app. Confirm **Open**.
4. For Chrome or Aside, open **Settings → Browser → Developer installation → Open extension folder** in Latch. Enable **Developer mode** on your browser's extensions page, choose **Load unpacked**, and select that folder. Keep Latch running and open the extension to connect.

The standalone [Chrome ZIP](https://github.com/dillionverma/latch/releases/download/v0.3.0/latch-0.3.0-chrome.zip) also works. Extract it to a permanent folder before loading it. [Full installation instructions](https://github.com/dillionverma/latch/blob/v0.3.0/README.md#installation) cover each platform. `SHA256SUMS` covers every release download.

## Upgrade

Preview releases do not update automatically. Quit Latch and replace the installed app or run the newer installer. Reopen Latch, reload its extension on your browser's extensions page, and refresh open website tabs. If you loaded a separate Chrome ZIP folder, replace its contents with the new ZIP before reloading.

## Preview limits

- Mac packages are not notarized. Windows packages are not code-signed. Windows and Linux still need end-to-end verification.
- Chrome and Aside have been verified. Other Chromium browsers still need end-to-end verification. Developer mode is required for unpacked installation.
- Firefox 140+ can load the unsigned Firefox ZIP through **about:debugging → This Firefox → Load Temporary Add-on** after extraction. Select `manifest.json`. Repeat after restarting Firefox. End-to-end verification is pending.
- Safari and native macOS AutoFill require Apple signing and provisioning. The Safari ZIP contains developer web assets, not an installable extension.
- Raycast requires a source checkout and development import. There is no packaged Raycast download or public store listing.
- While the repository is private, downloads require a GitHub account with repository access.
