# Local launches use the published runtime, never the self-extracting Portable EXE.
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
  $target = Join-Path $root 'apps\desktop\dist\win-unpacked\LxMine.exe'
}
if (!(Test-Path -LiteralPath $target)) {
  throw 'No local runtime found. Build LxMine and run scripts/publish-local-runtime.ps1 first.'
}
Start-Process -FilePath $target -WorkingDirectory (Split-Path -Parent $target)
