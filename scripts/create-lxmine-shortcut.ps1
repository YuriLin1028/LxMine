if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'LxMine requires PowerShell 7 or later.' }
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pointerPath = Join-Path $root 'releases\windows\runtime\current.json'
$target = $null
if (Test-Path -LiteralPath $pointerPath) {
  $runtime = Get-Content -LiteralPath $pointerPath -Raw | ConvertFrom-Json
  $target = Join-Path (Join-Path $root 'releases\windows\runtime') $runtime.entry
}
if (!$target -or !(Test-Path -LiteralPath $target)) {
  throw 'Publish the local runtime with scripts/publish-local-runtime.ps1 before creating the shortcut.'
}
$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'LxMine.lnk'
$shortcut = $ws.CreateShortcut($lnk)
$shortcut.TargetPath = $target
$shortcut.Arguments = ''
$shortcut.WorkingDirectory = Split-Path -Parent $target
$shortcut.IconLocation = (Join-Path $root 'apps\desktop\build\icon.ico') + ',0'
$shortcut.Description = 'LxMine'
$shortcut.WindowStyle = 1
$shortcut.Save()
Write-Output $lnk
