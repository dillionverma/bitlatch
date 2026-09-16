# Third-party software

Latch's original source is licensed under GPL-3.0-only. See [LICENSE](LICENSE).

## Bitwarden

Latch communicates with the user's **separately installed official Bitwarden CLI**. It does not redistribute that CLI in the packaged Mac application. The development dependency `@bitwarden/cli@2026.8.0` is used only for controlled compatibility tests.

The npm CLI bundle contains modules from `bitwarden_license`. Its package declares `SEE LICENSE IN LICENSE.txt`. Do not assume that all of that bundle is GPL or include it in a public release without a license inventory and the necessary rights.

- [CLI source at the tested release](https://github.com/bitwarden/clients/tree/77d62ade0fe91a502b7cfb9d8d894c2746c5609a/apps/cli)
- [Upstream license](https://github.com/bitwarden/clients/blob/77d62ade0fe91a502b7cfb9d8d894c2746c5609a/LICENSE.txt)
- [Separately licensed modules](https://github.com/bitwarden/clients/blob/77d62ade0fe91a502b7cfb9d8d894c2746c5609a/LICENSE_BITWARDEN.txt)
- [Official CLI installation](https://bitwarden.com/help/cli/)

Latch is independent and is not affiliated with or endorsed by Bitwarden.

## Other components

Electron, React, TanStack Virtual, Lucide, Zod, and tldts are used under their respective licenses. Build dependencies and exact resolved versions are recorded in `package-lock.json`. Electron includes Chromium and its third-party notices in the application bundle. The JS dependencies retain license comments in the generated bundles.

The visual direction takes inspiration from [Monocode](https://github.com/hardbeat920/monocode); Latch's interface and icon are original implementations.

Local integration tests use [Vaultwarden](https://github.com/dani-garcia/vaultwarden). It is a test dependency, not included in the Mac app.
