param([switch]$ConfigureOnly, [switch]$SkipStage, [string]$SigningConfig)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($PSVersionTable.PSVersion.Major -lt 7) { throw '请使用 PowerShell 7。' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$project = Join-Path $projectRoot 'apps/harmony'
$appConfigPath = Join-Path $project 'AppScope/app.json5'
$appVersion = (Get-Content -LiteralPath $appConfigPath -Raw | ConvertFrom-Json).app.versionName
if ([string]::IsNullOrWhiteSpace($appVersion)) { throw '无法从 AppScope/app.json5 读取 versionName' }
$profilePath = Join-Path $project 'build-profile.json5'
$profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json -AsHashtable
$product = $profile.app.products | Where-Object name -EQ 'hicar' | Select-Object -First 1
if (-not $product) {
    $base = $profile.app.products | Where-Object name -EQ 'default' | Select-Object -First 1
    $product = ($base | ConvertTo-Json -Depth 30 | ConvertFrom-Json -AsHashtable)
    $product.name = 'hicar'
    $product.bundleName = 'cn.migu.music'
    # A debug provisioning profile is tied to one bundle. Never reuse the default
    # profile or alter/forge it; let DevEco generate a new one for this product.
    $product.Remove('signingConfig') | Out-Null
    $profile.app.products += $product
}
if ($product.bundleName -ne 'cn.migu.music') { throw 'HiCar 产品包名与已核对的兼容方案不符。' }
if ($SigningConfig) {
    if (-not ($profile.app.signingConfigs | Where-Object name -EQ $SigningConfig)) {
        throw "signingConfigs 中不存在名为 $SigningConfig 的签名配置。"
    }
    $product.signingConfig = $SigningConfig
}
# A debug profile is bound to exactly one bundle-name. Refuse to sign the HiCar
# product with material issued for another bundle instead of failing deep inside
# hvigor with BUNDLE_NAME_DOES_NOT_MATCH.
if ($product.signingConfig) {
    $sc = $profile.app.signingConfigs | Where-Object name -EQ $product.signingConfig | Select-Object -First 1
    $p7bPath = if ($sc.material.profile) { $sc.material.profile } else { $null }
    if ($p7bPath -and (Test-Path -LiteralPath $p7bPath)) {
        $raw = [System.Text.Encoding]::GetEncoding(28591).GetString([System.IO.File]::ReadAllBytes($p7bPath))
        $match = [regex]::Match($raw, '"bundle-name"\s*:\s*"([^"]+)"')
        if ($match.Success -and $match.Groups[1].Value -ne 'cn.migu.music') {
            throw "签名配置 $($product.signingConfig) 的 profile 属于 $($match.Groups[1].Value)，不能用于 cn.migu.music。请为 hicar 产品在 DevEco 中单独生成签名。"
        }
    }
}
foreach ($module in $profile.modules) {
    foreach ($target in $module.targets) {
        if ($target.name -eq 'default' -and 'hicar' -notin $target.applyToProducts) { $target.applyToProducts += 'hicar' }
    }
}
$profile | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $profilePath -Encoding utf8
if ($ConfigureOnly) { Write-Host 'HiCar product configured; default product unchanged.'; return }
if (-not $SkipStage) {
    Push-Location (Join-Path $projectRoot 'apps/desktop')
    try { & npm.cmd run build:harmony-stage; if ($LASTEXITCODE -ne 0) { throw '舞台构建失败' } }
    finally { Pop-Location }
}
$studio = 'D:/Program Files/Huawei/DevEco Studio'
$env:DEVECO_SDK_HOME = Join-Path $studio 'sdk'
$env:JAVA_HOME = Join-Path $studio 'jbr'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
Push-Location $project
try {
    & (Join-Path $studio 'tools/hvigor/bin/hvigorw.bat') assembleHap --mode module -p product=hicar --no-daemon
    if ($LASTEXITCODE -ne 0) { throw 'HiCar HAP 构建失败。' }
} finally { Pop-Location }
$out = Join-Path $project 'entry/build/hicar/outputs/default'
$signed = Join-Path $out 'entry-default-signed.hap'
$unsigned = Join-Path $out 'entry-default-unsigned.hap'
foreach ($hapPath in @($signed, $unsigned)) {
    if (Test-Path -LiteralPath $hapPath) {
        & (Join-Path $PSScriptRoot 'check-harmony-sources.ps1') -Path $hapPath
    }
}
$releaseRoot = Join-Path $projectRoot 'releases/harmony'
New-Item -ItemType Directory -Force $releaseRoot | Out-Null
$stamp = Get-Date -Format yyyyMMdd
if ($product.signingConfig -and (Test-Path -LiteralPath $signed)) {
    $release = Join-Path $releaseRoot "LxMine-$appVersion-HiCar-$stamp.hap"
    Copy-Item -LiteralPath $signed -Destination $release
    Write-Host "SIGNED: $release"
    exit 0
} elseif (Test-Path -LiteralPath $unsigned) {
    $release = Join-Path $releaseRoot "LxMine-$appVersion-HiCar-$stamp-unsigned.hap"
    Copy-Item -LiteralPath $unsigned -Destination $release
    Write-Host "UNSIGNED: $release"
    Write-Host ''
    Write-Host '需要为 cn.migu.music 单独签发调试 profile，本机现有材料都绑定其他包名，不能复用：'
    Write-Host '  DevEco Studio -> File -> Project Structure -> Project -> Signing Configs'
    Write-Host '  1. 取消勾选 Automatically generate signature，Products 切到 hicar'
    Write-Host '  2. 新增一份签名配置（不要覆盖 default），勾选自动签名，等待 AGC 签发'
    Write-Host '  3. 回归本脚本：.\scripts\build-hicar.ps1 -SigningConfig <新配置名>'
    exit 2
} else { throw "构建完成但未找到产物：$out" }
