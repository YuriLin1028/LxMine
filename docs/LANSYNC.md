# 局域网一键同步（LxMine LAN Sync）

产品显示名已改为 LxMine。为兼容已有数据与设备，v1 协议标识和路径保留旧内部名称；接入新桌面基座仍在进行中。

目标：同一局域网内的 Windows 与鸿蒙设备互相发现，一键把**软件设置 + 歌单 + 音源**推送给对方；
对方确认接收后**整体覆盖**。不经过云端，不需要配对或信任关系。

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

### 数据边界

- 设置：只同步 `getPublicSettings()` 暴露过的键；AI 凭据、Discord AppId 等保留键不接收。
- 音源：整份 `lx-sources.json` 覆盖（含启用项）。
- 歌单：渲染层用 `getLocalPlaylists()` 导出，接收后 `saveLocalPlaylists()` 覆盖。

## 实现位置

| 层 | 文件 |
| --- | --- |
| 传输（UDP + HTTP） | `apps/desktop/electron/lansync/transport.cjs` |
| Electron 业务/身份/IPC | `apps/desktop/electron/lansync/index.cjs` |
| 渲染层封装 | `apps/desktop/src/services/lanSync.ts` |
| 弹窗 UI | `apps/desktop/src/components/modal/LanSyncModal.tsx` |
| 入口 | 命令面板「局域网同步」 |

## 鸿蒙端

鸿蒙应用已按同一协议实现发现、发送与接收：

- 发现/发送：`apps/harmony/entry/src/main/ets/services/LanDiscovery.ets` + `LanSyncClient.ets`；
- 接收：`LanSyncServer.ets`（`TCPSocketServer` + 最小 HTTP 解析），确认后应用音源并回复；
- 音源暂时只保存在页面状态里，持久化与歌单应用待补。

> 真机验证仍缺签名；代码已通过 `hvigor assembleHap` 编译。

## 验证

单元测试：`node --test apps/desktop/test/lansync/transport.node-test.mjs`
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
