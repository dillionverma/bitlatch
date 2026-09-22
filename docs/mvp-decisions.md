# MVP decisions

The original plan described a multi-week product. This first implementation proves the daily password workflow in a single Mac session.

## Keep

- A compact Mac desktop interface and a real Chrome/Aside inline picker.
- Existing Bitwarden vaults and official upstream cryptography.
- Fast local search, bounded lists, native messaging, and strict lock boundaries.
- Manual UI checks with isolated synthetic data, type checking, production builds, and packaging. Do not add automated tests.

## Simplify

The desktop owns the decrypted session. The extension is a thin companion and requires the Mac process to remain running. Closing the window leaves it running; quitting locks it and stops filling. An independent extension engine is later work.

Instead of extracting Bitwarden's Angular service graph in this first milestone, a small adapter invokes a separately installed official CLI. Search and matching run against an in-memory projection, so ordinary selections and fills do not spawn a CLI process.

Reads and writes go to one unlocked `bw serve` process that Latch keeps warm while the vault is open, because starting a CLI for each of them cost seconds. It is not a localhost endpoint: Latch hands the server one end of a connected socket pair as a file descriptor, so the server listens on no port and leaves no socket file behind, and nothing else on the machine can reach the unlocked vault. The server is started after sign-in, stopped when the vault locks or the app quits, and stood down for the commands that change which account is signed in, which run one-shot as before. Anything it cannot answer falls back to a one-shot run.

The published npm CLI includes `bitwarden_license` code. It is not a project dependency and remains excluded from packaged releases. A distributable standalone engine needs a proper upstream licensing/dependency inventory or an OSS-only build.

Official shadcn/ui Nova controls use Radix primitives, neutral semantic tokens, Lucide icons, and build-time Tailwind v4. They are local source files, not Radix Themes. System fonts need no download. A shared static theme supplies desktop and browser surfaces. The legacy desktop stylesheet and custom dialog-focus hook have been removed after screen migration.

No Jotai, TanStack Query cache, router, or form-state library is needed. Explicit React state and a typed bridge keep the UI understandable. TanStack Virtual still bounds the list. The extension has no React or Tailwind runtime. Sonner follows system appearance without next-themes.

## Defer

- Passkey registration/assertion, independent extension unlock.
- TOTP, folders, multi-account switching, import/export, permanent deletion, offline edits.
- Shared-organization and reprompt-protected secret access, enterprise policies.
- Safari/system credential-provider integrations, signing/notarization, updates, store publishing.

The web page never receives the vault or passkey private keys. Unsupported functionality is explicit in the UI rather than approximated.

## Next milestone

First stabilize real Cloud-account authentication and representative personal sites through owner-driven testing. Then choose and prove an upstream passkey-provider integration with correct presence/verification semantics. Validate the implemented save/update prompts and optional Touch ID on real devices before considering a distributable engine. Do not expand feature parity before those foundations work.

## Foundation verification boundary

`npm run check` runs TypeScript and the release build. `npm run package` creates the local arm64 application. Historical test reports describe earlier snapshots only; they are not current acceptance results. Manual synthetic checks must state which flows and native behavior were actually inspected. The foundation does not change authentication, cryptography, origin matching, secret release, or lock policy.

## Native appearance

Solid is the default. A pinned `electron-liquid-glass` runtime package remains external to esbuild, with native prebuilds unpacked from ASAR. Only public `addView` is used, once per window. Developer overrides allow glass on macOS 27.0, documented Electron vibrancy, solid, or simulated addon unavailability. Accessibility preferences always take priority. Material stays covered until relaunch after Reduce Transparency or Increase Contrast because the addon has no supported removal API. No production glass-support claim is made until the native matrix is complete.
