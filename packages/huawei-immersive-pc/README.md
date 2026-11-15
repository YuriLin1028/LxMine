# Huawei Immersive PC

把 LxMine PC 端已经落地的“华为手机级沉浸光感”提取成一套可复制到其他
Windows / Electron 程序的**开发标准 + 运行时 + 技能包 + 验收方法**。

它不是一张玻璃 CSS，也不是把手机截图铺在控件上：

- 每个控件实时采样 Chromium 背后的真实内容（视频、Canvas、滚动内容都算）；
- 圆角轮廓生成法线场，产生边缘折射与胶囊肩部的横向弯曲；
- 外缘单独采样环境色，形成“外层取色 → 透明内圈 → 底部信息畸变”的分层；
- 正文、图标和命中区域位于滤镜之外，变形时不会漂移；
- 弹窗使用真机录屏拟合的 740ms 展开曲线和 150ms 收起曲线；
- 像素、平滑度、负对照、源文件哈希和帧预算共同构成发布门禁。

> 这是独立前端实现，不是华为 SDK，也不包含任何华为代码、着色器或素材。
> 默认参数来自 LxMine 对真机 EXQUISITE 材质的标定。详见 `NOTICE.md`。

---

## 1. 60 秒接入

复制 `src/` 下的五个文件到你的前端资源目录，然后按顺序加载：

```html
<link rel="stylesheet" href="/ui/hx-immersive.css">

<svg class="hx-filter-defs" width="0" height="0" aria-hidden="true"><defs></defs></svg>

<div class="hx-dock hx-glass hx-light">
  <button class="hx-dock__button hx-glass hx-light" aria-label="上一首">…</button>
  <button class="hx-dock__button hx-dock__play hx-glass hx-light" aria-label="播放">…</button>
</div>

<script src="/ui/hx-material.js"></script>
<script src="/ui/hx-interactions.js"></script>
<script src="/ui/hx-popup.js"></script>
<script src="/ui/hx-surfaces.js"></script>
```

`hx-material.js` 会自动：

1. 创建 SVG filter defs；
2. 找到页面上的 `.hx-glass`；
3. 为每个宿主插入 `<span class="hx-glass__skin">`；
4. 按尺寸、圆角和 profile 生成并缓存法线/环境贴图；
5. 在 ResizeObserver 回调中批量刷新，避免逐控件强制布局。

你只负责布局和内容。**不要把 `filter` 加在宿主或父容器上**，否则文字会一起
被折射；光学皮肤必须是独立子层。正确的层级已经由 `.hx-glass` +
`.hx-glass__skin` 提供。

### 锚点菜单

```html
<button id="quality" class="hx-glass hx-light">音质：高品质</button>
```

```js
HxPopup.openMenu(document.querySelector('#quality'), [
  { label: '标准 128k', checked: quality === '128k', action: () => setQuality('128k') },
  { label: '高品质 320k', checked: quality === '320k', action: () => setQuality('320k') },
  { label: '无损 FLAC', checked: quality === 'flac', action: () => setQuality('flac') }
], { ariaLabel: '选择音质' });
```

菜单会自己完成：定位、空间不足时向上翻转、以触发器中点为 `transform-origin`、
740ms 展开、150ms 收起、点击外部/Esc/滚动/失焦关闭、方向键导航、焦点归还。

### 对话框与抽屉

```js
const session = HxSurfaces.openModal({
  content: document.querySelector('#my-dialog-template').content.cloneNode(true),
  ariaLabel: '新建歌单'
});
// session.close()
```

`HxSurfaces.openSheet({...})` 使用 600px 宽、66vh 高、顶部 32px 圆角、抓取条和
540ms / 240ms 的抽屉时序。

### Electron 无边框窗口

```js
new BrowserWindow({
  width: 1180,
  height: 760,
  frame: false,
  transparent: true,
  backgroundColor: '#00000000',
  roundedCorners: false,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
});
```

窗口圆角由页面 `.hx-window-surface` 控制；最大化/全屏时给 `<body>` 加
`hx-maximized` / `hx-fullscreen` 去掉圆角。最大化必须使用 Windows 工作区，
不能盖住任务栏。完整清单见 `references/windows-electron.md`。

---

## 2. 包含什么

```
huawei-immersive-pc/
├─ SKILL.md                         # 给 AI 编码代理的入口技能
├─ STANDARD.md                      # 规范性标准（MUST / SHOULD）
├─ src/
│  ├─ hx-material.js                # 光学皮肤：法线、折射、边缘、profile、缓存
│  ├─ hx-interactions.js            # 指针追光、按压/拖动分层形变、复位
│  ├─ hx-popup.js                   # 锚点菜单 + 通用 popup + 原生时序表
│  ├─ hx-surfaces.js                # 模态/抽屉生命周期 + 单节点几何形变
│  └─ hx-immersive.css              # tokens、组件几何、浮层、窗口 chrome
├─ examples/
│  ├─ index.html                    # 可交互 demo（实时 Canvas 背景）
│  ├─ demo.css
│  └─ demo.js                       # 菜单、抽屉、搜索形变、详情时序、帧表
├─ references/
│  ├─ material-model.md             # 数学、滤镜图、参数、调参/排错
│  ├─ motion-model.md               # 时序表、弹簧、编排配方
│  ├─ popup-model.md                # 弹窗几何、定位、ARIA、关闭规则
│  ├─ surfaces-and-choreography.md  # 模态、抽屉、搜索、详情、dock/nav
│  ├─ windows-electron.md           # 无边框、透明、最大化、DPI、GPU
│  ├─ acceptance-protocol.md        # 真机标定、阈值、负对照、哈希门禁
│  ├─ porting-checklist.md          # 从零移植的逐项清单
│  ├─ anti-patterns.md              # 常见错误、症状、原因、修复
│  └─ api-reference.md              # 全部 API / class / data 属性
├─ tools/
│  ├─ serve.cjs                     # 零依赖静态服务器
│  ├─ validate.cjs                  # 文档/源码/常量一致性检查
│  ├─ smoke.cjs                     # 真实 Chromium 点击、几何、时序、截图
│  └─ manifest.cjs                  # 生成 SHA-256 清单
├─ MANIFEST.sha256
├─ CHANGELOG.md
├─ NOTICE.md
└─ LICENSE
```

---

## 3. 不可协商的规则

这些规则来自实际踩坑；违反其中任何一条，视觉或性能都会明显退化。

1. **一个宿主只做一次光学 pass。** 宿主负责布局/命中/内容，单个
   `.hx-glass__skin` 负责背景采样。不要把 `backdrop-filter` 和 `filter` 叠在
   宿主、内容或嵌套多个模糊层上。
2. **只变换皮肤。** 按压/拖动只改 `.hx-glass__skin` 的 transform；正文、
   图标、点击区域和滚动位置保持不动。文字像素差必须为 0。
3. **不用截图、噪声或动态湍流伪造材质。** 折射必须来自真实 backdrop；
   除实测的轮廓/肩部位移外，不加入“液态”噪声。
4. **边缘是独立通道。** 外缘取色和内部折射不能共用同一张模糊图；否则
   边缘会被中心内容污染。
5. **指针光必须复位。** `pointerout`、窗口 `pointerleave`、失焦、页面隐藏时
   清除 `--hx-mx/--hx-my`，不能把光留在鼠标离开的边缘。
6. **弹窗从触发器中心长出来。** 以触发器中点为 origin，空间不足向上翻转；
   不使用自己的左上角作为 origin。
7. **选中行是系统蓝，不是勾选图标。** 48px 行高、4px 内边距、20px 圆角、
   152px 最小宽度；无标题、无 checkmark。
8. **浮层关闭先于动作。** 点击菜单项先收起，再执行回调；Escape 只关闭最上层，
   不能穿透关闭后面的详情页。
9. **性能预算是功能的一部分。** P95 帧间隔 < 33.5ms、最大 < 50ms、
   长任务 0；几何读取必须先快照再批量写入，滤镜按尺寸/圆角缓存。
10. **验收不能只靠目测。** 至少要有真机或基准图对比、局部平滑度、负对照
    和打包后复测；源码变更后旧批准失效。

完整规范和阈值见 `STANDARD.md` 与 `references/acceptance-protocol.md`。

---

## 4. 运行示例与验证

```bash
# 零依赖静态服务器，打开 http://127.0.0.1:4173/examples/
npm run demo

# 文档、源码语法、规范常量、清单哈希
npm run validate

# 真实 Chromium：材质滤镜、菜单几何/颜色/翻转、模态、抽屉、搜索形变、详情时序
npm run smoke

# 生成 src/docs/examples/tools 的 SHA-256 清单
npm run manifest
```

`smoke` 会输出 `artifacts/smoke.json` 和四张截图。它需要 Playwright；本仓库
可直接复用 `apps/desktop/node_modules/playwright`，也接受包内安装或
`PLAYWRIGHT_MODULE` 环境变量。

`smoke` 优先启动仓库内的 Electron（DPR 固定为 1），这是与目标程序相同的
合成路径，按正式阈值 P95 < 33.5ms 检查；没有 Electron 时依次回退到
Chromium、Edge、Chrome，headless/软件光栅环境使用 55ms 的功能上限，结果中的
`engine` 与 `frames.limit` 会注明实际环境。正式发布仍必须按 33.5ms 验收。

示例页面同时显示帧间隔 P95、长任务数和光学表面数。它故意使用移动的
Canvas、网格和大字号背景，因为这些内容能让折射、肩部弯曲和外缘取色肉眼可见。

---

## 5. 运行时 API 速览

| API | 作用 |
| --- | --- |
| `HxMaterial.install(options?)` | 扫描并装饰 `.hx-glass`，安装 Resize/MutationObserver |
| `HxMaterial.prepare(node)` | 动态节点（菜单/弹窗）插入 DOM 后立即测量并生成皮肤 |
| `HxMaterial.configure({ optical })` | 替换标定参数；会使旧 filter 失效并重绘 |
| `HxMaterial.refreshAll()` | 背景、主题或 DPI 变化后重采样 |
| `HxInteractions.install(options?)` | 指针追光、按压/拖动弹簧；默认自动安装 |
| `HxPopup.openMenu(anchor, items, options?)` | 构建并打开锚点菜单，返回 session |
| `HxPopup.openPanel(anchor, node, options?)` | 带材质与定位的通用弹层 |
| `HxPopup.close()` | 关闭当前弹层 |
| `HxSurfaces.openModal({ content, ... })` | 对话框生命周期、焦点陷阱、Esc |
| `HxSurfaces.openSheet({ content, ... })` | 底部抽屉 |
| `HxSurfaces.morph(node, fromRect, options)` | 单节点 FLIP 几何形变（搜索/展开） |

配置项、菜单 item 结构、CSS 变量和 data 属性见
`references/api-reference.md`。

---

## 6. 兼容性与降级

- **目标环境**：Windows 10/11 + Chromium 120+ / Electron 30+。SVG filter 作为
  `backdrop-filter` 的引用是该实现的核心能力，旧 WebView2/Gecko 不支持。
- **GPU**：必须在真实 GPU 合成路径下验收。禁用 GPU 或软件光栅时，材质会
  退化为普通模糊；这不算通过。
- **DPR**：皮肤按 CSS 像素生成，内部法线贴图分辨率受 2048 上限约束；
  125% / 150% / 200% 缩放都要各跑一次截图检查。
- **降级**：不支持 `backdrop-filter` 时保留半透明底色和边框，不渲染折射；
  函数仍可用，但不满足“手机级”验收。
- **reduced motion**：关闭弹簧和弹窗 WAAPI 动画，保留材质与即时状态变化。

---

## 7. 作为技能包使用

`SKILL.md` 是给 AI 编码代理的入口，包含触发条件、接入顺序、硬规则和验证
命令。把整个目录复制到技能目录即可：

```powershell
# 个人技能（按你的客户端约定调整）
Copy-Item -Recurse .\huawei-immersive-pc "$HOME\.zcode\skills\huawei-immersive-pc"
```

之后让代理“使用 huawei-immersive-pc 技能移植到我的 Electron 应用”，它应先读
`STANDARD.md`，再按 `references/porting-checklist.md` 执行，而不是直接粘贴
一段玻璃 CSS。

---

## 8. 文档阅读顺序

1. 第一次接入：本 README → `references/porting-checklist.md`
2. 调材质：`references/material-model.md` → `references/acceptance-protocol.md`
3. 调动效/弹窗：`references/motion-model.md` → `references/popup-model.md`
4. 处理窗口/最大化/DPI：`references/windows-electron.md`
5. 出问题：`references/anti-patterns.md`
6. 需要规范依据：`STANDARD.md`

---

## 9. 授权

Copyright © 2026 林毅。本复用包使用 **MIT** 许可，见 `LICENSE`。私人使用、修改、
合并到自己的闭源项目都没有 copyleft 义务，也不需要公开源码。

主 LxMine 应用、其上游代码和第三方依赖仍按各自原许可证执行；本包不改变
它们的授权。包内运行时是本项目重新整理的通用实现，不包含华为专有代码或
素材。如果以后把这个包分发出去，保留 MIT 版权声明即可。
