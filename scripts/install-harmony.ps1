param(
    [string]$Target = ''
)

# 构建并安装鸿蒙版。前提：已经在 DevEco Studio 里为 apps/harmony 启用「自动生成签名」，
# 否则 hvigor 只会产出 unsigned HAP，脚本会直接报错退出。
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw '请使用 PowerShell 7：pwsh.exe -File scripts/install-harmony.ps1' }

$sdk = 'D:\Program Files\Huawei\DevEco Studio\sdk'
$jbr = 'D:\Program Files\Huawei\DevEco Studio\jbr'
$hvigor = 'D:\Program Files\Huawei\DevEco Studio\tools\hvigor\bin\hvigorw.bat'
$env:DEVECO_SDK_HOME = $sdk
$env:JAVA_HOME = $jbr
$env:PATH = "$jbr\bin;$env:PATH"

Push-Location (Join-Path $PSScriptRoot '..\apps\harmony')
try {
    & $hvigor assembleHap --mode module -p product=default --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "hvigor 构建失败（exit $LASTEXITCODE）" }

    $hap = Join-Path (Get-Location) 'entry\build\default\outputs\default\entry-default-signed.hap'
    if (-not (Test-Path $hap)) {
        throw '没有找到已签名的 HAP。请先在 DevEco Studio 的 Project Structure → Signing Configs 勾选自动签名。'
    }

    $hdc = Join-Path $sdk 'default\openharmony\toolchains\hdc.exe'
    $arguments = @('install', '-r', $hap)
    if ($Target) { $arguments = @('-t', $Target) + $arguments }
    & $hdc @arguments
    if ($LASTEXITCODE -ne 0) { throw "hdc 安装失败（exit $LASTEXITCODE）" }
    Write-Host '安装完成。' -ForegroundColor Green
} finally {
    Pop-Location
}
