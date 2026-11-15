# LxMine 鸿蒙工程

## 工程与安装身份

用 DevEco Studio 打开 apps/harmony，工程显示名为 LxMine。手机和平板来自同一个工程和同一份签名 HAP。折叠屏的窗口与姿态适配属于本轮重建范围，尚未完成实机验收。

显示名、媒体会话名称、设置中的应用名称都已改为 LxMine。安装标识保留 com.lxlia.player，以复用用户已勾选的自动签名，并覆盖原应用、保留现有音源和歌单；这不表示显示名仍是旧名称。

## 当前构建边界

音乐服务、原生 UI 与资源可以独立编译。MineRadio 动效资源正在替换旧渲染组件，因此当前原生编译检查不代表新的融合体验已交付，不将旧渲染页当作 MineRadio 版本发布。

在项目根目录使用 PowerShell 7：

```powershell
npm run check:harmony
```

它等价于运行 scripts/build-harmony.ps1 -SkipStage，只检查当前原生工程，不重新生成旧动效包。完整的动效资源构建入口随 MineRadio 渲染桥一起更换。

自动签名已经由用户启用，无需重新勾选。签名配置与证书只保存在本机。构建目标为 apps/harmony/entry/build/default/outputs/default/entry-default-signed.hap。

## 安装与同步版本

安装使用 hdc install -r 覆盖当前应用，避免更换 bundleName 后多出第二个桌面图标。正式更新时手机和平板安装同一份已签名 HAP，记录同一文件的 SHA-256。折叠屏模拟验证与实际折叠屏测试应单独标注。

## 应用接续（跨设备迁移，2026-11-14 接入）

- 能力开关：`module.json5` 的 EntryAbility 必须有 `"continuable": true`（缺失时系统
  根本不提供接续入口，底部 dock 也不会出现应用胶囊）。
- 发送侧：`EntryAbility.onContinue()` 读取 `services/Continuation.ets` 的内存槽
  （页面每秒刷新，进度几乎实时；兜底用持久化快照），写入 `wantParam['lxmine_playback']`。
- 接收侧：冷启动走 `onCreate → captureLaunch → AppStorage('lxmine_continue_playback')`，
  热接续走 `onNewWant` 同一条路；页面 `@StorageProp('lxmine_continue_playback') @Watch`
  → `consumeContinuation()` 标记 `explicit=true` 直接按原进度播放（不受"启动时继续播放"
  设置影响）。
- **硬性前提：两台设备的 bundleName 必须一致**（系统按应用身份配对）。统一方案：
  **手机、平板、车机都装 HiCar 包 `cn.migu.music`**（`LxMine-<version>-HiCar-*.hap`）；
  HiCar 调试 profile 已包含手机与平板两个 UDID，同一份包可直装两端。
  default 产品（`com.lxlia.player`）不再分发：两包并存会变成"两个不同的应用"，
  接续不触发且桌面多一个图标。
- 系统侧还需：同一华为账号、蓝牙与 WLAN 开启、设置 → 更多连接 → 多设备协同 →
  应用接续 打开。
- 真机验证方式（无需第二台设备）：`aa start -a EntryAbility -b <bundle> --ps
  lxmine_playback '<snapshot-json>'` 模拟接收侧，dock 应立即切到该歌曲并载入进度。
