# LxMine PC 原生材质对照门禁

材质改动必须先与真机图片比较，再提交打包。不得修改基准、降低阈值、裁掉不利区域或用不同背景的截图宣称复刻成功。

## 运行与打包约束

在 `apps/desktop` 运行 `npm run test:material`。测试依次执行真机像素对比、真实指针拖动/回弹、播放与弹层、窗口缩放。

Electron Builder 的 `beforePack` 会检查 `artifacts/approved.json`、全部结果以及源码和基准 SHA-256。源码、验证器或基准变化后，旧报告立即失效。候选参数覆盖运行不能生成打包批准。测试开始即撤销旧批准，失败禁止出包。

Playwright 版本固定在桌面项目的开发依赖中。每项动效测试使用独立 Electron 进程、隔离用户目录、真实合成窗口、DPR 1、关闭后台节流和窗口遮挡降频，预热完整交互后采样。测试音频静音，真实 FFT 保持运行。

## 真机与背景对齐

基准来自 USB 连接的 PLA-AL10，原生 `uiMaterial.ImmersiveMaterial`，暗色主题，DPR 3.5，`supported=true`，`MaterialLevel.EXQUISITE=0`。同时捕获材质开启、关闭和再次开启，验证重复图的稳定性。

PC 使用同一张关闭材质的背景位图、相同 DPR 和 UI 树测出的控件边界。背景单独渲染时必须通过原始 RGB 对齐检查，不能靠平移成品截图提高分数。

四组场景共 16 个样本：

- 色条/网格与带文字的高对比背景各一组：52、72 高胶囊，64 圆球，28 圆角面板。
- 两种背景下另测 42 小圆按钮、参考胶囊、THIN 菜单、THICK 弹层。后两者直接使用移动项目 `MaterialControls.ets` 的材质选项。

## 固定阈值

- 全部内部像素（含薄轮廓）RGB 平均绝对差 ≤ 8/255。
- 材质主体平均绝对差 ≤ 8/255；距边缘 1–10 CSS px 的折射带 ≤ 12/255；中心 ≤ 8/255。
- 外部 16 CSS px 阴影带平均绝对差 ≤ 6/255。
- 主体结构相似度 SSIM ≥ 0.92。
- 背景对齐差 < 0.5/255，真机重复差 < 1/255，边界偏差 < 0.25 物理像素。
- 关闭折射的负对照必须失败。
- 稳态动效 P95 帧间隔 < 33.5ms，最大帧间隔 < 50ms，长任务 0；分层形变的文字像素差 < 1/255。

SSIM 区域不含最外 1 CSS px 的抗锯齿轮廓；这部分单独输出 `outlineMAE`，同时纳入全内部像素门槛。没有从完整差异图中删除它。SSIM 不是“复刻完成百分比”，门禁通过也不表示逐个像素完全相等。

每次运行保留 PC 原图、真机/PC/四倍差异三联图和 JSON；`artifacts/runs/` 保留历史。参数实验在 `journal.jsonl` 和各实验结果中记录，最终验证只接受实际默认源码。

## 重新采集

使用 PowerShell 7，已连接且解锁的手机，以及项目现有自动签名配置：

1. `node qa/material/make-fixture.cjs type` 或 `grid` 生成背景。
2. `pwsh.exe -File qa/material/build-native-reference.ps1` 生成临时标定 HAP。
3. `pwsh.exe -File qa/material/capture-native.ps1 -Scene type`、`grid`、`type-tiers` 或 `grid-tiers`。场景名称要与背景相符。

临时能力没有桌面入口。构建脚本恢复原清单和源文件，采集脚本在 finally 中恢复正常 HAP。正常 HAP 按哈希另存备份，旧参考图保留历史；不清空播放器数据。截图写入前移除同名测试文件，避免 HDC 覆写时保留旧 PNG 尾部数据。

## 实现依据与边界

### 2026-10-19 真实系统弹窗新增门禁

原有 16 个样本测的是自定义空白材质控件，不能代表 ArkUI 的生产选择弹窗。用户指定 Select 样式后，`NativePlayer` 的音质、动效组件均已改为真正的 Select，不再使用 MenuItem 的勾选文本或分组标题。`capture-system-menu.ps1` 调用当前实际组件和 `NativeSettings` 同配置 Select，采集网格/文字背景、弹窗开/关及重复帧；连接可用时在 finally 安装正常 HAP 并启动 EntryAbility，不清数据。最新六场景均必须为实际 Select；旧 Menu 样本只留作历史资料。

`system-menu.cjs` 复用生产 CSS、SVG 材质和相同截图背景，六个场景均须存在。正文按真机 UI Text 节点矩形外扩 1 CSS px 排除；选中 Option 以其准确原生边界单独统计，复用生产 `.menu-row.checked` 绘制，独立要求 MAE≤8，其余玻璃区域仍受原 MAE/SSIM 门槛约束。报告公布正文/选中区域像素数和选中层 MAE，不能把材质指标当作字体或完整页面一致率。原生分隔线按一个物理像素绘制。另要求重复帧稳定、无材质背景完全一致，并拒绝旧菜单材质负对照。缺样本时失败，实际组件源文件变化使基准失效。

有效截图来源与被丢弃的过渡帧由 `capture.json` 记录，原图保留于不可变 references 目录；一次设置下拉框过渡帧用未改动同组件的上一轮有效 on 图替换，当前 repeat 图与其在完整面板及外扩区域的像素 MAD 为 0，替代来源也绑定哈希。不得删除失败素材或把不稳定帧写成稳定重复帧。

`popup-motion.cjs` 真点击实际生产弹窗，再暂停其时间轴采固定相位 PNG；用另一段未参与拟合的原生录屏注册标题位置和缩放。低于 .82 的模板匹配置信度仅保留报告，不作精度断言；其余帧限制缩放差 .025、横向 5 CSS px、纵向 3 CSS px。横向阈值包含两次真机录屏在加速段相差一个视频帧的重复性误差；不宣称逐帧完全相同。另检查材质不随相位变化、展开中途关闭不跳变、旧 .92 起始缩放被拒绝。实时帧预算仍由独立 `motion.cjs app` 的长菜单连续开合场景测量，固定相位截图不能替代性能测试。

生产材质只采样实时 Chromium backdrop，不使用测试截图作为纹理。轮廓法线、边缘位移衰减和独立外缘混合来自真机像素标定；正文和点击区域与形变皮肤分开。滤镜和位移图按尺寸/圆角缓存，拖动时不重新生成图像。

官方接口依据：本机 SDK `@ohos.arkui.uiMaterial.d.ts`、[华为沉浸光感指南](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/arkts-immersive-light-sense-enable)、[W3C 位移滤镜定义](https://www.w3.org/TR/filter-effects-1/#feDisplacementMapElement)。也查阅了 [OpenHarmony 图形效果的公开实现](https://github.com/openharmony/graphic_graphics_effect/blob/master/src/effect/shader/ge_frosted_glass_effect.cpp)，用作分层采样的研究线索；未复制该着色器或声称它就是手机闭源 EXQUISITE 引擎。

REA 的前端静态分析留在 `.research/pc-material-rea.json`。本机没有已验证的兼容原生反编译后端，因此没有把静态接口或推测当作已还原的华为二进制算法。上述真机图片是验收依据。

2026-10-19 PublicHome 补充验收：`qa/catalogue/home-and-lyrics.cjs` 用真实点击确认音质/动效弹窗各自以触发器中心为原点、设置按钮无箭头、托盘存在、歌词可左拖/锁定恢复/关闭且不复活。首页平台选择器必须是 body 子节点，与搜索球同为 z-index 44；320/360px CDP 视口及 420/540/800/1200px 下断言完整标签没有溢出，四个中心命中点都落在按钮内；详情中隐藏。截图与报告在 `qa/catalogue/artifacts/home-ui/`。`dock-layout.cjs` 另检查合并栏的球与栏体同为 54px、上下对齐。原材质和帧预算阈值未改动。

`qa/catalogue/lyrics-restart.cjs` 以同一隔离配置目录连续启动三次，验证启用偏好不会被退出清理覆盖，主动关闭在重启后仍关闭。实际 Portable 冒烟在资源哈希外增加匿名首页、托盘、账号入口移除验证；LX 歌曲归一化后的平台用 lxSource 检查，歌单平台用 source 检查。脚本有独立超时，缺少完整结果不得视为通过。

DockUnlock 追加回归：窄搜索/二级页、合并栏的封面须与宽屏一致，为外圈 44px、内图 38px；音质必须留在右侧原工具组。`qa/catalogue/lyrics-unlock.cjs` 必须直接点击歌词窗内的图标和“解锁”文字恢复，不能用主窗口 IPC 解锁代替鼠标验收。锁定状态的非胶囊区域仍须穿透且不允许移动。

一次窗口缩放门禁捕获到 max 68.8ms、长任务 68ms；失败报告保留在 `.research/dockunlock-resize-failure/`。诊断 trace 显示材质刷新和布局/提交占用，优化为批量读取几何后再写回，并跳过已应用的光学皮肤样式；光学采样参数未更改。`LM_TRACE=1 node qa/material/motion.cjs resize` 仅为定位入口；完整门禁显式清空 LM_TRACE，避免把带追踪开销的运行当作发布验收。新增长任务起始时间/阶段记录，原 p95/max/长任务阈值不变。
