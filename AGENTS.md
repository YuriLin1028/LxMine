# LxMine 项目开发、架构与发布总规矩（全端铁律）

> 沉淀自 LxMine 从 `v0.1.0` 至 `v1.3.0` 全历程的架构定案与踩坑经验。  
> **所有在本仓库工作的 Agent、子 Agent 与协作者必须无条件遵守以下十条铁律，违者视为验收失败。**

---

## 铁律一：先全量开发与本地自检，交由用户个人测试，未经明确指令严禁对外推送

- 必须把当次所有需求全部开发、全端对齐并通过本地测试/构建自检后，**仅在本地产出安装包或推送安装到用户个人设备**（Windows 本机、`adb` 设备、`hdc` 手机或平板，及后续苹果端测试设备）供**用户亲自测试**。
- **在用户实测确认无误并明确下达“推送 / 发布”指令之前，绝对禁止执行以下任何对外操作**：
  - 禁止 `git push`（任何分支或 tag，包括 `main` 与 `gh-pages`）；
  - 禁止 `gh release create / upload / edit` 操作 GitHub Releases；
  - 禁止运行 `scripts/publish-website.ps1` 或更新线上更新清单推送给外部用户；
  - 禁止向华为开发者中心（AppGallery Connect）上传软件包或提交邀请测试审核。
- **发版先后顺序**：涉及鸿蒙应用市场邀请测试版本更新时，先由用户确认并提交 AGC 邀请测试；**待 AGC 审核通过、拿到新版邀测链接后**，再统一推送 GitHub Release 与更新官网，避免线上邀测链接错版或断档。

---

## 铁律二：多端更新通道严格物理隔离，杜绝跨端串推与更新死循环

当用户明确批准对外发布时，各端更新链路必须物理隔离、互不污染：

1. **鸿蒙 Store 邀测版（`com.lxmine.player`）**：仅走 `store-release.json`（只分发华为应用市场邀请测试链接，绝不接 GitHub 安装包或其他端补丁）。
2. **鸿蒙 HiCar 版（`cn.migu.music`）**：仅走 `harmony-hap-release.json`（仅校验 `.hap` 资产）。
3. **Android 端（`com.lxlia.player`）**：仅走 `android-release.json`（仅校验 `.apk` 资产）。
4. **Windows 端（`com.lxlia.player`）**：仅走 `windows-release.json`（仅校验 `.exe` 资产）；安装及静默更新必须写入已安装资产 SHA-256 回执并预填 NSIS `/S` `InstallLocation`，严禁出现重复弹窗的更新死循环。
5. **后续苹果端（iOS / iPadOS / macOS）**：接入后同样必须使用各自独立分发/更新通道（如 App Store / TestFlight 或独立 `macos-release.json`），绝不得与 Windows、Android 或鸿蒙通道交叉污染。

- 全端支持同版本热修补丁检测（结合版本与资产哈希/构建标识），但任何单端补丁绝不得触发其他端误推送或跨端串推。

---

## 铁律三：全端严格统一、鸿蒙 PC 与 Windows 对齐，以及苹果全生态对标鸿蒙铁律

- **无特殊说明即全端统一**：任何功能新增、Bug 修复、接口兜底、文案提示、设置分组与交互改动，只要用户未明确指定单端生效，必须在当前全部端——**Windows（`apps/desktop`）**、**Android（`apps/android`）**、**HarmonyOS（`apps/harmony`，含手机 / 平板 / `2in1` PC / HiCar / Store）**（及后续接入的 **Apple 苹果端：iOS / iPadOS / macOS**）同步完成并验证。
- **共享运行时与视觉层同步**：修改共享逻辑或舞台代码（`lx-discovery`、`lx-playlists`、`host.js`、`mine-stage`、`folia-stage`、`plain-stage`）后，必须同步到所有端对应目录，严禁只修一端遗漏其余端。
- **桌面形态双向强对齐（鸿蒙 PC `2in1` ↔ Windows ↔ 未来 macOS）**：
  - 在三端统一基础上，**鸿蒙 PC（`2in1`）必须与 Windows 端保持桌面级体验严格对齐**（后续 macOS 同样按此桌面基准对齐）：涵盖桌面歌词（多行/字体/颜色/锁定穿透/拖动缩放与位置持久化）、壁纸/桌面沉浸模式、宽屏列表行内直接操作、右键上下文菜单（替代移动端长按）、桌面音量调节、宽屏分栏与窗口化响应布局。
  - 仅操作系统底层专属能力保留合理平台边界：Windows 独有系统托盘、开机自启与 Wallpaper Engine 共存宿主；macOS 独有菜单栏/Dock 集成；移动端独有 HiCar 车机、智感握姿与低延迟耳返——上述专属能力不得在无系统支撑的端强加无效开关，非底层差异一律对齐。
- **后续苹果端开发铁律（iOS / iPadOS / macOS 对标对应鸿蒙设备，只换苹果原生液态玻璃控件）**：
  - **设备形态一一对标**：
    - **iOS（iPhone）↔ 鸿蒙手机**：导航结构、融合首页、快捷胶囊、底栏方向折叠、固定式独立页与「上模糊、下穿透」、播放详情横屏沉浸与双指手势、设置分组及文案流程完全一致；
    - **iPadOS（iPad）↔ 鸿蒙平板**：横竖屏宽屏适配、居中弹出独立页（最宽 580pt）、4 列曲库拼贴与板块网格、不锁方向策略、宽屏分栏底栏完全一致；
    - **macOS（Mac）↔ 鸿蒙 PC（`2in1`）& Windows**：桌面歌词、壁纸模式、宽屏行内操作、右键菜单、桌面音量与窗口化交互完全对齐。
  - **只换原生材质与控件，严禁擅自改版**：苹果端仅将交互控件与玻璃材质切换为**苹果原生 Liquid Glass（SwiftUI 原生液态玻璃控件/材质及原生按压形变反馈，低版本按规范平滑降级）**；页面信息架构、组件构成、歌曲行、顶栏几何、曲库时刻拼贴、独立页「上模糊、下穿透」、3D 舞台与局域网同步协议（兼容 `ios` / `ipados` / `macos` 标识）全部严格对齐既有鸿蒙基准，**严禁借开发苹果端私自改版或增删 UI 元素**。
- **严禁擅自改版或私加 UI 元素**：以鸿蒙端及 `docs/MOBILE_PC_PARITY.md` 为唯一视觉基准，严禁在任意端私自增加额外按钮、标题下多余卡片、重复顶栏管理球或不一致的列表/横滑卡片样式：
  - 全场景歌曲列表统一复用唯一 `SongRow` / `songRow` 与 `SongListTools` / `createListBar`（禁止自造第二套歌曲行或列表工具条，来源标注统一使用封面右上角平台角标，禁止文字平台小胶囊）；
  - 二级及以下页面顶栏统一 `PageHeader`（38vp 材质球 / 28sp 标题 / 12sp 副标题，视觉球顶 `statusInset + 6vp`；歌单库首页操作球严禁泄漏到任何二级页）；
  - 曲库统一为单次持久化随机种子的时刻相册式 Bento 拼贴（右上角提供「随机排列」刷新球重排种子，启动期不反复洗牌）。

---

## 铁律四：独立页固定交互与「上模糊、下穿透」视觉铁律

- **独立页弹出即固定，严禁整页拖拽抽搐**：
  - Android 端**永久禁止使用 Material 3 `ModalBottomSheet` 与独立系统 `Dialog` 窗口**（会隔断 `LocalBackdrop` 变成不透明实心块，且 `AnchoredDraggable` / `verticalScaleUp` 会导致列表上滑撞顶抽搐）。
  - 所有独立页与对话框必须通过主窗口根宿主 `GlassModalHost` 渲染固定式半透毛玻璃 `GlassSurface(tone = GlassTone.Menu, nested = true, floating = true)`：入场后容器位置完全锁定，仅允许内部列表/表单滚动；内部禁用 Android 12+ 拉伸过滚（`LocalOverscrollFactory provides null`）。
  - 锚点/下拉毛玻璃菜单由位于 `GlassModalHost` 之上的 `GlassOverlayHost` 承载（如「选择动效」「音质」「行长按菜单」），不被独立页裁切且返回键优先收起菜单。
- **「上模糊、下穿透」视觉规范**：
  - 主页面、板块详情、歌曲评论及所有大型独立页（播放队列、更多、耳返监听、音效、批量下载、排序、编辑歌单、切换歌曲平台、自定义封面、本地扫描等）**只允许顶部悬浮标题区下方做单向渐进模糊**（鸿蒙 `linearGradientBlur`，Android `topProgressiveFade` + 轻盈 `TopProgressiveBlur`）。
  - **严禁在页面或独立页底部叠加模糊遮罩或深色暗幕**，内容必须通透直达底部/底栏（下穿透）；顶部也不得使用重度不透明色块压黑画面。
- **子独立页返回闭环与可点击性**：
  - 从父独立页进入子独立页（如 `播放队列 → 播放队列排序 / 切换歌曲平台`、`更多 → 音效 / 定时关闭`）必须先收起父页并记录 `returnSheetAfterSub`，子页完成、取消或按返回键后自动回到父页，严禁双层独立页堆叠或返回键失效。
  - 鸿蒙全屏浮层根节点**禁止** `HitTestMode.Block`（会阻断子节点点击/拖动）；菜单内开启全屏浮层必须等菜单收起后再触发。
- **深浅色全域自适应**：
  - 所有卡片、胶囊、输入框、滑块轨道、边框、分割线与选中态文字/图标必须走深浅色自适应语义色（Android 使用 `Theme.kt` 语义 token，鸿蒙使用资源色），严禁浅色模式硬编码白色低透明底；需要按 `ON_ACCENT` 着色的单色图标（如 `chip_*_on.svg`）严禁列入 `MULTICOLOR_ASSET_ICONS`。

---

## 铁律五：已标定液态玻璃与按压形变核心实现红线

- 未经用户明确要求，**绝对禁止改动**以下已真机标定并受门禁保护的核心材质与形变实现：
  - **Windows**：`apps/desktop/renderer/material.js`、`apps/desktop/renderer/popup-motion.js`、只读门禁基线 `releases/windows/runtime/bundle-eef7f60599fed7cb` 及 `qa/material/*` 门禁阈值与基准；
  - **HarmonyOS**：`apps/harmony/entry/src/main/ets/components/MaterialControls.ets`（保持官方 `systemMaterial` 上伸 16vp 补偿、`applyShadow: false`、可见图标置于承载材质组件内部、隐藏导航/沉浸控件使用 `BLOCK_DESCENDANTS` 退出命中树）；
  - **Android**：`apps/android/app/src/main/java/com/lxlia/player/ui/Glass.kt`（保持普通控件 1.03× 微放大、Android 13+ 折射滑块/导航水球 1.45× 弹性折射、Android 12 及以下稳定降级）；
  - **后续 Apple 端（iOS / iPadOS / macOS）**：交互控件与玻璃层统一采用苹果原生 Liquid Glass（SwiftUI 原生液态玻璃体系），严禁魔改自绘假毛玻璃替代原生控件，且界面结构不得偏离对应鸿蒙形态。
- Windows 侧每次构建安装包前，必须在无其他重负载并发的情况下**单独运行 `npm run test:material` 并通过**，禁止跳过门禁或降低阈值。

---

## 铁律六：坐标单位统一、横竖屏切换与滚动性能铁律

- **严禁混用 `px` 与 `dp / vp`**：
  - Android 端所有 `ScrollState.value`、`positionInParent().y`、`firstVisibleItemScrollOffset` 传入 ViewModel 计算锚点、快捷胶囊高亮、搜索条收起或底栏折叠前，**必须除以 `LocalDensity.current.density` 转为 `dp`**；调用 `scroll.animateScrollTo(...)` 时再乘回 `density`。
  - HarmonyOS 端 `getRectangleById` 返回值必须经 `px2vp` 换算后再用于滚动与命中判断。
- **横竖屏与沉浸切换丝滑无闪断**：
  - 播放详情展开时保留主页面状态树不销毁，Android 隐藏期间跳过主页面离线重排；唯一常驻底栏 `DockLayer` 在首页/二级页/搜索/详情/横竖屏间永不重建，视口宽高或横竖屏变化时直接 snap 落位避免拖尾。
  - 缓存的非活跃歌词/舞台 Web 层必须退出原生触摸命中（鸿蒙 `Hidden`，Android 移出命中区）；Android 歌词 `WebView` 必须直接作为兄弟节点绘制，禁止放入玻璃 `layerBackdrop` 录制层。
  - 沉浸态进出与双指手势仅作用于播放详情，退出详情立即恢复可见态，绝不把隐藏状态泄漏回首页/曲库/设置。
- **滚动零掉帧**：
  - 首页网络刷新结果先入待应用队列，仅在停止滚动空闲后且内容签名变化时静默替换，禁止滚动中整树重建或套 `animateTo`；
  - 播放进度更新按页面节流（列表页 1s、播放详情页 200ms）；播放快照按引用缓存队列 JSON，禁止每秒反复序列化大歌单；
  - 移动端滚动列表统一隐藏系统滚动条。

---

## 铁律七：3D 舞台、歌词引擎与音频/网络可靠性铁律

- **舞台与歌词一致体验**：
  - 动效与无动效歌词共享逐字时间轴、连续滚动轨迹、翻译/罗马音对齐；浅色模式保持高对比清晰字形，禁止在浅色播放页叠整屏增白雾层。
  - WebGL 舞台（含 Sonic Workshop、MineRadio、Folia）须维持 120Hz 平滑步进、移动端 DPR 像素预算、视口/方向变化时强制重同步 `viewport/scissor` 与 `ResizeObserver` 唤醒，防止二次切入冻结。
- **音频与公共接口兜底**：
  - 在线播放默认启用全导入音源并发竞速，并在试听截断或坏链时自动跨源/跨平台兜底恢复；大歌单导入与搜索按平台协议有界分页完整拉取，离开页面立即递增代次 token 作废过期请求。
  - 移动端 `LxHost` 网络代理转发网易云、QQ 等接口时必须保留 `Content-Type`、重定向 `Location` 与合规浏览器 `User-Agent`（禁止泄露 `okhttp` UA 或误走触发验证码的接口路径）。
  - 翻译/罗马音与平台公开数据均以真实数据源为准，禁止伪造假内容；启动默认恢复上次歌曲与进度但保持暂停（仅用户开启「启动时继续播放」时自动播放）；UI 错误提示一律转为清晰中文提示，严禁向用户暴露堆栈或底层英文异常码。

---

## 铁律八：零内置音源、无账号合规与隐私红线

- **绝对禁止预置音源**：所有对外分发包（Store `.app`、HiCar `.hap`、Android `.apk`、Windows 安装/便携包及后续苹果端 `.ipa` / `.dmg`）**严禁打包任何音源脚本或种子文件**（`sources/`、`dev-source.js`、`lx-sources-default.json`、`private-test-sources.json`）。每次打包完成后必须执行压缩包资产审计，确认 **`BadSources = 0`**。
  - 仅个人私测包允许显式指定 `-Plxmine.privateTestSources=<本机快照>` 注入，且绝不覆盖用户已有/已删源，严禁流入任何对外产物。
- **无账号与零追踪**：全端不设登录/账号体系，不集成任何统计、广告或第三方崩溃上报 SDK，歌单/音源/设置仅存本机或局域网点对点直连同步。
- **鸿蒙 Store 审核红线**：`com.lxmine.player` Store `.app` 包必须按 `buildMode=release`、`debug=false` 构建签名，设备类型仅限 `["phone","tablet","2in1"]`，自动剥离 `car` 与 `ACCESS_CAR_DISTRIBUTED_ENGINE` 权限，并隐藏全部车机 HiCar 入口与连接通知。

---

## 铁律九：版本同步、固定工具链与构建验真铁律

- **全端版本严格同步**：每次发版同步升级版本号——Windows `apps/desktop/package.json`、Android `apps/android/app/build.gradle.kts`（`versionName` / `versionCode`）、HarmonyOS `apps/harmony/AppScope/app.json5`（`versionName` / `versionCode`，AGC 要求每次提交 `versionCode` 严格递增），以及后续苹果端（iOS / iPadOS / macOS 的 `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`）。
- **固定工具链与构建验收**：
  - **Android**：必须显式使用 **JDK 21**（`D:\Program Files\Java\jdk-21.0.9+10`）+ Gradle `8.14.3`（禁用 Java 25），通过单测与 `assembleRelease` 后执行 `zipalign` + `apksigner sign` + `apksigner verify --verbose`（v2/v3 签名通过）。
  - **HarmonyOS**：Store 包用 `scripts/build-store.ps1 -ReleaseSigning` 并校验 `.app` 内 `bundleName` / `deviceTypes` / 车机权限 / `buildMode` / `debug` / `BadSources=0`；HiCar 包用 `scripts/build-hicar.ps1`；真机验证同步覆盖已连接手机与平板。
  - **Windows**：先独占通过 `npm run test:material`，再执行 `npm run build:win`，并用 PowerShell 7 运行 `scripts/publish-local-runtime.ps1` 发布到固定运行目录并更新桌面快捷方式（绝不直接从临时 `dist` 运行，也不让快捷方式每次解压 Portable）。
- **脚本与声明严谨**：PowerShell 脚本调用外部原生命令后必须显式检查 `$LASTEXITCODE` 防止失败被静默吞掉；未连接实机验证的硬件能力（如实车 HiCar、折叠屏实体铰链）必须如实写明验证边界，严禁虚报验收结果。

---

## 铁律十：工作区整洁与规范持续维护

- 每次打包与本地验证完成后，**必须及时清理所有临时构建目录**（`apps/android/build`、`apps/android/app/build`、`apps/desktop/dist`、`apps/harmony/build`、`apps/harmony/entry/build` 等），保持仓库干净。
- 严禁污染或删除只读基线目录与回归证据；后续新增或变更任何跨端重要约定，必须同步更新本文件（`AGENTS.md`）与 [docs/MOBILE_PC_PARITY.md](docs/MOBILE_PC_PARITY.md)。
