# 锚点弹窗模型：几何、材质、交互与键盘

本文件聚焦“点击一个按钮后，从它旁边长出来的菜单”。这是 PC 端最容易做错、
也最影响“像不像手机”的组件。

标准实现：`src/hx-popup.js` + `.hx-popup` 样式。示例：`examples/index.html`
中的音质菜单与 dock “更多”菜单。

---

## 1. 视觉规格

| 属性 | 值 |
| --- | --- |
| 最小宽度 | 152px |
| 宽度 | `max-content`，最大 `min(340px, 100vw - 24px)` |
| 最大高度 | `min(680px, (100vh - 72px) × .8)` |
| 内边距 | 4px |
| 圆角 | 20px |
| 行高 | 最小 48px |
| 行内边距 | 10px 12px |
| 行圆角 | 16px |
| 字号 | 16px |
| 行间距 | 0；行间发丝线 |
| 选中文字 | `#5E9FFF` |
| 选中背景 | `rgba(49,122,247,.4)` |
| 遮罩 | 透明（仅捕获外部点击） |
| 材质 | popup profile：sigma 5 / edgeSigma 5 / alpha .71 |
| 阴影 | 极轻，`0 8px 24px rgba(0,0,0,.08)`，不要大投影 |

### 不要做的事

- 不要加标题（“选择音质”之类）；
- 不要加勾选图标；
- 不要加每行右侧的当前值；
- 不要使用全屏暗幕；
- 不要用大圆角 24/28px；原生是 20px；
- 不要让选中行和 hover 行使用同一个灰色；
- 不要在菜单内部再加一层玻璃。

---

## 2. DOM 结构

```html
<div class="hx-menu-backdrop"></div>

<div class="hx-popup hx-glass"
     data-hx-material="popup"
     role="menu"
     aria-label="选择音质"
     tabindex="-1"
     id="hx-popup-3"
     style="top: 320px; left: 640px; transform-origin: 48px -12px">
  <div class="hx-popup__row is-checked"
       role="menuitemradio"
       aria-checked="true"
       tabindex="-1">
    <span class="hx-popup__label">高品质 320k</span>
  </div>
  <div class="hx-popup__row"
       role="menuitemradio"
       aria-checked="false"
       tabindex="-1">
    <span class="hx-popup__label">无损 FLAC</span>
  </div>
</div>
```

`HxPopup.openMenu` 会自动生成这些；如果你手写，请保持：

- 遮罩在菜单之前；
- 菜单 `position: fixed`；
- 皮肤由运行时插入，不要手写 `<span class="hx-glass__skin">`；
- `data-hx-material="popup"` 确保使用正确的材质 profile。

---

## 3. 定位算法

```js
const rect = anchor.getBoundingClientRect();
const width = menu.offsetWidth;
const height = menu.offsetHeight;
const gap = 8;
const margin = 16;
const bottomMargin = 12;

let above = false;
let top = rect.bottom + gap;
if (top + height > innerHeight - bottomMargin) {
  above = true;
  top = Math.max(12, rect.top - gap - height);
}

let left = rect.left;
// 可选 align: start / center / end
left = clamp(left, margin, innerWidth - margin - width);

const originX = rect.left + rect.width / 2 - left;
const originY = rect.top + rect.height / 2 - top;
menu.style.top = top + 'px';
menu.style.left = left + 'px';
menu.style.transformOrigin = `${originX}px ${originY}px`;
menu.dataset.hxOriginX = String(originX / width);
```

### 3.1 为什么 origin 可能不在菜单内

- 向下展开时，触发器中心在菜单上方，`originY` 为负；
- 向上展开时，触发器中心在菜单下方，`originY > height`；
- 横向靠右时，`originX` 可能接近或超过宽度。

这是正确的：菜单从触发器所在方向“长出来”，而不是从自己的几何中心缩放。

### 3.2 翻转判定

- 先尝试下方；
- 下方放不下且上方有空间 → 上方；
- 上方也放不下 → 仍然选择空间更大的一侧，并依赖 `max-height` 滚动；
- 不要因为“下方看起来更好”而强制下方，否则靠近窗口底部的菜单会被截断。

### 3.3 安全区

- 左右至少 16px；
- 底部至少 12px；
- 顶部至少 12px；
- 手机比例下可用 `calc(100vw - 32px)`，但要保留 16px 边距。

### 3.4 滚动与缩放

- 打开后用户滚动页面 → 关闭菜单（原生行为）；
- 菜单自身滚动 → 不关闭；
- 窗口 resize → 关闭菜单；
- 窗口失焦 → 关闭菜单；
- 不要尝试在滚动时实时跟随锚点，容易抖动且与原生不一致。

---

## 4. 展开 / 收起

### 4.1 展开

- 740ms；
- 关键帧见 `motion-model.md`；
- 打开前 `visibility: hidden`，定位和材质准备完成后设为可见；
- `HxMaterial.prepare(menu)` 必须在可见前调用，避免首帧透明；
- 播放开始后不要再次测量宽度，否则会触发布局。

### 4.2 收起

- 150ms；
- 从当前矩阵读取 scale/opacity；
- 取消旧动画；
- 动画完成后移除菜单和遮罩；
- 关闭期间重复调用 `close()` 必须幂等。

### 4.3 中途关闭

用户可以在 740ms 展开途中点击外部。此时：

1. 读取当前 transform 和 opacity；
2. 取消展开动画；
3. 从当前值向 0.6/0 收起；
4. 不允许先把 opacity 跳到 1 再收。

---

## 5. 行状态

### 5.1 选中

- `is-checked`；
- `aria-checked="true"`；
- 文字蓝、背景蓝；
- 不显示图标。

### 5.2 hover

- `rgba(255,255,255,.09)`；
- 不与选中蓝混用；
- 键盘焦点使用 `:focus-visible`，不要仅靠 hover 表达焦点。

### 5.3 禁用

- `aria-disabled="true"`；
- 不响应 click；
- 不进入方向键序列；
- 透明度 0.4；
- hover 不变色。

### 5.4 分隔线

- 只有两个相邻的**非选中**行之间才画；
- 高度为一个物理像素；
- 左右各缩进 12px；
- 选中行前后不画线，避免视觉断裂。

---

## 6. 键盘与焦点

### 6.1 打开时

- 焦点进入当前选中项；没有选中项则进入第一个可用项；
- 触发按钮设置 `aria-expanded="true"`、`aria-haspopup="menu"`、
  `aria-controls="<menu id>"`；
- 菜单 `role="menu"`，行 `role="menuitemradio"` 或 `menuitem`；
- 行 `tabindex="-1"`，由脚本移动焦点（roving tabindex）。

### 6.2 键盘映射

| 键 | 行为 |
| --- | --- |
| ↑ / ↓ | 在可用项之间循环 |
| Home / End | 第一项 / 最后一项 |
| Enter / Space | 激活当前项 |
| Tab | 关闭菜单，焦点回到触发器（不穿透到后方页面） |
| Escape | 关闭菜单，焦点回到触发器 |

### 6.3 关闭后

- 通过 Escape/遮罩/Tab 关闭：焦点回到触发器；
- 通过选择项关闭：先触发 action，再把焦点还给触发器是合理默认；
- 如果 action 打开了新窗口/新菜单，不要强行把焦点拉回旧触发器；
- 触发器被移除时跳过 focus。

### 6.4 屏幕阅读器

- 菜单有 `aria-label`；
- 选中项有 `aria-checked`；
- 禁用项有 `aria-disabled`；
- 不在菜单打开时把背景内容设为 `aria-hidden`（菜单不是模态）；
- 如果菜单覆盖了关键内容，可以提供 `aria-modal` 的 panel 变体，但普通菜单不要。

---

## 7. 关闭规则

必须关闭：

1. 点击遮罩；
2. Escape；
3. 选择可用项（先关闭，再 action）；
4. 窗口 resize；
5. 页面滚动（菜单内部滚动除外）；
6. 窗口失焦；
7. 打开另一个 popup。

不关闭：

- 点击菜单内部空白；
- 菜单内部滚动；
- 鼠标移出菜单（原生菜单不会因 hover 离开而关闭）。

### 7.1 为什么先关闭再 action

如果 action 打开模态/新页面，菜单还停留在 z-index 81，会盖住新界面；
如果 action 触发路由卸载，菜单节点可能变成孤儿。先 `close()`，再执行
回调，保证层级和生命周期干净。

---

## 8. 材质

- profile `popup`；
- sigma 5、edgeSigma 5；
- alpha .71、color `[30,30,30]`；
- tint 在滤镜内部产生：中心更实、边缘更透；
- 皮肤背景必须透明；
- 菜单宿主不要再加 `backdrop-filter`；
- 菜单行本身不要加玻璃，否则会在菜单内部再采一次背景，出现“框中框”。

阴影保持轻：`0 8px 24px rgba(0,0,0,.08)`。原生系统菜单几乎不靠大投影
建立层级，而靠背景透色和边缘高光。

---

## 9. 尺寸细节

### 9.1 为什么用 `paddingBlock: calc(4px - borderWidth)`

Chromium 会把 0.5px 边框舍入到物理像素。如果边框 0.5px + padding 4px，
三行 48px 的菜单总高可能变成 153/154px，与基准的 152px 不一致。

处理：

```js
const borderTop = parseFloat(getComputedStyle(menu).borderTopWidth) || 0;
const padding = parseFloat(getComputedStyle(menu).paddingTop);
menu.style.paddingBlock = `calc(${padding}px - ${borderTop}px)`;
```

这样边框 + padding 的每边总占用保持 4px，三行 48px + 上下 4px = 152px。

### 9.2 最大宽度与省略

- 标签 `white-space: nowrap`；
- `overflow: hidden; text-overflow: ellipsis`；
- 菜单 `max-width: min(340px, calc(100vw - 24px))`；
- 不要为了塞下长文本把行高撑成两行；原生菜单是单行。

### 9.3 高 DPI

- 发丝线用 `1 / devicePixelRatio`；
- 0.5px 边框在 DPR 2 下是 1 物理像素，在 DPR 1 下可能被舍入；
- 125%/150% 缩放下检查菜单高度是否仍为 152/200px 等整数目标。

---

## 10. 通用 Panel

`HxPopup.openPanel(anchor, content, options)` 用于需要自定义内容的浮层：

- 同样从锚点定位/翻转；
- 默认 `role="dialog"`；
- 不自动生成行/键盘导航；
- 内部按钮需要自己处理焦点；
- 适合“小设置面板”“颜色选择器”，不适合长表单（用模态）。

---

## 11. 测试清单

- [ ] 菜单宽度 ≥152，三行高度 =152；
- [ ] 行高 ≥48；
- [ ] 选中行颜色 `rgb(94,159,255)`，背景 `rgba(49,122,247,.4)`；
- [ ] 无勾选图标、无标题；
- [ ] 顶部锚点向下展开；
- [ ] 底部锚点向上翻转，且不超出视口；
- [ ] 左右锚点不超出 16px 安全区；
- [ ] 打开后焦点在选中项；
- [ ] ↑/↓/Home/End/Enter/Escape/Tab 正常；
- [ ] 点击外部关闭；
- [ ] 滚动关闭，菜单内部滚动不关闭；
- [ ] 展开中途关闭不跳变；
- [ ] 关闭后节点和遮罩都移除；
- [ ] 菜单材质与背景实时变化；
- [ ] DP1/1.25/1.5/2 下高度和发丝线正确。
