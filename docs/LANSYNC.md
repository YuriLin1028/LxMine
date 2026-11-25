# 局域网一键同步（LxMine LAN Sync）

产品显示名已改为 LxMine。为兼容已有数据与设备，v1 协议标识和路径保留旧内部名称。

目标：同一局域网内的 Windows、HarmonyOS 与 Android 设备互相发现，通过**设备信任圈（6 位验证码配对）**建立双向信任后，一键把**软件设置 + 歌单 + 音源**推送给对方，或在信任圈内自动双向合并歌单与收藏。不经过云端，无账号，未信任设备无法向本机推送或自动同步任何数据。

## 设备信任圈（Trusted Device Circle）

为防止校园网、办公室等公共 Wi-Fi 下陌生 LxMine 设备误同步或弹窗骚扰，所有同步操作（**手动推送、IP 直连、Android pull 接收、以及自动同步歌单**）均严格执行 fail-closed 信任校验：

1. **配对加入（`POST /lxlia-sync/pair`）**：
   - 发起端生成 6 位数字验证码（`code`）与 128-bit 随机共享密钥（`token`，32 位十六进制），发送 `{protocol, version: 1, type: "pair", code, token, device}`；
   - 若目标为 Android 容器（`receiveMode: "pull"`），发起端通过 `pullRequests: [{id, receiverId, kind: "pair"}]` 广播通知，Android 主动 `GET /lxlia-sync/pull/<id>/<ownId>` 拉取请求，用户确认后经 `POST /lxlia-sync/receipt/<id>` 返回 `{receiverId, accepted: true, device}`；
   - 接收端弹窗展示发起设备名、平台与 6 位验证码，用户核对无误点击「信任此设备」后，双方各自把 `{id, name, platform, token, trustedAt}` 持久化到本地独立存储（Windows `lansync-trusted.json`、Android/HarmonyOS `prefs["trustedDevices"]`），**独立于 `appData` / 同步设置，覆盖同步绝不清空信任圈**；
   - 防骚扰：同一设备被拒后 10 秒冷却（`429`），同设备不重复排队（`409`）。
2. **严格验权（`/push` 与 `/auto-playlists`）**：
   - 发送端只在目标设备处于信任圈时携带对应 `trustToken`；自动同步直接跳过所有非信任设备；
   - 接收端对 `POST /lxlia-sync/push`、`POST /lxlia-sync/auto-playlists` 及 Android pull 拉取的 bundle 均以常量时间比对 `device.id + trustToken`；未信任或伪造令牌一律直接返回 **`HTTP 403 {"accepted":false,"code":"UNTRUSTED"}`**，**不弹窗、不合并、不落盘**。
3. **信任圈成员互通（可开关，默认开启，本地独立持久化）**：
   - 全端在「局域网同步」中提供独立开关 **「信任圈成员互通」**（`trustCircleTransitive`，默认 `true`，独立于同步设置保存，绝不被全量同步覆盖）。
   - **开启时**：假设设备 `A` 的信任圈里已有 `B`、`C`，新设备 `D` 与 `A` 完成配对且双方均开启此开关时，`A` 会为 `B↔D`、`C↔D` 各自生成独立 128-bit 密钥（不泄露 `A↔B` / `A↔C` 原密钥），将 `B`、`C` 随 `pair` 响应同步写入 `D` 的信任圈，并通过鉴权引荐接口 **`POST /lxlia-sync/vouch`**（Android 容器走 `kind: "vouch"` pull 通道）将 `D` 引荐给 `B`、`C`；若 `B` 或 `C` 当时离线，引荐项保存在本地 `pendingVouches` 队列（7 天有效），待其下次上线自动投递。
   - **关闭时**：只要 `A` 或 `D` 任意一方关闭此开关，`D` 只会拉入当前配对的 `A`，不会同步 `B`、`C`，也不会向任何其他设备引荐；若 `B` 关闭此开关，`B` 也会直接以 `403 TRANSITIVE_DISABLED` 拒绝来自 `A` 的引荐。
4. **移除信任（`POST /lxlia-sync/unpair`）**：
   - 任意一端移除信任设备后，本机立即拒绝其一切后续同步；若对端在线且支持直连，会携带原 `trustToken` 发送已鉴权的 `/lxlia-sync/unpair` 通知对端同步移除。

> 2026-10-18 真机验收：鸿蒙手机与平板连接同一个 Wi-Fi 名称后已能双向发现。
> 若同一路由器下仍发现不了，先确认两台设备连接的是同一个 SSID（而不是同品牌路由器的
> 两个不同网络），并关闭路由器的 AP 隔离。设置页会显示本机 Wi-Fi 与对端 Wi-Fi，便于定位。

## 协议（v1）

### 发现

- UDP 广播，端口 `41234`，`reuseAddr`。
- 每个节点每 3 秒广播一次：
  ```json
  {"protocol":"lxlia-lansync/1","type":"announce","id":"lxlia-xxxx","name":"设备名","platform":"win32","port":51234,"ts":0}
  ```
- 收到 announce 记录设备；10 秒未更新视为离线。退出时广播 `{"type":"bye","id":...}`。

### 传输

- 每个节点监听 HTTP 随机端口（announce 里的 `port`）。
- `GET /lxlia-sync/ping` → `{protocol,id,name,platform,port}`
- `POST /lxlia-sync/push`，body 为 bundle：
  ```json
  {
    "protocol": "lxlia-lansync/1",
    "version": 1,
    "createdAt": 0,
    "device": {"id": "...", "name": "...", "platform": "win32"},
    "settings": {...},
    "sources": [...],
    "playlists": [...]
  }
  ```
- 接收端不会立即应用：请求挂起，等待本机用户在界面上点「接收并覆盖」或「拒绝」；
  120 秒未处理则超时。接受时先应用数据，再回复 `{"accepted":true}`；拒绝回复 `{"accepted":false}`。

### Android 容器接收

卓易通实机能广播发现设备，但无法从局域网访问其 Android 接收端口。Android 新版在 announce 中添加 `receiveMode: "pull"`，由接收端主动连接发送端。

1. 发送端为一次传输生成独立 ID，保留这次发送时的 bundle 快照，并在原有 3 秒广播中添加 `pullRequests: [{id, receiverId}]`。广播仅含传输标识和目标设备 ID，不含音源正文。
2. 目标 Android 通过 `GET /lxlia-sync/pull/<id>/<receiverId>` 获取 bundle，直接交给原接收服务的校验、确认弹窗和持久化流程。
3. 用户操作后，Android 用 `POST /lxlia-sync/receipt/<id>` 发送 `{receiverId, accepted}`。取回数据本身不会被算作接受。
4. 确认回执会结束发送端的等待并移除该快照，120 秒未确认则超时。接收端短期缓存已处理结果，重试回执不会重复弹窗或应用数据。

此路径需要发送端和 Android 接收端都更新。没有 `receiveMode` 的旧设备继续走原 HTTP 推送。空闲时不增加 HTTP 轮询。

### 数据边界

- 设置：只同步 `getPublicSettings()` 暴露过的键；AI 凭据、Discord AppId 等保留键不接收。
- 音源：整份 `lx-sources.json` 覆盖（含启用项）。
- 歌单：渲染层用 `getLocalPlaylists()` 导出，接收后 `saveLocalPlaylists()` 覆盖。

## 实现位置

- Windows 传输及业务入口在 `apps/desktop/desktop/lansync/transport.cjs`、`index.cjs`，设置和确认界面在 `apps/desktop/public/lxmine/app.js`。
- Android 发现与接收服务在 `apps/android/app/src/main/java/com/lxlia/player/lx/Lan.kt`，主动接收在 `LanPullReceiver.kt`，确认和持久化在 `ui/ActionsApp.kt`。
- HarmonyOS 发现、发送与接收在 `apps/harmony/entry/src/main/ets/services/LanDiscovery.ets`、`LanSyncClient.ets`、`LanSyncServer.ets`，确认和持久化在 `pages/Index.ets`。

## 鸿蒙端

鸿蒙应用已按同一协议实现发现、发送与接收：

- 发现/发送：`apps/harmony/entry/src/main/ets/services/LanDiscovery.ets` + `LanSyncClient.ets`；
- 接收：`LanSyncServer.ets`（`TCPSocketServer` + 最小 HTTP 解析），确认后应用音源并回复；
- 用户接受后先持久化设置、音源及歌单，再回执。播放进度为本机数据，不被同步覆盖。

2026-11-17，HiCar 和 Store 已分别构建签名包，HiCar 安装于平板。Windows 向同一平板的卓易通 Android 发送时，已观察到原生确认框和成功回执。

## 验证

单元测试：`node --test apps/desktop/tests/lxmine-sync.test.js apps/desktop/tests/lxmine-sync-pull.test.cjs apps/harmony/test/native-services.node-test.mjs`。Android 对应 `LanSyncTest`。
- UDP announce 被正确发现；
- 推送后挂起、确认后应用并回复 accepted；
- 拒绝时不应用。

双实例端到端（同一台机器，两个 `--user-data-dir`，2026-10-17 实测通过）：
1. A 通过 UDP 发现 B（设备名 `PC-B`，地址 `192.168.0.104`，随机端口）；
2. A 推送 bundle，B 侧 `pending` 收到请求，摘要为 `{settings: 25, sources: 1, playlists: 0}`；
3. B 未确认前 A 的请求保持挂起（120 秒超时）；
4. B `respond(true)` 后：A 收到 `{accepted: true}`，B 的音源列表出现 A 的源；
5. 修改 A 的设置 `enable_player_page_native_blur = true` 后再次同步，B 接受后该值变为 `true`，确认设置被覆盖。

> 歌单同步通道已接线（`playlists` 字段 + `saveLocalPlaylists`），2026-10-17 已用非空歌单实测：
> 发送方本地歌单为 `同步测试歌单`，接收方待处理摘要显示 `playlists: 1`，确认后接收方
> `local_playlists` 中出现同名歌单，发送方收到 `accepted: true`。
>
> 歌单由渲染层应用：主进程确认接收后会广播 `lansync-applied`，由全局的 `LanSyncAutoApply`
> 写入 IndexedDB，因此不要求接收时同步弹窗处于打开状态。
