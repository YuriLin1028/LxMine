# Publish a built runtime once, then point the desktop shortcut straight at it.
# Existing running releases and user data are left in place.
param([string]$SourceDirectory)
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'LxMine requires PowerShell 7 or later.' }
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (!$SourceDirectory) { $SourceDirectory = Join-Path $root 'apps\desktop\dist\win-unpacked' }
$source = (Resolve-Path -LiteralPath $SourceDirectory).Path.TrimEnd('\')
if (!(Test-Path -LiteralPath (Join-Path $source 'LxMine.exe'))) { throw 'Missing built LxMine.exe.' }
$package = Get-Content -LiteralPath (Join-Path $source 'resources\app\package.json') -Raw | ConvertFrom-Json
if ($package.productName -ne 'LxMine') { throw 'The source is not a built LxMine runtime.' }
$manifest = @(Get-ChildItem -LiteralPath $source -Recurse -File | Sort-Object FullName | ForEach-Object {
  [ordered]@{ path = [IO.Path]::GetRelativePath($source, $_.FullName); size = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
})
$json = ConvertTo-Json -InputObject $manifest -Depth 4 -Compress
$digest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($json))).ToLowerInvariant()
$runtimeRoot = Join-Path $root 'releases\windows\runtime'
$name = 'bundle-' + $digest.Substring(0,16)
$destination = Join-Path $runtimeRoot $name
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
if (!(Test-Path -LiteralPath $destination)) {
  Copy-Item -LiteralPath $source -Destination $destination -Recurse
}
foreach ($file in $manifest) {
  $copy = Join-Path $destination $file.path
  if (!(Test-Path -LiteralPath $copy) -or (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) {
    throw ('Runtime copy verification failed: ' + $file.path)
  }
}
$json | Set-Content -LiteralPath (Join-Path $destination 'runtime-manifest.json') -Encoding utf8NoBOM
$pointer = [ordered]@{ entry = "$name\LxMine.exe"; bundleSHA256 = $digest; version = $package.version; publishedAt = [DateTimeOffset]::Now.ToString('o'); source = $source }
$temporary = Join-Path $runtimeRoot 'current.pending.json'
$pointer | ConvertTo-Json | Set-Content -LiteralPath $temporary -Encoding utf8NoBOM
Move-Item -LiteralPath $temporary -Destination (Join-Path $runtimeRoot 'current.json') -Force
& (Join-Path $PSScriptRoot 'create-lxmine-shortcut.ps1')
Write-Output "Local runtime published and verified: $destination"
