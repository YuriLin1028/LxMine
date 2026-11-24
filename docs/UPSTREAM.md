# LxMine 来源记录

LxMine 是 Mineradio 的衍生作品，并与 LX Music 的自定义音源协议互通。本文固定
上游版本、许可证与修改边界，便于分发时核对声明。

## 上游一：Mineradio

- 作者：XxHuberrr。
- 仓库：<https://github.com/XxHuberrr/Mineradio-paused>（原 `XxHuberrr/Mineradio`
  重定向至此）。
- 采用版本：2.2.0，提交 `d43de565acabfdc1a9c9820a27e81a98ccbebcef`。
- 原作者许可证：**GPL-3.0-only**，原文保留在 `apps/desktop/LICENSE`，作者版权行
  `Copyright (C) 2026 XxHuberrr`。
- 原作者和第三方声明保留在 `apps/desktop/NOTICE.md` 与
  `apps/desktop/docs/THIRD_PARTY_PORTS.md`。
- LxMine 修改：工程与产品品牌、构建配置、LX 音源与资料库接入、局域网同步、
  鸿蒙原生移植。修改状态见 [PLAN.md](PLAN.md)，不代表上述工作已全部完成。

## 上游三：Folia（独立舞台渲染子包 `packages/folia-stage`）

- 许可证：**AGPL-3.0-only**，原文保留在 `packages/folia-stage/LICENSE` 与构建产物 `folia-stage/LICENSE`。
- 用途：以独立打包的前端可视化舞台子包形式提供 `folia-*` 原生歌词与视觉动效模式（`Partita`、`Pendolo`、`Diorama`、`Fume`、`Sonnet`、`Tempera`、`Lumiere`、`Monet`、`Cadenza`、`Claddagh`、`Tilt`、`Classic`、`Cappella`），并通过 `window.lxmineStage` 桥接协议与三端宿主打通，源码完整保留于 `packages/folia-stage`。

因为桌面端是 Mineradio 的衍生作品，**LxMine 整体按 GPL-3.0-only 分发**。根目录
`LICENSE` 为 GPL-3.0 原文；`NOTICE.md` 汇总上游与第三方声明。

## 上游二：LX Music（洛雪音乐助手）

- 仓库：<https://github.com/lyswhut/lx-music-desktop>。
- 已有音乐适配的参考版本：v2.12.6，提交
  `ad95d5091c9ed689fa72b5e5c849df65f5a679ce`。
- 上游许可证为 **Apache-2.0 并含附加条款**；移植或引用其代码须保留对应声明，
  附加条款同样适用。
- 用途：自定义源协议兼容、公开搜索、歌曲元数据、歌词和歌单互换。

LxMine 不是 LX Music 的 Fork，也不分发 LX Music 的完整程序；桌面端与鸿蒙端自行实现
协议适配层。LX Music 的名称与版权归 lyswhut 及贡献者所有。

## 不随仓库分发的第三方音源

`音源/`、`apps/desktop/desktop/lx-sources-default.json` 与鸿蒙
`entry/src/main/resources/rawfile/sources/` 中的脚本来自不同社区作者，授权条款
不统一，部分脚本内含 API key。它们已由 `.gitignore` 排除，不属于本仓库、也不受
GPL-3.0 或 MIT 授权约束。使用者需自行取得并导入，并自行遵守各平台服务条款。

## 商标与鸿蒙包名

- 各音乐平台名称、Logo 与商标归其权利人所有，本项目仅用于识别与互操作说明。
- 鸿蒙 `hicar` 产品为兼容已安装设备与应用接续，沿用历史包名 `cn.migu.music`。
  该包名仅用于本地调试安装，与咪咕音乐及其权利方无关；公开分发前应改为自有包名。

## 重建边界

此前 Folia 桌面基座已移入本地归档，新桌面树由上述 MineRadio 提交重新建立。鸿蒙旧
视觉组件仍在替换期间，不能把本文件视为该部分已完成清理的证明。

保留的独立音源、歌单与传输模块需维持各自来源说明。分发前必须按实际包含代码的
许可证提供对应源码与声明，不将上游 GPL 字段当作所有新增或历史模块许可证已经审定
的结论。
