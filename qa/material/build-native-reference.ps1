param([string]$Target = $env:LXMINE_DEVICE)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 required' }
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$project = Join-Path $root 'apps/harmony'
$artifacts = Join-Path $PSScriptRoot 'artifacts'
$module = Join-Path $project 'entry/src/main/module.json5'
$pages = Join-Path $project 'entry/src/main/resources/base/profile/main_pages.json'
$hap = Join-Path $project 'entry/build/default/outputs/default/entry-default-signed.hap'
$original = Join-Path $artifacts 'normal-before-lab.hap'
$moduleBytes = [IO.File]::ReadAllBytes($module)
$pageBytes = [IO.File]::ReadAllBytes($pages)
$injected = @(
  @{ From = 'native/MaterialLabAbility.ets'; To = 'entry/src/main/ets/entryability/MaterialLabAbility.ets' },
  @{ From = 'native/MaterialLab.ets'; To = 'entry/src/main/ets/pages/MaterialLab.ets' },
  @{ From = 'native/MaterialTierAbility.ets'; To = 'entry/src/main/ets/entryability/MaterialTierAbility.ets' },
  @{ From = 'native/MaterialTierLab.ets'; To = 'entry/src/main/ets/pages/MaterialTierLab.ets' },
  @{ From = 'native/NativeMenuAbility.ets'; To = 'entry/src/main/ets/entryability/NativeMenuAbility.ets' },
  @{ From = 'native/NativeMenuLab.ets'; To = 'entry/src/main/ets/pages/NativeMenuLab.ets' },
  @{ From = 'fixture.png'; To = 'entry/src/main/resources/rawfile/material-lab.png' }
  @{ From = 'fixture-type.png'; To = 'entry/src/main/resources/rawfile/material-lab-type.png' }
)
$created = [Collections.Generic.List[string]]::new()
foreach ($item in $injected) {
  if (Test-Path -LiteralPath (Join-Path $project $item.To)) { throw "Lab path already exists; preserve it and recover the previous lab run before continuing: $($item.To)" }
}
$normalHash = (Get-FileHash -LiteralPath $hap -Algorithm SHA256).Hash.Substring(0,16)
$versionedNormal = Join-Path $artifacts "normal-$normalHash.hap"
if (!(Test-Path -LiteralPath $versionedNormal)) { Copy-Item -LiteralPath $hap -Destination $versionedNormal }
Copy-Item -LiteralPath $hap -Destination $original -Force
try {
  foreach ($item in $injected) {
    $targetPath = Join-Path $project $item.To
    if (Test-Path -LiteralPath $targetPath) { throw "Temporary lab path already exists: $targetPath" }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $item.From) -Destination $targetPath
    $created.Add($targetPath)
  }
  $manifest = [Text.Encoding]::UTF8.GetString($moduleBytes) | ConvertFrom-Json
  $manifest.module.abilities += [pscustomobject]@{
    name='MaterialLabAbility'; srcEntry='./ets/entryability/MaterialLabAbility.ets'; exported=$true;
    label='$string:app_name'; icon='$media:layered_image';
    startWindowIcon='$media:start_window_icon'; startWindowBackground='$color:start_window_background'
  }
  $manifest.module.abilities += [pscustomobject]@{
    name='MaterialTierAbility'; srcEntry='./ets/entryability/MaterialTierAbility.ets'; exported=$true;
    label='$string:app_name'; icon='$media:layered_image';
    startWindowIcon='$media:start_window_icon'; startWindowBackground='$color:start_window_background'
  }
  $manifest.module.abilities += [pscustomobject]@{
    name='NativeMenuAbility'; srcEntry='./ets/entryability/NativeMenuAbility.ets'; exported=$true;
    label='$string:app_name'; icon='$media:layered_image';
    startWindowIcon='$media:start_window_icon'; startWindowBackground='$color:start_window_background'
  }
  [IO.File]::WriteAllText($module, ($manifest | ConvertTo-Json -Depth 30))
  [IO.File]::WriteAllText($pages, '{"src":["pages/Index","pages/MaterialLab","pages/MaterialTierLab","pages/NativeMenuLab"]}')
  & (Join-Path $root 'scripts/build-harmony.ps1') -SkipStage
  if ($LASTEXITCODE -ne 0) { throw 'Native material lab build failed' }
  Copy-Item -LiteralPath $hap -Destination (Join-Path $artifacts 'material-lab.hap') -Force
} finally {
  [IO.File]::WriteAllBytes($module, $moduleBytes)
  [IO.File]::WriteAllBytes($pages, $pageBytes)
  foreach ($targetPath in $created) {
    if ((Test-Path -LiteralPath $targetPath) -and [IO.Path]::GetFullPath($targetPath).StartsWith($project + [IO.Path]::DirectorySeparatorChar)) { Remove-Item -LiteralPath $targetPath }
  }
  # Keep normal install scripts pointing to the normal HAP, never the lab.
  Copy-Item -LiteralPath $original -Destination $hap -Force
}
