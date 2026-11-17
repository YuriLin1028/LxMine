# Android third-party code

The liquid-glass rendering dependency is Kyant0/AndroidLiquidGlass (Backdrop 1.0.6), licensed under Apache-2.0.

The files in `app/src/main/java/com/lxlia/player/ui/liquid/` are adapted from the official catalog at commit `896a94a3ade1cc1a940b92365f942a34971fecda` (tag `1.0.6`). The original license is included in `app/src/main/assets/licenses/AndroidLiquidGlass-LICENSE.txt` and packaged into the APK.

The adaptations change package placement, HarmonyOS control geometry and colors, callback freshness, and gesture cancellation. `GlassControls.kt` and `Glass.kt` use the catalog's refraction, backdrop sampling, pointer highlight, and damped-drag formulas with LxMine's control presentation.

Upstream source is available at https://github.com/Kyant0/AndroidLiquidGlass/tree/896a94a3ade1cc1a940b92365f942a34971fecda.

The primary-page background uses the OpenHarmony `COMPONENT_THIN` dark mask value from `global_system_resources` commit `c97a915509a875bd29b820e6edcc8a67f9556ddb`, together with LxMine Harmony's page overlay. The shared MineRadio assets originate from the Harmony stage and startup scene. The Android stage wrapper exposes the visual background layers and connects the analyser to native playback without competing for audio focus.
