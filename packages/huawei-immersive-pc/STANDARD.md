# 华为式沉浸光感 Windows UI 开发标准

**版本**：1.0.0  
**状态**：Stable  
**适用**：Windows 10/11 上的 Chromium / Electron / WebView2 桌面程序  
**规范来源**：LxMine PC 端实现与真机 EXQUISITE 像素标定  
**配套运行时**：`src/hx-material.js`、`hx-interactions.js`、`hx-popup.js`、`hx-surfaces.js`、`hx-immersive.css`

> 本文中的“华为式”是对视觉与动效参考的工程描述，不表示与华为官方 SDK 的兼容、
> 认证或代码来源关系。实现细节见 `NOTICE.md`。

---

## 0. 规范用语

- **MUST / 必须**：违反即不满足本标准，验收失败。
- **MUST NOT / 禁止**：出现即判定为缺陷。
- **SHOULD / 应该**：除非有记录在案的理由，否则应遵守。
- **MAY / 可以**：可选实现，不影响合规。
- 数值默认单位为 CSS px；时间单位为 ms；颜色为 sRGB。
- “真机”指运行 HarmonyOS `uiMaterial.ImmersiveMaterial` 的设备；“基准”指
  在固定设备、主题、DPR 和背景下拍摄的可复现截图。

---

## 1. 范围与非目标

### 1.1 范围

本标准覆盖 PC 端与“沉浸光感”相关的全部可见层：

1. 光学材质：轮廓法线、折射、肩部位移、环境边缘、透色、模糊、圆角适配；
2. 指针交互：追光、按压、拖动、释放、失焦复位；
3. 动效：锚点弹窗、模态、底部抽屉、搜索形变、播放详情分层时序、
   导航/播控栏形态变化；
4. 弹窗：菜单几何、定位/翻转、选中态、键盘、焦点、关闭层级；
5. 窗口：无边框透明窗口、圆角、最大化/全屏、标题栏按钮、任务栏；
6. 性能与验收：缓存、批处理、帧预算、真机像素门禁、负对照、源码绑定。

### 1.2 非目标

- 不复制华为闭源渲染引擎，不声称逐像素、逐 GPU 完全一致；
- 不提供 HarmonyOS ArkTS 组件；本包是 Web/Electron 运行时；
- 不定义业务信息架构、播放器协议、音源、账号或同步；
- 不把“毛玻璃模糊”当作沉浸光感。只有模糊没有折射、边缘分层和肩部场，
  不满足本标准。

---

## 2. 术语

| 术语 | 含义 |
| --- | --- |
| 宿主 host | 承载布局、命中测试和内容的元素，例如按钮、dock、菜单 |
| 光学皮肤 skin | 宿主内的独立子层，唯一执行 backdrop 采样与位移滤镜的层 |
| 轮廓法线 | 由圆角矩形 SDF 生成、编码进 R/G 通道的二维法线 |
| 肩部位移 | 胶囊直边向中心收缩的切向位移，使上下沿产生轻微弯曲 |
| 环境边缘 | 与外缘法线独立采样、只在窄边缘带混合的背景颜色 |
| profile | `control` / `menu` / `popup` / `sheet` 四组材质参数 |
| 锚点弹窗 | 以触发控件为锚点、从触发器中点展开的菜单/浮层 |
| 批准报告 | 通过全部阈值并绑定源码哈希的 `approved.json` |

---

## 3. 架构与层级模型

### 3.1 三层结构

每个光学控件 MUST 由三层构成：

```
┌─────────────────────────────────────────┐
│ 1. 内容层（文字 / 图标 / 输入 / 命中区） │  z-index: auto，不参与滤镜
├─────────────────────────────────────────┤
│ 2. 光学皮肤 .hx-glass__skin             │  z-index: -1，backdrop-filter
├─────────────────────────────────────────┤
│ 3. 页面 / 视频 / Canvas 背景             │  真实 Chromium backdrop
└─────────────────────────────────────────┘
```

宿主 `.hx-glass` MUST：

- `position: relative`；
- `isolation: isolate`，建立独立层叠上下文；
- 背景透明，不自带 `backdrop-filter` / `filter`；
- 只负责布局、圆角、命中测试和内容。

皮肤 `.hx-glass__skin` MUST：

- 绝对定位、覆盖宿主的**边框盒**（含透明边框）；
- `pointer-events: none`、`aria-hidden="true"`；
- 唯一的 `backdrop-filter: var(--hx-lens)`；
- 由运行时按宿主尺寸/圆角生成，不手写固定尺寸贴图。

### 3.2 单次光学 pass

一个宿主 MUST 只有一张皮肤、一次 backdrop 采样。禁止：

- 父容器 `filter: blur()` 后再对子元素做位移；
- 同时设置 `background` 模糊层 + `backdrop-filter` + 伪元素模糊；
- 嵌套多个 `.hx-glass__skin`；
- 对宿主本身使用 `filter`（会连同文字一起过滤）。

原因：`backdrop-filter` 采样的是元素背后的合成结果。父级先过滤会改变子级
可采样的内容，且无法恢复原始背景；多层模糊会累积亮度、乳白化和色偏。

### 3.3 动态节点

运行时通过 MutationObserver 自动装饰后插入的 `.hx-glass`。弹窗、模态和动态
列表也 MUST 在插入 DOM 后调用 `HxMaterial.prepare(node)`，以确保在首帧前完成
测量，避免“先透明、后闪出材质”。

### 3.4 层叠顺序

推荐的全局 z-index：

| 层 | z-index |
| --- | --- |
| 场景 / 背景 | 0 |
| 应用主体 | 3–50 |
| 播放详情 | 60 |
| 底部 dock / nav | 70 |
| 弹窗遮罩 | 80 |
| 锚点菜单 / popup | 81 |
| 窗口控制按钮 | 90 |
| Toast | 100+ |
| 启动画面 | 120 |

Escape 必须按“最上层先关闭”处理；菜单/模态在捕获阶段消费 Escape 并
`stopPropagation`，不得穿透关闭后方页面。

---

## 4. 材质模型

### 4.1 轮廓 SDF 与法线

对圆角矩形，取像素到圆角轮廓的有符号距离，按最近边/角求外法线：

- 直边：法线沿该边法向；
- 圆角：法线沿圆心到像素的径向；
- 内部：法线模长随距边距离指数衰减。

法线以 `128 ± n·116` 编码进 R/G 通道；B 通道编码“透明内圈/边缘遮罩”。
这不是简单的径向渐变：四个角、直边和胶囊肩部必须各自正确。

### 4.2 折射

滤镜图 MUST 按以下顺序（结果变量可改名，语义不可变）：

1. `feImage` 载入法线贴图；
2. `feComponentTransfer` 去掉 128 偏置，得到向量场；
3. `feGaussianBlur(SourceGraphic, sigma)`；
4. `feDisplacementMap` 用 R/G 位移，`scale = min(amplitudeCap, height × amplitude)`；
5. 对位移结果做小半径 `feGaussianBlur(resultSigma)`，去除 8 位等值线台阶；
6. `feColorMatrix saturate` 调整饱和度；
7. 与环境边缘层合成；
8. 对 popup 额外叠加内部透色。

默认参数（`control`）：

| 参数 | 值 | 作用 |
| --- | --- | --- |
| `sigma` | 1.9 | 内部折射模糊半径 |
| `edgeSigma` | 1.9 | 外缘采样模糊；popup 为 5 |
| `amplitude` | 4 | 每 CSS px 高度的位移强度 |
| `amplitudeCap` | 90 | 位移上限 |
| `decay` | 2.5 | 内部法线衰减 |
| `tangentGain` | 0.12 | 肩部横向位移增益 |
| `tangentCap` | 8 | 肩部位移上限 |
| `tangentDecay` | 2.5 | 肩部衰减 |
| `resultSigma` | 0.75 | 位移后平滑 |
| `alpha` | 0.15 | 控件透色 |
| `color` | `[10,12,14]` | 控件底色 |
| `saturation` | 1.25 | 折射饱和度 |
| `envWeight` | 1 | 环境边缘权重 |
| `envStart` / `envWidth` | 0.25 / 2 | 环境边缘起始与宽度 |
| `envOffset` / `envLift` / `envSlope` | 0 / 0 / 1 | 环境采样方向与亮度 |

### 4.3 肩部位移

纯 SDF 法线会让胶囊上下直边保持“尺子般笔直”，与真机的轻微外凸不符。
必须在位移场中加入切向分量：

```
tx = -clamp(px * tangentGain, ±tangentCap)
     × (1 - |nx|)
     × clamp((w - 2r) / r, 0, 1)
     × exp(-distance / tangentDecay)
```

`ty` 同理。该项在圆形控件上自然为 0；在胶囊上随距边距离衰减。
验收时，水平网格基准上的上下沿相位误差 MUST ≤ 0.75 CSS px（参考实现实测
最大 0.375 px）。

### 4.4 环境边缘

边缘 MUST 独立采样，不得复用中心折射图：

- 用 `edgeSigma` 单独模糊 `SourceGraphic`；
- 用独立的轻微位移采样环境色；
- 以法线图的 B 通道（透明内圈 mask）只在窄边缘带混合；
- 中心内容保持清晰，边缘允许轻微取色和折射。

这对应真机的三层观感：**外层环境取色 → 细透明内圈 → 内侧背景畸变**。

### 4.5 Profile

| profile | 覆盖参数 | 用途 |
| --- | --- | --- |
| `control` | 基准值 | 按钮、dock、导航、搜索、卡片 |
| `menu` | `alpha .88`、`color [26,28,31]` | 非锚点浮层/旧式 popover |
| `popup` | `sigma 5`、`edgeSigma 5`、`alpha .71`、`color [30,30,30]`、内部透色 | 系统 Select / 锚点菜单 |
| `sheet` | `sigma 4`、`alpha .88`、`color [26,28,31]` | 模态、底部抽屉 |

`popup` 的底色由滤镜内部产生（中心较实、边缘较透），皮肤背景必须透明；
其他 profile 由皮肤背景色承担透色。

### 4.6 缓存与尺寸

- 滤镜 MUST 按 `宽 × 高（2px 量化）× 四角半径 × profile` 缓存；
- 缓存上限默认 96，优先淘汰未使用项；
- 生成画布分辨率不超过 2048；
- 深度内部（各通道贡献都小于 1/8 字节）跳过计算，保证字节一致；
- 尺寸变化只重建皮肤引用，不重建页面布局。

### 4.7 降级

不支持 SVG filter 作为 backdrop 时：

- 保留半透明底色、0.5px 高光边和阴影；
- 不声称满足视觉验收；
- 不得用静态截图替代实时采样。

---

## 5. 几何与组件

### 5.1 主 tokens

| Token | 值 | 说明 |
| --- | --- | --- |
| `--hx-window-radius` | 20px | 普通窗口圆角 |
| `--hx-height-dock` | 56px | 宽屏播控栏 |
| `--hx-radius-dock` | 28px | 播控栏圆角 |
| `--hx-height-nav` | 56px | 宽屏导航栏 |
| `--hx-radius-nav` | 28px | 导航栏圆角 |
| `--hx-height-compact` | 54px | 手机比例单行合并栏 |
| `--hx-radius-compact` | 27px | 合并栏圆角 |
| `--hx-cover` / `--hx-cover-inner` | 44 / 38px | 播控封面外圈/内图 |
| `--hx-button` / `--hx-play` | 38 / 40px | 详情/宽屏按钮、播放键 |
| `--hx-height-search` | 50px | 搜索框 |
| `--hx-radius-search` | 25px | 搜索框圆角 |
| `--hx-radius-popup` | 20px | 锚点菜单 |
| `--hx-popup-min-width` | 152px | 菜单最小宽度 |
| `--hx-popup-row` | 48px | 菜单行高 |
| `--hx-radius-modal` | 30px | 模态圆角 |
| `--hx-radius-sheet` | 32px | 抽屉顶部圆角 |

### 5.2 底部栏

宽屏 MUST：

- 导航与播控同高 56px、同圆角 28px、底边对齐；
- 播控内边距 `0 14px 0 6px`，封面左移，避免视觉重心偏右；
- 导航内边距 `0 10px`，item 间距 4px，item 50px 高、25px 圆角。

手机比例（窄窗口）MUST：

- 两栏：播控 44px / 导航 56px，同宽、间距 4px；
- 合并单行：两者都 54px / 27px，导航收为 54px 圆球；
- 合并行封面仍为 44/38px，不因栏体变矮而缩小；
- 详情页恢复 56px 高，7 个控制（喜欢/上一首/播放/下一首/模式/下载/队列），
  不允许只剩 5 个。

### 5.3 搜索框

内外层 MUST 都是 50px 高、25px 圆角、14px 字号；内层只比外层少一个返回按钮
的宽度。外层与内层必须使用同一材质，不允许“外玻璃、内实色”。

### 5.4 弹窗

- 最小宽度 152px，宽度 `max-content`，最大 `min(340px, 100vw - 24px)`；
- 最大高度 `min(680px, (100vh - 72px) × 0.8)`；
- 内边距 4px、圆角 20px；
- 行最小高度 48px、内边距 10px 12px、圆角 16px、字号 16px；
- 行间分隔线为一个物理像素，左右各缩进 12px；
- 选中行：文字 `#5E9FFF`，背景 `rgba(49,122,247,.4)`；禁止勾选图标/标题；
- 菜单遮挡背景透明，不使用全屏暗幕；模态才使用暗幕。

### 5.5 模态 / 抽屉

- 模态宽 `min(560px, 100vw - 80px)`，最大高 76vh，圆角 30px，内边距 26px；
- 抽屉宽 `min(600px, 100vw - 32px)`，最大高 66vh，顶部圆角 32px；
- 抽屉抓取条 38×4px，距顶 10px；
- 遮罩 `rgba(3,4,6,.38)` + `blur(16px) saturate(1.12)`。

### 5.6 响应式

以 **内容宽度/窗口长宽比** 判定手机布局，而不是仅看视口像素宽度；
在 320 / 360 / 420 / 540 / 800 / 1200px 宽度下都必须验证：

- 标签不溢出；
- 四个导航中心命中点落在按钮内；
- dock 封面、按钮和圆角比例一致；
- 菜单不超出左右 16px、上下 12px 安全区。

---

## 6. 交互模型

### 6.1 指针追光

- 仅 `.hx-light` 元素响应；
- 半径 95px，白色 15%，hover 透明度 0.35，按下 1.0；
- 位置写入 `--hx-mx/--hx-my`；
- `pointerout`（离开宿主且 relatedTarget 不在内部）、窗口 `pointerleave`、
  `blur`、`visibilitychange(hidden)` MUST 清除坐标，使光斑回到默认位置；
- 不允许把光斑固定在鼠标离开时的边缘坐标。

### 6.2 按压与拖动

按压目标：`translate(0,0) scale(.997,.967)`。拖动时：

```
x = clamp(dx, -100, 100) × 0.025
y = clamp(dy, -70, 70) × 0.025
sx = .997 + |dx| × .00003
sy = .967 + |dy| × .00012
```

- 只作用于 `.hx-glass__skin`；
- 不捕获 pointer；原生 range、文本选择、滚动保持可用；
- 左键、主指针、非输入控件才触发；
- 释放、`pointercancel`、窗口失焦、页面隐藏、指针 ID 不匹配时 MUST 清空
  `.hx-pressed` / `.hx-light-active` 并回弹。

### 6.3 弹簧

- 刚度 380，阻尼 32，`dt` 上限 0.032s；
- 位移/缩放阈值 `.00015`、速度阈值 `.001` 后吸附；
- 未激活时停止 rAF，不允许常驻空转；
- `prefers-reduced-motion: reduce` 时直接吸附，不播放弹簧。

### 6.4 键盘与焦点

- 菜单项、模态按钮、dock 按钮 MUST 可聚焦；
- `:focus-visible` 使用 2px 白色 outline，offset 4px；
- 菜单方向键循环、Home/End、Enter/Space、Tab 关闭、Esc 关闭；
- 模态 Tab 焦点陷阱；关闭后焦点回到触发器；
- 输入框内的 Space/方向键不得被全局快捷键劫持。

---

## 7. 动效模型

### 7.1 锚点弹窗

- 展开：**740ms**，线性关键帧，缩放从 0.20 起，241–291ms 有 1.02 轻微过冲，
  透明度在 ~0.976 平台后到 1；
- 收起：**150ms**，缩放 1→0.6，透明度 1→0；
- 必须是“单节点 WAAPI + 触发器中心 origin”，不是 CSS `transform: scale(0)`
  也不是双节点交叉淡入；
- 展开中途关闭 MUST 从当前 transform/opacity 连续收起，不能跳回起点；
- 关闭动画结束后移除节点，清理动画。

完整帧表见 `src/hx-popup.js` 与 `references/motion-model.md`。

### 7.2 其他时序

| 场景 | 进入 | 退出 | 曲线 |
| --- | --- | --- | --- |
| 模态 | 520ms | 220ms | `cubic-bezier(.17,1.3,.27,1)` / `.4,0,1,1` |
| 底部抽屉 | 540ms | 240ms | `cubic-bezier(.16,1.28,.27,1)` / `.4,0,1,1` |
| 搜索形变 | 460ms | 460ms | `.22,1.08,.32,1` / `.4,0,.6,1` |
| 播放详情进入 | 播控先到位，**620ms 后**背景显影 | — | `ease` + spring |
| 播放详情退出 | 先停 **140ms**，再分层淡出 | 总 620ms | `ease` |
| 视图切换 | 125ms 旧内容退场 + 320/380ms 新内容 | — | spring |
| dock/nav 形变 | 460ms | 460ms | spring `(.2,1.16,.3,1)` |
| 追光 | 250ms hover / 80ms 按下 | — | ease |

### 7.3 播放详情编排

进入：

1. 点击封面/标题，立即把 dock 移到详情位置；
2. 背景保持模糊/暗化，详情内容不可先于播控到位；
3. **620ms 后**移除进入态，背景从 blur 13px/16px 过渡到清晰；
4. 详情遮罩、歌词、时间轴按同一节奏到位。

退出：

1. 先保持 **140ms**，不要同时移动 dock 和淡出背景；
2. 背景先淡出，dock 随后回到主页位置；
3. 620ms 后恢复底层视图和导航；
4. 若从搜索进入，返回搜索；否则返回来源 tab。

### 7.4 搜索形变

- 搜索球和搜索框 MUST 是同一个 DOM 节点；
- 记录起始矩形，切换到目标布局后测量目标矩形；
- 用 FLIP：`translate(dx,dy) scale(sx,sy)`，`transform-origin: top left`；
- 打开 460ms spring，关闭反向；
- 不允许两个节点交叉淡入造成“双材质”或文本重影。

### 7.5 动画所有权与中断

- 同一节点同一时间只允许一个主入场动画；
- 关闭时先取消当前动画，读取当前矩阵作为新起点；
- `prefers-reduced-motion` 时返回已完成 Promise / 直接落位；
- 动画结束后取消 fill，避免 WAAPI 长时间占用；
- 不用 CSS `animation` 驱动需要读取当前相位的交互式弹出。

---

## 8. 弹窗模型

### 8.1 结构

```html
<div class="hx-menu-backdrop"></div>
<div class="hx-popup hx-glass" role="menu" aria-label="选择音质"
     data-hx-material="popup" style="transform-origin: …">
  <div class="hx-popup__row is-checked" role="menuitemradio" aria-checked="true">…</div>
  <div class="hx-popup__row" role="menuitemradio" aria-checked="false">…</div>
</div>
```

- 背景遮罩透明，只负责点击外部关闭；
- 菜单 `position: fixed`，不进入页面滚动流；
- `.hx-popup` 的皮肤（`.hx-glass__skin`）承担 backdrop 采样；
- 菜单自身 `background: transparent`；popup profile 在滤镜内部产生深色透色。

### 8.2 定位算法

```
gap = 8; margin = 16; bottomMargin = 12
belowTop = anchor.bottom + gap
if belowTop + menu.height > viewport.height - bottomMargin:
    above = true
    top = max(12, anchor.top - gap - menu.height)
else:
    top = belowTop
left = clamp(anchor.left, margin, viewport.width - margin - menu.width)
originX = anchor.centerX - left
originY = anchor.centerY - top
```

- 翻转只看可用空间，不因菜单位置“看起来奇怪”而随意切换；
- 左/右越界必须 clamp；菜单不得超出安全区；
- 记录 `originX / menu.width` 供 WAAPI 决定横向展开方向；
- 菜单位置在打开时一次性计算；滚动/缩放时关闭，不跟随重排。

### 8.3 选中态

- 选中行使用系统蓝文字 + 半透明蓝底；
- 不显示勾选图标、不显示分组标题、不在行尾重复当前值；
- 单选菜单使用 `role="menuitemradio"` 和 `aria-checked`；
- 动作菜单使用 `role="menuitem"`；
- 禁用项 `aria-disabled="true"`，不响应点击，不进入方向键序列。

### 8.4 关闭规则

以下任一情况 MUST 关闭：

- 点击遮罩；
- Escape；
- 选择任意可用项（先关闭再执行 action）；
- 窗口 resize / 滚动（非菜单内部滚动）；
- 窗口失焦；
- 打开另一个 popup（保证同时只有一个）。

点击菜单内部不关闭；菜单内部滚动不关闭；关闭动画期间不得重复执行 close。

### 8.5 键盘与焦点

- 打开后焦点进入选中项或第一项；
- ↑/↓ 循环，Home/End 首尾，Enter/Space 选择，Tab 关闭；
- Escape 关闭并把焦点还给触发器；
- 触发器设置 `aria-haspopup`、`aria-expanded`、`aria-controls`；
- 菜单 `role=menu`，行 `tabindex=-1`，由脚本 roving focus。

### 8.6 内容限制

- 菜单宽度由内容决定，超长文本省略；
- 行数超过可用高度时菜单内部滚动，不把页面撑开；
- 不在菜单里放输入框、富文本或嵌套滚动区域；复杂内容使用 `openPanel` 或模态。

---

## 9. 窗口与 Windows 集成

### 9.1 无边框透明窗口

Electron MUST：

```js
frame: false,
transparent: true,
backgroundColor: '#00000000',
roundedCorners: false,
```

`roundedCorners: false` 关闭 DWM 自带圆角/阴影，避免与页面圆角双重裁切；
页面用 `.hx-window-surface { border-radius: 20px; overflow: hidden; }` 控制视觉
圆角，并在最大/全屏时置 0。

### 9.2 最大化

- 普通最大化 MUST 使用工作区尺寸（`screen.getDisplayMatching(bounds).workArea`），
  **不得盖住任务栏**；
- 全屏是独立按钮，不能复用最大化；
- 最大化/全屏时移除 stage、页面、遮罩、启动画面的圆角；
- 还原时恢复 20px 圆角和阴影边框。

### 9.3 标题栏

- 拖动区高 28px，`-webkit-app-region: drag`；
- 控制按钮 46×34px，`no-drag`；
- 关闭按钮 hover `#c42b1c`，其余 hover 白色 12%；
- 最大化按钮用方形图标，全屏用四角图标，最小化单独；
- 标题栏按钮不得遮挡内容命中区；拖动区不能覆盖可点击控件。

### 9.4 启动画面

- 启动画面也必须有 20px 圆角并裁切内部 iframe；
- 最大/全屏/壁纸模式时圆角为 0；
- 淡出完成后再移除，避免透明窗口闪黑。

### 9.5 DPI 与字体

- 以 CSS 像素布局；`--hx-hairline = 1 / devicePixelRatio`；
- 125% / 150% / 200% 缩放分别验证 0.5px 边框和菜单分隔线；
- 字体优先 HarmonyOS Sans SC，其次 PingFang SC / Microsoft YaHei UI / Segoe UI；
- 不把文字放进滤镜层，避免亚像素渲染被位移。

### 9.6 安全

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`（如可行）；
- 窗口控制通过 preload 暴露最小 IPC；
- 不把 `shell.openExternal` 暴露给任意 URL；
- 材质数据 URL 需要 CSP 允许 `img-src data:`；否则滤镜无法加载。

---

## 10. 性能

### 10.1 预算

| 指标 | 阈值 |
| --- | --- |
| 帧间隔 P95 | < 33.5ms |
| 最大帧间隔 | < 50ms |
| 长任务（>50ms） | 0 |
| 文本区域按压像素差 | < 1/255 |
| 打包后复测 | 与源码测试同门槛 |

在真实合成窗口、DPR 1、关闭后台节流、窗口可见的条件下测量；隐藏窗口、
最小化、后台降频的数据无效。

### 10.2 实现要求

- 所有几何读取 MUST 先快照，再批量写入；单帧写入预算默认 4ms；
- 不在 pointermove 中读取布局；指针坐标使用 `clientX/Y` 与缓存的 rect；
- filter 按尺寸/圆角/profile 缓存，resize 量化到 2px；
- 位移画布不超过 2048px；
- 深度内部跳过计算；
- 只对皮肤做 transform，且使用 `will-change` 仅在弹窗动画期间；
- 不用 `filter: blur()` 叠加多层；不用持续 animated noise；
- 暂停隐藏页面的 Canvas/动画。

### 10.3 常见性能陷阱

| 现象 | 原因 | 修复 |
| --- | --- | --- |
| 缩放时 56–150ms 尖峰 | 每个控件交替读写布局 | 快照 + 4ms 批处理 |
| 弹窗打开掉帧 | 每帧重建 filter / 测宽高 | 打开前一次测量并缓存 |
| 拖动文字抖动 | 变换宿主而不是皮肤 | 只变换 skin |
| GPU 内存增长 | 每个尺寸都保留 filter | 量化 + LRU 上限 |
| 全屏后发灰 | 父级 filter / 重复模糊 | 移除父级过滤 |

---

## 11. 验收

### 11.1 真机标定

1. 固定设备、系统版本、主题（暗色）、DPR、字体缩放；
2. 生成网格背景与带文字高对比背景；
3. 同一背景分别拍“材质开 / 关 / 再开”，验证重复性；
4. PC 端用同一张关闭材质的背景图渲染，不能平移成品截图凑分；
5. 记录控件边界，误差 < 0.25 物理像素；
6. 至少覆盖：52/72 高胶囊、64 圆球、28 圆角面板、42 小圆按钮、THIN 菜单、
   THICK 弹层；共 16 个样本；
7. 系统 Select/Menu 必须使用真实生产组件，不能用 MenuItem 勾选文本冒充。

### 11.2 固定阈值（参考项目）

| 区域 | 平均绝对误差 |
| --- | --- |
| 全部内部像素（含最外 1px） | ≤ 8/255 |
| 材质主体 | ≤ 8/255 |
| 折射带（距边 1–10px） | ≤ 12/255 |
| 中心 | ≤ 8/255 |
| 外部 16px 阴影带 | ≤ 6/255 |
| 主体 SSIM | ≥ 0.92 |
| 背景对齐差 | < 0.5/255 |
| 真机重复差 | < 1/255 |
| 球面 Laplacian 比例 | ≤ 1.5 |
| 胶囊肩部相位误差 | ≤ 0.75 CSS px |
| 关闭折射的负对照 | MUST 失败 |

这些阈值绑定设备、场景和测试机。新项目 MUST 重新采集自己的基准；
禁止修改基准、降低阈值、裁掉不利区域来“通过”。

### 11.3 发布门禁

- 像素报告、动效报告、基准文件和验证器源码全部计算 SHA-256；
- 源码/基准/验证器任一变化，旧批准立即失效；
- 打包前 `beforePack` 校验批准状态、哈希、样本数、局部平滑度、肩部误差、
  帧预算；
- 失败时拒绝出包，不允许“先打包再补测”；
- 打包后对实际 exe 再跑一次 smoke/motion，防止 asar/资源路径差异。

### 11.4 动效验收

- 真实点击实际生产弹窗，暂停时间轴采固定相位；
- 与未参与拟合的原生录屏注册标题位置和缩放；
- 模板匹配置信度 < .82 只报告，不作精度断言；
- 缩放差 ≤ .025，横向 ≤ 5 CSS px，纵向 ≤ 3 CSS px；
- 中途关闭不跳变；旧起始缩放（如 .92）必须被拒绝；
- 每项测试独立进程、隔离用户目录、预热后采样；
- 场景间保留冷却时间，避免 GPU/合成器异步销毁造成假尖峰。

### 11.5 证据

每次验收保留：PC 原图、真机/PC/四倍差异三联图、JSON 指标、运行日志、
源码哈希、打包产物哈希。禁止只保留“通过”结论。

---

## 12. 可访问性与降级

- 所有交互控件可用键盘到达；焦点可见；
- 菜单、模态有正确 role/aria；
- 文本对比度满足 WCAG AA（正文 4.5:1，大字号 3:1）；
- `prefers-reduced-motion` 下关闭弹簧、弹出动画、搜索形变；
- 关闭透明/模糊后仍能阅读和操作；
- 触控目标不小于 38×38px；菜单行 48px；
- 不用颜色作为唯一状态指示（选中行同时有 `aria-checked`）。

---

## 13. 版本与兼容

- 运行时遵循 SemVer；CSS token/时序/阈值变化属于 minor 或 major；
- 修改默认材质参数 MUST 重新标定并更新 `MANIFEST.sha256`；
- 新增 profile 必须同时提供几何、材质、动效和验收证据；
- 旧项目升级前先跑 `npm run validate` 与 `npm run smoke`；
- `1.x` 不保证与 `0.x` 的像素级一致，但保持 API 兼容。

---

## 14. 反模式索引

完整症状/原因/修复见 `references/anti-patterns.md`。高频错误：

1. 宿主 `filter: blur()`，文字一起糊；
2. 多层玻璃叠加，越叠越白；
3. 用截图/噪声伪装折射；
4. 菜单用自己的左上角做 origin；
5. 选中行画勾选图标；
6. 指针光不复位；
7. 拖动变换整个按钮；
8. 关闭弹窗与执行 action 顺序颠倒；
9. 窄窗口把详情播控缩成 5 个按钮；
10. 最大化盖住任务栏；
11. 用隐藏窗口测帧率；
12. 改源码后继续使用旧批准。

---

## 15. 合规检查表

发布前逐项确认：

- [ ] 每个光学控件只有一张 skin，宿主无 filter；
- [ ] 正文/命中区不在滤镜层；
- [ ] 外缘独立采样，肩部场存在；
- [ ] 指针光在所有离开路径复位；
- [ ] 按压/拖动只改 skin，释放/失焦回弹；
- [ ] 弹窗 740/150ms、触发器中心 origin、可翻转；
- [ ] 菜单 152/48/4/20，选中蓝、无勾选；
- [ ] 模态/抽屉时序与焦点陷阱；
- [ ] 搜索是单节点形变；
- [ ] 详情 620ms 显影、140ms 退出保持；
- [ ] 窄窗口 dock 44/56 或 54/27，详情 56 + 7 控件；
- [ ] 窗口 20px 圆角，最大化/全屏 0，任务栏可见；
- [ ] DPR 100/125/150/200% 截图通过；
- [ ] 像素、负对照、平滑度、肩部、SSIM 通过；
- [ ] P95 < 33.5ms、max < 50ms、长任务 0；
- [ ] 源码/基准/批准哈希一致，打包后复测通过；
- [ ] reduced motion、键盘、aria、对比度通过。
