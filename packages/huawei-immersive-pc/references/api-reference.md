# API 参考

运行时全部挂载在 `window`，无构建依赖。推荐加载顺序：

```html
<link rel="stylesheet" href="hx-immersive.css">
<script src="hx-material.js"></script>
<script src="hx-interactions.js"></script>
<script src="hx-popup.js"></script>
<script src="hx-surfaces.js"></script>
```

如果需要在框架启动后再初始化：

```html
<script>window.HX_IMMERSIVE_MANUAL = true;</script>
```

之后手动调用 `HxMaterial.install()` / `HxInteractions.install()`。

---

## 1. 必需的标记

```html
<svg class="hx-filter-defs" width="0" height="0" aria-hidden="true"><defs></defs></svg>

<button class="hx-glass hx-light">…</button>
```

- `.hx-filter-defs` 可省略，运行时会自动插入；
- `.hx-glass` 宿主必须是 `position: relative` 的普通元素（运行时/CSS 已提供）；
- `.hx-light` 可选，启用指针追光；
- 不要在宿主上手写 `.hx-glass__skin`；
- 不要在宿主或父级使用 `filter` / `backdrop-filter`。

---

## 2. HxMaterial

### `HxMaterial.install(options?)`

扫描 `document.body`，装饰所有 `.hx-glass`，安装 ResizeObserver 和
MutationObserver。重复调用幂等。

```js
HxMaterial.install({
  selector: '.hx-glass',
  flushBudgetMs: 4,
  cacheLimit: 96
});
```

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `selector` | `.hx-glass` | 需要装饰的宿主选择器 |
| `defsSelector` | `.hx-filter-defs` | SVG defs 容器 |
| `autoInstall` | `true` | 脚本加载后自动安装 |
| `flushBudgetMs` | `4` | 每帧写入皮肤的预算 |
| `cacheLimit` | `96` | filter 缓存上限 |
| `optical` | 见 STANDARD | 材质参数，可含 `menu/sheet/popup` 覆盖 |

### `HxMaterial.prepare(node)`

动态节点插入 DOM 后立即测量并生成皮肤。菜单、模态、动态按钮必须调用。

```js
document.body.append(menu);
HxMaterial.prepare(menu);
```

返回内部 state（一般不需要使用）。

### `HxMaterial.configure(patch)`

深度合并配置，递增 generation，清空旧 filter，重新排队所有宿主。

```js
HxMaterial.configure({
  optical: {
    sigma: 2.0,
    menu: { alpha: 0.9 }
  }
});
```

注意：修改默认材质参数应重新做像素验收；`configure` 不会自动生成批准。

### `HxMaterial.refresh(host)` / `HxMaterial.refreshAll()`

强制重新测量/刷新。用于：

- 主题/背景切换；
- DPI 变化；
- 从最小化恢复；
- 外部改变宿主尺寸但 ResizeObserver 未触发（少见）。

### `HxMaterial.destroy()`

断开 observer、移除所有皮肤和 filter、清空缓存。用于热重载/微前端卸载。

### 属性

| 属性 | 说明 |
| --- | --- |
| `HxMaterial.version` | 版本号 |
| `HxMaterial.stats` | `{ hosts, filters, installed }` |
| `HxMaterial.options` | 当前配置的深拷贝 |

### 事件

```js
document.addEventListener('hxmaterial:ready', () => {
  console.log('material installed');
});
```

### data 属性

| 属性 | 值 | 作用 |
| --- | --- | --- |
| `data-hx-material` | `control` / `menu` / `popup` / `sheet` | 强制材质 profile；运行时也会写回实际值 |
| `data-hx-glass` | `ready` | 运行时标记已装饰 |
| `data-hx-press` | `none` | interactions 跳过该宿主的按压 |

---

## 3. HxInteractions

### `HxInteractions.install(options?)`

安装全局 pointer 监听。自动安装默认开启；`HX_IMMERSIVE_MANUAL=true` 时关闭。

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `pressSelector` | `.hx-glass` | 可按压的宿主 |
| `lightSelector` | `.hx-light` | 追光目标 |
| `excludedSelector` | `input,textarea,select,[contenteditable="true"],[data-hx-no-press]` | 排除区域 |
| `stiffness` | `380` | 弹簧刚度 |
| `damping` | `32` | 弹簧阻尼 |
| `press` | `[0,0,.997,.967]` | 按压目标 |
| `dragX` / `dragY` | `.025` | 位移比例 |
| `dragMaxX` / `dragMaxY` | `100 / 70` | 位移上限（CSS px） |

### `HxInteractions.releaseAll()`

立即清除所有 `.hx-pressed` / `.hx-light-active`，并把弹簧目标归零。用于路由
切换、窗口失焦、全屏切换。

### `HxInteractions.refresh(host)`

宿主皮肤被替换后更新内部 surface 引用。

### 属性

- `HxInteractions.version`
- `HxInteractions.options`

### CSS 变量（运行时写入宿主）

| 变量 | 含义 |
| --- | --- |
| `--hx-mx` / `--hx-my` | 指针在宿主内的坐标 |
| `--hx-lens` | 当前滤镜引用 |
| `--hx-tint` | 当前底色（调试/降级） |

### 类

| 类 | 含义 |
| --- | --- |
| `.hx-pressed` | 当前按压中 |
| `.hx-light-active` | 当前按下追光 |

---

## 4. HxPopup

### `HxPopup.openMenu(anchor, items, options?)`

```js
const session = HxPopup.openMenu(button, [
  { label: '标准 128k', value: '128k', checked: false, action: () => {} },
  { label: '高品质 320k', value: '320k', checked: true, action: () => {} },
  { separator: true },
  { label: '下载', disabled: false, action: () => {} }
], {
  ariaLabel: '选择音质',
  align: 'start',
  gap: 8
});
```

#### item

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `label` | string | 显示文本 |
| `value` | any | 传给 action 的值（可选） |
| `checked` | boolean | 出现则使用 `menuitemradio` + 选中蓝 |
| `disabled` | boolean | 禁用 |
| `hint` | string | 行尾提示（默认样式弱化） |
| `separator` | true | 分隔线，忽略其他字段 |
| `action` | `(item) => void` | 点击回调；菜单先关闭 |

#### options

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `ariaLabel` | `'菜单'` | 菜单无障碍名称 |
| `className` | `''` | 追加到 `.hx-popup` |
| `align` | `'start'` | `start` / `center` / `end` |
| `gap` | `8` | 与锚点间距 |
| `margin` | `16` | 左右安全区 |
| `bottomMargin` | `12` | 底部安全区 |
| `haspopup` | `'menu'` | 写回锚点 `aria-haspopup` |
| `rowRole` | 自动 | 强制行角色 |
| `focus` | `true` | 打开后聚焦选中项/第一项 |
| `restoreFocus` | `true` | 关闭后焦点回到锚点 |
| `onOpen` | — | `(session) => void` |
| `onClose` | — | `() => void` |

#### session

```js
{
  menu, backdrop, anchor, options,
  close(opts?: { restoreFocus?: boolean }): Promise<void>
}
```

### `HxPopup.openPanel(anchor, content, options?)`

通用锚点浮层：

```js
HxPopup.openPanel(button, myPanelNode, {
  ariaLabel: '颜色设置',
  role: 'dialog',
  className: 'my-panel',
  align: 'end'
});
```

`content` 可以是 Node 或字符串（字符串作为 textContent）。面板不自动生成行，
需要自己处理键盘与焦点。

### `HxPopup.close(options?)`

关闭当前 popup。

```js
HxPopup.close({ restoreFocus: false });
```

返回 Promise；在 150ms 收起后 resolve。无当前 popup 时立即 resolve。

### `HxPopup.current`

当前 session 或 null。

### `HxPopup.motion`

- `HxPopup.motion.open(node)`：播放 740ms 展开，返回 Animation 或 null；
- `HxPopup.motion.close(node)`：播放 150ms 收起，返回 Promise。

通常不需要直接调用；`openMenu/openPanel` 已处理。

### 常量

- 展开 740ms；
- 收起 150ms；
- 菜单最小宽 152px；
- 行高 48px；
- 内边距 4px；
- 圆角 20px。

---

## 5. HxSurfaces

### `HxSurfaces.morph(node, fromRect, options?)`

单节点 FLIP 形变。调用者负责切换布局；本函数只提供临时 WAAPI 动画。

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `toRect` | `node.getBoundingClientRect()` | 目标矩形 |
| `direction` | `'open'` | `open` / `close` |
| `duration` | `460` | 时长 |
| `radiusFrom` | `'22px'` | 起始圆角 |
| `radiusTo` | `'29px'` | 结束圆角 |
| `fromOpacity` | `.55` | 打开起点 / 关闭终点透明度 |
| `toOpacity` | `1` | 打开终点 / 关闭起点透明度 |

返回 `Animation` 或 `null`（reduced motion / 尺寸为 0 / 异常）。关闭时动画使用
`fill:'forwards'`，完成后调用方应 `cancel()` 并把节点放回最终布局。

### `HxSurfaces.openModal(options?)`

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `content` | `''` | Node 或 HTML 字符串（可信） |
| `sheet` | `false` | 使用底部抽屉 |
| `ariaLabel` | `'对话框'` | 无障碍名称 |
| `className` | `''` | 追加到容器 |
| `width` | `''` | 覆盖宽度 |
| `role` | `'dialog'` | ARIA role |
| `closeOnBackdrop` | `true` | 点击遮罩关闭 |
| `restoreFocus` | `true` | 关闭后焦点回到前一元素 |
| `onOpen` / `onClose` | — | 生命周期回调 |

返回：

```js
{
  node,        // .hx-modal 或 .hx-sheet
  backdrop,
  close(): Promise<void>
}
```

行为：

- 自动设置 `role=dialog`、`aria-modal=true`；
- 自动插入抓取条（sheet）；
- 自动 `HxMaterial.prepare(box)`；
- Esc 关闭、Tab 焦点陷阱、遮罩点击；
- 进入 520/540ms，退出 220/240ms；
- 关闭幂等。

`content` 为字符串时使用 `innerHTML`，只传可信模板。

### `HxSurfaces.openSheet(options?)`

等价于 `openModal({ ...options, sheet: true })`。

---

## 6. CSS

### 6.1 类

| 类 | 用途 |
| --- | --- |
| `.hx-glass` | 光学宿主 |
| `.hx-glass__skin` | 运行时插入的皮肤（不要手写） |
| `.hx-light` | 指针追光 |
| `.hx-pressed` / `.hx-light-active` | 运行时按压状态 |
| `.hx-icon-button` | 42px 圆形按钮 |
| `.hx-floating-back` | 50px 返回按钮 |
| `.hx-search` | 50px / 25px 搜索框 |
| `.hx-nav` / `.hx-nav__item` | 导航 |
| `.hx-nav.is-compact` | 54px 圆球导航 |
| `.hx-dock` / `.hx-dock__*` | 播控栏 |
| `.hx-dock.is-compact` | 54px 合并栏 |
| `.hx-dock.is-detail` | 56px 详情栏 |
| `.hx-popup` | 锚点菜单/通用浮层 |
| `.hx-popup__row` / `.is-checked` / `.is-disabled` | 菜单行 |
| `.hx-popup__separator` / `__label` / `__hint` | 菜单结构 |
| `.hx-menu-backdrop` | 透明点击遮罩 |
| `.hx-modal-backdrop` / `.is-sheet` / `.is-closing` | 模态遮罩 |
| `.hx-modal` / `.hx-sheet` / `.hx-sheet__grip` | 模态/抽屉 |
| `.hx-window-surface` | 20px 窗口圆角层 |
| `.hx-drag-region` | 28px 可拖动区 |
| `.hx-caption` / `.hx-caption__close` | 标题栏按钮 |
| `.hx-splash` | 启动画面 |
| `body.hx-maximized` / `body.hx-fullscreen` | 去圆角状态 |

### 6.2 CSS 变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `--hx-bg` | `#08090b` | 窗口底色 |
| `--hx-text` / `--hx-muted` | `#f5f4f2` / `#9b9c9f` | 文本 |
| `--hx-accent` | `#f4d28a` | 强调色 |
| `--hx-selected` | `#5e9fff` | 菜单选中文字 |
| `--hx-selected-bg` | `rgba(49,122,247,.4)` | 菜单选中底 |
| `--hx-line` / `--hx-line-strong` | 白 10% / 20% | 分隔线 |
| `--hx-hairline` | `0.5px` | 物理像素发丝线（运行时按 DPR 写） |
| `--hx-window-radius` | `20px` | 窗口圆角 |
| `--hx-height-dock` / `--hx-radius-dock` | `56px` / `28px` | 播控栏 |
| `--hx-height-compact` / `--hx-radius-compact` | `54px` / `27px` | 合并栏 |
| `--hx-cover` / `--hx-cover-inner` | `44px` / `38px` | 封面 |
| `--hx-button` / `--hx-play` | `38px` / `40px` | 按钮 |
| `--hx-height-search` / `--hx-radius-search` | `50px` / `25px` | 搜索 |
| `--hx-popup-min-width` / `--hx-popup-row` | `152px` / `48px` | 菜单 |
| `--hx-radius-popup` | `20px` | 菜单圆角 |
| `--hx-radius-modal` / `--hx-radius-sheet` | `30px` / `32px` | 模态/抽屉 |
| `--hx-spring` | `cubic-bezier(.2,1.16,.3,1)` | dock/nav |
| `--hx-popup-open` / `--hx-popup-close` | `740ms` / `150ms` | 弹窗 |
| `--hx-modal-open` / `--hx-modal-close` | `520ms` / `220ms` | 模态 |
| `--hx-sheet-open` / `--hx-sheet-close` | `540ms` / `240ms` | 抽屉 |
| `--hx-search-morph` | `460ms` | 搜索 |
| `--hx-detail-hold` / `--hx-detail-close-hold` | `620ms` / `140ms` | 详情 |
| `--hx-font` | HarmonyOS Sans SC 栈 | 字体 |

### 6.3 z-index

| 元素 | z-index |
| --- | --- |
| 菜单遮罩 | 80 |
| 菜单/面板 | 81 |
| 模态遮罩 | 80 |
| 窗口按钮 | 90 |
| Toast | 100+ |
| 启动画面 | 120 |

---

## 7. 兼容性与限制

- 需要 Chromium 120+；`backdrop-filter: url(#filter)` 是核心依赖；
- 需要 CSP `img-src data:`（SVG 内的 `feImage`）；
- 不支持时只保留半透明底色，视觉验收不通过；
- `HxSurfaces.openModal` 的字符串内容走 `innerHTML`，必须可信；
- `HxPopup` 是单例，页面同时只会有一个 popup；
- reduced motion 下弹窗/搜索/弹簧不做动画，但状态、焦点和关闭逻辑不变；
- 所有尺寸以 CSS 像素计；DPR 只影响发丝线和纹理采样，不改变布局。
