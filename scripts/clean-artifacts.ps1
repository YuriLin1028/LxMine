<#
.SYNOPSIS
  清理 LxMine 的构建产物与 QA 取样，只保留最新一份可运行构建和材质门禁基线。

.DESCRIPTION
  这个仓库的产物都不入 git，但没有任何自动清理，跑几天就会堆到几十 GB：
    - qa\*\artifacts     每次视觉回归的逐帧截图 / 录像 / 便携包冒烟现场
    - releases\windows   每个版本一个带日期后缀的 exe，以及每次打包一份 ~400MB 的 runtime
  默认只做试运行（打印将删除的内容和体积），加 -Execute 才真正删除。

  永远保留：
    qa\material\artifacts\approved.json          材质门禁批准报告（删了 beforePack 会拒绝打包）
    qa\material\artifacts\references\            真机材质基准样本
    qa\material\artifacts\comparison-*.png       docs/ 引用的对比图
    releases\windows\runtime\current.json        启动器读取的入口指针
    最新一份 Setup + Portable 安装包、最新一份 runtime bundle、releases\harmony 全部 HAP

.EXAMPLE
  pwsh -NoProfile -File scripts\clean-artifacts.ps1
  试运行，只打印。

.EXAMPLE
  pwsh -NoProfile -File scripts\clean-artifacts.ps1 -Execute
  真正清理 QA 产物与旧构建。

.EXAMPLE
  pwsh -NoProfile -File scripts\clean-artifacts.ps1 -Execute -IncludeResearch
  连 .research 的调研快照与缓存一起清掉（旧桌面端快照会永久丢失）。
#>
[CmdletBinding()]
param(
  [switch]$Execute,
  [switch]$IncludeResearch,
  [int]$KeepBuilds = 1
)

if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'LxMine requires PowerShell 7 or later.' }
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$artifactsRoot = Join-Path $root 'qa\material\artifacts'
$releasesWin = Join-Path $root 'releases\windows'
$runtimeRoot = Join-Path $releasesWin 'runtime'

$keepFiles = @(
  (Join-Path $artifactsRoot 'approved.json'),
  (Join-Path $runtimeRoot 'current.json')
)
$keepDirs = @( (Join-Path $artifactsRoot 'references') )

function Format-Size([double]$bytes) {
  if ($bytes -ge 1GB) { return ('{0,7:N2} GB' -f ($bytes / 1GB)) }
  if ($bytes -ge 1MB) { return ('{0,7:N1} MB' -f ($bytes / 1MB)) }
  return ('{0,7:N0} KB' -f ($bytes / 1KB))
}

function Get-PathSize([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return 0 }
  $item = Get-Item -LiteralPath $path -Force
  if (-not $item.PSIsContainer) { return [double]$item.Length }
  $sum = (Get-ChildItem -LiteralPath $path -Recurse -File -Force -ErrorAction SilentlyContinue |
          Measure-Object -Property Length -Sum).Sum
  return [double]$sum
}

$targets = New-Object System.Collections.Generic.List[string]

# 1) QA 产物：qa\material\artifacts 保留基线，其余 qa\*\artifacts 整体清空
foreach ($qaDir in Get-ChildItem -LiteralPath (Join-Path $root 'qa') -Directory -Force) {
  $art = Join-Path $qaDir.FullName 'artifacts'
  if (-not (Test-Path -LiteralPath $art)) { continue }
  $isMaterial = ($art -eq $artifactsRoot)
  foreach ($child in Get-ChildItem -LiteralPath $art -Force) {
    if ($isMaterial) {
      if ($keepDirs -contains $child.FullName) { continue }
      if ($keepFiles -contains $child.FullName) { continue }
      if (-not $child.PSIsContainer -and $child.Name -like 'comparison-*.png') { continue }
    }
    $targets.Add($child.FullName)
  }
}

# 2) 旧安装包：按写入时间保留最新 $KeepBuilds 个 Setup / Portable
$exes = Get-ChildItem -LiteralPath $releasesWin -File -Force -Filter '*.exe'
foreach ($kind in 'Setup', 'Portable') {
  $group = $exes | Where-Object { $_.Name -like "*-$kind*" } | Sort-Object LastWriteTime -Descending
  $group | Select-Object -Skip $KeepBuilds | ForEach-Object { $targets.Add($_.FullName) }
}

# 3) 旧 runtime：只留最新 bundle + current.json
if (Test-Path -LiteralPath $runtimeRoot) {
  $bundles = Get-ChildItem -LiteralPath $runtimeRoot -Directory -Force -Filter 'bundle-*' |
             Sort-Object LastWriteTime -Descending
  $bundles | Select-Object -Skip 1 | ForEach-Object { $targets.Add($_.FullName) }
  foreach ($f in Get-ChildItem -LiteralPath $runtimeRoot -File -Force) {
    if ($keepFiles -contains $f.FullName) { continue }
    $targets.Add($f.FullName)
  }
}

# 4) 可选：调研快照与缓存
if ($IncludeResearch) {
  foreach ($name in 'archives', 'npm-cache', 'qa-python', 'repos') {
    $p = Join-Path $root ".research\$name"
    if (Test-Path -LiteralPath $p) { $targets.Add($p) }
  }
}

# 安全闸：禁止越出仓库、禁止命中保留项
$prefix = $root.TrimEnd('\') + '\'
$bad = $targets | Where-Object {
  -not $_.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) -or
  $keepDirs -contains $_ -or $keepFiles -contains $_ }
if ($bad) {
  Write-Host '拒绝执行：以下目标越界或命中保留清单' -ForegroundColor Red
  $bad | ForEach-Object { Write-Host "  $_" }
  exit 1
}

$plan = foreach ($t in $targets) {
  if (-not (Test-Path -LiteralPath $t)) { continue }
  [PSCustomObject]@{ Size = (Get-PathSize $t); Path = $t.Substring($prefix.Length) }
}
$totalSize = ($plan | Measure-Object -Property Size -Sum).Sum
if (-not $totalSize) { $totalSize = 0 }

Write-Host ''
Write-Host '待清理：' -ForegroundColor Cyan
foreach ($row in ($plan | Sort-Object Size -Descending)) {
  Write-Host ("  {0}  {1}" -f (Format-Size $row.Size), $row.Path)
}
Write-Host ("  ---- 共 {0} 项，{1}" -f $plan.Count, (Format-Size $totalSize))

if (-not $Execute) {
  Write-Host ''
  Write-Host '试运行结束，未删除任何文件。加 -Execute 执行。' -ForegroundColor Yellow
  exit 0
}

$reclaimed = 0.0
$failures = @()
foreach ($row in $plan) {
  $full = Join-Path $root $row.Path
  try {
    if ((Get-Item -LiteralPath $full -Force).PSIsContainer) {
      [System.IO.Directory]::Delete($full, $true)
    } else {
      [System.IO.File]::Delete($full)
    }
    $reclaimed += $row.Size
  } catch {
    $failures += ($row.Path + ' -> ' + $_.Exception.Message)
  }
}

Write-Host ''
Write-Host ("已回收 {0}；失败 {1} 项；仓库当前 {2}" -f (Format-Size $reclaimed), $failures.Count, (Format-Size (Get-PathSize $root))) -ForegroundColor Green
$failures | ForEach-Object { Write-Host "  失败: $_" -ForegroundColor Red }
if ($failures.Count -gt 0) { exit 1 }
