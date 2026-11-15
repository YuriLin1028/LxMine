# Windows / Electron 集成：无边框、透明、圆角、最大化

沉浸光感的视觉前提是“窗口本身没有系统标题栏和方角”。这一层如果做错，
后面材质再准也会露馅。本文给出经过 LxMine PC 实际打包验证的配置和常见坑。

---

## 1. BrowserWindow 基线

```js
const { BrowserWindow, screen } = require('electron');
const path = require('node:path');

const win = new BrowserWindow({
  width: 1180,
  height: 760,
  minWidth: 420,
  minHeight: 520,
  show: false,
  frame: false,
  fullscreen: false,
  resizable: true,
  transparent: true,
  backgroundColor: '#00000000',
  hasShadow: true,
  autoHideMenuBar: true,
  title: 'YourApp',
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    backgroundThrottling: true
  }
});

win.once('ready-to-show', () => win.show());
```

### 关键点

- `frame: false`：移除系统标题栏；
- `transparent: true` + `backgroundColor: '#00000000'`：允许页面圆角外透明；
- `hasShadow: true`：保留系统窗口阴影；如果阴影出现方角，可尝试关闭并让页面
  自己画阴影；
- `show: false` + `ready-to-show`：避免启动白闪；
- `backgroundThrottling: true`：生产环境省电；动效验收时显式关闭；
- `sandbox`：如果 preload 需要 Node API 而无法开启，至少保持
  `contextIsolation: true`、`nodeIntegration: false`。

> 透明窗口在不同 Windows 版本/GPU 驱动上行为略有差异。125%/150% 缩放、
> Win10/Win11、深浅主题都要实测。不要只在一台开发机上验收。

---

## 2. 页面结构

```html
<body>
  <div class="hx-window-surface"></div>       <!-- 圆角 + 背景 -->
  <div class="hx-drag-region"></div>           <!-- 可拖动标题带 -->
  <header class="hx-caption">
    <button data-action="fullscreen">…</button>
    <button data-action="minimize">…</button>
    <button data-action="maximize">…</button>
    <button class="hx-caption__close" data-action="close">…</button>
  </header>
  <main>…</main>
</body>
```

```css
.hx-window-surface {
  position: fixed;
  inset: 0;
  border-radius: 20px;
  overflow: hidden;
  background: #08090b;
}
.hx-drag-region {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 28px;
  z-index: 88;
  -webkit-app-region: drag;
}
.hx-caption {
  position: fixed;
  top: 0; right: 0;
  z-index: 90;
  display: flex;
  height: 34px;
  -webkit-app-region: no-drag;
}
.hx-caption button {
  width: 46px; height: 34px;
  border: 0; background: transparent;
  -webkit-app-region: no-drag;
}
```

注意：

- 拖动区不能覆盖可点击控件；如果页面顶部有搜索/按钮，把拖动区限制在
  `height: 28px` 的空白带；
- 窗口按钮必须 `no-drag`；
- 页面主体要留出顶部 34px 的安全区，避免内容被按钮压住；
- `overflow: hidden` 放在 `.hx-window-surface`，不要放在 `body`，否则 fixed
  浮层会被裁切。

---

## 3. 最大化、全屏、还原

### 3.1 普通最大化

必须使用 Windows 工作区，保留任务栏：

```js
ipcMain.handle('window-toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isFullScreen()) {
    win.setFullScreen(false);
  } else if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize(); // Windows 自动使用 workArea
  }
});
```

如果使用 `setBounds` 自定义最大化（例如需要动画），必须取：

```js
const display = screen.getDisplayMatching(win.getBounds());
const area = display.workArea; // 不含任务栏
win.setBounds(area, false);
```

**禁止**用 `display.bounds` 做普通最大化；那会盖住任务栏。

### 3.2 全屏

全屏是独立按钮，使用完整 display：

```js
const display = screen.getDisplayMatching(win.getBounds());
win.setBounds(display.bounds, false);
win.setFullScreen(true);
```

全屏与最大化不能共用一个按钮，否则用户无法区分“保留任务栏最大化”和
“真全屏”。

### 3.3 圆角状态

```js
win.on('maximize', () => win.webContents.send('window-state', { maximized: true }));
win.on('unmaximize', () => win.webContents.send('window-state', { maximized: false }));
win.on('enter-full-screen', () => win.webContents.send('window-state', { fullscreen: true }));
win.on('leave-full-screen', () => win.webContents.send('window-state', { fullscreen: false }));
```

前端：

```js
document.body.classList.toggle('hx-maximized', state.maximized);
document.body.classList.toggle('hx-fullscreen', state.fullscreen);
```

```css
body.hx-maximized .hx-window-surface,
body.hx-maximized .hx-caption,
body.hx-fullscreen .hx-window-surface,
body.hx-fullscreen .hx-caption { border-radius: 0; }
```

- 最大化/全屏时窗口外框不应保留 20px 圆角；
- 还原后恢复 20px；
- 启动画面也要跟随圆角状态；
- 如果 DWM 自带圆角与页面圆角叠加，设置 `roundedCorners: false`（若当前
  Electron 版本支持）或调整窗口透明/阴影策略，并截图确认。

### 3.4 多显示器与 DPI

- 使用 `screen.getDisplayMatching(win.getBounds())`，不要假设主屏；
- 跨屏拖动后重新计算最小尺寸和工作区；
- 125%/150% 缩放下检查窗口边界、圆角和菜单发丝线；
- 保存/恢复窗口位置时 clamp 到当前屏幕工作区，避免窗口跑到屏幕外。

---

## 4. 标题栏按钮

| 按钮 | 尺寸 | 行为 |
| --- | --- | --- |
| 全屏 | 46×34 | `toggleFullscreen` |
| 最小化 | 46×34 | `win.minimize()` |
| 最大化/还原 | 46×34 | `win.maximize()` / `win.unmaximize()`，图标切换 |
| 关闭 | 46×34 | `win.close()`，hover `#c42b1c` |

- 按钮图标 16×16，stroke 1.5；
- hover 背景白色 12%；
- 关闭按钮 hover 红色，文字/图标白色；
- 最大化图标在还原态改为“两个叠放矩形”；
- 按钮区域 `-webkit-app-region: no-drag`；
- 窗口最大化时右上角不再有 20px 圆角裁切。

---

## 5. 启动画面

- 启动画面放在独立层，z-index 120；
- 同样 20px 圆角、overflow hidden；
- 内部 iframe/视频也裁切；
- `ready-to-show` 后再显示主窗口，启动画面淡出 600ms；
- 最大化/全屏时启动画面圆角 0；
- 启动画面不要使用 `backdrop-filter`（此时背景尚未稳定）。

---

## 6. 桌面歌词 / 壁纸等独立窗口

如果同一应用还有桌面歌词、壁纸、悬浮球等透明窗口：

- 每个窗口独立设置 `frame:false, transparent:true, hasShadow:false`；
- 歌词窗口通常 `resizable:false`、`skipTaskbar:true`、`alwaysOnTop`；
- 锁定状态使用 `setIgnoreMouseEvents(true, { forward: true })` 做点击穿透；
- 不要假设主窗口的 DPI、圆角、主题与悬浮窗一致；
- 独立窗口的材质如果要复用，仍按各自尺寸生成 skin；
- 关闭/解锁时清理全局快捷键和鼠标穿透状态。

LxMine 的桌面歌词窗口还处理了：中键锁定、主窗口与歌词窗口的双向状态同步、
Windows 11 圆角、任务栏隐藏、退出时恢复。把这些当作“独立窗口”的检查项，
不要混进主窗口的材质代码。

### 6.1 全屏壁纸模式

全屏壁纸不是“把窗口放大”，而是同一窗口的另一种呈现状态：

- `body.wallpaper-mode` 隐藏应用主体、导航、dock、搜索、详情、评论、
  page veil、搜索球和返回按钮；
- 窗口圆角、内框阴影、标题栏按钮和拖动区全部移除；
- stage/视频/封面层保持运行，不能被销毁或重建；
- 只保留壁纸信息层和退出按钮，退出按钮必须 `pointer-events:auto`；
- 进入/退出时不要切换 `transparent`、`frame` 或 BrowserWindow 尺寸；
- 退出后恢复普通模式的圆角、导航和滚动位置；
- 全屏壁纸下不要运行锚点菜单/模态；先退出壁纸模式再交互。

### 6.2 桌面歌词

桌面歌词窗口是独立透明窗口，复用材质时必须按它自己的尺寸生成 skin：

- `frame:false`、`transparent:true`、`hasShadow:false`、`skipTaskbar:true`；
- 未锁定时可拖动；锁定后锁定位置并处理点击穿透；
- 中键锁定/解锁与主窗口状态双向同步，避免全局轮询把刚锁定的状态立刻反转；
- 锁定状态的非胶囊区域应点击穿透，不能挡住桌面；
- 关闭/解锁/退出时恢复 `setIgnoreMouseEvents(false)`、全局快捷键和位置；
- 不要用主窗口的 DPR/圆角假设桌面歌词窗口。

---

## 7. GPU 与性能

- **不要**在发布版调用 `app.disableHardwareAcceleration()`；软件光栅会让
  backdrop-filter 退化为纯模糊或直接失效；
- 验收时确认窗口可见、未最小化、未处于后台节流；
- Electron 的 `backgroundThrottling` 在动效测试中设为 false；
- 透明窗口 + 大面积 backdrop-filter 会增加 GPU 负担；限制同时可见的光学
  控件数量，菜单关闭后及时移除；
- 不在隐藏页面继续跑 Canvas/弹簧；
- 高刷新率屏幕（120/144Hz）下用 rAF 实测，不要假设 60Hz；
- 如果 GPU 进程崩溃，回退到半透明底色，不崩溃整个界面。

---

## 8. CSP 与资源

SVG filter 使用 data URL 作为 `feImage`，需要 CSP 允许：

```
img-src 'self' data:;
```

如果使用 blob URL，需要 `blob:`。缺少该权限时，控件会显示为纯色/透明，
控制台出现 CSP 报错。

其他建议：

- `script-src 'self'`；
- 不允许远程代码；
- 外部链接通过 `shell.openExternal` 且校验协议；
- `setWindowOpenHandler` 拒绝默认新窗口。

---

## 9. 常见故障

| 症状 | 原因 | 修复 |
| --- | --- | --- |
| 窗口四角是方的 | 页面没有裁切/圆角，或 DWM 圆角冲突 | `.hx-window-surface` 圆角 + overflow；检查 `roundedCorners` |
| 最大化盖住任务栏 | 用了 `display.bounds` | 改 `win.maximize()` 或 `workArea` |
| 全屏后仍有圆角 | 未监听 fullscreen 状态 | body class 置 0 |
| 透明区域是黑的 | `backgroundColor` 不是全透明 | `#00000000` |
| 启动白闪 | 未等 `ready-to-show` | `show:false` + 事件后再 show |
| 拖动区点不动按钮 | 拖动区盖住控件 | 限制高度/z-index，按钮 `no-drag` |
| 125% 下菜单发丝线消失 | 0.5px 被舍入 | 使用 `1/devicePixelRatio` |
| 最小化后材质发灰 | 后台节流/合成暂停 | 恢复后 `refreshAll()` |
| 跨屏后窗口错位 | 使用主屏 bounds | `getDisplayMatching` + clamp |
| 桌面歌词点不中 | 忽略鼠标状态未恢复 | 明确 lock/unlock 状态机 |

---

## 10. 发布前窗口检查表

- [ ] 无边框、透明、圆角 20px；
- [ ] 最大化保留任务栏；
- [ ] 全屏独立按钮、圆角 0；
- [ ] 最大化/还原图标正确；
- [ ] 关闭 hover 红色；
- [ ] 拖动区不挡按钮；
- [ ] 启动画面圆角/淡出；
- [ ] 100/125/150/200% DPI；
- [ ] 多显示器/跨屏；
- [ ] 桌面歌词/壁纸等独立窗口状态清理；
- [ ] CSP 允许 data:；
- [ ] 真实 GPU 下性能通过；
- [ ] 打包后实际 exe 复测。
