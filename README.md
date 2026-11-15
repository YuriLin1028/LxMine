# LxMine

跨端音乐播放器，面向 **Windows** 与 **HarmonyOS 手机 / 平板 / 车机**。

LxMine 以 [Mineradio](#上游与致谢) 2.2.0 的沉浸视觉与桌面体验为基座，接入
[LX Music](#上游与致谢) 的自定义音源协议与音乐资料库能力，统一 PC 与鸿蒙端的首页、
歌单、搜索、本地音乐与播放详情体验。

当前版本：**1.0.0**（2026-11-14）。版本内容见 [RELEASE_NOTES](docs/RELEASE_NOTES.md)，
构建与发布记录见 [RELEASE](docs/RELEASE.md)。

## 上游与致谢

本项目是站在两个开源项目肩膀上的衍生作品，特此明确来源：

| 上游 | 作者 | 许可证 | 在本项目中的作用 |
| --- | --- | --- | --- |
| [LX Music（洛雪音乐助手）](https://github.com/lyswhut/lx-music-desktop) | lyswhut 及贡献者 | Apache-2.0（附附加条款） | 自定义音源协议、公开搜索、歌曲元数据、歌词与歌单互换 |
| [Mineradio](https://github.com/XxHuberrr/Mineradio-paused) | XxHuberrr | GPL-3.0-only | 桌面端基座：沉浸视觉、歌词舞台、3D 歌单架、电影镜头系统 |

- LX Music 仓库：<https://github.com/lyswhut/lx-music-desktop>
- Mineradio 仓库：<https://github.com/XxHuberrr/Mineradio-paused>（原 `XxHuberrr/Mineradio` 重定向至此）
- 固定版本、提交号与修改边界见 [docs/UPSTREAM.md](docs/UPSTREAM.md)；完整声明见 [NOTICE.md](NOTICE.md)。

LxMine 不是 LX Music 或 Mineradio 的官方版本，与两位作者无隶属或背书关系。
上游名称、Logo 与原创视觉设计的权利归各自作者所有。

## 功能

- **四平台融合首页**：每日三十首、跨平台榜单概念合并、分类板块、快捷胶囊。
- **统一歌曲列表**：每个列表都有播放全部、排列（拖动式手动排序）与列表内搜索。
- **歌单库**：时刻相册式随机拼贴封面。
- **本地音乐**：目录扫描、元数据与内嵌封面读取、歌词解析、下载收纳。
- **PC 沉浸光感**：指针追光、系统材质、锚点弹窗、无边框窗口 chrome 与按压反馈。
- **鸿蒙原生端**：ArkTS / ArkUI 导航与播控，应用接续、局域网同步、横屏沉浸。
- **多音源兼容**：兼容 LX 自定义源脚本；脚本由用户自行导入，仓库不附带。

## 目录结构

```
apps/desktop/                Electron 桌面端（Mineradio 基座 + LX 音源层）
apps/harmony/                HarmonyOS ArkTS 工程（手机 / 平板 / 车机）
packages/huawei-immersive-pc 华为式沉浸光感 PC 标准包（独立 MIT 许可）
docs/                        构建、来源、同步、版本与验收文档
scripts/                     打包、同步与清理脚本
qa/                          材质门禁与 UI 验收脚本、参考基线
```

## 构建与运行

需要 Node.js 20+ 与 PowerShell 7。

```powershell
npm --prefix apps/desktop ci
npm start                 # 启动桌面端
npm run build:win:dir     # 生成免安装目录
npm run build:win         # 生成 NSIS 安装包
```

鸿蒙工程用 DevEco Studio 打开 `apps/harmony`，签名与构建步骤见
[docs/HARMONY.md](docs/HARMONY.md)。命令行打包可执行 `npm run build:harmony`。

沉浸光感标准包可独立验证：

```powershell
cd packages/huawei-immersive-pc
npm run validate
npm run smoke
```

## 音源脚本不随仓库分发

`音源/`、桌面端内置音源种子与鸿蒙 rawfile 中的音源脚本均为第三方社区作品，
作者与授权条款各不相同，部分脚本内含 API key。它们已被 `.gitignore` 排除，
不属于本仓库及其许可证范围。

首次运行后请在应用内「设置 → 音源」导入你自行获得的 LX 自定义源脚本。请遵守
各音乐平台的服务条款与版权规则。

## 许可证

- 本仓库整体以 **GPL-3.0-only** 发布，全文见 [LICENSE](LICENSE)。桌面端衍生自
  GPL-3.0 的 Mineradio，因此整体必须沿用 GPL-3.0。
- `packages/huawei-immersive-pc` 单独以 **MIT** 发布，见该目录下的 `LICENSE`。
- 第三方库、移植模块与服务声明见 [NOTICE.md](NOTICE.md)、
  [apps/desktop/NOTICE.md](apps/desktop/NOTICE.md) 与
  [THIRD_PARTY_PORTS.md](apps/desktop/docs/THIRD_PARTY_PORTS.md)。

## 说明与免责声明

- 本项目不提供、不托管任何音乐内容，也不提供绕过付费或版权保护的能力。
- 本项目与网易云音乐、QQ 音乐、酷我、酷狗、咪咕音乐、Spotify 等平台均无隶属关系，
  不是任何平台的官方客户端。
- 鸿蒙 `hicar` 产品为兼容已安装设备与应用接续，沿用历史包名 `cn.migu.music`；
  该包仅用于本地调试安装，与咪咕音乐无关，公开分发前请改为自有包名。
- 软件按现状提供，不附带任何担保；使用造成的后果由使用者自行承担。
