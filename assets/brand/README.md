# Latch — Cobalt clasp, Glass

Source color: #145CFF. Rendered through Icon Composer MCP 1.1.0 and Apple ictool 27.0.

- Latch.icon: editable Apple Icon Composer document.
- source/clasp.svg: editable foreground vector.
- source/flat-icon.svg: flat vector for browser use.
- macos/: four native appearances (default, dark, clear light, clear dark) at 1024 px; default PNG sizes from 16 to 1024 px; Latch.icns (default 1024 px: icon-1024.png).
- ../../apps/extension/public/: flat PNG icons at 16, 32, 48, and 128 px for toolbar clarity.
- preview.png: appearance comparison sheet.

The system material can change the visible blue from the source color. The .icon document remains editable in Icon Composer. The app build compiles the default PNG exports into a macOS asset catalog and ICNS, preserving the approved untinted appearance. The host app supplies the AutoFill provider icon. Browser icons use the flat exports.
