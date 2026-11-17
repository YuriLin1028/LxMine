param([switch]$SkipStage)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw '需要 PowerShell 7：pwsh.exe -File scripts/build-harmony.ps1' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$studio = 'D:\Program Files\Huawei\DevEco Studio'
if (-not $SkipStage) {
  Push-Location (Join-Path $projectRoot 'apps\desktop')
  try { & npm.cmd run build:harmony-stage; if ($LASTEXITCODE -ne 0) { throw 'MineRadio 动效资源构建失败' } }
  finally { Pop-Location }
}
$entry = Join-Path $projectRoot 'apps\harmony\entry\src\main\resources\rawfile\mine-stage\harmony-stage.html'
if (-not (Test-Path -LiteralPath $entry)) { throw '缺少 MineRadio 渲染资源，请先运行完整构建' }
$env:DEVECO_SDK_HOME = Join-Path $studio 'sdk'
$env:JAVA_HOME = Join-Path $studio 'jbr'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
Push-Location (Join-Path $projectRoot 'apps\harmony')
try {
  & (Join-Path $studio 'tools\hvigor\bin\hvigorw.bat') assembleHap --mode module -p product=default --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'HarmonyOS HAP 构建失败' }
} finally { Pop-Location }
$output = Join-Path $projectRoot 'apps\harmony\entry\build\default\outputs\default'
foreach ($fileName in @('entry-default-signed.hap', 'entry-default-unsigned.hap')) {
  $hapPath = Join-Path $output $fileName
  if (Test-Path -LiteralPath $hapPath) {
    & (Join-Path $PSScriptRoot 'check-harmony-sources.ps1') -Path $hapPath
  }
}
