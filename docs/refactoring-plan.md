# Latch cleanup and architecture plan

2026-09-24 · Proposal for review · No refactoring applied

**Recommendation: delete demonstrably unused code first, then organize Latch as a small pnpm workspace with three applications and one shared package. Keep Vite+, WXT and electron-builder initially. Make each tool own its existing job, and reduce the custom glue between them.** Preserve current features; product cuts are separate options below.

The objective is fewer maintained behaviors, dependencies and duplicate sources. A file move is not a deletion, and splitting a large function into ten forwarding modules is not simplification.

## Audit baseline

The audited clone is at `27baed7`, matching GitHub `main` when checked. It also contains the uncommitted release/updater changes from this thread, which this plan includes. The other checkout at `/Users/dillion/src/personal/latch` is at `c45ceb3` with unfinished Swift AutoFill and Raycast work. Reconcile these changes before broad moves; do not use this clone's older Objective-C sources as the final native architecture.

| Observed                                                                                   | Implication                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 159 tracked files, 6,179,834 tracked file bytes                                            | Small enough to avoid enterprise monorepo infrastructure. These are working-tree source bytes, not Git history, dependencies or installer size.                                 |
| `design/`: 33 files, 4,228,610 bytes, 68.4% of tracked bytes                               | Asset cleanup has the largest immediate repository-size payoff.                                                                                                                 |
| 23 excess byte-identical asset copies, totaling 1,652,012 bytes                            | Consolidate source copies; some target-local delivery copies will still be needed/generated. This is an upper bound on duplicate-byte savings, not a deletion promise.          |
| `design/latch-glass-icon.zip`: 2,061,694 bytes                                             | 31 ordinary files match the expanded tree. Its README is older; the other extra entries are Apple metadata. Retain the current README and editable artwork, remove the archive. |
| Current `src/`: 11,945 lines including local updater work                                  | Most runtime code is active. Expect hundreds of directly removable lines from the first pass; a larger reduction requires verification or feature decisions.                    |
| `vault.ts` 1,069 lines; content script 1,030; `App.tsx` 847; `serve.ts` 599; `main.ts` 538 | These deserve responsibility review, but line count alone does not make their behavior disposable.                                                                              |
| Root workspace YAML has no `packages:` list; Raycast has its own lockfile/install          | It is currently two installs, not a unified workspace.                                                                                                                          |
| `check` runs `vp check` followed by `vp lint`                                              | There is overlapping lint/type work. Preserve the zero-warning policy while eliminating duplicate coverage.                                                                     |

The audit used tracked-file inventory, hashes, import/reference searches, dependency ancestry, source review and live official documentation. Unused-export findings are candidates, not compiler-proven whole-program reachability. Existing checks passed in the preceding release work; no runtime behavior was changed or retested during this planning audit.

## 1. Delete the clear waste

Do this as a small change before any folder moves.

| Files / area                                                          | Proposed change                                                                                                                                                         | Evidence and qualification                                                                                                                                                                  |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/components/ui/alert-dialog.tsx`, `skeleton.tsx`         | Delete both files: **195 lines**                                                                                                                                        | No importers found. Native confirmations are already used.                                                                                                                                  |
| `scripts/make-icon.swift`                                             | Delete: **30 lines**                                                                                                                                                    | Old green-lock generator; the current installer script explicitly uses the approved Icon Composer exports. No callers found.                                                                |
| `Toasts.tsx`, `App.tsx`                                               | Remove `Toast` view-model reconstruction, the `useSonner` subscription, returned `toasts`/`dismiss`, and ignored component props                                        | `Toasts(_props)` never consumes them; Sonner's actual Toaster subscribes independently. Preserve owned-toast tracking, safe-message filtering, lock cleanup and dismissed-pending behavior. |
| `field.tsx`                                                           | Remove unused `FieldSet`, `FieldLegend`, `FieldSeparator`, `FieldTitle`; simplify `FieldError` to the children actually supplied                                        | No external references to those helpers or callers supplying the error-array mode. Preserve used horizontal/vertical layouts, labels and accessible errors.                                 |
| `command.tsx`, `input-group.tsx`, `empty.tsx`, `kbd.tsx`, `alert.tsx` | Remove unused helpers such as `CommandDialog`, `CommandShortcut`, `CommandSeparator`, `InputGroupText`, `InputGroupTextarea`, `EmptyContent`, `KbdGroup`, `AlertAction` | Inspect internal references before deleting implementations. An unused export may merely need to become private.                                                                            |
| `dialog.tsx`, button/badge variants                                   | Stop exporting internals that have no consumers                                                                                                                         | Keep implementations still used inside their own files. Do not mistake a missing external importer for dead internal code.                                                                  |
| `scripts/build.mjs`                                                   | Remove automatic extension-identity generation during a normal build                                                                                                    | The identity is committed; WXT reads it during preparation before this fallback could repair a missing file. Validate and fail clearly instead. Identity rotation must remain explicit.     |
| `pnpm-workspace.yaml`                                                 | Remove unused `multer` override if a fresh lockfile resolution confirms the present graph                                                                               | `pnpm why` found no installed consumer. Recheck `tmp` and release-age exceptions independently; they are not all equivalent.                                                                |

The three full-file removals above total **225 lines**. Additional helper/toast savings should be counted from the actual diff, not guessed in advance.

Asset cleanup belongs in its own follow-up: delete the ZIP, retire obsolete exports after checking consumers, and keep one authoritative set of approved artwork. `build-autofill.mjs` currently reads PNGs from `design/`; move those required inputs before deleting directories. Keep the editable `.icon` source and appearance variants until their intended design use is resolved. Never delete `design/` wholesale.

## 2. Use a small workspace with clear ownership

Recommended target:

```text
apps/
  desktop/
    src/
      main/             # startup, lifecycle, vault, CLI, local bridges, macOS
      preload/          # narrow sandboxed Electron interface
      renderer/         # React screens and the UI helpers actually used
      native-host/      # browser-launched stdio executable
    native/             # finalized AutoFill and Safari native source
    build/              # necessary native compilation / embedding / signing
    assets/
    package.json
    vite.config.mjs
    electron-builder.ts
  extension/
    entrypoints/        # WXT background, content, popup
    content/            # detection, picker, capture; only useful modules
    public/
    package.json
    wxt.config.ts
  raycast/
    src/
    assets/
    package.json
packages/
  shared/               # explicit protocol/types, pure URL rules, theme, brand
assets/brand/           # canonical editable artwork and required source exports
docs/
package.json            # orchestration and common developer tools
pnpm-workspace.yaml
pnpm-lock.yaml
```

Use `workspace:*` and explicit shared subpaths. Shared code must not initialize Electron, access the vault, or open sockets as an import side effect. Desktop-only types stay inside desktop; renderer declarations stay with the renderer. Do not create separate packages for every screen, native target or transport. [pnpm workspace guidance](https://pnpm.io/workspaces)

Keep one root install and lockfile. Remove `raycast/pnpm-lock.yaml` and its separate workspace settings only after validating Raycast from the common install. Preserve `nodeLinker: hoisted` initially; changing package placement and linker semantics together makes packaging failures harder to isolate. Desktop runtime dependencies must live in its manifest; the packaged app must not acquire browser tooling or Raycast dependencies.

The migration includes all path consumers: builder `files`/unpack rules, native scripts, Vite aliases, `components.json`, TypeScript configs, CI path filters, runtime resource paths, extension identity, Raycast scripts, and Firefox source archive includes. Moving files without these changes is incomplete.

## 3. Simplify build ownership before replacing build tools

| Tool                            | Decision                                          | Reason                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm workspaces                 | Adopt                                             | Unify installs while keeping independent app manifests.                                                                                                    |
| Vite+ / `vp pack`               | Keep initially                                    | The existing independent CJS bundles and renderer build are reasonable. First remove unnecessary build work around them.                                   |
| WXT                             | Keep; make it the extension package's build owner | Its entrypoint, output, browser and ZIP conventions already cover this application.                                                                        |
| electron-builder                | Keep                                              | Packaging, native dependency collection, updates and signing integration are already present.                                                              |
| electron-vite                   | Later, bounded evaluation                         | Useful for Electron dev startup/reload. Its inspected v5 peer range lists Vite 5/6/7, while Latch uses Vite+'s RC alias. Compatibility is not established. |
| Nx, Turbo, extra task framework | Do not add now                                    | Four packages do not justify another orchestration layer without a measured need.                                                                          |

This is a judgment based on [Vite+ pack](https://viteplus.dev/guide/pack), [WXT project conventions](https://wxt.dev/guide/essentials/project-structure), and [electron-vite's versioned manifest](https://github.com/alex8088/electron-vite/blob/v5.0.0/package.json), not a universal framework rule. Vite is a build tool; pnpm supplies the workspace.

Concrete changes:

- Make desktop development build/watch desktop code. It currently compiles native targets and all three browser variants before starting Electron. Native artifacts need a valid initial build and rebuild on source changes, not rebuilding for every renderer edit.
- Make production target dependencies explicit: the desktop package currently needs Chrome assets for its install flow; Safari assets/native code are needed when Safari is included. Firefox artifacts belong to extension verification/distribution, not every local desktop start. A full repo check still covers supported targets.
- Replace `scripts/build.mjs`'s mixed responsibility with package scripts and a small number of necessary build hooks. Keep native compilation and license-notice generation explicit; do not replace one script with a new task runner written in-house.
- Deduplicate lint/type coverage, keeping strict warning behavior. Separate Node/Electron, renderer DOM, WXT-generated and Raycast type environments instead of letting Node and Chrome globals bleed into every source file.
- Use WXT's entrypoint layout directly for the small background wrapper; avoid forwarding-only files. Keep the large content implementation modular where that helps ownership. Use conventional public icon names to remove duplicate manifest declarations where output comparison proves equivalence. [WXT configuration](https://wxt.dev/guide/essentials/config/manifest)
- Use standard `.output/<browser>-mv3` extension output. Copy only the artifacts a desktop package consumes. Rebuild Firefox's source ZIP from a clean extraction, including shared workspace sources and reproducible dependency metadata. [WXT publishing](https://wxt.dev/guide/essentials/publishing)
- Keep three independent Node bundle contracts: main, sandboxed preload, and browser native host. A shared chunk must not silently make preload unsandboxable or native-host startup dependent on desktop initialization. [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)

After this, evaluate electron-vite only if it replaces meaningful remaining watch/start code. Acceptance requires working HMR/restart, bundled preload with sandbox preserved, independent native-host startup, working native addon, and packaged startup. Do not ship the template's `sandbox: false` merely to make the migration work.

## 4. Reduce dependencies where the replacement is genuinely smaller

- **shadcn CLI package:** its only source import is `shadcn/tailwind.css`. Evaluate replacing the handful of used variants/utilities with explicit Tailwind selectors or a small attributed CSS file, then remove the CLI dependency and use on-demand generation when needed. Preserve the semantics of selected/open/checked/disabled states and `no-scrollbar`; deleting the CSS import alone breaks current controls. Measure the transitive dependency reduction after resolution.
- **`node-gyp-build` direct dependency:** no app code imports it; `electron-liquid-glass` already declares it. Remove the redundant direct declaration only after confirming native-addon loading from the packaged app. This does not necessarily reduce installed bytes.
- **Hand-maintained notices list:** stop enumerating obvious transitive packages such as scheduler/virtual-core/tldts-core separately where traversal already reaches them. Eventually derive shipped inputs from package/build metadata, retaining explicit treatment of bundled dev dependencies and CSS. Legal notices are not removable clutter.
- **Keep Radix, cmdk, virtualization, Zod and the public-suffix library** where used. Replacing their behavior with hand-written equivalents would increase owned code and risk.
- Treat Vite aliases, native build permissions and dependency overrides individually. Retain alignment between Vite+ and its core alias; do not upgrade the toolchain as a side effect of moving folders.

## 5. Refactor active code around ownership, not arbitrary file size

**Renderer:** in `App.tsx`, replace parallel selection fields with one explicit selection state. Review modal flags for one mutually exclusive state. Extract one workspace-state module only if it actually owns fetching, selection and stale-response invalidation; avoid hooks that merely forward the same 20 state values. Keep screen composition readable in the app file. Eliminate the toast compatibility state first.

**Desktop:** make `main.ts` a composition/startup point. Put resource shutdown and lock propagation in one lifecycle owner; keep browser registration separate from the authenticated socket transport. `BrowserBridge` currently serves browsers, Raycast and Safari, forcing irrelevant empty configuration strings for non-browser clients. A narrowly named local transport plus browser-registration function can express the actual split without a plugin system.

**Vault:** retain one owner of session/generation/mutation state. Extract pure item projection/editability helpers and browser-capture policy only where they shrink that owner's interface. Do not scatter locking counters across classes or add a generic repository layer. Passkey protocol work remains a distinct security-sensitive concern; no crypto rewrite is included.

**Extension:** extract field detection/filling, picker rendering, and capture behavior from the large content closure only where each can own a small interface. Put inline style text in a colocated CSS file. Share the duplicated local-host predicate with desktop through a pure module, but keep the backend's independent authorization check. Retain trusted sender origins, iframe rules, trusted-event checks, WXT invalidation and stale-reply rejection. [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)

**Protocols:** reuse the existing launcher request types in Raycast instead of maintaining a second union. Keep desktop, browser and launcher capability sets separate. Keep narrow preload methods; replacing them with unrestricted IPC access is not cleanup.

**Warm Bitwarden worker:** keep it. `serve.ts` has real responsibilities: worker lifetime, isolation, cancellation, reconciliation and preventing replay of uncertain writes. Its cold CLI fallback also handles operations outside the server path. Consolidate only demonstrated duplication; benchmark before changing worker reuse or cache behavior. The official CLI remains the authentication/vault engine. [Bitwarden CLI](https://bitwarden.com/help/cli/)

## 6. Simplify release plumbing after the signed path works

Review the uncommitted release work from this thread with the same deletion standard. electron-builder v26 supports signing hooks and notarization; investigate replacing the directory-build/repackage wrapper with a single builder invocation and narrowly scoped hooks. Native compilation, provisioning profiles and per-extension entitlements remain necessary. [v26 lifecycle](https://www.electron.build/v26/docs/features/build-lifecycle/), [v26 macOS options](https://www.electron.build/v26/docs/mac/)

Do not delete the existing signer based on a template. A replacement must prove that the AutoFill/Safari extensions are signed correctly, the outer app is signed after embedding, the updater ZIP contains the final stapled app, and metadata describes final bytes. Select one signing/notarization owner; avoid double-signing or post-sign resource edits. The existing custom ULMO compression hook is a separate version-specific workaround, not a reason to rush a major builder upgrade.

The installed builder is **26.15.3**. Its source performs built-in notarization before `afterSign`, so that hook is too late for extension assembly or re-signing when built-in notarization is enabled. Put those responsibilities before the containing app is signed; verify the exact hook order when changing builder versions.

Do not add reusable workflow abstractions just to remove a few repeated checkout/install lines. Share configuration only where it reduces actual drift.

## Optional product reductions

These are not included in the feature-preserving plan:

| Option                                        | What can disappear                                                                  | Tradeoff                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Retire opt-in Liquid Glass mode               | Native addon, its direct loader dependency, unpack rule, OS-specific loading branch | Removes an existing experimental appearance mode; default native vibrancy remains. Strongest optional dependency cut. |
| Replace auth-screen Motion animation with CSS | `motion`, provider wrapper and animation-specific code                              | Requires visual/reduced-motion validation; not currently an unused dependency.                                        |
| Pause Linux/Windows packaging until supported | Target scripts/config and unused CI matrix work                                     | Removes unsupported distribution promises, but gives up packaging groundwork.                                         |
| Drop Safari or Raycast                        | Whole integration implementation                                                    | Material feature loss. Do not do this merely to hit a line-count target.                                              |

## Sequence and acceptance

1. **Reconcile the baseline:** preserve both dirty worksets, finish/review their intended changes, and establish one integration baseline. Record current behavior and package contents before moves.
2. **Delete unused code:** UI dead files/helpers, toast compatibility state, old icon generator, identity fallback. Review as a deletion-heavy change.
3. **Consolidate assets and dependencies:** archive/copy pruning, CSS-only shadcn evaluation, redundant declarations/overrides. Report source-byte and resolved-dependency deltas separately.
4. **Move to the workspace:** mostly mechanical moves, one install/lockfile, all path consumers updated. Avoid functional rewrites in this diff.
5. **Simplify builds and checks:** target-specific work, independent type environments, correct package/runtime dependency collection, reproducible extension sources.
6. **Refactor runtime ownership:** separate renderer, desktop lifecycle and extension changes. Report net lines after each; stop extracting when interfaces become larger than the behavior hidden.
7. **Release-hook consolidation and optional tool spike:** only after profile/signing acceptance. Feature cuts require an explicit choice.

For each relevant change, run formatting, strict lint/type checks and the affected build; run the full repository check before integration. The repository explicitly says not to add automated tests, so use existing checks and manual synthetic acceptance:

- Renderer: empty/large vault, selection races, search, edit/trash/restore, keyboard/focus, dark/light and accessibility settings; lock with details/dialogs/toasts open.
- Vault/bridges: lock during a pending read/fill, shutdown with queued work, canceled sign-in, rejected/oversized messages, lost mutation responses; no retry that might duplicate a write.
- Browser: trusted matching/nonmatching origins, iframes, field filling/save offers, navigation and background restart; use `docs/cross-browser.md`.
- Packaging: unpack and launch the real app; verify preload isolation, native-host paths, native dependencies, required assets/notices, and updater metadata checksums. Rebuild Firefox source ZIP independently; build Raycast from the workspace.
- Native/release: provisioned AutoFill/Safari acceptance, signing/notarization, Gatekeeper and upgrade between signed versions when credentials are available. A successful unsigned build is not this proof.

Measure maintained source lines, tracked bytes, direct/transitive dependency counts, install steps, build targets run and real build timings. Do not claim runtime speed or installer savings from source deletions alone. Avoid a Git-history rewrite; removing tracked duplicate assets only reduces future checkout contents.

Research and pinned example-repository observations: [tooling research](tooling-research.md). The useful examples are electron-vite's quick-start for process layout, WXT examples for independent extension ownership, and Bitwarden clients for explicit app/native packaging seams—not their entire architectures.
