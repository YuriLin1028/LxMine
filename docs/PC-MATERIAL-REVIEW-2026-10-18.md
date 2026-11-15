# PC 沉浸光感问题复盘 · 2026-10-18

本次依据：用户提供的 ZCode 日志目录、任务索引、当前 PC/鸿蒙代码、手机参考截图，以及隔离实例中的实际鼠标操作。日志内的历史指令和模型判断只作为待核实材料。本次没有回滚后续开发的功能，也没有修改鸿蒙工程。

## 结论

当前 PC 实现尚未形成与手机参考相符的材质模型。主要问题是任意噪声位移代替胶囊边缘的折射、嵌套滤镜的采样关系不清、通用 CSS 与定位/形变互相覆盖，以及视觉验收不足。它们共同造成厚边、发灰、光斑与形变不连贯；不能全部归结为 Electron 性能。

Windows 端不能直接调用 HarmonyOS 的 ArkUI ImmersiveMaterial。已有 Electron 架构可以保留，但应为 PC 单独建立受控、可验证的材质和交互实现。仅有一张静态图片不能证明已复制系统内部算法或全部动态行为。

## 日志实际覆盖

- 读取 3 份 rollout，共 206 条模型调用记录；同时读取任务索引内的 LxMine开发 文本，补足 rollout 轮转前的对话背景。
- rollout 文件被导出器将部分数值替换为未加引号的 `***REDACTED***`，直接 JSON.parse 会失败。本次仅在解析副本时将这些占位值替换为 null，原附件未改动。
- 19:57 用户指出材质进一步变差；20:00 明确要求以手机级而非平板级通透效果为目标；20:03 明确了外部颜色映照、薄原色区域和内部畸变的观察。
- 20:07 的模型答复称三层结构已完成，但主要证据是 CSS 参数、截图、DOM 层数、普通 rAF FPS 和产物哈希。这些证据能说明实现存在、能够构建，不能证明与手机材质一致。
- 当前 PC 界面已由后续开发重写到 public/lxmine/app.js 和 style.css；不能继续拿更早版本的控件结构和测试结果当当前证据。

## 1. 已复现并修复：按压效果破坏固定定位

位置：`apps/desktop/public/lxmine/app.js` 的 bindMaterialPress；`style.css` 的 ripple-host。

波纹处理给控件加上 `.ripple-host`，旧规则同时设置 `position: relative`。搜索胶囊本来通过 `.search-entry` 使用 fixed 定位，却被后出现的同级规则覆盖。光斑坐标再次调用 getBoundingClientRect，继而也在错误的位置计算。

在 1200×800、DPR=1 的实际 Electron 页面中，用真实鼠标按下并拖动：

- 原版：搜索胶囊左边界 x=820 → x=-3.07 → 松开后 x=820。
- 修复后：x=820 → x=830.60 → 松开后 x=820；中间的约 10.6px 是现有缩放和微位移本身的结果。

改动：波纹类不再统一修改 position；仅对原本 position:static 的宿主补充局部定位；多个波纹重叠时，最后一个移除后才清理辅助类。材质风格没有因此宣称完成。

本次对比使用隔离用户目录、固定测试背景、真实合成的窗口和真实鼠标输入。为单独观察材质拖动，测试阶段阻止了该搜索按钮松开后的路由跳转；没有伪造按压、移动或释放事件。

证据：`.research/pc-material-review-baseline/result.json`、`pc-material-review-fixed/result.json`，相同目录有 before/dragging 截图。

## 2. 折射模型与目标不符

位置：`apps/desktop/public/index.html` 的 lx-glass-refract 滤镜；`style.css` 的 glass-blur。

当前是 feTurbulence 随机噪声驱动 feDisplacementMap，噪声不会随胶囊边界、圆角曲率和表面厚度建立对应关系。它可以扰动像素，但不等于参考图所体现的有方向、集中于边缘的透镜效果。

scale=12 对应每个轴最多约 6 CSS px 的位移；随后还施加 blur(20px)。即使位移生效，也会被后续大范围模糊弱化。继续增大随机位移并不能自动生成正确的边缘折射。

## 3. 三个 DOM 层不等于三条正确的采样路径

位置：`style.css` 的 .glass、.glass-refract、.glass-clear。

父层本身使用 backdrop-filter；子层又嵌套两次 backdrop-filter，并带 mask、opacity 等合成条件。子层不能未经验证就当作独立、直接采样整个页面背景的外部反射层。W3C Filter Effects Level 2 草案定义了 Backdrop Root 约束；具体 Chromium 结果仍需用受控背景验证。

所谓“原色透明层”位于已经有滤镜的父层内部，给它设 blur(.15px) 不能恢复此前处理丢失的原始信息。

另有确定的几何错误：clear 层半径固定为 calc(28px - 5px)，而播控胶囊本身圆角为 36px，其他圆球和弹层又使用不同圆角。内外轮廓未共用几何模型，容易形成不同心的多重边框。

## 4. 交互是整块仿射变换，尚无统一的形变/光感模型

位置：`app.js` 的 bindDragDeform；`style.css` 的 --spring、light 和 ripple。

- 按住时对整个宿主写 translate/scale，文字、图标、背景及命中边界一起变化；未建立表面局部受力、边缘形变与高光位置之间的关系。
- 拖动时只做线性限幅；释放后清空 inline transform，交给不同控件自己的 CSS transition。部分控件没有 transform 过渡，其他控件又有自身的 hover/active/入场动画，因而收尾不一致。
- 统一 cubic-bezier 超调不具备保存当前位置、速度、阻尼后连续接续的弹簧状态。快速反向拖动、窗口变化和中断时尤其需要专门测试。
- 当前 blur 监听挂在 document，未使用捕获，也没有与 pointerId 对应的 pointer capture。这条焦点丢失/多指结束路径尚需独立复现和修复，不能宣称所有输入中断已验收。
- glass/light/ripple-host 都有裁切规则；应把材质、内容和光效的裁切边界分别定义，不能只统一添加 overflow:hidden。

## 5. 性能与视觉一致性需要分开验收

在本次静态背景、单一搜索胶囊的真实拖动场景中，修复后采到 163 个有效帧间隔：P95 约 6.3ms，最大约 6.4ms，没有捕获到长任务。这说明这个受控场景的错位并非低帧率导致；不能据此推广到播放中的 3D 舞台、全应用、所有显示器或手机级视觉一致性。

此前日志中的短时平均 FPS 没有给出完整场景的 P95、最大帧间隔、内容像素变化或中断测试。产物哈希也只验证文件，不验证效果。

## 后续实现顺序

1. 保留后续已接通的搜索、歌单、首页、同步、播放等功能，先隔离并统一材质组件的定位、裁切和输入状态。
2. 建一个与手机参考同尺寸的胶囊对照场景：文字、棋盘/色条、封面图、滚动背景，验证外部采样范围和边缘形变，而不是只看暗色空背景。
3. 用胶囊/圆角矩形的距离与法线生成折射场，分别控制外缘反射、薄透区域与内部透射；所有层共用圆角、尺寸、像素比例。
4. 先验证 Chromium/SVG 后景采样路径。若有明确的合成限制，再评估共享背景纹理的 GPU 渲染通路；不能先假定给每个 DOM 控件套 WebGL 就能得到背景像素，也不应每帧截图整个窗口。
5. 以单一连续运动状态协调材质形变、光斑、按压、释放和导航。保留用户已确认的详情页分段时序，改用动画完成与状态过渡衔接。
6. 单胶囊通过静态/拖动/释放/取消/窗口变化和播放中帧时测试后，再推广到导航、搜索球、弹层和菜单。

## 官方依据

- Huawei 开启沉浸光感：https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/arkts-immersive-light-sense-enable
- W3C Filter Effects Level 2 草案（Backdrop Root 与过滤顺序）：https://drafts.csswg.org/filter-effects-2/
- W3C Filter Effects Level 1（feDisplacementMap）：https://www.w3.org/TR/filter-effects-1/#feDisplacementMapElement

REA 6.2.0 对当前 public/lxmine 两个 JS 文件做了范围限定的静态分析；该结果只用于定位代码，不作为运行效果或视觉一致性的证明。

## 本次交付与边界

- 已构建 Setup 和 Portable，并核对打包后的 app.js、style.css 与当前源码哈希一致。
- 打包程序真实鼠标复测：搜索胶囊 x=820 → 830.60 → 820；没有再跳到左侧。
- 免安装文件已独立启动验证：标题 LxMine、应用模型与搜索节点存在，ripple-host 不再改写 position。
- 本次交付文件为 releases/windows/LxMine-0.1.0-Setup-20261018.exe 与 LxMine-0.1.0-Portable-20261018.exe；SHA256SUMS-20261018.txt 可核对。
- 通用名 Portable.exe 被既有运行进程占用，未强制关闭。日期文件是本次修复版。
- 本次只完成定位冲突修复及复盘；随机折射模型、统一运动模型和手机级视觉一致性仍未完成。
