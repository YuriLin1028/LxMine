---
name: huawei-immersive-pc
description: >-
  Build or port Huawei-style immersive-light UI on Windows/Electron/Chromium:
  live-backdrop optical material, contour refraction, tangential capsule
  shoulders, environmental rim, pointer light, press/drag deformation,
  anchored popups, modals/sheets, search morph, playback-detail choreography,
  frameless window chrome and pixel/motion acceptance gates. Use when the user
  asks for 华为沉浸光感, 手机级玻璃/材质, 鸿蒙风格 UI, immersive glass, liquid
  optical surfaces, Huawei-like popups/animations, or porting LxMine's PC visual
  system to another Windows app.
---

# Huawei Immersive PC

本技能把“手机级沉浸光感”作为一套**运行时 + 规范 + 验收协议**来交付，而不是
一段玻璃 CSS。宿主、光学皮肤、正文必须分层；弹窗、窗口和性能都有硬指标。

## 先读什么

按任务选择，不要一次读完全部：

| 任务 | 必读 |
| --- | --- |
| 第一次接入 | `STANDARD.md` §3–§6，`references/porting-checklist.md` |
| 调材质/折射/边缘 | `references/material-model.md` |
| 动效/弹窗时序 | `references/motion-model.md` |
| 菜单定位/键盘 | `references/popup-model.md` |
| 模态/搜索/详情 | `references/surfaces-and-choreography.md` |
| 无边框/最大化/DPI | `references/windows-electron.md` |
| 验收/门禁 | `references/acceptance-protocol.md` |
| 出问题 | `references/anti-patterns.md` |
| API/类/token | `references/api-reference.md` |

规范用语：MUST = 不满足即失败；SHOULD = 除非记录理由否则遵守。

## 不可协商的规则

1. **一个宿主、一张皮肤、一次光学 pass。** 宿主负责布局/命中/内容；只有
   `.hx-glass__skin` 执行 `backdrop-filter`。禁止父级 `filter`、多层玻璃、
   把文字放进滤镜。
2. **只变换皮肤。** 按压/拖动不得 transform 宿主；文字像素差必须为 0。
3. **实时 backdrop。** 不用截图纹理、噪声或动态湍流伪造折射。
4. **边缘独立采样。** 外层环境色、透明内圈、内部畸变是三层，不得共用一张
   模糊图。
5. **胶囊必须有肩部切向场。** 否则直边像尺子；相位误差 ≤ 0.75 CSS px。
6. **指针光必须复位。** `pointerout`、窗口 `pointerleave`、失焦、页面隐藏
   清 `--hx-mx/--hx-my`。
7. **弹窗从触发器中点展开。** 740ms 展开 / 150ms 收起；下方不足向上翻转；
   选中行系统蓝、无勾选、无标题；152/48/4/20 几何。
8. **关闭先于动作。** 菜单项先 close 再 action；Escape 只关闭最上层。
9. **详情分层。** 播控先到位，620ms 后背景显影；退出先保持 140ms。
10. **性能是功能。** P95 < 33.5ms、max < 50ms、长任务 0；先快照几何再批量
    写入；filter 按尺寸/圆角缓存。
11. **验收不能目测。** 真机/基准像素、局部平滑度、负对照、源码哈希、打包后
    复测；改源码后旧批准失效。

## 工作流

1. **审计**目标应用：Chromium 版本、窗口是否无边框/透明、是否已有全局
   filter/backdrop、原生 select、窄窗口布局、性能基线。
2. **接入运行时**：复制 `src/` 五个文件；CSS 进 head；四个 JS 按顺序加载；
   给一个按钮加 `hx-glass hx-light`。
3. **先几何，后材质**：dock/nav 56/28、compact 54/27、详情 56、封面 44/38、
   按钮 38/40、菜单 152/48/4/20、窗口 20px。不要先调折射参数。
4. **实现组件**：菜单用 `HxPopup.openMenu`；模态/抽屉用 `HxSurfaces`；搜索
   用单节点 `morph`；详情按 620/140/620 编排；窗口按 `windows-electron.md`。
5. **性能**：ResizeObserver 批处理、filter 缓存、只在皮肤上 transform、隐藏
   页面暂停动画。
6. **验证**：`npm run validate`、`npm run smoke`；再按验收协议做像素/动效/
   打包后复测。
7. **交付**：列出改动、几何/时序依据、验收证据、未覆盖项（设备/GPU/DPI）。

## 最小接入

```html
<link rel="stylesheet" href="src/hx-immersive.css">
<script src="src/hx-material.js"></script>
<script src="src/hx-interactions.js"></script>
<script src="src/hx-popup.js"></script>
<script src="src/hx-surfaces.js"></script>

<button id="quality" class="hx-glass hx-light">音质：高品质 320k</button>
```

```js
HxPopup.openMenu(document.querySelector('#quality'), [
  { label: '标准 128k', checked: quality === '128k', action: () => setQuality('128k') },
  { label: '高品质 320k', checked: quality === '320k', action: () => setQuality('320k') },
  { label: '无损 FLAC', checked: quality === 'flac', action: () => setQuality('flac') }
], { ariaLabel: '选择音质' });
```

动态节点：

```js
document.body.append(menu);
HxMaterial.prepare(menu);   // 必须早于 visible / 动画
```

对话框：

```js
const session = HxSurfaces.openModal({
  content: template.content.cloneNode(true),
  ariaLabel: '新建歌单'
});
```

## 关键实现约束

- **宿主**：`position:relative; isolation:isolate; background:transparent;
  border:0; box-shadow:none;`，无 `filter`/`backdrop-filter`。
- **皮肤**：绝对定位覆盖边框盒（`inset` 为负 borderWidth）、
  `pointer-events:none`、`z-index:-1`、`aria-hidden=true`。
- **动态节点**：MutationObserver 自动装饰，但打开弹窗前仍要 `prepare` 防首帧
  透明。
- **DPR**：发丝线 `1/devicePixelRatio`；125/150/200% 都要截图。
- **CSP**：`img-src data:`，否则 `feImage` 法线图加载失败。
- **降级**：不支持 `backdrop-filter: url()` 时保留半透明底，但不得声称通过
  视觉验收。
- **版权/授权**：Copyright © 2026 林毅；MIT，私人/闭源项目可直接使用。主 LxMine 应用及其上游仍按各自许可证执行。

## 验证命令

```bash
npm run demo       # 打开可交互示例
npm run validate   # 语法/文档/规范常量/哈希清单
npm run smoke      # Chromium 实际点击、几何、颜色、翻转、时序、截图
npm run manifest   # 改了源码/文档后重新生成 MANIFEST.sha256
```

`smoke` 需要 Playwright；本仓库复用 `apps/desktop/node_modules/playwright`。

## 交付时必须说明

- 目标 Chromium/Electron 版本与 GPU 环境；
- 哪些平台/DPI/窗口状态已测，哪些未测；
- 材质参数是否仍为默认标定值，是否重新做过基准；
- 像素/动效结果及证据路径；
- 已知限制（例如非 Chromium、软件光栅、无真机基准）。

## 禁止事项

- 只写一段 `backdrop-filter: blur()` 就宣称复刻；
- 用截图当材质纹理；
- 用 `filter` 过滤宿主/父级；
- 弹窗从自己左上角缩放；
- 菜单选中行画勾选/加标题；
- 拖动时 transform 整个按钮；
- 窄窗口把详情播控缩成 5 键；
- 最大化盖住任务栏；
- 用隐藏窗口测帧率；
- 改源码后继续使用旧 `approved.json`；
- 删除失败样本或降低阈值来“通过”。

## 文件地图

```
src/hx-material.js       光学材质、皮肤、缓存、观察器
src/hx-interactions.js   追光、按压/拖动、复位
src/hx-popup.js          锚点菜单/popup/740-150 时序
src/hx-surfaces.js       模态/抽屉/单节点形变
src/hx-immersive.css     tokens + 组件 + 窗口 chrome
examples/                可运行 demo
references/              详细规范与排错
tools/                   serve / validate / smoke / manifest
STANDARD.md              规范性标准
```

遇到不确定的行为，先读对应 reference 的“验收”与“反模式”，不要凭感觉调参数。
