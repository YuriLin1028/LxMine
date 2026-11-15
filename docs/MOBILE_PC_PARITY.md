# LxMine PC / HarmonyOS 对齐清单

更新：2026-10-20。设置以 PC 当前结构为基准；手机、平板共用 ArkUI 实现。

## 本轮已对齐

- 设置分组顺序：音乐源、播放、歌词、系统与互联、关于。
- 播放设置：音质、播放顺序、MineRadio 动效。
- 歌词独立子页：封面取色／自定义、纯色／渐变、翻译／音译、罗马音、时间偏移与重置。翻译和罗马音取决于数据源是否提供，不生成虚假内容。
- 系统设置：启动动画、启动时继续播放上次内容（默认关闭）、局域网同步入口、下载管理入口。
- 原生设置卡片统一为整组 20vp 圆角背景，内部行连续排列；主设置、歌词、同步页面采用相同规则，不再给行单独套圆角或逐行裁切。
- 歌单库：最近播放，实际开始播放才记录，去重并持久化。
- 播放状态恢复：默认只恢复歌曲、队列及进度，不自动发声；用户开启继续播放后才恢复播放。
- 音乐动效：PC 与移动端共用 MineRadio 桥接逻辑；移除 3D 歌单卡片。移动端音频分析通过本地代理解码实际音频，已在手机、平板读到非零频谱与信号。
- 同步：修复批量导入音源 ID 碰撞导致 PC 拒绝整包的问题；保存失败保留待接收请求，可重试。使用手机实际数据验证 16 个音源、3 个歌单、528 首歌曲完整保存。
- 搜索：移动端按页在同一页面追加结果；用户已确认正常，本轮不重复进行真机搜索验收。
- 下载：系统下载器失败后使用流式 HTTP 下载，校验响应及音频文件后再保存；取消和失败不产生成功记录。
- 二级及以下页面顶栏：统一为 `PageHeader`（38vp 材质返回球 + 28vp 标题 + 12vp 副标题，视觉球顶
  `statusInset + 6vp`），播放详情页顶栏同步上移并对齐；榜单/歌单详情不再显示歌单库三球；
  返回图标恢复系统 `chevron_left` 线条“小于号”观感。完整硬性规范见文末“二级及以下页面顶栏”。
- 首页滚动性能：爬取结果不再在滚动中整表替换（空闲后应用 + 内容签名去重），移除滚动路径上的
  无用 @State，暂停二级页覆盖时的胶囊几何轮询；播放进度状态按页面节流，接续/磁盘快照不再
  反复序列化整条播放队列。完整硬性规范见文末“首页滚动性能”。
- PC 歌曲列表与顶栏：搜索歌曲结果并入唯一 `songRow`，所有歌曲列表容器改为透明 `song-list`
  （取消首页新歌速递及其它列表的大圆角背景框）；行操作按窗口宽度（>=760px）在行内显示
  爱心/加号；详情页 42px 返回钮与 42px 标题行盒同顶对齐。完整硬性规范见“歌曲列表页统一”。
- 歌单库：PC/移动端“资料库”统一更名“歌单库”；主体从等高卡片网格改为时刻相册式随机拼贴
  （1–2 列/行 span，固定间距与窗口边距），PC `.playlist-mosaic` 与移动端 LibraryView 同规则；
  随机种子只生成一次并持久化，后续启动排列固定不变；右上角“随机排列”刷新按钮可换种子重排；
  移动端歌单库纵向滚动条关闭。完整硬性规范见“歌单库 = 时刻相册式拼贴”。

## 平台边界

- 桌面歌词：按用户要求不移植到移动端。
- Windows 托盘、登录 Windows 后启动、与 Wallpaper Engine 共存的桌面壁纸宿主：依赖 Windows，没有在移动端添加无效开关。
- HiCar、智感握姿：保留移动端专用入口，不加入 PC。
- 四平台匿名内容、聚合／分平台搜索继续保留；不增加登录流程。

## 验证与后续限制

- 手机竖屏、平板横屏：实际检查设置主页、歌词子页、原生颜色菜单、滚动后的卡片边缘与文字换行。
- 设置选择实际写入设备偏好；主色／辅色预览实时变化。单元测试覆盖四种颜色模式、坏数据恢复、公开歌词翻译与罗马音解析。
- HarmonyOS 编译通过；原生服务测试 9 项通过，PC 同步测试 5 项通过。
- Windows 安装版与便携版已构建；便携版资源哈希、匿名首页、托盘及页面错误检查通过。严格材质与动画门禁通过。
- HiCar 未连接真实车机验收；折叠屏未使用真实硬件验收，不能将现有响应布局等同于完成折叠真机测试。
- 下载流式回退已有文件字节、失败和取消测试；仍需补充不同真实音源、不同音质的长时间真机下载覆盖。
- 本轮真实手机到 PC 保存验证通过；不能据此声称所有设备组合与两个方向均完成真机验证。

## 主要实现位置

- 移动设置：`apps/harmony/entry/src/main/ets/components/AlignedSettings.ets`
- 设置持久化、歌词与原生播放器接入：`apps/harmony/entry/src/main/ets/pages/Index.ets`
- 歌词颜色：`apps/harmony/entry/src/main/ets/services/LyricPreferences.ets`
- 实际歌词与翻译：`services/LxRuntime.ets`、`services/LyricService.ets`
- 原生服务测试：`apps/harmony/tests/native-services.test.cjs`
- PC 同步与持久化：`apps/desktop/desktop/lansync/`
- PC 设置对照：`apps/desktop/public/lxmine/app.js` 中 `renderSettings`、`renderLyricsSettings`。

## 开发规范（2026-11-14 起，硬性）

- **歌曲列表页统一**：凡展示歌曲集合的列表——首页新歌速递、歌单详情、榜单详情、板块更多页、
  搜索歌曲结果、本地音乐、下载列表——PC 一律调用唯一 `songRow`（`songListCard` 只是装载器），
  移动端一律使用 `SongRow` 组件；**禁止自造第二种歌曲行样式**
  （`searchSongRow`、`search-row` 歌曲行、feed-song-row、FeedSectionPage 私有 songRow 均已删除）。
  封面卡片网格（`songCard` / `playlistCard`）只用于横排封面场景（首页横排行、更多页歌单卡片），不得用于歌曲列表。
- **歌曲列表容器透明**：PC 容器统一 `div.song-list`，**禁止 `.list-card` 大圆角背景框**；
  首页新歌速递、搜索、歌单/榜单详情、更多页、本地音乐、下载列表的行必须直接落在页面背景上，
  材质/圆角/悬停反馈由 `.song-row` 自己承担。行结构、48px 封面、36px 操作钮、字号与间距全场景一致。
- **PC 行操作按窗口宽度切换**：`@media (min-width:760px)` 行内直接显示下载/爱心/加号，隐藏展开箭头；
  `<760px` 显示下载 + 展开箭头，展开后显示爱心/加号/时长。窄窗的行内爱心/加号不得占位，
  宽窗的展开面板不得出现；禁止用 `phone-layout`（宽高比）代替宽度断点来决定行操作。
  PC 搜索歌曲结果必须直接调用 `songRow(item, all, null, {openDetail:true})`，不得另写搜索歌曲行。
- **PC 详情页顶栏水平对齐**：返回钮 42px 与标题行盒 42px 同顶（`#app-header`/`#comments-head`
  必须 `align-items:flex-start`），标题 `line-height:42px` 在行盒内垂直居中；
  禁止用 `align-items:center` 去居中“标题+空副标题”整块，否则标题会比圆钮高约半行。
- **列表行来源标注统一用封面角标**：PC `srcBadge(source)`、移动端 `sourceBadge(source)`，禁止文字小胶囊（.plat 文字标注已删除）。
- **首页歌曲列表与其它区块同宽**：贴内容区左右边（与板块标题对齐），不得限宽（newSongs 列表 760px 限宽已删）。
- **PC 页面内容全宽**：`#view` 不得再写 `max-width:1240px; margin:0 auto`，`#search-results` /
  `.history-block` 不得再写 `max-width:1120px` 居中。所有页面统一贴 `#main` 的 40px（phone-layout 26px）
  窗口内边距：首页新歌速递、搜索落地/结果、板块更多页、歌单/榜单详情、歌单库的第一行/第一张卡片
  必须与页面标题同一左边界，不得出现居中收窄的“红框”式内容区。
- **移动端滚动条**：`Scroll` 列表统一 `.scrollBar(BarState.Off)`；歌单库页不得出现上下滚动条
  （LibraryView 已补，DownloadsView/MineHome/FeedSectionPage/NativeSettings/AlignedSettings 同规则）。
- **歌单库 = 时刻相册式拼贴**：页面标题、导航、返回文案统一“歌单库”（内部 tab 键仍为 `资料库`）。
  PC 用 `.playlist-mosaic`（CSS Grid + span 1–2 列/行 + `grid-auto-flow:dense`，
  `layoutMosaic` 按窗宽算列数与 `grid-auto-rows`）；移动端 LibraryView 用同一套 1–2 列/行
  随机占位算法。**只固定卡片间距（PC 14px / 移动端 12vp）与窗口边距（40/26px、32/20vp）**；
  卡片尺寸和比例由 span 决定，**禁止**再退回固定 164px 的 `.card`、`auto-fill 180px` 等高网格
  或所有卡片同宽的 Flex 换行。缺封面时用名称哈希渐变 + 图标兜底，封面裁切填充整块。
  拼贴**只随机一次**：PC 把 `mosaicSeed` 写入 localStorage，移动端写入设置
  `lxmine_mosaic_seed`；首启用种子洗牌决定“哪张卡进大/小格”，之后每次启动复用同一顺序。
  禁止每次打开应用重新洗牌、每次渲染重新随机 span 或按窗口尺寸重新抽签（窗口宽度只影响
  列数与行高，不改变卡片与格位的对应关系）。
  **歌单库右上角必须提供“随机排列”刷新按钮**（38vp 材质球，PC 42px 圆钮）：点击后生成新种子、
  持久化、立即重排并提示“歌单库排列已刷新”；不得重新拉取歌单数据。刷新后的新排列同样
  在后续启动中固定，直到用户再次点击刷新。
- **沉浸材质的上伸空间**：systemMaterial 材质层会向组件上方伸出 ~16vp，贴近容器上边界
  或标题区上边界时被切成直线（"上部遮罩"）。铁律：Navigation 宿主内的内容必须下移 16vp
  （margin top 16），把材质上伸空间留在标题区内（HomeChips、NativePlayer 顶排即此模式；
  沉浸光感与拖拽形变必须保留，**禁改组件级 blur**）。交互类材质 applyShadow 保持 false。
  另：材质组件内的可见图标必须放在承载材质的组件**内部**（Button{Image}）——
  "透明控件 + 静态覆盖层"的结构在拖拽形变时 logo 不跟球动（NativePlayer SQ/投播/特效
  曾中招）；AVCastPicker 等系统控件覆盖时用 HitTestMode.Transparent 让触点落到下层球体。
- **胶囊高亮不判页底**：高亮始终跟随最后一个滚过胶囊栏的板块，页底保持"分类"高亮
  （"页底无高亮"规则已按用户要求删除，双端一致）。页底强制"分类"只认 onScrollEdge
  边缘标记（手机 homeAtBottom）或真实几何（PC scrollTop+clientH≥scrollHeight-90），
  **禁用 maxScrollSeen 近似**——下滑时它跟随 offset，任意位置都会误判页底。
- **切栏与高亮解耦**：一栏/两栏切换时冻结胶囊高亮判定 700ms（PC homeChipHoldUntil /
  手机 chipAnchorHoldUntil），切栏引起的滚动回滚不得移动高亮。
- **滚动容器内元素上浮动画必须留顶部余量**：横向滚动容器 overflow-y 必为 hidden，容器需 `padding-top` 留量并用负 margin 抵消保持静止位置（见 .row-scroll）。
- 新增列表样式前先复用现有标准组件；确需新样式必须先更新本规范并双端同步实现。

### 二级及以下页面顶栏（2026-11-14 定案，硬性）

- **唯一实现**：移动端 `apps/harmony/entry/src/main/ets/components/PageHeader.ets`。
  板块详情（新歌速递/推荐歌单/排行榜/分类/相似推荐）、歌单与榜单详情、搜索、搜索实体详情、下载、
  音源、设置子页、歌曲评论、播放详情，全部使用同一顶栏规格；禁止页面再自造顶部 `Row`。
- **几何**：返回球与所有顶栏操作球统一直径 38vp、球内图标 20vp；标题 28vp / Bold；副标题 12vp / MUTED，
  单行省略。左右内边距 20vp（手机）/ 32vp（平板 wide）；返回球与标题间距 12vp；右侧操作球间距 8vp。
  歌单库首页的下载/导入/新建三球同为 38vp，禁止再出现 44vp 的大球。
- **位置**：视觉球顶固定 `statusInset + 6vp`，与标题块顶端对齐（标题列只下移 2vp 做光学居中）。
  标题有副标题时只允许标题块向下生长，禁止 Row 垂直居中把球压到 `statusInset + 13vp` 以下。
  播放详情页的返回球/操作球必须与列表详情页处在同一水平线；旧写法
  `top = max(24,statusInset) + 6` 再叠加 16vp 下移已废除。播放页 Navigation 宿主上移 16vp
  （`top = statusInset - 10`），再由顶栏 `margin top 16` 补偿，视觉球顶仍是 `statusInset + 6vp`。
- **返回图标**：统一 `SymbolGlyph(musicSymbol(ic_back))`，系统 `sys.symbol.chevron_left` 的线条
  “小于号”观感。禁止 `Image($r('app.media.ic_back')).fillColor(...)`：`fillColor` 会把描边路径
  填成实心三角，与新歌速递旧版返回键观感不符。`ic_more` 等自定义实心图标仍走 Image。
- **材质与形变**：球体统一 `musicMaterial()`（ULTRA_THIN、Transparent、interactive、
  `applyShadow: false`）；图标必须放在承载 `systemMaterial` 的 Button 内部（`MaterialBall` 自宿主，
  对应“拖拽形变时 logo 跟球走”）。禁止“透明控件 + 静态覆盖图标”，禁止组件级 blur 替换材质。
  浮层顶栏（海量板块页、评论页）必须用 `MaterialBall` 的自带 Navigation 标题宿主，不要把返回键
  裸放在 Stack 里——裸放时系统材质不渲染，只剩一个没有圆球的图标。
- **内容边界**：二级页顶栏只允许“返回球 + 标题/副标题 + 本页相关操作”。歌单库一级页的
  下载管理/导入歌单/新建歌单三个 38vp 操作球只属于歌单库首页，禁止带到歌单详情、榜单详情、
  下载管理、搜索、设置子页等任何子页。
- **主次区分**：一级页与二级页标题同为 28vp，顶栏操作球同为 38vp；主次只由“是否有返回球”
  和页面内容区分，不再用 44vp 大球制造层级。Bottom sheet、AlertDialog、系统菜单不属于页面顶栏，
  不受本节约束（其标题 24vp 保持不变）。
- **退出二级页时主页置顶胶囊不得延迟**：主页快捷胶囊的挂载条件必须接受 `feedClosing`
  （`!feedSection || feedClosing`），透明度跟随 `1 - max(playerReveal, feedDim())` 淡入；
  禁止等 420ms 关闭定时器把 `feedSection` 清空后才挂载，否则会出现“标题/搜索已出现、
  置顶胶囊过一会才出现”的抽帧现象。

### 首页滚动性能（2026-11-14 定案，硬性）

- **爬取结果不得在滚动中整表替换**：`refreshHomeFeed` 只把结果交给 `queueHomeFeed`，由
  `applyPendingHomeFeed` 在 `now - lastHomeScrollAt > 650ms` 且不在板块/歌单/搜索/播放页时
  才写 `homeFeed`。连续下滑期间爬取完成的首页数据必须挂起，不能重建整棵首页树。
- **首页换数据禁止包 `animateTo`**：`homeFeed` 是整页多板块状态，套弹簧动画会把所有板块
  一起纳入布局动画，直接 swap。首屏无旧内容（`homeFeed == null`）时可直接回填。
- **内容签名去抖**：替换前用 `homeFeedSignature` 比较板块/条目 id、count 与歌曲 id；
  完全一致时只更新缓存、跳过重建。播放量、封面 URL 等纯文字变化不得触发整页重建。
- **大对象序列化延后**：`JSON.stringify(feed)` 与 `saveHomeCache` 必须放在真正应用刷新结果的
  空闲时机；禁止在爬取 Promise 刚完成的瞬间在 UI 线程序列化几百 KB 的首页 JSON。
- **刷新去重**：启动期 `initialize` 与 Web `onPageEnd` 都会触发刷新，必须用 `homeFeedRefreshing`
  防止两路爬取/解析同时进行；双击标题刷新用 `force=true` 允许打断。
- **滚动路径禁止写无用 @State**：`homeScroll`/`onDidScroll` 只允许写普通字段（如
  `lastHomeScrollAt`）；历史遗留的 `homeScrollY` 这类“只赋值不读取”的 @State 必须删除，
  否则每帧都会触发无意义重建。
- **胶囊几何轮询暂停**：300ms 的 `getRectangleById` 高亮维护只在一级发现页执行；
  `feedSection`/`openedPlaylist`/播放页盖住首页时必须暂停。
- **播放进度状态节流**：`timeUpdate` 不得每次都写 `positionMs` @State。一级页/列表页按 1s、
  播放详情页按 200ms 刷新；否则首页滚动/搜索列表会被每秒多次整页重建拖出掉帧。
  `duration` 仅在变化时写；打开播放详情时重置节流时间戳，保证首帧进度立即更新。
- **播放快照禁止反复序列化大队列**：接续内存槽只存 `song/queue/positionMs/playing` 的对象引用，
  系统 `onContinue` 真正调用时才 `JSON.stringify`；持久化快照的歌曲/队列 JSON 必须按引用缓存，
  只有队列或当前歌曲变化时才重新序列化。磁盘快照 15s 一次，并在暂停、切歌、退后台、退出时强制落盘。
  禁止每 1s/5s 对整条队列做 `JSON.stringify`（大歌单会产生周期性掉帧）。
- **验收**：冷启动先显示缓存首页；连续下滑 3s 期间爬取结果返回不得出现整表替换/跳帧；
  停止滚动后才允许应用；日志可核对 `[HomeFeed] refresh unchanged; skip rebuild` 与
  `[HomeFeed] apply refreshed feed`。播放中连续下滑时，进度环/歌词允许按 1s 粒度更新，
  但不得因 `timeUpdate` 每秒多次重建首页。
- **验收清单**：在平板 wide 与手机竖屏分别进入 播放详情 / 搜索 / 飙升榜详情 / 每周新歌详情 /
  下载 / 音源 / 评论，测量返回球 `bounds` 顶边必须同为 `statusInset + 6vp`；球顶不得被裁平；
  长按/拖动球体时图标随球缩放、光感跟随；标题超长单行省略；子页右侧不得出现歌单库三球。
- **PC 对照**：PC 端 `setHeader`（42px 圆钮 / 30px 标题）已是唯一顶栏，仍由 `#page-title` 与
  `#header-actions` 统一承载；不得为某个二级页单独写头部。HarmonyOS 侧新增页面必须复用
  `PageHeader`，不允许再出现第三种顶栏。

### 歌曲列表动作条（2026-11-14 定案，硬性）

- **适用范围**：首页新歌速递、首页板块详情的歌曲列表、歌单库本地音乐、歌单库内每个可打开的
  歌单/榜单/最近播放/我喜欢的、搜索结果歌曲列表，以及 PC 端同名页面。
- **必备动作**：列表头必须同时有 **播放全部** 与 **排列**，与列表本身是否为空无关；空列表时
  “播放全部”置灰但按钮仍显示。播放全部使用当前排序/搜索后的顺序作为队列，禁止固定用原始顺序。
- **删除歌单**：只有“歌单库里真实存在、且可删除（自建/导入/同步）的歌单”详情页才显示；
  推荐歌单、排行榜、每日三十首、分类等在线列表即使同样使用 `kind: 'lx'` 外壳也不得出现
  删除入口；我喜欢的、最近播放、本地音乐、搜索页、首页板块、PC 本地/搜索页一律不得出现
  删除入口。判断依据是“该歌单 id 是否存在于本地歌单库”，不得按 `kind` 判断。
  歌单为空时没有歌曲列表头，删除入口要单独补在空状态里。
- **排序项**：添加顺序、歌名首字母、歌手名（同歌手再按歌名）、专辑名首字（同专辑再按歌名）、
  手动排列。排序只改变展示顺序和播放队列，不写回歌单原顺序；手动排列是当前列表的临时展示顺序。
- **手动排列交互**：必须支持 **按住条目拖动**（手指/鼠标），按落点重排；禁止用上下箭头按钮。
  移动端 `SongOrderDialog` 用 List `editMode(true)` + `onItemDragStart/onItemDrop`；PC
  `showManualOrderDialog` 用 HTML5 draggable + dragover/drop。拖动后点“完成”才应用。
- **列表内搜索**：每个列表右上角必须有“搜索本列表”按钮（移动端 38vp 材质球；PC `#header-actions`
  的 search 图标）。搜索只过滤当前列表的歌名/歌手/专辑，不触发公共搜索；本地音乐页的
  “智能识别”图标必须与搜索图标明显区分（sparkle vs magnifier），不得复用同一个放大镜。
- **统一组件**：移动端用 `components/SongListTools.ets`，排序逻辑用 `services/SongOrder.ets`；
  PC 用 `createListBar` / `arrangeSongs` / `openListSortMenu`。新增歌曲列表必须复用，禁止再写
  第三套“播放全部/排列”按钮。

### 浮层可点击性（2026-11-14 实测踩坑，硬性）

- **禁止在全屏浮层根节点使用 `HitTestMode.Block`**。ArkUI 的 `Block` 会连同**子节点**一起
  阻断命中测试：浮层看得见、返回键能关，但所有按钮/列表/拖动都无响应。正确写法是根节点
  `HitTestMode.Default`，由铺底的半透明 Column 承担拦截（它没有子交互，可保持 Default；
  不要给根 Stack 设 Block）。`SongOrderDialog` 与 `LocalScanDialog` 都曾因根节点 Block 完全失灵。
- **系统菜单里不要同步打开全屏浮层**：`bindMenu` / `openAnchoredMenu` 的关闭有动画与遮罩；
  手动排列等全屏层要等菜单收起后再开（移动端 `setTimeout(..., 220)`；PC 的
  `openAnchoredMenu` 在 `close()` 完成后再执行 action，并立即移除 backdrop）。
- 验收：浮层打开后必须实际点击“关闭/取消/完成”、滚动列表、拖动条目；仅截图看到浮层不算通过。

### 本地音乐（2026-11-14 定案）

- 本地音乐入口固定在歌单库拼贴卡；页面右上角只有三个动作：智能识别（sparkle）、导入、搜索本列表。
- 识别弹窗必须有逐项勾选与全选；导入直接添加。识别/导入后写入本地索引并持久化。
- 导入时用 `AVMetadataExtractor` 读取时长/标题/歌手/专辑/内嵌封面，并解析 MP3 ID3v2 USLT 与
  FLAC Vorbis `LYRICS`；封面存沙箱 JPEG，播放时封面/时长/歌词与在线歌曲一致。
- 应用内下载完成的歌曲自动登记进本地音乐（不复制文件）；本地歌曲行不显示下载按钮。
