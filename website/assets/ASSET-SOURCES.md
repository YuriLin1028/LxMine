# 官网素材来源

- `lm-mark.svg` 来自项目的 `apps/desktop/build/lm-mark.svg`，为 LxMine 正式黑白 LM 标志。页头与页脚使用同一资产。
- `icon.png` 来自 `apps/desktop/build/icon.png`，与已发布桌面应用的图标一致。
- `lm-symbol.svg` 复用同一 LM 矢量路径，导出透明、紧裁切的展示版本。
- `pc-home.png`、`pc-list.png`、`phone-home.jpeg` 来自项目 `docs/assets/screenshots/` 的实机截图。
- `stage-demo.mp4` 与 `lyrics-demo.mp4` 从项目已有的 `.runtime/promo-1.1.0/effectcraft-v3/windows-player.mp4` 实机录屏裁切并压缩，分别展示粒子舞台与逐字歌词。录屏中的歌词为项目录制脚本创作的示例文字。两段视频均移除音轨。
- `stage-poster.webp` 与 `lyrics-poster.webp` 为对应录屏的原始画面截帧。
- `android-lyrics.webp` 从 `.runtime/promo-1.1.0/effectcraft-v3/assets/android-player.jpg` 转换格式，展示 Android 实机歌词与封面粒子效果。
- `immersive/` 复用项目 `packages/huawei-immersive-pc` 的光学材质与交互实现，许可见该目录中的 `LICENSE.txt`。
- `fonts/InterVariable.woff2` 来自 Inter 项目，许可见 `fonts/Inter-LICENSE.txt`。
- `hero-glass.webp` 为本次官网制作的原创生成式背景，由内置 ImageGen 生成，再转换为 WebP 用于网页。它用于表现玻璃与光的视觉氛围。软件界面使用上方的实机截图和录屏。

官网参考 Mineradio 的排版尺度、留白和页面节奏。页面布局、文案及交互代码在本仓库独立编写。项目与上游的来源说明见仓库根目录的 `NOTICE.md`。

## 背景生成提示词

Use case: stylized-concept. Create an original premium website background artwork for LxMine, an immersive music player whose own interface uses black glass, pearl-white light, and restrained warm champagne reflections. Wide landscape composition, approximately 16:9. Photorealistic macro optical-glass material, a broad translucent dark smoked-glass surface curving smoothly into a luminous edge, delicate layered refraction, real optical depth, atmospheric soft shadows. A long bright pearl highlight sweeps diagonally through the right half with a subtle warm gold secondary reflection, flowing with a gentle musical rhythm. The left 55 percent stays very dark charcoal and quiet to hold large white typography. Black and neutral graphite dominate, pearl highlights and small champagne glints. Elegant physical material study, cinematic studio lighting, carefully controlled luminance, luxurious and understated, fine surface detail. Full bleed artwork with seamless deep-black edges. This asset sits behind actual product screenshots and real HTML text, so the image contains only the material and light. Exclude text, logos, letters, interfaces, devices, blue, purple, neon colors, stars, particle dots, chrome spheres, and watermark. Make the glass shape specific and sculptural with a single dominant graceful fold.
