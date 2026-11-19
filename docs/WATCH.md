# LxMine 手表端

当前构建版本为 0.1.0。两套工程启动后显示配对提示，通过「演示」验证播放／暂停、切歌和进度。演示使用本地样例数据。WATCH 版的「检查连接」调用 Wear Engine 查询已连接对端。手机应用间消息与真实播放控制进入签名真机联调阶段。

## 构建

使用 PowerShell 7 和 DevEco Studio。默认位置是 `D:\Program Files\Huawei\DevEco Studio`。

```powershell
npm run build:watch
npm run build:watch -- -Target Wearable
npm run build:watch -- -Target Lite
```

首次构建会在各工程从 `build-profile.template.json5` 复制本机配置。可随后在 DevEco Studio 打开单独的手表工程，为对应包名配置调试签名。

- WATCH 工程在 `apps/watch-wearable`，包名 `com.lxmine.watch`。
- GT／FIT 工程在 `apps/watch-lite`，包名 `com.lxmine.watch.lite`。
- HAP 输出在各工程的 `entry/build/default/outputs/default/`。未配置签名时生成 `entry-default-unsigned.hap`，需要签名后安装。

## 视觉与原生材质

首屏使用 LxMine 的应用图标，以及鸿蒙端深色主题的炭黑底、暖金强调色和系统播控符号。WATCH 版查询圆屏特征，Lite 版读取设备屏形并使用圆屏安全宽度或方屏宽度。

WATCH 播控胶囊在 API 26.0.0 及以上调用 `uiMaterial.isImmersiveMaterialSupported()`。设备支持时，在 Navigation 标题区承载 `ImmersiveMaterial`，用超薄材质、透明底色和白色触控光沿用 LxMine 的鸿蒙播控风格。支持检测未通过时使用深色胶囊和系统按压反馈。GT／FIT 使用相同配色、胶囊布局和 Lite 按压态。

[华为开启沉浸光感指南](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/arkts-immersive-light-sense-enable/) · [系统材质 API](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/arkts-apis-uimaterial/)

## 首轮真机验收

1. WATCH 使用对应设备的签名与 DevEco 调试流程。GT／FIT 使用手动调试签名，按机型要求通过运动健康和应用调测助手安装。
2. 分别在 WATCH 圆屏、GT 圆屏和 FIT 方屏打开「演示」，验证标题、上一首／下一首、播放／暂停、页面退出后计时停止及触区是否裁切。
3. WATCH 记录 `immersive material supported` 日志。有原生材质能力的型号实测按压反馈、材质层级和系统强度设置。其余型号确认降级界面。
4. 确认 AGC 权限与双端签名指纹后联调 Wear Engine 双向消息，在手机锁屏仍播放时验证命令和状态回执。

[智能穿戴开发与发布](https://developer.huawei.com/consumer/cn/doc/doccenter-multi-device/bpta-smartwatch/) · [轻量级智能穿戴调试](https://developer.huawei.com/consumer/cn/doc/lite-wearable-guides/lite-wearable-bpta-guide/)
