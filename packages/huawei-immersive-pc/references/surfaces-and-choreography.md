# 浮层与页面编排：模态、抽屉、搜索、详情、dock

本文覆盖“除了锚点菜单之外”的界面运动：模态、底部抽屉、搜索形变、播放详情
分层时序、dock/导航的宽窄布局切换，以及视图切换和状态清理。

实现：`src/hx-surfaces.js`、`src/hx-immersive.css`、`examples/demo.js`。

---

## 1. 模态

### 1.1 结构

```html
<div class="hx-modal-backdrop">
  <div class="hx-modal hx-glass" data-hx-material="sheet"
       role="dialog" aria-modal="true" aria-label="新建歌单">
    <h2>新建歌单</h2>
    <p>…</p>
    <button class="hx-glass hx-light">取消</button>
    <button class="hx-glass hx-light">创建</button>
  </div>
</div>
```

- 遮罩 `fixed inset:0`，z-index 80；
- 模态宽 `min(560px, 100vw - 80px)`；
- 最大高 76vh，内部滚动；
- 圆角 30px，内边距 26px；
- 进入 520ms，退出 220ms；
- 遮罩 `rgba(3,4,6,.38)` + `blur(16px) saturate(1.12)`；
- 模态自身使用 sheet profile 的暗色材质，不要再用第二层玻璃。

### 1.2 生命周期

```
openModal()
  ├─ 创建 backdrop + box
  ├─ append 到 body
  ├─ HxMaterial.prepare(box)
  ├─ 绑定 Esc / Tab / 遮罩点击
  ├─ focus 第一个可操作元素
  └─ 返回 { node, close }

close()
  ├─ 幂等
  ├─ 移除监听
  ├─ backdrop.classList.add('is-closing')
  ├─ 220ms 后移除 DOM
  └─ 焦点回到打开前的元素
```

### 1.3 焦点陷阱

- `Tab` / `Shift+Tab` 在模态内循环；
- 没有可聚焦元素时聚焦模态容器本身；
- 点击遮罩关闭是可选的，但必须可配置（`closeOnBackdrop`）；
- Escape 关闭时必须 `stopPropagation`，避免继续关闭后方详情页；
- 关闭动画期间不能重复触发关闭。

### 1.4 内容安全

`openModal` 接受字符串时会使用 `innerHTML`。只传可信模板；用户生成内容必须
先转义或传 DOM 节点。不要把网络返回的 HTML 直接插入。

---

## 2. 底部抽屉

- `.hx-modal-backdrop.is-sheet` 使用 `align-items:flex-end`；
- `.hx-sheet` 宽 `min(600px, 100vw - 32px)`，最大高 66vh；
- 顶部圆角 32px，底部 0；
- 抓取条 38×4px，距顶 10px，圆角 2px；
- 进入 540ms，退出 240ms；
- 内容 padding-top 30px，给抓取条留空间；
- 抽屉贴住窗口底边，不能悬空。

抽屉适合播放队列、多选操作、短列表。长表单/需要稳定焦点的内容用模态。

---

## 3. 搜索形变

### 3.1 结构

搜索球和搜索框必须是**同一个节点**：

```html
<div id="search" class="hx-search hx-glass hx-light" role="search">
  <svg>…</svg>
  <input aria-label="搜索">
</div>
```

关闭态放在入口 slot 中，宽度 360–430px；打开态移动到全屏搜索层顶部，
宽度 720px 上限。

### 3.2 打开

1. 记录 `from = node.getBoundingClientRect()`；
2. 显示搜索层，把节点移入 `search-overlay-host`；
3. 加上打开态 class，强制一次布局；
4. 记录 `to = node.getBoundingClientRect()`；
5. `HxSurfaces.morph(node, from, { toRect: to, radiusFrom:'25px', radiusTo:'29px' })`；
6. 焦点进入输入框；
7. 结果列表延迟 80ms 淡入，不要与几何形变同一瞬间。

### 3.3 关闭

1. 记录 `from = node.getBoundingClientRect()`；
2. 记录 slot 的 `to` 矩形；
3. 反向 morph（起点 `transform:none`，终点 translate/scale）；
4. 搜索层淡出；
5. 动画完成后把节点放回 slot，清除打开态 class，取消动画；
6. 清空输入值（可选）并归还焦点。

### 3.4 常见错误

- 用两个节点（球 + 框）交叉淡入；
- 先隐藏球再测量，得到 0×0；
- 用 `transform-origin: center`，文字在缩放时漂移；
- 打开态宽度变了但 skin 没有重新测量——ResizeObserver 会处理，但必须在首帧
  前调用 `HxMaterial.prepare` 或让布局先稳定；
- 关闭时直接 `display:none`，没有反向形变。

---

## 4. 播放详情

### 4.1 进入

- 点击封面、标题或详情按钮；
- 立即把 dock 移动到详情位置（宽屏居中/窄屏全宽）；
- 显示详情层，但背景保持暗化/模糊；
- 620ms 后移除 `detail-entering`，背景开始显影；
- 时间轴、歌词等详情内容可以在 dock 到位后依次进入；
- 不要在 0ms 同时做背景去模糊和 dock 位移。

状态建议：

```html
<body class="detail-open detail-entering">
```

```css
body.detail-entering #page-veil { opacity: 1; backdrop-filter: blur(16px); }
body.detail-open #page-veil { opacity: 0; backdrop-filter: blur(0); transition: ...; }
```

### 4.2 退出

- 140ms 保持：先让详情内容停住；
- 加 `detail-leaving`，背景先淡出；
- 620ms 后移除详情层，恢复底层 tab/搜索；
- dock 回到原位；
- 清除所有计时器，防止快速开关时旧 timer 把新状态关掉。

### 4.3 窄窗口

- 详情 dock 高 56px，封面 44/38，按钮 38，播放 40；
- 7 个控制全部显示；
- 宽度不足时用 container query 把部分控制收进“更多”，但详情主行不能退化为
  5 键紧凑布局；
- 导航在详情页隐藏；
- 如果从搜索进入详情，退出时回到搜索，而不是主页。

### 4.4 背景层

- stage（视频/Canvas/封面模糊）在详情页继续运行；
- 不要在详情打开时销毁 stage；
- 切换歌曲时先解码封面再替换背景，避免透明帧；
- 视频层与封面层之间用 opacity 过渡，不使用 display 切换。

---

## 5. dock / 导航

### 5.1 宽屏

- dock 56px 高、28px 圆角；
- nav 56px 高、28px 圆角；
- 两者底边对齐；
- dock 内边距 `0 14px 0 6px`；
- 封面左移，视觉重心居中。

### 5.2 窄窗口两栏

- dock 44px / 22px 圆角；
- nav 56px / 28px 圆角；
- 同宽、间距 4px；
- 封面 32/26，按钮 28，播放 32；
- 只保留 5 个主控制，其余进“更多”。

### 5.3 合并单行

- nav 收为 54px 圆球；
- dock 54px / 27px；
- 封面仍是 44/38，不因栏体变矮而缩小；
- 播控只留喜欢、上一首、播放、下一首、更多；
- 点击当前 tab 的球可以重新展开为两栏。

### 5.4 详情

- 恢复 56px / 28px；
- 封面 44/38，按钮 38，播放 40；
- 7 键；
- 导航隐藏；
- dock 居中/全宽，时间轴在上方。

### 5.5 过渡

- 高度/宽度/圆角使用 460ms spring；
- 内容切换用 380ms 的 `dockSwap`（上移 7px + 淡入）；
- 不同时改变字体大小、内边距和按钮数量，否则会出现“跳一下”；
- 先用 CSS class 切换布局，再让 ResizeObserver 更新光学皮肤；
- 皮肤形变与布局过渡分离：不要给 dock 宿主加 transform。

---

## 6. 视图切换

- 旧内容 125ms 淡出 ±7px；
- 新内容 320ms 淡入 + 380ms 位移；
- 用 token 防止快速切换时旧回调覆盖新视图；
- 切换后恢复滚动位置（0/90/260ms 三次）；
- 切换时不要销毁材质 defs；动态节点由 MutationObserver 处理；
- 页面级 `view-in` 动画不要嵌套在已经有 transform 的父级里。

---

## 7. Toast

- 固定底部 112–122px；
- 深色 92% 背景、1px 边框、14–16px 圆角；
- 220ms 进入，2400ms 后自动消失；
- `role="status"`，不抢焦点；
- 同一条 Toast 重用时重置计时器，不叠加多个 DOM。

Toast 不需要玻璃材质：它面积小、出现频繁，材质会增加无谓的合成开销。

---

## 7.1 评论 / 二级浮层

评论页是“覆盖在详情之上的二级浮层”，不是锚点弹窗：

- 进入 440ms spring，退出 300ms fade；
- 背景 `rgba(8,9,11,.72)` + `backdrop-filter: blur(30px) saturate(1.2)`；
- 内边距 `42px 40px 40px`，圆角跟随窗口（普通 20px，最大化/全屏 0）；
- 左上返回按钮 50px 圆形，`hx-glass hx-light`，指针离开复位；
- 层级高于详情，低于窗口按钮；
- Escape 只关闭评论，不关闭下方详情；关闭评论后焦点回到评论入口；
- 评论列表滚动时不让材质重新测量每个列表项（列表项不是玻璃）；
- 输入框/发送按钮使用普通控件，不放进光学滤镜层。

“二级浮层”的通用规则：**先判断最上层**（菜单 → 模态 → 抽屉 → 评论 →
详情 → 搜索 → 页面），Escape 只处理最上层，关闭后恢复上一层状态和滚动位置。

---

## 8. 状态清理清单

页面/浮层切换时逐项检查：

- [ ] 所有 setTimeout/setInterval 已清理；
- [ ] `detail-entering` / `detail-leaving` 不会同时存在；
- [ ] 搜索节点回到 slot，宽度 class 已移除；
- [ ] 菜单遮罩已移除；
- [ ] 模态焦点已归还；
- [ ] 指针按压类已清除；
- [ ] `--hx-mx/--hx-my` 已复位；
- [ ] 隐藏的 iframe/Canvas 已暂停；
- [ ] Escape 只关闭最上层；
- [ ] 返回来源正确（搜索 → 搜索，tab → tab）。
