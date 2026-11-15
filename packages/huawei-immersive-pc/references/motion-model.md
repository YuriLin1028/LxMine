# 动效模型：时序、弹簧与编排

本标准里的时间不是“看起来差不多”。弹窗展开曲线来自真机系统菜单录屏的
逐帧注册；其他时序来自 LxMine PC 端在真机上反复比对的稳定版本。本文给出
可直接复用的数值、实现方式和中断规则。

---

## 1. 动效设计原则

1. **先到位，再显影。** 播放详情的播控栏必须先到达目标位置，背景之后才从
   模糊中解析；不能两者同时运动。
2. **收起比展开快。** 展开允许过冲和长时间稳定，收起必须干净利落。
3. **原点来自触发器。** 锚点弹窗从触发器中点生长，不从自身左上角或屏幕中心。
4. **单节点连续。** 搜索球到搜索框是同一个节点；弹窗是同一个节点；不做双节点
   交叉淡入。
5. **可中断。** 关闭必须从当前 transform/opacity 继续，不能跳回起点。
6. **减少动态。** `prefers-reduced-motion` 下直接落位，不牺牲可用性。

---

## 2. 锚点弹窗：740ms 展开

### 2.1 帧表

列：`时间(ms), 缩放, 宽度相对 x, CSS px y, 透明度`。横向 x 会乘以菜单宽度，
再根据触发器中点在左半/右半决定方向；纵向 y 在向上翻转时取反。

```
0       0.20   0.00000   -8.0000   0.0000
24.576  0.38  -0.00286   -3.9871   0.1687
41.249  0.47  -0.00995   -1.9431   0.3793
57.922  0.57  -0.01291   -0.9337   0.5834
74.596  0.66  -0.01754   -0.5720   0.6950
91.269  0.74  -0.02138   -0.4374   0.7685
107.942 0.81  -0.02443   -0.5299   0.7830
124.615 0.87  -0.02916   -0.8496   0.7899
141.288 0.91  -0.03478   -0.3617   0.7899
157.962 0.95  -0.03793   -0.2944   0.8204
174.635 0.97  -0.04443    0.5804   0.8267
191.308 0.99  -0.04847    1.0346   0.8613
207.981 1.01  -0.04512    1.0683   0.8802
224.654 1.01  -0.04759    1.4889   0.9100
241.328 1.02  -0.04345    1.7160   0.9420
258.001 1.02  -0.04099    2.1366   0.9577
274.674 1.02  -0.03852    2.1366   0.9737
291.347 1.02  -0.03360    2.1366   0.9762
308.020 1.02  -0.02867    1.7160   0.9762
324.694 1.01  -0.03034    1.9094   0.9762
341.367 1.01  -0.02296    1.9094   0.9762
358.040 1.01  -0.02049    1.4889   0.9762
374.713 1.00  -0.01970    1.6823   0.9762
391.386 1.00  -0.01724    1.6823   0.9762
408.060 1.00  -0.01232    1.2617   0.9762
424.733 1.00  -0.00985    1.2617   0.9762
441.406 1.00  -0.00739    0.8412   0.9762
458.079 1.00  -0.00493    0.8412   0.9762
474.752 1.00  -0.00493    0.8412   0.9762
491.426 1.00  -0.00246    0.4206   0.9762
508.099 1.00  -0.00246    0.4206   0.9762
524.772 1.00  -0.00246    0.4206   0.9762
541.445 1.00   0.00000    0.4206   0.9762
558.119 1.00   0.00000    0.0000   0.9922
574.792 1.00   0.00000    0.0000   0.9922
591.465 1.00   0.00000    0.0000   0.9922
608.138 1.00   0.00000    0.0000   0.9922
624.811 1.00   0.00000    0.0000   0.9922
641.485 1.00   0.00000    0.0000   0.9922
658.158 1.00   0.00000    0.0000   0.9922
674.831 1.00   0.00000    0.0000   0.9922
691.504 1.00   0.00000    0.0000   0.9922
740.000 1.00   0.00000    0.0000   1.0000
```

实现用 `Element.animate(frames, {duration:740, easing:'linear', fill:'both'})`，
`offset = time / 740`。不要用 `ease-out` 近似：原生的中段过冲和后段长平台
是识别度的一部分。

### 2.2 方向

```js
const up = menu.classList.contains('is-above') ? -1 : 1;
const side = Number(menu.dataset.hxOriginX) < 0.5 ? -1 : 1;
transform = `translate(${x * menu.offsetWidth * side}px, ${y * up}px) scale(${scale})`;
```

- `x` 是宽度比例，必须乘菜单实际宽度；
- 纵向 y 是 CSS px；
- `is-above` 时 y 取反，视觉上从触发器向上展开；
- `transform-origin` 由锚点算法写入，通常是触发器中心，可能落在菜单外。

### 2.3 收起：150ms

```
0      1.00  1.00
16.67  0.98  0.94
33.33  0.92  0.80
50     0.86  0.60
66.67  0.79  0.35
83.33  0.73  0.13
100    0.69  0.03
150    0.60  0.00
```

关闭前读取当前矩阵：

```js
const computed = getComputedStyle(menu);
const matrix = new DOMMatrixReadOnly(computed.transform === 'none' ? undefined : computed.transform);
const scale = Math.hypot(matrix.a, matrix.b);
const opacity = Number(computed.opacity);
const x = matrix.e, y = matrix.f;
```

取消已有动画，然后从当前 scale/opacity 起动画。位移按进度线性回到 0：

```
translate(x * (1 - p), y * (1 - p)) scale(closeScale * currentScale)
```

### 2.4 为什么不能只用 CSS

- CSS `@keyframes` 不便于从中途读取当前相位；
- 关闭时如果重新从 scale(0) 开始，会跳变；
- 菜单宽度是动态的，x 必须按宽度计算；
- WAAPI 可以在 finished 后 cancel，避免 fill 长期占用。

---

## 3. 弹簧：dock / 导航 / 皮肤形变

皮肤弹簧：

```
v += (380 * (target - value) - 32 * v) * dt
value += v * dt
dt = clamp(dt, 0.001, 0.032)
```

- 刚度 380、阻尼 32，略欠阻尼，松手后有一次很小的回弹；
- 位移阈值 `0.00015`、速度阈值 `0.001` 后吸附；
- 仅在有活动状态时跑 rAF；
- 阻尼不要降到 20 以下，否则明显抖动；
- `reduced motion` 时直接设为目标值并清空 transform。

CSS 过渡（dock/nav）使用：

```css
--hx-spring: cubic-bezier(.2, 1.16, .3, 1);
transition: width .48s var(--hx-spring), height .35s var(--hx-spring);
```

注意：用于形变皮肤的弹簧是 JS 物理，不是 CSS cubic-bezier；两者不要混用。

---

## 4. 模态与抽屉

| 属性 | 模态 | 抽屉 |
| --- | --- | --- |
| 进入 | 520ms `cubic-bezier(.17,1.3,.27,1)` | 540ms `cubic-bezier(.16,1.28,.27,1)` |
| 退出 | 220ms `cubic-bezier(.4,0,1,1)` | 240ms `cubic-bezier(.4,0,1,1)` |
| 起始 | `translateY(24px) scale(.9)`，blur 2px | `translateY(92px) scale(.985)` |
| 结束 | 正常 | 正常 |
| 遮罩 | 240ms fade | 240ms fade |
| 圆角 | 30px | 顶部 32px，底部 0 |

- 模态 `transform-origin: 50% 64%`，从略低于中心处长出；
- 抽屉必须贴底，抓取条 38×4px、距顶 10px；
- 退出时给 backdrop 加 `is-closing`，由 CSS 统一驱动；
- JS 的移除定时器必须 ≥ 退出时长（220/240ms），不能提前移除。

---

## 5. 搜索形变

```js
const from = node.getBoundingClientRect();
// 切换布局（同一个 node 移到 overlay / 从 overlay 移回 slot）
const to = node.getBoundingClientRect();
const dx = from.left - to.left;
const dy = from.top - to.top;
const sx = clamp(from.width / to.width, .05, 1);
const sy = clamp(from.height / to.height, .05, 1);
node.animate([
  { transformOrigin: 'top left', transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, borderRadius: '25px', opacity: .9 },
  { transformOrigin: 'top left', transform: 'none', borderRadius: '29px', opacity: 1 }
], { duration: 460, easing: 'cubic-bezier(.22,1.08,.32,1)' });
```

关闭方向：

- 起点 `transform: none`、圆角 29px；
- 终点 `translate(dx,dy) scale(sx,sy)`、圆角 25px；
- 使用 `cubic-bezier(.4,0,.6,1)`，`fill: 'forwards'`；
- 结束后取消动画并把节点放回原布局。

关键点：

- 只使用一个节点；
- 目标矩形必须在布局切换后测量；
- `transform-origin: top left` 保证文本/输入框不因中心缩放而漂移；
- 起始矩形的宽高为 0 时不播放动画，避免 `scale(Infinity)`。

---

## 6. 播放详情编排

### 6.1 进入

```
t=0     点击封面/标题；dock 开始移动到详情位置
t=0     detail-entering 类；背景保持 blur(16px) saturate(1.16)
t=620   移除 detail-entering；背景过渡到清晰（约 700ms）
```

- 详情内容可以随 dock 一起进入，但背景显影必须晚于播控到位；
- 不要用同一个 0ms 过渡同时做 dock 位移和背景去模糊；
- 如果从搜索进入，关闭搜索 overlay 后再打开详情，避免两个 z-index 层叠加。

### 6.2 退出

```
t=0     点击返回
t=0     detail-entering 移除；详情内容开始退出
t=140   加 detail-leaving；背景开始淡出
t=620   移除 detail-leaving；恢复底层 tab/搜索和导航
```

- 140ms 的保持是“顿一下”的来源；不要省略；
- 退出总时长 620ms，与进入的背景显影时长对称；
- 返回来源：从搜索进入则恢复搜索，否则恢复来源 tab；
- 退出过程中按 Escape 不应重复触发关闭。

### 6.3 窄窗口详情

- 详情 dock 高 56px，不因窗口窄而缩小；
- 封面 44/38px，按钮 38px，播放 40px；
- 7 个控制：喜欢、上一首、播放、下一首、模式、下载、队列；
- 容器宽度不足时用 container query 收起部分控制到“更多”，但详情主行不得
  变成 5 键布局；
- 时间轴在播控上方，随 dock 一起到位。

---

## 7. 视图切换

- 旧内容 125ms 淡出并轻微位移（±7px）；
- 渲染新内容后，320ms 淡入 + 380ms spring 位移；
- 切换 token 防止快速连续点击时旧回调覆盖新视图；
- 滚动位置按视图 key 恢复，在 0/90/260ms 三次校正，抵消图片加载导致的
  高度变化；
- 不在切换期间重建整个材质树；只让 ResizeObserver 自然刷新。

---

## 8. 追光与按压

- hover 进入 250ms，按下 80ms；
- 按下同时把皮肤压到 `scale(.997,.967)`；
- 拖动时皮肤跟随指针位移，但最大 2.5px（x）/1.75px（y）；
- 释放弹簧回弹；
- 文本不参与任何 transform；
- 离开、失焦、页面隐藏必须清坐标与按压类；
- 不为追光单独开 rAF；只在 pointermove 写 CSS 变量。

---

## 9. 减少动态

```css
@media (prefers-reduced-motion: reduce) {
  .hx-glass__skin { transform: none !important; }
  .hx-modal, .hx-sheet, .hx-modal-backdrop { animation-duration: .01ms !important; }
}
```

JS：

- `motionOpen` 返回 null；
- `motionClose` 直接 resolve；
- 菜单直接显示，不播放 740ms；
- 搜索 morph 返回 null，布局立即切换；
- 详情仍保留 620ms 的背景状态切换？可以缩短为 0，但不能让播控与背景同时
  瞬移；至少保留一帧顺序，避免闪烁。

---

## 10. 测量方法

1. 使用真实合成窗口（非隐藏、非最小化），关闭后台节流；
2. 每项场景独立进程、隔离用户目录；
3. 预热：先完成一轮打开/关闭/滚动，再采样；
4. 用 `requestAnimationFrame` 记录帧间隔，计算 P95 / max；
5. 用 `PerformanceObserver('longtask')` 记录 >50ms 任务；
6. 场景之间保留冷却（参考实现 20s），避免 GPU/合成器异步销毁造成假尖峰；
7. 固定相位截图不能替代实时帧预算；两者都做；
8. 打包后对实际 exe 再测一次。

参考阈值：P95 < 33.5ms，max < 50ms，长任务 0。若失败，先看 trace 中的
Layout / Paint / Composite，再决定是否改材质；不要通过降低测试分辨率或
隐藏窗口来“通过”。

---

## 11. 反模式

- 用 `transition: all .3s` 代替明确的属性列表；
- 弹窗从 `scale(0)` 开始，第一帧完全不可见；
- 关闭时重新创建节点，导致无法读取当前相位；
- 菜单展开时同时改变宽度/高度，触发大量布局；
- 搜索用两个节点交叉淡入；
- 详情页 dock 和背景同时过渡；
- 在 pointermove 中调用 `getBoundingClientRect`；
- 用 `setInterval` 驱动弹簧；
- 动画结束后不取消 fill，长期占用合成层；
- 忽略 `prefers-reduced-motion`。
