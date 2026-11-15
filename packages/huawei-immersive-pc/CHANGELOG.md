# Changelog

All notable changes to this standard/package are documented here.
Format follows Keep a Changelog; versioning follows SemVer.

## [1.0.0] — 2026-10-19

First standalone extraction from LxMine PC.

### Added

- `hx-material.js`: generalized optical material runtime.
  - rounded-rectangle SDF normals, contour displacement, tangential capsule
    shoulders, independent environmental rim, post-displacement smoothing;
  - `control` / `menu` / `popup` / `sheet` profiles with calibrated defaults;
  - automatic SVG defs/skin injection, dynamic-tree observation, 2px geometry
    quantization, filter cache with eviction, byte-exact deep-interior skip;
  - 4ms batched ResizeObserver writes and idempotent lifecycle.
- `hx-interactions.js`: pointer light, press/drag deformation on the skin only,
  spring release, stale-pointer cleanup, reduced-motion handling.
- `hx-popup.js`: anchored menu/panel controller with the 740ms native entry
  table, 150ms close, trigger-centre origin, flip/clamp positioning, ARIA,
  roving focus, keyboard map and single-popup lifecycle.
- `hx-surfaces.js`: modal/sheet lifecycle, focus trap, Esc/backdrop close,
  one-node FLIP morph for search.
- `hx-immersive.css`: tokens, optical skin, controls, dock/nav, popup modal and
  sheet geometry, Windows caption chrome, reduced motion.
- Interactive `examples/` with live Canvas backdrop, menus, modal, sheet,
  search morph, staged detail timing and a frame meter.
- `tools/validate.cjs`, `tools/smoke.cjs`, `tools/serve.cjs`,
  `tools/manifest.cjs`; Chromium smoke covers filter application, menu geometry
  and selected color, flip, modal/sheet, search morph, detail timing.
- `STANDARD.md` plus references for material math, motion, popup, surfaces,
  Windows/Electron, acceptance protocol, porting checklist, anti-patterns and
  API.
- `SKILL.md` for AI coding agents; `NOTICE.md` provenance and license notes.

### Notes

- Defaults are calibrated from LxMine's native EXQUISITE captures (16 samples,
  PLA-AL10, DPR 3.5, dark theme). They are not a claim of bit-exact
  reproduction of a closed-source engine on every GPU/background.
- Package license: MIT, copyright (c) 2026 林毅. The main LxMine
  application and upstream components keep their original licenses.
