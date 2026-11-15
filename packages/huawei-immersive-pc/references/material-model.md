# 材质模型：从圆角轮廓到实时折射

本文解释 `src/hx-material.js` 的数学、滤镜图和调参方法。目标不是让你“照着
数值抄”，而是让你理解每个参数在画面上对应什么，从而在新背景、新尺寸和新
DPR 下仍能判断哪里错了。

---

## 1. 为什么必须实时采样 backdrop

真机沉浸材质的核心不是一张固定玻璃贴图，而是：

1. 读取控件背后的真实画面；
2. 按控件轮廓产生局部位移；
3. 在边缘混入环境颜色；
4. 再叠加透色和饱和度。

PC 端用 Chromium 的 `backdrop-filter` 采样控件背后的合成结果。只要背景是
视频、Canvas、滚动列表或动态壁纸，折射内容就会同步变化。截图纹理无法做到
这一点，而且会在窗口移动、背景切换时露馅。

> 判定方法：把背景换成高对比动态网格。如果控件内部的网格不随背景移动，
> 而是像贴图一样固定，说明实现是伪造的。

---

## 2. 圆角矩形的有符号距离

设控件宽 `w`、高 `h`，四角半径分别为 `r0..r3`，像素相对中心为 `(px,py)`。
对每个像素：

```
qx = |px| - (w/2 - r)
qy = |py| - (h/2 - r)
ax = max(qx, 0)
ay = max(qy, 0)
len = hypot(ax, ay)
distance = r - (len + min(max(qx, qy), 0))
```

- `distance > 0`：在形状内部，距边界的距离；
- `distance = 0`：轮廓；
- `distance < 0`：外部。

外法线：

- 如果 `len > 0`（圆角区），`n = (ax/len * sign(px), ay/len * sign(py))`；
- 否则（直边区），沿较近的直边取 `sign(px)` 或 `sign(py)`。

这比“径向渐变”正确：直边法线平行于边法向，四角法线指向圆心外，胶囊两端
自然形成半圆。

---

## 3. 法线编码

法线贴图使用 RGBA 8 位：

```
R = 128 - nx * bend * 116 + tx / displacementScale * 255
G = 128 - ny * bend * 116 + ty / displacementScale * 255
B = clear * 255
A = 255
```

其中：

- `bend = exp(-max(0, distance) / decay)`：内部法线随距离衰减；
- `tx/ty`：肩部切向位移；
- `clear`：透明内圈/边缘 mask，1 表示靠近边缘，0 表示内部；
- `128` 是中性值，`116` 留出余量避免溢出。

滤镜里用 `feComponentTransfer` 把 128 映射到 0：

```
intercept = -1/510
```

这样 R/G 变成以 0 为中心的有符号向量，供 `feDisplacementMap` 使用。

### 为什么不用更高的位深

Canvas ImageData 是 8 位。增加 `mapDensity` 只会提高采样分辨率，不能消除
等值线台阶；最终采用 `resultSigma` 对**位移结果**做小半径模糊，既消除台阶，
又不模糊边缘高光。不要用降低法线强度来换平滑，那会牺牲折射。

---

## 4. 位移强度

```
displacementScale = min(amplitudeCap, h * amplitude)
```

- `amplitude = 4` 表示每 1 CSS px 高度最多产生 4 个位移单位；
- `amplitudeCap = 90` 防止大面板产生夸张扭曲；
- 位移图 R/G 的范围约 ±1，因此实际位移约为 `±displacementScale`。

调参直觉：

| 现象 | 调整 |
| --- | --- |
| 边缘像果冻/过度扭曲 | 降低 `amplitude` 或 `amplitudeCap` |
| 折射几乎看不见 | 提高 `amplitude`，先检查背景是否有细节 |
| 大面板中心也被扭曲 | 降低 `decay`，让法线更快衰减 |
| 胶囊直边太直 | 提高 `tangentGain` / `tangentDecay` |
| 胶囊肩部被拉断 | 降低 `tangentCap` |

---

## 5. 肩部位移

真机胶囊的上下直边不是完全水平，而是向中心轻微收缩。仅靠 SDF 法线无法
产生这种切向分量，因为直边法线垂直于边。

实现：

```
tx = -clamp(px * tangentGain, ±tangentCap)
     * (1 - |nx|)
     * clamp((w - 2r) / max(r,1), 0, 1)
     * exp(-max(0,distance) / tangentDecay)
```

- `(1 - |nx|)`：只在法线不纯水平的地方生效，避免圆形控件被拉歪；
- `(w - 2r)/r`：让胶囊越长效果越明显；正方形/圆形自动减弱；
- `exp(...)`：只影响边缘带，不污染中心文字；
- 结果同时写入法线 R/G 和环境采样 R/G。

验收时用水平网格背景，测量上下沿的相位曲线；参考实现最大误差 0.375 CSS px，
门禁 ≤ 0.75。文字背景没有稳定水平条纹，不能用于该项测量。

---

## 6. 环境边缘

“外层取色、透明内圈、内部畸变”是三个不同来源：

1. **内部折射**：`SourceGraphic` → `sigma` 模糊 → 法线位移；
2. **环境边缘**：`SourceGraphic` → `edgeSigma` 模糊 → 环境法线（较弱）位移；
3. **透明内圈**：法线图 B 通道经 `feColorMatrix` 生成 rim mask。

合成：

```
litRim = environment IN rimMask
inner  = refracted OUT rimMask
optical = inner + litRim
```

- `envWeight` 控制边缘层权重；
- `envStart/envWidth` 控制从轮廓向内多深开始变为透明；
- `envOffset` 控制环境采样是否带方向性偏移；
- `envLift/envSlope` 调整边缘亮度；
- `saturation` 在最后统一提高色彩浓度。

不要用同一张模糊图同时做中心和边缘，否则边缘会被中心内容“染色”，出现
乳白圈或脏边。

---

## 7. 完整滤镜图

```
lens (normal+mask)
  ├─ feComponentTransfer (R/G neutral) ──► vectors
  ├─ feColorMatrix (B → alpha) ──────────► rimMask

SourceGraphic
  ├─ feGaussianBlur(sigma) ──► diffuse
  │     └─ feDisplacementMap(vectors) ──► refracted
  │           └─ feGaussianBlur(resultSigma) ──► refractedSmooth
  ├─ feGaussianBlur(edgeSigma) ──► edgeDiffuse
  │     └─ feDisplacementMap(environment) ──► environment
  │           └─ feComponentTransfer(lift/slope) ──► lit

refractedSmooth OUT rimMask ──► inner
lit IN rimMask ──► litRim
inner + litRim ──► optical
optical → saturate → [popup tint over] → output
```

要点：

- `feImage` 使用 `preserveAspectRatio="none"`，贴图尺寸等于量化后的控件尺寸；
- filter 区域 `x=0 y=0 width=100% height=100%`，不裁掉边缘阴影；
- `color-interpolation-filters="sRGB"`，与浏览器合成保持一致；
- 不要把 `SourceGraphic` 换成已模糊的图再做边缘，否则边缘会被中心污染；
- popup 的 tint 必须在 saturate 之后、作为最后一个 `feComposite over`。

---

## 8. Profile 与透色

| profile | sigma | edgeSigma | alpha | color | 特殊 |
| --- | --- | --- | --- | --- | --- |
| control | 1.9 | 1.9 | .15 | 10,12,14 | 皮肤背景承担透色 |
| menu | 1.9 | 1.9 | .88 | 26,28,31 | 皮肤背景承担透色 |
| popup | 5 | 5 | .71 | 30,30,30 | 滤镜内部产生边缘更透的 tint |
| sheet | 4 | 1.9 | .88 | 26,28,31 | 皮肤背景承担透色 |

popup 的 tint 用 `environmentCanvas` 的 B 通道作为 mask：中心 alpha 高、边缘
alpha 低。这模拟系统菜单“中心可读、边缘透背景”的效果。不要简单给整个菜单
设置半透明背景，否则边缘和中心一样实，失去层次。

---

## 9. 运行时内部

### 9.1 测量

`measure(host)` 读取：

- `offsetWidth/offsetHeight`；
- 四边 `borderWidth`，用于把皮肤扩展到边框盒；
- 四个角半径，百分比转换为像素；
- `borderRadius` 字符串，用于皮肤视觉圆角；
- 材质类型（`data-hx-material` 或 class）。

### 9.2 刷新

`refresh(host, state)`：

1. 生成/取缓存 filter；
2. 计算 tint；
3. 生成签名（generation + filter id + inset + radius + tint）；
4. 签名未变则跳过所有写入；
5. 写皮肤 inset、圆角、背景、`--hx-lens`；
6. 写宿主 `--hx-lens` 和 `data-hx-material`。

### 9.3 批处理

`ResizeObserver` 只把宿主加入 `pending`，下一帧：

- 先对所有宿主调用 `measure`（纯读）；
- 再按 4ms 预算写皮肤；
- 剩余宿主留到下一帧。

禁止在循环中交替 `measure → write`，那会在窗口缩放时对每个控件强制布局。

### 9.4 缓存

key：

```
w(2px 量化) : h(2px 量化) : r0 : r1 : r2 : r3 : kind : JSON(profile)
```

默认上限 96；超过后删除未被任何 host 使用的项，至少保留 24 个。
resize 时只量化尺寸，不把每个中间像素都变成新 filter。

### 9.5 深度跳过

计算每个通道贡献的“归零深度”：

```
cutoff(decay, gain) = decay * ln(max(1, gain*8))
```

取所有贡献（法线、肩部、环境、tint）的最大值。超过该深度的像素直接写
中性值 `(128,128,0,255)`，因为任何贡献都小于 1/8 字节，8 位结果完全一致。
这不是降低精度，而是跳过不可能改变输出的运算。

---

## 10. 调参流程

### 10.1 准备

1. 固定设备与主题；
2. 准备网格背景与文字背景；
3. 同一背景拍“材质开/关/再开”；
4. 用关闭材质的图做 PC 背景，确保背景逐像素对齐；
5. 记录控件边界，误差 < 0.25 物理像素。

### 10.2 先几何，后光学

按顺序调：

1. **圆角/边界**：控件位置、半径、皮肤 inset；
2. **内部法线**：折射方向、强度、衰减；
3. **肩部**：胶囊上下沿相位；
4. **环境边缘**：外缘取色、透明圈、亮度；
5. **透色/饱和度**：中心可读性；
6. **平滑度**：等值线台阶。

不要用全局 MAE 单独判断。全局分数会掩盖边缘错误；必须同时看：

- 中心 MAE；
- 折射带 MAE；
- 外部阴影 MAE；
- 最外 1px outline MAE；
- SSIM；
- 球面 Laplacian 比例；
- 胶囊肩部相位。

### 10.3 过拟合警告

- 只对一张背景拟合，换背景就崩；
- 只对一种尺寸拟合，缩放后失真；
- 用降低 `resultSigma` 让 SSIM 变好，但球面出现层纹；
- 用增加 `alpha` 让 MAE 变好，但材质变得不透明；
- 用固定截图纹理让分数变好，但动态背景暴露。

至少使用网格 + 文字两类背景、多种尺寸和多个 profile。

---

## 11. 排错

### 11.1 控件完全透明

- 检查 `.hx-glass__skin` 是否存在；
- 检查 `--hx-lens` 是否设置为 `url(#hx-lens-N)`；
- 检查 filter defs 是否被 CSP 阻止（需要 `img-src data:`）；
- 检查宿主是否 `overflow: hidden` 裁掉了皮肤（皮肤 inset 为负边框）；
- 检查背景是否本身纯黑，导致折射不可见。

### 11.2 文字发虚/跟着动

- 宿主或父级被加了 `filter`；
- 皮肤被错误地放在内容之上；
- 变换了宿主而不是皮肤；
- `isolation` 缺失导致 z-index 失效。

### 11.3 边缘出现矩形硬边

- filter 区域小于皮肤尺寸；
- 皮肤没有覆盖边框盒；
- `feImage` 的宽高与量化后的尺寸不一致；
- 宿主 `border-radius` 与 skin 的 `border-radius` 不一致。

### 11.4 球面层纹

- 8 位位移场等值线；
- 先提高 `resultSigma`（0.5–1.0），不要先降 `mapDensity`；
- 如果仍明显，检查是否在位移后又叠加了锐化/对比度。

### 11.5 胶囊直边像尺子

- 缺少肩部切向场；
- `tangentGain` 太小；
- `tangentDecay` 太大，效果溢出中心；
- 背景没有水平条纹，肉眼难以判断——换网格背景。

### 11.6 缩放时卡顿

- 在 ResizeObserver 回调里同步 refresh 每个元素；
- 每帧重建 filter；
- 用 `getBoundingClientRect` 在 pointermove 中读布局；
- 皮肤 transform 触发了内容重排。

### 11.7 某些 GPU 上发灰/发白

- 多层模糊叠加；
- `backdrop-filter` 与父级 `filter` 同时存在；
- 软件光栅降级；
- 透明窗口的 alpha 预乘问题（检查 `backgroundColor: '#00000000'`）。

---

## 12. 最小正确实现清单

- [ ] 宿主透明、relative、isolate；
- [ ] 单个 skin，绝对定位覆盖边框盒；
- [ ] 法线图按尺寸/圆角缓存；
- [ ] `feDisplacementMap` 使用 R/G，环境边缘独立；
- [ ] B 通道作为 rim mask；
- [ ] `resultSigma` 去除台阶；
- [ ] 肩部切向场存在；
- [ ] popup 内部 tint，其他 profile 皮肤透色；
- [ ] 深度跳过不影响字节结果；
- [ ] ResizeObserver 批处理；
- [ ] 动态节点 prepare；
- [ ] 负对照（关闭折射）会被验收拒绝。
