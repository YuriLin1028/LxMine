param([switch]$SkipStage, [switch]$ReleaseSigning, [string]$ReleaseDir, [string]$SigningConfig)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($PSVersionTable.PSVersion.Major -lt 7) { throw '请使用 PowerShell 7。' }

# Store 版 = 华为应用市场「邀请测试」通道的包：product=store，bundleName com.lxmine.player，
# 支持 phone / tablet / 2in1，产物是 AGC 接受的 .app（内含 HAP）。
# 车机包始终由 build-hicar.ps1 产出并只通过 GitHub 分发（cn.migu.music）。
# 旧的 com.lxlia.player 已在华为侧被占用，Store 线改用 com.lxmine.player（AGC APP ID 6917621881923326327）。
$projectRoot = Split-Path -Parent $PSScriptRoot
$project = Join-Path $projectRoot 'apps/harmony'
$appJsonPath = Join-Path $project 'AppScope/app.json5'
$modulePath = Join-Path $project 'entry/src/main/module.json5'
$profilePath = Join-Path $project 'build-profile.json5'
$storeBundle = 'com.lxmine.player'

$app = Get-Content -LiteralPath $appJsonPath -Raw | ConvertFrom-Json
$appVersion = $app.app.versionName
$appVersionCode = [string]$app.app.versionCode
if ([string]::IsNullOrWhiteSpace($appVersion)) { throw '无法从 AppScope/app.json5 读取 versionName' }

# store 产品在 build-profile.json5 里覆盖 bundleName；AppScope 仍是 default 产品的包名。
$profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json -AsHashtable
$storeProduct = $profile.app.products | Where-Object name -EQ 'store' | Select-Object -First 1
if (-not $storeProduct) { throw 'build-profile.json5 缺少 store 产品，请先恢复产品配置。' }
if ($storeProduct.bundleName -ne $storeBundle) {
    throw "store 产品包名应为 $storeBundle，当前是 $($storeProduct.bundleName)。"
}

$materialDir = if ($ReleaseDir) { $ReleaseDir } else { Join-Path $HOME '.ohos/lxmine-release' }
$useRelease = $ReleaseSigning -or [bool]$SigningConfig
$buildMode = if ($useRelease) { 'release' } else { 'debug' }

$moduleBackup = [System.IO.Path]::GetTempFileName()
$profileBackup = [System.IO.Path]::GetTempFileName()
Copy-Item -LiteralPath $modulePath -Destination $moduleBackup -Force
Copy-Item -LiteralPath $profilePath -Destination $profileBackup -Force
$failed = $false

try {
    # 1) 临时把 module.json5 收窄为手机/平板，并去掉车机专用权限。
    #    邀请测试不支持 car 设备类型；保留车机权限会触发自检“权限与设备类型不符”。
    $lines = Get-Content -LiteralPath $modulePath
    $patched = @()
    $devicePatched = $false
    $carPermDropped = $false
    foreach ($line in $lines) {
        if ($line -match '"deviceTypes"\s*:') {
            $patched += '    "deviceTypes": ["phone", "tablet", "2in1"],'
            $devicePatched = $true
            continue
        }
        if ($line -match 'ACCESS_CAR_DISTRIBUTED_ENGINE') {
            $carPermDropped = $true
            continue
        }
        $patched += $line
    }
    if (-not $devicePatched) { throw 'module.json5 中没有找到 deviceTypes，脚本与工程结构不一致。' }
    if ($carPermDropped) {
        for ($i = $patched.Count - 1; $i -ge 0; $i--) {
            if ($patched[$i] -match '"name"') { $patched[$i] = $patched[$i] -replace ',\s*$', ''; break }
        }
    }
    $patchedText = ($patched -join "`n")
    $null = $patchedText | ConvertFrom-Json
    Set-Content -LiteralPath $modulePath -Value $patchedText -Encoding utf8

    # 2) 签名：hvigor 只认 DevEco 加密格式的密码（>=32 位十六进制，配合材料目录里的
    #    material/ 元数据解密）。-ReleaseSigning 用材料目录的 encpwd.txt 临时注入 store-release。
    if ($ReleaseSigning) {
        $p12 = Join-Path $materialDir 'lxmine-release.p12'
        $cer = Join-Path $materialDir 'lxmine-release.cer'
        $p7b = Join-Path $materialDir 'lxmine_store.p7b'
        $encFile = Join-Path $materialDir 'encpwd.txt'
        $matDir = Join-Path $materialDir 'material'
        foreach ($f in @($p12, $cer, $p7b, $encFile)) { if (-not (Test-Path -LiteralPath $f)) { throw "发布签名材料缺失：$f" } }
        if (-not (Test-Path -LiteralPath $matDir)) { throw "缺少 DevEco 材料目录：$matDir" }
        $enc = (Get-Content -LiteralPath $encFile -Raw).Trim()
        if ($enc.Length -lt 32 -or $enc.Length % 2 -ne 0) { throw 'encpwd.txt 不是 hvigor 可解密的加密密码。' }

        $profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json -AsHashtable
        $entry = @{
            name = 'store-release'
            type = 'HarmonyOS'
            material = @{
                certpath = $cer
                keyAlias = 'lxmine'
                keyPassword = $enc
                profile = $p7b
                signAlg = 'SHA256withECDSA'
                storeFile = $p12
                storePassword = $enc
            }
        }
        $profile.app.signingConfigs = @(@($profile.app.signingConfigs | Where-Object name -NE 'store-release') + $entry)
        $target = $profile.app.products | Where-Object name -EQ 'store' | Select-Object -First 1
        $target.signingConfig = 'store-release'
        $profile | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $profilePath -Encoding utf8
        Write-Host "使用发布签名材料：$materialDir"
    }
    elseif ($SigningConfig) {
        $profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json -AsHashtable
        if (-not ($profile.app.signingConfigs | Where-Object name -EQ $SigningConfig)) {
            throw "signingConfigs 中不存在名为 $SigningConfig 的签名配置。"
        }
        $target = $profile.app.products | Where-Object name -EQ 'store' | Select-Object -First 1
        $target.signingConfig = $SigningConfig
        $profile | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $profilePath -Encoding utf8
    }

    # 3) 构建。
    if (-not $SkipStage) {
        Push-Location (Join-Path $projectRoot 'apps/desktop')
        try { & npm.cmd run build:harmony-stage; if ($LASTEXITCODE -ne 0) { throw 'MineRadio 动效资源构建失败' } }
        finally { Pop-Location }
    }
    $stageEntry = Join-Path $project 'entry/src/main/resources/rawfile/mine-stage/harmony-stage.html'
    if (-not (Test-Path -LiteralPath $stageEntry)) { throw '缺少 MineRadio 渲染资源，请先运行完整构建' }

    $studio = 'D:/Program Files/Huawei/DevEco Studio'
    $env:DEVECO_SDK_HOME = Join-Path $studio 'sdk'
    $env:JAVA_HOME = Join-Path $studio 'jbr'
    $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
    Push-Location $project
    try {
        # AGC 上传的是 APP 包（.app），不是单独的 HAP。
        & (Join-Path $studio 'tools/hvigor/bin/hvigorw.bat') assembleApp --mode project -p product=store -p buildMode=$buildMode --no-daemon
        if ($LASTEXITCODE -ne 0) { throw "Store APP 包构建失败（buildMode=$buildMode）。" }
    } finally { Pop-Location }
}
catch {
    $failed = $true
    throw
}
finally {
    Copy-Item -LiteralPath $moduleBackup -Destination $modulePath -Force
    if ($useRelease) { Copy-Item -LiteralPath $profileBackup -Destination $profilePath -Force }
    Remove-Item -LiteralPath $moduleBackup -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $profileBackup -Force -ErrorAction SilentlyContinue
    if (-not $failed) {
        $restored = Get-Content -LiteralPath $modulePath -Raw
        if ($restored -notmatch '"deviceTypes"\s*:\s*\[[^\]]*"car"') { throw '还原 module.json5 失败：deviceTypes 中没有 car。' }
        Write-Host '已还原 module.json5（deviceTypes 含 car）。'
        if ($useRelease) { Write-Host '已还原 build-profile.json5（store 产品无签名配置、signingConfigs 无 store-release）。' }
    }
}

$outDir = Join-Path $project 'build/outputs/store'
$unsignedApp = Join-Path $outDir 'harmony-store-unsigned.app'
$signedApp = Join-Path $outDir 'harmony-store-signed.app'
$releaseRoot = Join-Path $projectRoot 'releases/harmony'
New-Item -ItemType Directory -Force $releaseRoot | Out-Null
$stamp = Get-Date -Format yyyyMMdd

if ($ReleaseSigning) {
    if (-not (Test-Path -LiteralPath $signedApp)) { throw "找不到已签名 APP 包：$signedApp" }
    $appPack = $signedApp
}
elseif ($SigningConfig) {
    if (-not (Test-Path -LiteralPath $signedApp)) { throw "找不到已签名 APP 包：$signedApp" }
    $appPack = $signedApp
}
else {
    if (-not (Test-Path -LiteralPath $unsignedApp)) { throw "构建完成但未找到 APP 包：$outDir" }
    $appPack = $unsignedApp
}

& (Join-Path $PSScriptRoot 'check-harmony-sources.ps1') -Path $appPack

# 4) 包内自检：AGC 合法性检测的硬性项先本地挡掉。
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Read-HapManifest([string]$appPath) {
    $tmpHap = Join-Path ([System.IO.Path]::GetTempPath()) ("lxmine-" + [guid]::NewGuid().ToString('N') + '.hap')
    $appZip = [System.IO.Compression.ZipFile]::OpenRead($appPath)
    try {
        $hapEntry = $appZip.Entries | Where-Object { $_.FullName -like '*.hap' } | Select-Object -First 1
        if (-not $hapEntry) { throw "APP 包里没有 HAP：$appPath" }
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($hapEntry, $tmpHap, $true)
    } finally { $appZip.Dispose() }
    $hapZip = [System.IO.Compression.ZipFile]::OpenRead($tmpHap)
    try {
        $entry = $hapZip.Entries | Where-Object { $_.FullName -eq 'module.json' } | Select-Object -First 1
        if (-not $entry) { throw 'HAP 里没有 module.json' }
        $reader = New-Object System.IO.StreamReader($entry.Open())
        try { return ($reader.ReadToEnd() | ConvertFrom-Json) } finally { $reader.Close() }
    } finally {
        $hapZip.Dispose()
        Remove-Item -LiteralPath $tmpHap -Force -ErrorAction SilentlyContinue
    }
}

$manifest = Read-HapManifest $appPack
$problems = @()
if ($manifest.app.bundleName -ne $storeBundle) { $problems += "bundleName=$($manifest.app.bundleName)" }
if ((@($manifest.module.deviceTypes) -join ',') -ne 'phone,tablet,2in1') { $problems += "deviceTypes=$(@($manifest.module.deviceTypes) -join ',')" }
$perms = @($manifest.module.requestPermissions | ForEach-Object { $_.name })
if ($perms -contains 'ohos.permission.ACCESS_CAR_DISTRIBUTED_ENGINE') { $problems += '仍含车机权限' }
if ([string]$manifest.app.versionCode -ne $appVersionCode) { $problems += "versionCode=$($manifest.app.versionCode)（期望 $appVersionCode）" }
if ($buildMode -eq 'release' -and $manifest.app.debug -eq $true) { $problems += 'debug=true（API>=11 不允许含调试信息）' }
if ($manifest.app.buildMode -ne $buildMode) { $problems += "buildMode=$($manifest.app.buildMode)（期望 $buildMode）" }
if ($problems.Count -gt 0) { throw "包自检未通过：$($problems -join '；')" }
Write-Host "包自检通过：bundleName $storeBundle / deviceTypes phone,tablet,2in1 / buildMode $($manifest.app.buildMode) / debug $($manifest.app.debug) / versionCode $appVersionCode"

if (-not $useRelease) {
    $release = Join-Path $releaseRoot "LxMine-$appVersion-Store-$stamp-local.app"
    Copy-Item -LiteralPath $appPack -Destination $release -Force
    Write-Host "LOCAL（debug 构建、未签名，仅供本机验证）: $release"
    Write-Host ''
    Write-Host '发布签名：.\scripts\build-store.ps1 -SkipStage -ReleaseSigning'
    Write-Host "材料目录默认 $materialDir（p12 / cer / p7b / credentials.txt）"
    exit 2
}

if ($manifest.app.debug -eq $true -or $manifest.app.buildMode -ne 'release') {
    throw '包内仍是 debug 构建或未签名，不能上传。'
}
$release = Join-Path $releaseRoot "LxMine-$appVersion-Store-$stamp.app"
if ($appPack -ne $release) { Copy-Item -LiteralPath $appPack -Destination $release -Force }
$hash = (Get-FileHash -LiteralPath $release -Algorithm SHA256).Hash
Write-Host "STORE: $release"
Write-Host "versionName $appVersion / versionCode $appVersionCode / bundleName $storeBundle / deviceTypes phone,tablet,2in1"
Write-Host "SHA256: $hash"
Write-Host ''
Write-Host '下一步（AGC 邀请测试）：'
Write-Host '  1. 应用上架 > 软件包管理 -> 上传该 .app，使用场景选「仅测试」'
Write-Host '  2. 应用测试 > 测试用户 -> 新建测试群组'
Write-Host '  3. 应用测试 > 测试版本列表 -> 创建测试版本 -> 邀请测试 -> 选包 -> 测试时间(<=90天) -> 提交审核'
Write-Host '  4. 审核通过后复制版本分享链接；未录入群组的朋友用 分享链接 + &invitationCode=<邀请码>'
Write-Host '  详见 docs/INVITE_TEST.md'
