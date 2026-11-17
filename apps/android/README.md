# LxMine for Android

LxMine 的 Android 端：与 Windows / HarmonyOS 端共享 LX 自定义音源协议、融合首页、
歌单库、本地音乐、下载、局域网同步与 MineRadio 舞台。可见界面全部为 Kotlin + Jetpack
Compose；只有「自定义音源运行时」与「MineRadio 舞台」沿用同一份 Web 资源。

## 目录

```
apps/android/
├─ app/src/main/java/com/lxlia/player/
│  ├─ MainActivity.kt          单 Activity：方向策略、系统选择器、深链与分享回跳
│  ├─ LxMineApp.kt             进程级装配（Store / 音源引擎 / 本地音乐 / 下载 / 回环服务）
│  ├─ audio/                   ExoPlayer + MediaSession 前台服务与播放调度
│  ├─ core/Store.kt            与鸿蒙 preferences 同键的持久化
│  ├─ lx/                      音源运行时桥、搜索、首页、目录、歌词、评论、下载、同步
│  ├─ model/                   Song / 歌单 / 首页 / 歌词数据模型
│  └─ ui/                      Compose 界面（顶栏、胶囊、底栏、各页面、浮层）
└─ app/src/main/assets/
   ├─ lx-runtime/              LX 音源沙箱（与鸿蒙 rawfile 同源，多一个 Android 桥适配文件）
   ├─ mine-stage/              MineRadio 舞台（three.js 引擎、启动动画）
   └─ icons/                   与鸿蒙 media 目录同源的图标
```

## 构建

本机工具链（不依赖 Android Studio）：

| 组件 | 版本 | 位置 |
| --- | --- | --- |
| JDK | 21 (Microsoft OpenJDK) | `D:\Program Files\Java\jdk-21.0.9+10` |
| Android SDK | compile 36 / target 35 / build-tools 36.0.0 | `D:\Program Files\Android\Sdk` |
| Gradle | 8.14.3 | `D:\Program Files\Gradle\gradle-8.14.3` |

```powershell
$env:JAVA_HOME="D:\Program Files\Java\jdk-21.0.9+10"
$env:ANDROID_HOME="D:\Program Files\Android\Sdk"
& "D:\Program Files\Gradle\gradle-8.14.3\bin\gradle" assembleDebug
```

产物：`app/build/outputs/apk/debug/app-debug.apk`（debug 包名带 `.debug` 后缀，
可与其它包共存）。

安装到真机：

```powershell
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.lxlia.player.debug/com.lxlia.player.MainActivity
```

也可以直接用 Android Studio 打开本目录（Gradle 工程结构标准）。

## 与鸿蒙端的差异（平台边界）

- **液态玻璃材质**：使用 Kyant0/AndroidLiquidGlass 的 Backdrop 1.0.6，导航、开关、
  滑块和按压高光适配同版本官方示例。控件的布局、静止颜色与尺寸按鸿蒙源码和实机核对。
  上游代码来源与许可证见 `NOTICE.md`。
- **系统播控单行歌词**：Android MediaSession 没有对应字段，通知栏只显示歌曲信息。
- **投播**：改为系统音频路由（蓝牙/耳机等，Android 10+），没有路由时明确提示。
- **分享**：`ACTION_SEND` 文本分享 `lxmine://play?...` 深链，本应用与 PC 均可唤起。

## 关键实现约定（与 docs/MOBILE_PC_PARITY.md 对齐）

- 歌曲列表只有一个行组件 `SongRow`，所有列表（首页新歌、歌单、板块、搜索、本地、下载、
  队列）复用；列表头统一 `SongListTools`（播放全部 + 排列 + 列表内搜索）。
- 顶栏只有 `PageHeader`（38dp 球 + 28sp 标题 + 12sp 副标题，球顶 = 状态栏 + 6dp）。
- 底栏只有一份常驻胶囊：播控 + 导航，只变几何不重建；滑动方向驱动一栏/两栏。
- 首页爬取结果在滚动中挂起（650ms 静默窗口），滚动结束才换数据；内容签名相同直接跳过。
- 播放进度状态按页面节流（一级页 1s / 详情页 200ms），不因 `timeUpdate` 重建整页。
- 音源脚本由用户主动导入；播放地址只由当前启用音源解析，
  失败时按最多 6 个备用音源依次回退。
