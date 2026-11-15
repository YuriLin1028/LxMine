param([switch]$Revert)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($PSVersionTable.PSVersion.Major -lt 7) { throw '请使用 PowerShell 7。' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$mainProfile = Join-Path $projectRoot 'apps/harmony/build-profile.json5'
$signProject = Join-Path $projectRoot 'apps/harmony-hicar-sign'
$signProfile = Join-Path $signProject 'build-profile.json5'
$configName = 'hicar'

if (-not (Test-Path -LiteralPath $mainProfile)) { throw "缺少 $mainProfile" }
$main = Get-Content -LiteralPath $mainProfile -Raw | ConvertFrom-Json -AsHashtable

if ($Revert) {
    $main.app.signingConfigs = @($main.app.signingConfigs | Where-Object name -NE $configName)
    $p = $main.app.products | Where-Object name -EQ 'hicar' | Select-Object -First 1
    if ($p) { $p.Remove('signingConfig') | Out-Null }
    $main | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $mainProfile -Encoding utf8
    Write-Host "已移除 $configName 签名配置，hicar 产品回到未签名状态。"
    exit 0
}

if (-not (Test-Path -LiteralPath $signProfile)) { throw "找不到签名工程配置：$signProfile" }
$sign = Get-Content -LiteralPath $signProfile -Raw | ConvertFrom-Json -AsHashtable
$src = @($sign.app.signingConfigs | Where-Object { $_ -and $_.material }) | Select-Object -First 1
if (-not $src) {
    throw "签名工程里还没有签名配置。请先用 DevEco 打开 $signProject 并勾选自动签名。"
}

$material = $src.material
foreach ($key in @('storeFile', 'certpath', 'profile')) {
    if (-not $material[$key]) { throw "签名材料缺少字段 $key" }
    if (-not (Test-Path -LiteralPath $material[$key])) { throw "签名材料文件不存在：$($material[$key])" }
}

$raw = [System.Text.Encoding]::GetEncoding(28591).GetString([System.IO.File]::ReadAllBytes($material.profile))
$match = [regex]::Match($raw, '"bundle-name"\s*:\s*"([^"]+)"')
if (-not $match.Success) { throw '无法从 profile 中读取包名。' }
$profileBundle = $match.Groups[1].Value
if ($profileBundle -ne 'cn.migu.music') {
    throw "签名工程生成的 profile 包名是 $profileBundle，不是 cn.migu.music。请在签名工程里把 AppScope/app.json5 的 bundleName 改成 cn.migu.music 后重新生成。"
}
$typeMatch = [regex]::Match($raw, '"type"\s*:\s*"([^"]+)"')
Write-Host "profile 包名：$profileBundle，类型：$($typeMatch.Groups[1].Value)"

$entry = @{ name = $configName; type = $src.type; material = $material }
if (-not $src.type) { $entry.Remove('type') }
$main.app.signingConfigs = @(@($main.app.signingConfigs | Where-Object name -NE $configName) + $entry)

$product = $main.app.products | Where-Object name -EQ 'hicar' | Select-Object -First 1
if (-not $product) { throw '主工程缺少 hicar 产品配置，请先运行 build-hicar.ps1 -ConfigureOnly。' }
$product.signingConfig = $configName

$main | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $mainProfile -Encoding utf8
Write-Host "已把 $configName 签名配置写入主工程，hicar 产品现在引用它。"
Write-Host "下一步：.\scripts\build-hicar.ps1 -SkipStage -SigningConfig $configName"
