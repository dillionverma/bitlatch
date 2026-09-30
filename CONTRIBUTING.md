# Develop Latch

[Back to README](README.md)

## Run locally

Node **24.11+ or 22.18+**, pnpm **11.25.0**, and Xcode for Mac builds.

```sh
git clone https://github.com/dillionverma/latch.git
cd latch
pnpm install --frozen-lockfile
pnpm run dev
```

Run `pnpm run check` and `pnpm run build` before submitting changes. The first checks formatting, lint, and types; the second builds all targets. The workspace uses Electron, [Vite+](https://viteplus.dev), and WXT with one install and lockfile.

`pnpm run test:matcher` runs the synthetic URL-matching suite and is included in `pnpm run check`. Default and Host matching require the same hostname. Base domain also includes subdomains under recognized public or private suffixes. An omitted port matches any port; an explicit port stays restrictive, including `:443` and `:80`. Explicit schemes must match. Scheme-less host/domain entries allow HTTPS or approved local HTTP. Ambiguous single-label names with ports need an explicit scheme, except `localhost:port`. Exact and Starts with retain full-URL and same-origin restrictions. Regex and Never do not autofill.

## Packaging and releases

**Packages.** Run on the target operating system. Output is written to `apps/desktop/release/`.

```sh
pnpm run package:mac    # DMG and ZIP, Apple Silicon
pnpm run package:linux  # AppImage and deb
pnpm run package:win    # NSIS installer
```

The [desktop workflow](.github/workflows/desktop.yml) builds macOS arm64, Windows x64, and Linux x64 / arm64 packages on their native runners.

**Development builds.** Desktop hot reload reuses native and browser assets after building missing outputs. Run `pnpm --filter @latch/desktop build` and restart development after changing those assets. `pnpm run check` regenerates WXT types before checking the workspace.

Desktop builds depend only on Chrome assets. The root build adds Firefox, Safari, the native Safari wrapper on macOS, and Raycast. WXT targets run sequentially because they share generated types. Signed packaging builds Safari only when its profile is supplied. Build caching remains disabled for host- and signing-dependent tasks.

**Releases.** `pnpm run package:dir` creates an ad-hoc signed, non-notarized Mac app without the provisioned macOS extensions. `pnpm run package:mac:signed` requires Apple signing inputs and notarizes without publishing. The [release workflow](.github/workflows/release.yml) checks, builds, and publishes all desktop and browser packages with SHA-256 checksums. Push a matching `vX.Y.Z` tag or run it manually with the version; manual runs create the tag only after successful builds. The separate [signed macOS workflow](.github/workflows/release-macos-signed.yml) produces notarized artifacts for an existing tag without modifying published releases. Add `LATCH_SAFARI_PROFILE_BASE64` to include Safari.

Release logic lives in `scripts/release.mjs`; `.github/release-notes.md` holds the preview notes. Artifact checks run locally without publishing:

```sh
node scripts/release.mjs validate v0.3.0
node scripts/release.mjs verify v0.3.0 /path/to/collected-artifacts
```

Validation requires matching desktop/extension versions and rejects a local tag pointing at another commit. Artifact verification requires all eleven expected payloads, rejects empty or unexpected files, and writes `SHA256SUMS`. Publication is a separate workflow step that preserves draft and tag checks. The internal shared package is not release-versioned with the apps.

**Browser install buttons.** Set `extensionUrls` in `apps/desktop/src/main/browser-setup.ts` to the published Chrome Web Store listing and Firefox listing or Mozilla-signed HTTPS XPI download. Keep the Chrome store ID aligned with `packages/shared/extension.json` and Firefox's ID with `packages/shared/src/browser-targets.ts` so native messaging remains authorized. URLs stay in the main process; buttons open the selected browser, not the default browser. Safari uses Apple's extension-settings API and is available only when Safari recognizes the bundled extension. Connection status remains shared across browsers.

**Browser packages.** Run `pnpm run extension:zip` for Chrome, Firefox, Safari web assets, and Firefox sources. To rebuild the downloaded sources archive, extract it and run from its root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec wxt build apps/extension -b firefox
```

Verified with Node 24.20.0, pnpm 11.25.0, and WXT 0.21.4. Output: `apps/extension/.output/firefox-mv3/`.
