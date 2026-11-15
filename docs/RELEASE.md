# LxMine 发布记录

## 2026-11-15 鸿蒙双轨分发：应用市场邀请测试 + HiCar 保持 GitHub

- 新增 `scripts/build-store.ps1`（`npm run build:store`）：产出华为应用市场邀请测试用包，
  bundleName `com.lxmine.player`（旧 `com.lxlia.player` 在华为侧已被占用，AGC 无法创建），产物是 AGC 接受的 **APP 包（`.app`）**。构建期间临时把
  `entry/src/main/module.json5` 的 `deviceTypes` 收窄为 `["phone","tablet"]` 并移除
  `ACCESS_CAR_DISTRIBUTED_ENGINE`，结束（含失败）自动还原并校验 `car` 已恢复。
  `-ReleaseSigning` 用 `%USERPROFILE%\.ohos\lxmine-release\` 里的发布证书与 Profile
  按 `buildMode=release` 构建并签名（AGC 合法性检测要求 API≥11 的包 `debug` 不为
  `true`；hvigor 只接受 DevEco 加密格式的密码，脚本用 `encpwd.txt` + `material/` 注入
  `store-release` 签名配置，构建后还原）；不带的则出 debug 包仅供本机验证。复制产物前
  会解开 `.app` 内的 HAP 自检包名、设备类型、车机权限、`versionCode`、`buildMode`、
  `debug` 六项。上架材料（应用介绍、测试说明、权限说明、隐私问答、审核备注）见
  [AGC_SUBMISSION.md](AGC_SUBMISSION.md)。
- AGC 侧已落地（2026-11-15）：创建应用 LxMine（APP ID `6917621881923326327`，
  `com.lxmine.player`，手机/平板，项目 LxMine）；申请发布证书 `lxmine_release`
  （2026-11-15 至 2029-11-15）与发布 Profile `lxmine_store`；上传
  `LxMine-1.0.0-Store-20261115.app`，合法性检测「已达标」；创建外部测试群组「好友测试」。
- 邀请测试规则按官方文档核对（2026-11）：上限 10000 人 / 300 群组、单版本最长 90 天、
  仅中国大陆、不支持快速审核、不支持未成年模式；版本分享链接在审核通过后可拼
  `&invitationCode=`；发布邀请测试不需要资质与备案。
- 双轨规则与 AGC 操作写入 [INVITE_TEST.md](INVITE_TEST.md)。HiCar 版不进市场：
  `cn.migu.music` 是咪咕音乐包名无法在 AGC 创建，且邀请测试设备类型不含车机；
  继续由 `build-hicar.ps1` 出包并放 GitHub Releases，维护者自用该版本。
- 版本同步：两包同源，版本号统一取 `apps/harmony/AppScope/app.json5` 的
  versionName / versionCode，每次发版依次出 Store 包与 HiCar 包。
- 2026-11-15 已提交邀请测试版本（预审中，30–40 分钟自动检测后转人工审核）：
  设备 手机/平板/PC/2in1（`deviceTypes` 含 `2in1`；手表不参与），测试期
  2026-11-15 → 2027-01-01，反馈渠道为抖音公开群 784249865742。
  版本分享链接：<https://appgallery.huawei.com/link/invite-test-wap?taskId=5554c3049d63f207e204e4decf9160d7>

## 2026-11-14 v1.0.0 — 融合完成版

- 版本号从固定 0.1.0 升级为 **1.0.0**（Harmony versionCode 1000000；Windows package 1.0.0）。
- 功能与修复汇总见 [RELEASE_NOTES.md](RELEASE_NOTES.md)：四平台融合首页、每日三十首、分类、
  歌单库时刻拼贴、统一歌曲列表、播放全部/五种排序/拖动排列/列表内搜索、本地音乐识别导入、
  PC 与移动端对齐、浮层命中测试修复。
- 产物：`LxMine-1.0.0-Setup.exe`、`LxMine-1.0.0-HiCar-20261114.hap`。

## 2026-11-13 HiCar 重签（换机：HUAWEI Pura X / VOL-AL00）

- 用户换机后旧 HiCar 包安装报 `9568423 the device is unauthorized`：2026-10-20 的 debug profile 只登记了两台旧设备 UDID。
- 在 `apps/harmony-hicar-sign` 重新勾选自动签名并登录华为账号，生成新 profile（`default_harmony-hicar-sign_<hash>.p7b`，有效期 2026-11-13 至 2027-11-13），其 `debug-info.device-ids` 已含新机 UDID（已脱敏）。
- 重新执行 `sync-hicar-signing.ps1` 后以 `.\scripts\build-hicar.ps1 -SkipStage -SigningConfig hicar` 出包：`releases/harmony/LxMine-0.1.0-HiCar-20261113.hap`（25.8MB，bundle `cn.migu.music`，deviceTypes `phone/tablet/car`，versionName 0.1.0 / versionCode 1）。
- 已用 `hdc install -r` 装到 HUAWEI Pura X（HarmonyOS 7.0.0 / API 26），`aa start` 启动成功，`cn.migu.music` 与 `:render` 进程存活，首页完整渲染。
- 后续换机或 profile 过期时重复同一流程；`build-profile.json5` 中 `hicar` 签名配置已指向本次材料。

## 2026-11-14 首页大融合（华为音乐排版）+ 平台 logo 角标

- 排版对照华为音乐真机首页：头图改为**竖排长卡片并排**（融合榜单 + 每日三十首，List 横向，`contentStartOffset/contentEndOffset` 实现"静止时左侧留距、滑动时贴屏幕物理边缘"）；横向卡片行（推荐歌单/排行榜/热门歌单/相似/最近）同样全屏出血。分类板块卡片无封面时用按名称哈希的渐变色块 + 名称首字，不再显示空占位图标。
- **快捷胶囊复刻旧版四大平台按钮**：`HomeChips` 新组件，均分整行、不套滚动容器（发现 systemMaterial 在滚动容器内不渲染），再包 `MaterialSurface`（沉浸光感要求普通控件位于 Navigation 标题区）；激活项白底用 `Material.empty` 避免材质盖掉白底；每枚胶囊带图标（新歌♪ 歌单▦ 排行榜☰ 热门▶ 分类⋯）；胶囊点击后高亮保持 800ms 不被路过的板块抢走；跳转用 px2vp 修正后精准落位；根节点 `HitTestMode.None` 让胶囊间空隙可拖动页面。胶囊常驻吸附在头部下方（页面层级，非滚动内），分类/板块覆盖：新歌/歌单/排行榜/热门/分类。
- **榜单大融合**：同概念榜单合并（飙升/新歌/热歌/原创），多来源榜单本身无角标、只有内部歌曲封面带角标；打开融合榜单时并行拉取各部分、按标称数量截断（卡片"共 N 首"与实际一致）再交错；`openFeedPlaylist` 载入前弹 toast 反馈。**每日三十首**：四平台新歌按日期种子确定性洗牌取 30 首，头图首张卡片（真实封面 + "X月X日 · 融合推荐 30 首"），点击直接播放当日队列。
- **分类板块**：`homeLite` 返回各平台歌单分类，合并去重后在首页成行；点分类卡片注入临时 section（`request={source,type:'hot',category}`）复用 FeedSectionPage 加载对应歌单列表，列表内歌单卡片同样带角标/渐变封面。
- 修正：`FeedSectionPage` 歌曲行补角标；播控栏页底回弹不再自动展开两栏（`maxScrollSeen` 判定 atBottom，负向滑动不累计）；卡片播放态——横幅/列表行的播放键在对应内容正在播放时变为暂停键。
- PC 端 `.row-scroll` 同步全屏出血（负 margin + 内 padding，phone-layout 26px）；runtime 更新为 `bundle-e9c54256ef4841b1`（`current.json` 与桌面快捷方式已指向）。
- 已验证（Pura X 真机截图）：竖排横幅 + 每日三十首卡片、胶囊光感/图标/白色高亮跟随、分类渐变封面、跳转精准；平板 MRDI-W10 同步安装。产物：`releases/harmony/LxMine-0.1.0-HiCar-20261114.hap`（`2315e7b2…242ee7d0`）、`LxMine-0.1.0-Tablet-20261114.hap`（`efaa6c87…f4181`）。
- 追加修复（同日晚）：胶囊图标改 `SymbolGlyph`（musicSymbol 映射，高亮时随文字变黑——原 stroke 型 SVG 不吃 fillColor）；页底/回弹区间清除胶囊高亮；横幅与榜单卡片点击**先跳转出歌单壳再后台装载**（toast 反馈），装载完成后按标称数截断+去重并回写卡片数量（内外一致）；卡片播放键有播放态（对应内容播放中变暂停键，横幅播放键独立点击=开播+自动播放）；每日三十首点击进入详细列表（内存队列秒开），卡片播放键直接开播；`loadPlatformSection` 加页数上限 4 页与 total 边界（修复网易云"华语"等大分类无限分页导致分类详情空）；平板去掉首页 `maxWidth 1000` 约束（出血与手机一致）。
- PC 首页对齐移动端：`lx-discovery.cjs`（shared）加 `homeLite`，`lxmine-ipc` 暴露 `lxmine-home-lite`，preload 暴露 `lxMusic.homeLite`；渲染层 `loadMergedFeed`（四平台融合 + 榜单概念合并 + 每日洗牌 + 分类）替代单平台 home，首页移除四大平台按钮，改为快捷胶囊（sticky、玻璃、点击滚动）+ 竖排横幅行（每日三十首/融合榜单，播放键点击开播）+ 融合板块；卡片封面带圆形平台角标（`public/lxmine/logo-*.png`），无封面用渐变+首字；融合榜单详情并行拉取各部分并截断交错；分类卡片进入对应歌单列表页。runtime `bundle-e22b60cde42d5c38`（快捷方式已指向）。PC 出血改为
`margin/padding calc(50% - 50vw)` 全窗出血（不再受 #view 1240px 居中限制，
贴程序窗口左右边缘）；滚轮悬停横向行横向滚动（document wheel 委托，
`.row-scroll` 内 preventDefault）；胶囊高亮跟随滚动（updateHomeCompact 内
按 section top ≤ 210px 判定，页底取消，点击保持 800ms）。`public/index.html`
暂有 window.onerror→document.title 调试陷阱。
PC 胶囊白色高亮的坑：`.glass:not(.modal):not(.popover){background:transparent}`
特异性 (0,3,0) 盖掉 `.home-chip.active` 的 (0,2,0) 白底——用
`.home-chip.glass.light.active { background:#F2F1F7 !important }` 提权覆盖
（移动端 ArkTS 无此问题）。胶囊吸顶位置改搜索球以下（sticky top 92px）。
横向行出血改 `margin:calc(50% - 50vw)` + 固定 40px 内边距（`#view:has(.home-chips)`
解除 1240px 限宽），静止首卡对齐内容左缘、滚动贴窗口边缘；每行加左右圆形
玻璃按钮（PC 独有），滚轮横向滚动委托已按用户要求移除。

- 排版参考华为音乐首页（真机截图对照）：轮播头图（合并榜单前三张，DotIndicator，封面打底 + 榜名/播放量/角标）→ 快捷胶囊（精选/新歌/歌单/排行榜，点击滚动到对应板块，getRectangleById 的 px 结果经 px2vp 换算后再 scrollTo）→ 新歌速递列表行（封面+角标+心+播放）→ 推荐歌单/排行榜/热门歌单横向卡片（播放量左下角标 + 平台角标右上）→ 相似推荐 → 最近常听。删除搜索框下的四大平台胶囊与 `switchHomePlatform`；内容顶部 padding 去掉胶囊预留的 76vp 空白。
- 数据融合：`lx-discovery.js` 新增 `homeLite(source)`（推荐/热门/榜单/新歌，不带分类标签，单平台约 4 个请求），`host.js` 路由放行 `home-lite`；`HomeFeed.ets` 新增 `loadMergedHome`：四平台并发请求后按 round-robin 交错去重（`source:id` 键），组成统一 sections，不再区分平台板块。原 `home(source)` 协议保留给旧逻辑。
- 角标：`Theme.sourceBadge(source)` 返回 wy/tx/kw/kg 的 logo 资源（网易云/QQ 音乐取自 favicon 解码 32px，酷我 30px，酷狗取自应用宝 CDN 128px 真图标；此前手绘的酷狗耳机 SVG 不像，已弃用）。规则：只有单一来源的封面才带角标，多平台融合的板块/歌单不显示角标，只标注在内部歌曲封面；播控栏圆形旋转播控球永不显示角标；角标内缩（卡片 5vp、小行 3vp、横幅 12vp），不超出封面圆角。`SongRow` 平台文字标注改为封面角标。
- 已验证（Pura X 真机截图）：轮播翻页、胶囊锚点跳转、四平台新歌/榜单混排、角标位置与酷狗真图标；平板 MRDI-W10 同步安装（横屏布局同样正常）。产物：`releases/harmony/LxMine-0.1.0-HiCar-20261114.hap`（`1f9a4e5e…66eb9f6`）与 `LxMine-0.1.0-Tablet-20261114.hap`（`52676427…527990`）。


- 方向：`EntryAbility` 默认 `PORTRAIT`（`deviceType === 'car'` 保持 `AUTO_ROTATION`，避免 HiCar 车机被锁竖屏）；`pages/Index` 新增 `applyOrientation(detail)`，只在播放详情页打开期间切 `AUTO_ROTATION`，关闭动画结束后锁回竖屏。首页/资料库/设置/竖屏详情均不可横屏。
- 横屏沉浸：详情页横屏时 `stageControlsVisible=false`，`NativePlayer`（返回+音质/投屏/分享/评论/动效）与 `DockLayer`（进度条+播控栏）整体淡出下移，只保留 `MineRadioStage` 的背景动效与歌词；全屏透明层挂 `PanGesture({fingers:2, direction:Vertical})`，两指上滑显示、下滑隐藏，过渡为 `springMotion(0.46,0.82)`。竖屏详情与其它页面永不进入该状态。
- 首页性能：`MineHome` 的横向行改为 `List` + `LazyForEach`（新增 `RowSource<T> implements IDataSource`，仓库首个数据源实现），一屏只构建可视卡片；`feedSongCard` 的 `newSongs.some()` 改为预建 `Set`；删除死代码 `feedSongRow`。整理后首页 UI 树 246 节点 / 17 张图片（改前一次构建 400+ 卡片）。
- 首页快照：`services/Store` 新增 `loadHomeCache/saveHomeCache(platform)`，冷启动先渲染上次结果再由 `refreshHomeFeed` 静默替换；`refreshHomeFeed` 日志补充 `sections` 与 `load` 耗时。
- 诊断写盘：`MineRadioStage` 取消每 20 个 clock tick 的周期性 `captureDiagnostics()`（首页滚动时持续 Preferences flush），保留 450 ms 去抖与崩溃自愈。
- PC→手机同步：新增 `scripts/push-pc-to-phone.mjs`（纯 Node，UDP 发现或 `--host`，端口探测 41300-41304，过滤手机端不支持的 `mg` 曲目）。已把 `%APPDATA%\Lxlia` 的 11 项设置、3 个歌单（528 首）、16 个音源推送到 Pura X 并在资料库/设置页核对一致。
- 两指手势修复：舞台是 ArkWeb，触摸不会冒泡到 ArkUI 父节点，原 `PanGesture`/根节点 `onTouch` 都收不到。改为在详情页横屏时盖一层 `HitTestMode.Transparent` 的透明捕获层，用 `onTouch` 统计双指纵向位移（>36vp 触发），并保留根节点 `onTouch` + `PanGesture` 兜底，`toggleStageControls` 250ms 去抖。已在 Pura X（强制横屏测试）验证：两指上滑显示、下滑隐藏、`springMotion(0.46,0.82)` 过渡正常。
- 返回即旋转：`playerVisibilityChanged` 不再等退场动画 `onFinish`，关闭详情页时同步 `applyOrientation(false)`，横屏返回后立刻转竖屏。
- 平板策略：`deviceType === 'tablet'`（以及 `car`）不锁方向，其余功能与手机一致（横屏详情同样进入沉浸）。
- 底部一栏/两栏改为方向驱动：`homeScroll` 按累计滑动方向（阈值 44vp）切换 `dockCollapsed`，不再"只有回到最顶部才两栏"；到顶恒为两栏。头部仍只在顶部展开，避免展开后压住内容。点一栏里的圆球展开时清空方向累计并压制 400ms 滚动回调，修掉展开后页面上下抽搐；一栏时当前页圆球 `hitTestBehavior` 改为 `Default`，单击即可展开（原来只有父级 `onTouch` 能命中，需要点得又准又重）。
- PC 端同步：`public/lxmine/app.js` 的 `updateHomeCompact` 新增 `dockCompact/scrollTravel/lastScroll`，`phone-compact` 改由滑动方向驱动（阈值 44px，到顶展开）；点当前页导航项展开时清空累计。因材质门禁基线缺失无法重新打包，改为把新渲染层写入发布 runtime：`releases/windows/runtime/bundle-f6cf494f0c907f6a`（`current.json` 与桌面快捷方式已指向它）。
- 已安装验证：手机 `cn.migu.music`（Pura X）与平板 `com.lxlia.player`（MRDI-W10）均安装新包并启动正常。

## 2026-10-20 HiCar 兼容包（cn.migu.music）

- 车机入口采用已核对的兼容方案：新增独立产品 `hicar`，`bundleName` 改为 `cn.migu.music`，`deviceTypes` 含 `car` 并保留 `ACCESS_CAR_DISTRIBUTED_ENGINE`；正常版 `com.lxlia.player` 的配置与签名不变。
- AGC 已为该包名签发 debug profile，说明包名此前未被占用：`issuer=app_gallery`、`developer-id=<已脱敏>`、有效期 2026-10-20 至 2027-10-20，绑定手机与平板两台设备 UDID。
- 签名材料由独立工程 `apps/harmony-hicar-sign/` 经 DevEco 自动签名生成，再由 `scripts/sync-hicar-signing.ps1` 以 `hicar` 名称并入主工程；该工程与主工程分开，避免 DevEco 工程级自动签名覆盖正常版材料。
- 产物 `releases/harmony/LxMine-0.1.0-HiCar-20261020.hap`（25.8MB）。`hap-sign-tool verify-app` 通过：`Digest verify result: true`（SHA-256）、`verify-app success`。
- 已安装到手机 HUAWEI Mate 70 Pro+（HarmonyOS 7.0.0 / API 26）并启动成功：`cn.migu.music` 进程与 `:render` 服务存活，画面见 `.research/hicar-20261020/launch.jpeg`。`bm dump` 确认已安装 `cn.migu.music`（appIdentifier 已脱敏，versionCode 1）与 `com.lxlia.player` 并存。
- 未完成：车机端 HiCar「应用尝鲜区」的实际识别与车内交互验证，需要实车环境。
- 已知副作用：设备上出现两个名称相同的 LxMine；两者数据目录与局域网同步身份相互独立，不会互相覆盖，但桌面难以区分。

构建入口：`.\scripts\build-hicar.ps1 -SkipStage -SigningConfig hicar`。签名材料失效或换机器时，重新在 `apps/harmony-hicar-sign` 勾选自动签名，再执行 `.\scripts\sync-hicar-signing.ps1`；`-Revert` 可回退主工程配置。

## 2026-10-20 SyncRecent / SettingsAligned

- 移动设置对齐 PC 的音乐源、播放、歌词、系统与互联、关于分组，排除桌面歌词与 Windows 专用系统功能，保留 HiCar 和智感握姿。
- 歌词设置接通颜色模式、自定义颜色、翻译／罗马音与时间偏移；原生设置卡片统一为整组圆角，内部行连续排列，移除单行圆角和裁切。
- 手机和平板均已安装 SettingsAligned HAP，已实际检查设置主页、歌词页、原生选择菜单和滚动边缘。
- 修复 LAN 同步音源 ID 碰撞及保存失败无法重试；加入最近播放、默认静默恢复播放状态，移动端音频分析恢复实际频谱响应，移除 3D 歌单卡片。
- HarmonyOS 服务测试 9 项、PC 同步测试 5 项通过。Windows 严格材质／帧时门禁与便携版运行、资源哈希、匿名首页、托盘检查通过。
- 验收范围和未完成的真实设备组合见 `docs/MOBILE_PC_PARITY.md`。搜索追加、搜索框形变由用户确认正常，本轮不重复真机验收。

产物：
- `releases/harmony/LxMine-0.1.0-SettingsAligned-20261020.hap`
- `releases/windows/LxMine-0.1.0-Setup-SyncRecent-20261020.exe`
- `releases/windows/LxMine-0.1.0-Portable-SyncRecent-20261020.exe`

桌面快捷方式已指向发布运行目录 `bundle-7e6b3ae70bc3b6d0`。已运行的旧实例须从托盘退出后重新启动，才会运行新版。

## 2026-10-19 WallpaperCoexist 修正

- 修正上一版壁纸模式的方向：保留 Wallpaper Engine 作为底层，LxMine 使用独立、默认 80% 不透明度的透明桌面叠加层，主程序窗口仍可打开。
- 不再使用上一版在本机实际桌面上失败的 WorkerW 替代壁纸路径；改用现有 DefView 共存路径，保留 Explorer 的真实图标与点击行为。壁纸层默认鼠标穿透。
- 桌面叠加层拥有独立的原生生命周期，不再驱动主窗口的完整桌面模式、WE 原生宿主或窗口恢复逻辑。创建/关闭串行处理，异常销毁时停止原生图标守护并恢复桌面状态。
- 设置和托盘继续提供退出入口，Esc 不退出，桌面层不含额外控制器或区域标签。
- 新增 `qa/catalogue/wallpaper-display.cjs`：采集真实显示器，而非仅采集 LxMine 自己的窗口。在 HDR/混合桌面上使用两组相反色差的测试层验证实际可见性与连续性，保留 90% 区域覆盖门槛；测试结束恢复窗口布局。
- 相关单元测试 36 项、歌词/同步/设置与托盘端到端回归通过。界面资源未改变，源文件绑定的材质门禁仍有效。

产物：`releases/windows/LxMine-0.1.0-Setup-WallpaperCoexist-20261019.exe`、`releases/windows/LxMine-0.1.0-Portable-WallpaperCoexist-20261019.exe`。

## 2026-10-19 LyricsRepair 修正

- 修复桌面歌词状态回执强制重绘设置首页的问题，保留当前歌词设置页面；异步首页加载结束也按当前子页面刷新。
- 桌面歌词不再因为打开歌曲详情页而被清空；无歌词时显示明确提示。
- 未锁定时使用紧凑阴影区域，保留八向拖动缩放与尺寸记忆。旧的大范围首次迁移到紧凑尺寸；歌词动效与固定交互边界分离，缩放把手使用指针捕获。
- 局域网接收独立刷新已落盘的资料库，不再等待网络首页请求；检查接收结果与持久化后的歌单数量，防止旧首页响应覆盖新歌单。同步失败不显示成功。
- 壁纸模式使用独立的桌面宿主，主程序窗口可以照常打开。移除旧壁纸覆盖层文字与退出按钮，不注册 Esc 退出；设置与托盘菜单保留关闭入口。
- 补充 Explorer 将 WorkerW 放在 Progman 内的窗口布局适配，避免 `WALLPAPER_WORKERW_NOT_FOUND`。
- 回归脚本：`qa/catalogue/lyrics-sync-wallpaper.cjs`，覆盖真实鼠标开关、详情页歌词、实际边缘缩放、真实 HTTP 接收与磁盘/资料库内容、原生桌面挂载、主窗口重新打开及 Esc 不退出。

验证：36 项单元测试通过；4 次真实鼠标锁定/解锁通过；打包后的程序通过上述端到端回归，并通过设置开关与原生托盘菜单动作退出壁纸模式。同步使用 Harmony 协议的真实 HTTP 测试载荷，本轮未操作用户手机。材质门禁全部通过：optics P95/max 6.3/6.4ms，app 10.3/25ms，resize 6.3/31.3ms，长任务均为 0。

本轮产物：`releases/windows/LxMine-0.1.0-Setup-LyricsRepair-20261019.exe`、`releases/windows/LxMine-0.1.0-Portable-LyricsRepair-20261019.exe`。

## 2026-10-19 LyricsSettings 修正

- 播控栏歌词按钮改为捕获阶段独立开关；点击只切换桌面歌词，不允许任何其它点击处理器把页面带到设置页。悬浮歌词工具条不再包含“设置”动作，主进程也不再接受该动作。
- 接收局域网同步的确认弹窗修复：之前只创建了模糊遮罩，没有把对话框挂到遮罩上，因此表现为“有模糊层但无弹窗”；现在会显示发送方、歌单/音源摘要以及“拒绝 / 接收并覆盖”。
- 设置新增独立的“歌词设置”页面，包含播放详情页歌词与桌面歌词两部分：
  - 详情页：颜色来源（封面取色纯色/渐变、自定义纯色/渐变）、翻译/音译开关、罗马音开关；颜色同步到详情页舞台歌词调色与详情页光效。
  - 桌面歌词：开关、1/2/3/5 行、72%–155% 字号、封面/自定义纯色或渐变色。
  - 歌词时间偏移移入该页面。
- 桌面歌词改为多行上下文显示，支持渐变文字与字号；拖动/关闭/退出持久化位置，尺寸也持久化。鼠标在未锁定的歌词区域内时显示边界阴影与八向缩放把手；鼠标离开或锁定后阴影消失，锁定区域保持透明穿透。
- 桌面歌词工具条保留“锁定/解锁、上一首、播放/暂停、下一首、关闭”。

门禁通过：optics 6.3/6.4ms，app 6.3/18.8ms，resize 6.3/25.0ms，长任务 0。打包后实际运行验证：歌词按钮在首页直接开关且 tab 不变；三行上下文歌词、渐变和 120% 字号生效；右侧尺寸拖动持久化；设置页十个分组与同步确认弹窗正常。

最新产物：
- `releases/windows/LxMine-0.1.0-Setup-LyricsSettings-20261019.exe`（`973cb493e27c383585240b354ad1699eaa25bbd03de11759d85f25dd675f6372`）
- `releases/windows/LxMine-0.1.0-Portable-LyricsSettings-20261019.exe`（`4ef2f5624d96c9851e76e802bb8dbfe6156c632139ea4649086768a963cac9b6`）
- `releases/windows/SHA256SUMS-LyricsSettings-20261019.txt`

桌面快捷方式已指向 `releases/windows/runtime/bundle-53be828e54951e93/LxMine.exe`。请关闭当前进程后从快捷方式重新打开。

## 2026-10-19 VolumeLyrics 修正

- 播控栏“词”按钮改为明确的直接开关：不再经过设置页；按钮增加 `aria-pressed`/激活色，启动失败会回滚状态。桌面歌词悬浮工具条中的“设置”入口已移除，主进程也不再接受歌词工具条的 `settings` 动作，彻底去掉误跳设置页的路径。
- 桌面歌词位置写入 `desktop-lyrics-bounds.json`（`app.getPath('userData')`）：拖动、关闭、退出时保存；重新开启和应用重启后按上次坐标恢复，并在显示器/DPI 变化时重新约束到可见区域。已在隔离 profile 中验证关闭再开与重启恢复。
- 播控栏新增音量按钮：点击后从按钮中点向上展开 252px 音量弹层，内部滑杆实时调节 `audio.volume`，百分比持久化到 `lxmine.pc.v1`；0% 允许保存，按钮显示静音图标。手机比例布局隐藏该按钮，音量入口保留在“更多”菜单。
- 桌面歌词工具条的“设置”按钮移除；“关闭”“锁定”“上一首/播放/下一首”保留。

门禁通过：optics P95 6.3ms/max 12.5ms，app 12.5/12.6ms，resize 6.3/31.4ms，长任务 0。打包后实际运行验证：音量弹层 252×84、滑杆 42%/0% 持久化；歌词按钮直接开关、无设置跳转；移动后的歌词窗口关闭再开保持 `x=260,y=200,920×220`，持久化文件内容一致。

最新产物：
- `releases/windows/LxMine-0.1.0-Setup-VolumeLyrics-20261019.exe`（`24a45f50afa54594a553589cb68f8349a24c945734845809e47e1b14731e56ec`）
- `releases/windows/LxMine-0.1.0-Portable-VolumeLyrics-20261019.exe`（`61545fd80bc3f7946c5116f3176fe86e10d0aed43de59f19266161237974c4a7`）
- `releases/windows/SHA256SUMS-VolumeLyrics-20261019.txt`

桌面快捷方式已指向 `releases/windows/runtime/bundle-d96f783d98449ffe/LxMine.exe`。正在运行的旧版本不会被强制退出；关闭后从快捷方式重新打开即可使用本轮修正。

## 2026-10-19 DetailWide 最终修正

手机/平板窄窗口的歌曲详情播控改为与宽窗口同尺寸：56px 高、44px 封面、38px 内图、38px 操作按钮、40px 播放键，保留 7 个操作（喜欢、上一首、播放、下一首、顺序、下载、队列）。合并栏/搜索/二级页仍为 44/38。

完整门禁通过：optics 6.3/6.4ms，app 6.3/31.3ms，resize 12.5/32.1ms，长任务 0。打包后 Portable 复测通过：29 个材质皮肤、12 个位移滤镜、公开首页 10 板块、托盘可用、账号接口 410、六个前端资源哈希一致、无脚本错误；打包后 app P95 6.3ms/max 18.8ms、长任务 0。

最新产物：
- `releases/windows/LxMine-0.1.0-Setup-DetailWide-20261019.exe`
- `releases/windows/LxMine-0.1.0-Portable-DetailWide-20261019.exe`
- `releases/windows/SHA256SUMS-DetailWide-20261019.txt`

桌面快捷方式指向新的固定运行目录 `releases/windows/runtime/bundle-f91b58748d535ea1/LxMine.exe`。

## 2026-10-19 DockUnlock 最终门禁与出包

当前源码完整门禁已通过：optics P95 6.3ms/max 6.4ms，app 6.3/31.3ms，resize 12.5/32.1ms，长任务 0。门禁在三个场景之间加入 20 秒 GPU/compositor 冷却，避免上一场景的异步 GPU 回收造成 resize 假尖峰；单独 resize 仍为正常值。批准报告：`qa/material/artifacts/approved.json`。

最新 Windows 产物：

- `releases/windows/LxMine-0.1.0-Setup-DockUnlock-20261019.exe`
- `releases/windows/LxMine-0.1.0-Portable-DockUnlock-20261019.exe`
- `releases/windows/SHA256SUMS-DockUnlock-20261019.txt`

打包后 Portable 复测：29 个材质皮肤、12 个位移滤镜；公开首页 10 个板块、无跨平台串项；托盘可用；账号桥接已移除、登录接口返回 410；六个前端资源 SHA256 与批准源码一致；无脚本错误。打包后 app 场景 P95 6.3ms/max 18.8ms、长任务 0。

桌面快捷方式已指向新的固定运行目录 `releases/windows/runtime/bundle-8748496799ccccc0/LxMine.exe`，不再每次启动解压 Portable。HarmonyOS PublicHome HAP 仍为 09:38 构建版本；本轮 PC 改动未重新构建或安装 HAP。

# LxMine 开发状态

## 2026-10-19 DockUnlock 修正

按用户对照图，搜索页/二级页与主页合并栏的封面统一为宽屏的外圈 44px、内图 38px；保留双栏细播控与歌曲详情原有的不同尺寸。420/540/800/1200px 下实际打开搜索页、滚动合并栏、打开歌曲详情验证，前两种状态尺寸均为 44/38，球与栏体未裁切。音质按钮恢复到右侧原有工具组（音质、评论、动效），弹窗依旧以触发器中心展开；四种宽度起点误差均为 0px。报告为 `qa/material/artifacts/dock-20261019/report.json`。

桌面歌词锁定后的解锁入口改为可直接点击的锁形胶囊，图标与文字都可点击。主进程不再把“锁定”无条件等同于整窗穿透；渲染器仅在鼠标位于解锁胶囊内时请求接收鼠标，其余锁定歌词区域仍穿透且不可拖动。接收鼠标的 IPC 只允许该歌词窗口调用。悬停工具条、原歌词视觉、托盘及主窗口解锁入口保持可用。

`qa/catalogue/lyrics-unlock.cjs` 检查连续四次真实点击的锁定/解锁（分别点击锁图标与文字），并观察主进程实际 setIgnoreMouseEvents 调用，断言文字区域穿透、锁定时不能移动、解锁胶囊可接收鼠标。以下为上一轮记录。

## 2026-10-19 PublicHome 本轮更新

首页采用四个平台各自的匿名公开接口，提供平台独立板块，不接入登录、账号歌单或个性化日推。网易云含公开推荐、新歌速递、热门/精品歌单及榜单；QQ 含推荐/最新歌单、巅峰榜；酷我含热门/新晋歌单及实时榜单目录；酷狗含精选、最热、最新、热藏、飙升歌单与榜单。各平台另有自己的分类歌单、相似推荐及本地最近常听。公开接口未给出的信息不伪造。

平台按钮与搜索球同为 body 的独立浮层，z-index 44，脱离滚动内容及页面切换的 transform 容器。只在首页一级界面显示，进入榜单、歌单、搜索、歌曲详情和其他页面时隐藏。320/360px 使用 Electron 的 CDP 视口仿真（桌面窗口本身仍保留最小尺寸），另检查 420/540/800/1200px；全部标签完整，中心命中节点均是按钮本身。报告与截图：`qa/catalogue/artifacts/home-ui/`。

音质与动效弹窗从各自触发器中心展开，两者原点分别在面板左侧/右侧，坐标误差 0px；保留已标定的材质、弹簧曲线和中途收起连续性。设置下拉按钮移除箭头。合并播控栏的导航球修正为与栏体同高的 54px 圆形。托盘从应用启动起常驻。

桌面歌词保留原特效，改为左键拖动、悬停工具条控制播放/设置/锁定/关闭；主播控“词”按钮左键开关、右键锁定/解锁，也可从托盘解锁。移除中键及全局中键轮询脚本。普通歌词内容更新不再携带启用/锁定权限；关闭同步回主界面并持久化。实际操作测试覆盖拖动、锁定恢复、关闭后 12 次旧刷新不重开。账号桥接方法和登录 IPC 注册已移除，HTTP 登录/账号路由返回 410。

现场公开接口测试：网易云榜单 100 首、QQ 热歌榜 300 首和推荐歌单 1195 首、酷我热歌榜 300 首、酷狗 TOP500 500 首；自动遍历全部页，不增加产品级上限。平台资料已删除的歌曲明确计数提示，保留其余可获取歌曲。报告：`qa/catalogue/artifacts/home-live/`。公共数据随平台更新，数量仅代表本次采样。

最终源码通过原有 16 个材质样本、6 个实际 Select 样本、弹窗录屏轨迹和三种帧预算场景。app 帧间隔 P95 6.3ms/max 25ms，resize 12.5/31.2ms，optics 6.3/12.6ms，长任务均为 0。9 项分页单测及六类搜索界面回归通过。手机/平板共用源码把平台按钮放在搜索所在的原生 Navigation 标题浮层，编译/自动签名通过；本轮没有重新连接真机，因此不声称已安装或已验证原生屏幕表现。

发布文件已使用 `PublicHome-20261019` 后缀，与上一轮 Select 版本分开保留：Windows 安装版/便携版位于 `releases/windows/`，手机/平板共用的已签名 HAP 位于 `releases/harmony/LxMine-0.1.0-PublicHome-20261019.hap`。校验和为 `releases/SHA256SUMS-PublicHome-20261019.txt`。实际 Portable 已验证匿名首页、托盘、登录接口关闭及六个前端资源逐文件 SHA256 一致，无脚本错误；证据为 `qa/material/artifacts/portable-1792374792795/result.json`。

桌面快捷方式已指向 `releases/windows/runtime/bundle-a83d66593bef98b0/LxMine.exe`，整份运行目录逐文件校验。最终本机热缓存测试：窗口显示 275ms、就绪 910ms，记录 `.research/startup-publichome-final.log`。打包界面 app 帧间隔 P95 12.5ms/max 18.8ms、长任务 0。已运行的旧版本不会被强行退出，请退出后从快捷方式重新打开。以下章节为历史记录。

当前为 0.1.0 开发版本。2026-10-19 本轮选择弹窗、窄窗口和完整列表改动已完成，当前源码通过材质/动效门禁，安装版和便携版已构建并验证。未覆盖的外部验收仍见下文。

## 已交付

- PC：Windows x64 安装版/便携版，Liquid 材质版已完成真机原生材质标定与像素/动效门禁；16 个内置 LX 音源。
- HarmonyOS：手机/平板同一份原生 ArkUI 应用；当前 HAP 内置 16 个 LX 音源，已签名版和未签名版放在 releases/harmony。
- 桌面歌词、全屏壁纸、托盘、开机自启、局域网同步、歌单导入、下载、公开评论和聚合搜索均已接入。

## 验证边界

- PC 材质门禁：`qa/material`；完整报告 `qa/material/artifacts/approved.json`。源码或基准变化会使批准失效，`beforePack` 拒绝未复测源码。
- 历史发布材料：`resultSigma=0.75`；球面 Laplacian 比例 1.215–1.289，胶囊上下沿最大相位误差 0.375 CSS px；原来的 16 个原生像素样本及发布包测试通过。原门禁未覆盖生产环境的系统 Menu/Select，当前新增该项，必须另行通过。
- 尚未完成的外部验收：HiCar 车机实测、折叠屏姿态/铰链实机验证、手机/平板反向局域网同步（当前无设备连接）、其他设备分发所需的 release 签名。
- HarmonyOS 当前 HAP 使用本机 DevEco debug 自动签名，profile 只包含本机登记设备；给其他设备使用需重新签名或用 AGC release 证书签 unsigned 包。

## 构建

- PC：`cd apps/desktop && npm run build:win`（门禁通过后）或 electron-builder 同时构建 nsis/portable。
- 本机快捷方式：成功构建后用 PowerShell 7 运行 `scripts/publish-local-runtime.ps1`。脚本把 `dist/win-unpacked` 发布到项目内按内容哈希命名的固定目录，逐文件校验后更新桌面快捷方式；不直接从构建临时目录运行，也不在每次启动时解压 Portable EXE。
- Harmony：`pwsh -File scripts/build-harmony.ps1 -SkipStage`，产物在 `apps/harmony/entry/build/default/outputs/default/`。

项目仍在 `D:\Lxlia`；目录改名和散落文件整理未执行。

## 2026-10-19 本机启动修正

原快捷方式经 PowerShell 寻找最新 Portable EXE，每次把约 416MB 的运行文件解压到临时目录后才启动。同版本隔离测试从启动到窗口显示耗时 18154ms，其中主进程前耗时 17970ms；直接运行已展开程序为 955ms。发布到固定目录后复测为 289ms（热缓存，不代表所有机器的冷启动）。证据在 `.research/startup-20261019/`。

启动入口修正首先使用原有发布程序独立验证；后续本轮源码通过 `beforePack` 门禁和打包检查后，已发布到新的固定目录。最新热缓存测试窗口显示 297ms、就绪 739ms，记录在 `.research/startup-select-runtime.log`。

## 2026-10-19 系统菜单、窄窗口及完整列表

源码已将实际歌曲页菜单独立为 popup 材质，保留原有控件、通用面板标定。按用户最新指定的系统 Select 样式，手机、平板共用的音质/动效组件改用真正的原生 Select，PC 同步高亮选中项、无勾选符号、无动效菜单标题。原生 Select 的默认最小触发器尺寸已通过 constraintSize 收到 38vp，真机两个槽位均为 133×133 物理像素，没有挤压相邻按钮。最新正常 HAP 已安装到手机，采集完毕后恢复 EntryAbility，保留应用数据。

六组网格/文字背景的新 Select 成对样本和重复帧已齐全。一次设置下拉框 on 帧处于关闭过渡，被判无效；该组件源文件未变，采用上一轮有效 on 帧与本轮 repeat 帧，两者在面板及外扩 16 CSS px 区域逐像素完全一致。原始无效图、两次有效来源和说明均保留在 `native-menu-20261019/capture.json` 与不可变 references 文件夹，未降低门槛或隐藏污染。

菜单按真机录屏的缩放、位移、轻微回弹与淡入轨迹展开，关闭从当前变换继续；先完成定位和 SVG 材质准备再显示。动画独立录屏校验与固定相位截图位于 `qa/material/artifacts/native-menu-20261019/motion/`。低置信度模板匹配帧保留在报告中，未用于几何精度断言；透明度仅为录屏估计，不能当作系统原始 alpha。

窄窗口检查覆盖 420、540、800、1200px。合并栏恢复 54px 高、38px 封面；窄歌曲页保留五个操作，其他操作由更多菜单提供。报告在 `qa/material/artifacts/dock-20261019/report.json`。

搜索、网络歌单/榜单曲目、歌手歌曲和播客详情自动遍历平台分页，不再要求点击加载更多。传输层仍按页请求以符合上游接口，但不设置产品级总条数上限；上游停止返回或失败时明确显示部分结果警告。查询代次阻止旧请求覆盖新搜索。桌面大列表分帧构建 DOM，手机和平板共用完整列表服务。QQ 导入按实际返回条数推进游标，内置歌单取消 5000 首截断。

回归入口：`node --test qa/catalogue/pagination.test.cjs`、`node qa/catalogue/ui.cjs`、`node qa/material/dock-layout.cjs`、`node qa/material/popup-motion.cjs`；完整批准由 `node qa/material/check.cjs` 产生。报告为 `qa/material/artifacts/approved.json`。真机选择弹窗语义与触发器几何验证在 `qa/material/artifacts/native-select-regression/`。

本轮验证：9 项列表单测通过，六种搜索类型实际 UI 的条目数与数据数一致且没有加载更多按钮；2,307 条结果与 6,007 首本地保存/重开用例通过。独立录屏的 29 个注册帧中 25 个满足置信度门槛，最大缩放差 0.020001、标题横向差 4.207 CSS px、纵向差 1.262 CSS px；4 个低置信度帧原样保留。源码 app 帧间隔 P95 6.3ms/max 12.6ms，resize 6.3/25.0ms，optics 6.4/6.4ms，长任务均为 0；打包后的 app 场景也为 6.3/12.6ms、长任务 0。此前 147ms 尖峰未复现，尚不能确认其原始根因已消除。六组真实选择弹窗材质 MAE 为 2.331–3.200/255、SSIM 为 0.930–0.978，选中层单独 MAE 为 1.027–1.739/255；相同背景与重复帧 MAD 均为 0。正文被明确排除，不把材质指标当作字体或完整页面一致率。

Windows 产物为 `releases/windows/LxMine-0.1.0-Setup-20261019.exe`、`LxMine-0.1.0-Portable-20261019.exe`。实际 Portable 启动检查确认六个前端资源的 SHA256 与批准源码完全一致，生产校准接口关闭，无脚本错误。桌面快捷方式已更新到 `releases/windows/runtime/bundle-5c28d2d894a9d06b/LxMine.exe`；不会每次解压 Portable。已运行的旧实例不被强制关闭，退出旧实例后从快捷方式打开新版。

手机/平板共用的新签名包为 `releases/harmony/LxMine-0.1.0-Select-20261019.hap`。三份产物校验和见 `releases/SHA256SUMS-Select-20261019.txt`。本机原来没有连接的平板未声称已经安装本轮 HAP。
