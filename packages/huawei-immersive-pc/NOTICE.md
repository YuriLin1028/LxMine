# NOTICE

## Provenance

The runtime and the calibrated defaults in this package were extracted from the
LxMine PC client (`public/lxmine/material.js`, `popup-motion.js`, and the
corresponding CSS choreography), then generalized:

- class prefix changed from the app's `glass` vocabulary to `hx-*`;
- app-specific selectors, profile detection and IPC were removed;
- the material runtime gained lifecycle, configuration, cache management and
  dynamic-tree support;
- the popup runtime gained menu construction, anchoring rules, ARIA, keyboard
  handling and panel support;
- the modal/sheet lifecycle and the search morph were separated into
  `hx-surfaces.js`;
- normative geometry, timings, acceptance thresholds and porting guidance were
  written as standalone documents.

## What this is

This is an **independent front-end implementation** of an immersive optical
surface. It samples the live Chromium backdrop and applies a contour normal
field, tangential shoulder displacement, an independent environmental rim and
profile-specific tinting.

It is not a Huawei SDK, is not endorsed by Huawei, and does not contain or
decompile Huawei code, shaders, fonts, icons, screenshots or other proprietary
assets. "Huawei", "HarmonyOS" and related marks belong to their owners and are
used only to describe the visual reference.

The default parameters were fitted against native `uiMaterial.ImmersiveMaterial`
(EXQUISITE) captures taken on a physical phone for the LxMine project. The
capture and comparison pipeline is described in
`references/acceptance-protocol.md`. The thresholds are evidence for that
device, theme, scene set and test machine; they are not a claim of bit-exact
reproduction of a closed-source engine on every GPU or background.

## Copyright and license

Copyright (c) 2026 林毅.

This extracted package is **MIT** licensed (see `LICENSE`), at the project
owner's direction. It is intended for private and internal reuse without the
copyleft obligations of the main LxMine application.

The main LxMine application, its upstream-derived code and third-party
dependencies remain under their own original licenses; this package does not
relicense them. The runtime here is the generalized implementation described
above, not a copy of upstream application code. No Huawei proprietary code or
assets are included.

If this package is later distributed, keep the MIT copyright notice and verify
that any code you merge into it comes from a source you are allowed to license
under MIT.
