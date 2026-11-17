# 华为应用市场邀请测试（Store 版）与 HiCar 双轨分发

本文件规定 LxMine 鸿蒙端的两条分发线，以及邀请测试的完整操作流程。规则依据华为
官方文档（2026-11 核对），链接见文末。

## 双轨定义

| | Store 版（邀请测试） | HiCar 版（兼容版） |
| --- | --- | --- |
| bundleName | `com.lxmine.player` | `cn.migu.music` |
| deviceTypes | phone / tablet / 2in1（PC） | phone / tablet / car |
| 分发渠道 | 华为应用市场「邀请测试」，一条链接加入测试组 | GitHub Releases（`releases/harmony/LxMine-<版本>-HiCar-<日期>.hap`） |
| 签名 | AGC 发布证书 + Profile | 本机 debug 自动签名（设备绑定，见 [RELEASE.md](RELEASE.md)） |
| 上架审核 | 需要（不支持快速审核） | 不进市场，无审核 |

- HiCar 版**永远不进应用市场**：`cn.migu.music` 是咪咕音乐的包名，AGC 无法创建；
  且邀请测试支持的设备类型不含车机。
- 维护者自用 HiCar 版，保持不变。
- 两个包**同一份源码、同一个版本号**。改版只改 `apps/harmony/AppScope/app.json5`
  的 `versionName` / `versionCode`，然后各跑一次构建。

### 为什么 HiCar 版不能走邀请测试

1. 邀请测试支持的设备类型是手机、平板、PC/2in1、智能手表，**没有车机**；包里的
   `deviceTypes` 含 `car` 也传不上去。
2. HiCar 车机入口之所以能用，是因为包名借用了 `cn.migu.music`——该包名在 HiCar
   白名单里（车机应用列表显示为「咪咕音乐」）。AGC 不接受注册他人已有的包名。
3. 结论：**车机里只能装 GitHub 的 HiCar 包**，手机/平板装 Store 包。两者包名不同，
   可以同时安装在一台手机上；歌单、音源与设置用应用内「局域网同步」互传。
   部分车型支持 HiCar 手机投屏，可以把 Store 版画面投到车机，但那不是车机原生入口，
   体验与 HiCar 包不同。

## 一次性准备

1. **开发者账号**：华为开发者联盟账号完成实名认证。个人开发者可用邀请测试；`buildVersion`
   分钟级过审仅企业开发者可用，本项目用不到。
2. **AGC 建应用**：HarmonyOS 应用，包名 `com.lxmine.player`，设备类型只选手机、平板。
   已完成：APP ID `6917621881923326327`，项目 LxMine。
   （旧包名 `com.lxlia.player` 已被占用，无法创建。）
3. **发布证书与 Profile**：AGC「证书、APP ID 和 Profile」用 DevEco 生成的 CSR 申请，
   然后把材料写入 `apps/harmony/build-profile.json5` 的 `signingConfigs`
   （建议命名 `store-release`，不要改动现有的 `default` 与 `hicar`）。
4. **隐私声明**：AGC「协议服务」用托管模板生成隐私政策与用户协议；应用内需要有入口。

## 出包

```powershell
npm run build:store                     # 完整构建（含 MineRadio 动效资源）
npm run build:store:check               # 跳过动效资源，需已有 harmony-stage.html
```

指定发布证书签名（上传 AGC 用这个）：

```powershell
.\scripts\build-store.ps1 -SkipStage -ReleaseSigning
```

签名材料放在 `%USERPROFILE%\.ohos\lxmine-release\`：`lxmine-release.p12`（keystore）、
`lxmine-release.cer`（AGC 发布证书链）、`lxmine_store.p7b`（发布 Profile）、
`credentials.txt`（密码，勿外传）、`encpwd.txt` + `material/`（hvigor 可解密的密码元数据）。
hvigor 只接受这种加密格式，明文会被 00303116 拒绝；脚本在构建期间临时注入
`store-release` 签名配置，构建后还原 `build-profile.json5`。

产物：

- 发布签名：`releases/harmony/LxMine-<版本>-Store-<日期>.app`（可上传）
- 未指定发布签名：`...-Store-<日期>-local.app`（debug 构建 + 本机签名，只用于本机验证）

AGC 上传的是 **APP 包（`.app`）**，不是单独的 HAP；脚本用 `assembleApp` 出包，并在复制前
解开 `.app` 里的 HAP 自检：包名、`deviceTypes`、车机权限、`versionCode`、`buildMode`、
`debug` 六项，任何一项不符直接失败。带 `-SigningConfig` 时按 `buildMode=release` 构建——
AGC 合法性检测要求 API≥11 的包里 `debug` 不能为 `true`。

脚本在构建期间会临时改 `entry/src/main/module.json5`：`deviceTypes` 收窄为
`["phone", "tablet"]`，并移除 `ohos.permission.ACCESS_CAR_DISTRIBUTED_ENGINE`；
构建结束（含失败）自动还原并校验 `car` 已回到 `deviceTypes`。原因：邀请测试不支持
car 设备类型，声明了车机权限会触发自检「权限与设备类型不符」。若要指定发布签名，
`build-profile.json5` 中 `default` 产品的 `signingConfig` 同样在结束后还原。

HiCar 包仍用原流程：

```powershell
.\scripts\build-hicar.ps1 -SkipStage -SigningConfig hicar
```

## AGC 操作流程

1. **应用上架 > 软件包管理** → 上传 `.app`，「使用场景」选「仅测试」。
2. **应用测试 > 测试用户** → 新建测试群组（可先建空群组，后续用邀请码链接）。
3. **应用测试 > 测试版本列表** → 创建测试版本 → 选「邀请测试」→ 选包 → 测试时间
   （最长 90 天）→ 测试信息 → 隐私声明 → 联系方式 → 审核信息 → 勾选测试群组 →
   **提交审核**。
   - 「上架自检」可选：勾选后按正式上架标准预检，约 1 天，不影响邀请测试结果。
4. **审核通过后**：在版本状态页复制「版本分享链接」，它直接打开 AppGallery
   「应用尝鲜」的测试详情页。
   - 已录入群组的朋友：点链接即可。
   - 未录入群组的朋友：链接末尾拼 `&invitationCode=<邀请码>`，邀请码在「邀请码管理」生成。
     **拼接邀请码只在审核通过后可用**。

朋友侧流程：浏览器打开链接 →「开始测试」→ 首次「同意」加入测试群组 → 详情页「安装」。
之后可从应用市场「应用尝鲜」更新，无需再点链接。

## 版本同步规则

- 每次发版按顺序出两个包：`build-store`（上传 AGC）+ `build-hicar`（GitHub）。
- `versionCode` 每次递增（1.1.0 使用 `1100000`），且必须**高于**发布过的全网版本、
  **不低于**发布过的测试版本。
- 不允许两个在架测试版本 `versionName` / `versionCode` / 构建版本完全一致。
- 已经安装了测试版的设备，装更低 versionCode 的包不会失败，也不会清数据；从邀请测试
  切到 GitHub 侧载包或反过来同理。

## 审核注意

- 权限：Store 包保留 5 个（INTERNET、GET_NETWORK_INFO、GET_WIFI_INFO、
  DETECT_GESTURE、KEEP_BACKGROUND_RUNNING），其中 `DETECT_GESTURE` 有 `reason`
  文案，审核会看用途。保持文案与「智感握姿」功能对应。
- 隐私声明必须能在应用内打开；账号归属地为中国大陆时还需填应用负责人联系方式。
- **主要风险**：应用内置/可导入的 LX 音源会抓取第三方平台内容，审核可能以版权或
  内容来源驳回。被驳回时先看具体原因；若因内容合规无法通过，可另出一个仅本地音乐
  的 Store 包（同一源码，隐藏在线音源入口），HiCar 版不受影响。

## 已知限制

- 仅分发中国大陆地区。
- 不支持未成年模式（AppGallery 应用尝鲜同样限制）。
- 单版本测试最长 90 天，到期需新建测试版本。
- 邀请测试 10000 人上限、300 个群组；同时最多 100 个在架测试版本。
- 车机设备类型不在邀请测试范围内。

## 官方文档

- 业务介绍（四种测试方式对比）：<https://developer.huawei.com/consumer/cn/doc/doccenter-submission/agc-help-invite-test-overview-0000002287701773>
- 创建并发布测试版本：<https://developer.huawei.com/consumer/cn/doc/doccenter-submission/agc-help-appgallery-release-testapp-0000002258174266>
- 邀请用户参与测试（链接与邀请码拼接）：<https://developer.huawei.com/consumer/cn/doc/doccenter-submission/agc-help-appgallery-invite-testuser-0000002292624413>
- FAQ：<https://developer.huawei.com/consumer/cn/doc/doccenter-submission/agc-help-invite-test-faq-0000002363660365>
