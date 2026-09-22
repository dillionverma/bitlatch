# Latch UI

Use the supplied shadcn/ui Radix Nova controls in `src/renderer/components/ui`. The generator was shadcn 4.21.0; resolved dependencies are pinned in the lockfile. Do not add a second primitive or state library.

- `src/shared/theme.css` is the canonical light/dark token source for desktop, popup and the closed-shadow picker. System fonts and local icons only.
- `src/renderer/tokens.css` maps semantic tokens to Tailwind v4 and supplies compact control recipes. Keep the root at 16 px; use 13 px controls, 12 px supporting text and 11 px metadata.
- `workspace.css` owns pane geometry: 196/304/flexible at 1080 × 720, 180/280/flexible at 820 × 550. `metrics.ts` supplies the single 56 px virtual-row height.
- `tasks.css` owns task layouts. Use Dialog/AlertDialog focus management, opaque bodies and stable scrolling footers. Lock immediately unmounts all vault content and portals; no secret exit animations.
- Primary color means action; neutral accent means hover. Selection, inactive selection and keyboard focus have separate tokens. Preserve a visible 2 px focus ring and targets of at least 24 px.
- Native glass is limited to navigation. List, detail, auth and overlays stay opaque. Solid is the default. Accessibility flags force solid; high contrast strengthens borders and reduced motion removes transitions.
- Browser UI uses vanilla DOM and bundled static CSS. Keep its closed shadow root, trusted input checks and backend origin decisions. Never inject React or a page-wide reset.

Changes use `npm run check`, `npm run format:check`, packaging and manual synthetic inspection. Do not add automated tests. [Current evidence and limits](verification.md).
