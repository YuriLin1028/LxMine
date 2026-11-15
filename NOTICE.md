# NOTICE

LxMine  
Copyright (C) 2026 林毅 and contributors.

LxMine is free software: you can redistribute it and/or modify it under the terms of
the GNU General Public License as published by the Free Software Foundation, version 3
only. See [LICENSE](LICENSE). The full text is distributed verbatim; this NOTICE does
not modify or replace it.

## Upstream projects

### Mineradio

- Author: XxHuberrr
- Repository: <https://github.com/XxHuberrr/Mineradio-paused> (formerly `XxHuberrr/Mineradio`)
- License: GPL-3.0-only, Copyright (C) 2026 XxHuberrr
- Base version: Mineradio 2.2.0, commit `d43de565acabfdc1a9c9820a27e81a98ccbebcef`

The desktop application in `apps/desktop` is a derivative work of Mineradio. The
original license text is kept at `apps/desktop/LICENSE`; the original author's
third-party notices are kept at `apps/desktop/NOTICE.md` and
`apps/desktop/docs/THIRD_PARTY_PORTS.md`. LxMine's modifications include product
branding, build configuration, the LX-compatible source layer and library model,
LAN sync, and the native HarmonyOS port. LxMine is not affiliated with or endorsed
by the Mineradio author.

### LX Music（洛雪音乐助手）

- Repository: <https://github.com/lyswhut/lx-music-desktop>
- License: Apache License 2.0 with additional terms, Copyright lyswhut and contributors
- Reference version for the source protocol: v2.12.6, commit `ad95d5091c9ed689fa72b5e5c849df65f5a679ce`

LxMine interoperates with LX Music's custom-source protocol and adapts public
search, track metadata, lyric and playlist interchange behavior. LxMine is not a
fork of LX Music, is not its official release, and is not affiliated with or
endorsed by its author.

## Third-party components

Third-party libraries, ports and adapted community modules remain the property of
their respective copyright holders and are distributed under their own licenses.
See `apps/desktop/NOTICE.md`, `apps/desktop/docs/THIRD_PARTY_PORTS.md`, and the
license files shipped with each vendored directory.

`packages/huawei-immersive-pc` is a standalone package licensed under the MIT
License; see its own `LICENSE` file. That license applies only to that package.

## Custom source scripts are not distributed

LxMine does not ship music content, and this repository does not contain LX custom
source scripts. The scripts under a local `音源/` directory, the built-in source
seed, and the HarmonyOS rawfile sources are third-party community works with their
own authors and terms; some contain API keys. They are excluded by `.gitignore` and
are not covered by this project's license. Users must obtain and import their own
sources, and are responsible for complying with the terms of service of the
services they use.

## Names and trademarks

LxMine, LX Music, Mineradio, NetEase Cloud Music, QQ Music, Kuwo, Kugou, Migu Music,
Spotify, Huawei, HarmonyOS and HiCar are names or trademarks of their respective
owners. They are used here only for identification and interoperability
description. This project is not an official client of any music service.

The HarmonyOS `hicar` build product uses the historical bundle name `cn.migu.music`
for local device installation and app-continuation compatibility. It is a local
debugging artifact, is not associated with Migu Music, and should be changed to an
owned bundle name before any public distribution.
