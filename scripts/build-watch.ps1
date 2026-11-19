param(
    [ValidateSet('All', 'Wearable', 'Lite')]
    [string]$Target = 'All',
    [string]$DevEcoStudio = 'D:\Program Files\Huawei\DevEco Studio'
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw '请使用 PowerShell 7。' }

$hvigor = Join-Path $DevEcoStudio 'tools/hvigor/bin/hvigorw.bat'
$sdk = Join-Path $DevEcoStudio 'sdk'
$java = Join-Path $DevEcoStudio 'jbr'
foreach ($requiredPath in @($hvigor, $sdk, $java)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) { throw "DevEco Studio 组件不存在：$requiredPath" }
}

$root = Split-Path -Parent $PSScriptRoot
$projects = switch ($Target) {
    'Wearable' { 'watch-wearable' }
    'Lite' { 'watch-lite' }
    'All' { 'watch-wearable'; 'watch-lite' }
}
$originalSdk = $env:DEVECO_SDK_HOME
$originalJava = $env:JAVA_HOME
$originalPath = $env:PATH
$failures = [System.Collections.Generic.List[string]]::new()

try {
    $env:DEVECO_SDK_HOME = $sdk
    $env:JAVA_HOME = $java
    $env:PATH = "$(Join-Path $java 'bin');$originalPath"
    foreach ($project in $projects) {
        $projectPath = Join-Path $root "apps/$project"
        $localProfile = Join-Path $projectPath 'build-profile.json5'
        if (-not (Test-Path -LiteralPath $localProfile)) {
            Copy-Item -LiteralPath (Join-Path $projectPath 'build-profile.template.json5') -Destination $localProfile
        }
        Push-Location -LiteralPath $projectPath
        try {
            Write-Host "正在构建 $project"
            & $hvigor assembleHap --mode module -p product=default --no-daemon
            if ($LASTEXITCODE -ne 0) {
                $failures.Add($project)
                continue
            }
            $output = Join-Path $projectPath 'entry/build/default/outputs/default'
            $packages = @(Get-ChildItem -LiteralPath $output -Filter '*.hap' -File -ErrorAction SilentlyContinue)
            if ($packages.Count -eq 0) {
                $failures.Add("$project（缺少 HAP）")
                continue
            }
            $packages | ForEach-Object { Write-Host $_.FullName }
        } finally {
            Pop-Location
        }
    }
} finally {
    $env:DEVECO_SDK_HOME = $originalSdk
    $env:JAVA_HOME = $originalJava
    $env:PATH = $originalPath
}

if ($failures.Count) { throw "手表包构建失败：$($failures -join '、')" }
