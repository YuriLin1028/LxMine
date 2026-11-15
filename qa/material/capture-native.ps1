param([string]$Target = $env:LXMINE_DEVICE, [ValidateSet('grid','type','grid-tiers','type-tiers')][string]$Scene = 'type')
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 required' }
$hdc = 'D:\Program Files\Huawei\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe'
$dir = Join-Path $PSScriptRoot 'artifacts'
function Native([string[]]$Command) {
  $output = & $hdc -t $Target @Command
  if ($LASTEXITCODE -ne 0) { throw ($output -join "`n") }
  return $output
}
function Layout([bool]$On) {
  for ($attempt=0; $attempt -lt 8; $attempt++) {
    Native @('shell','uitest','dumpLayout','-p','/data/local/tmp/lm-material-layout.json') | Out-Null
    Native @('file','recv','/data/local/tmp/lm-material-layout.json',(Join-Path $dir 'pending-layout.json')) | Out-Null
    $tree = Get-Content -Raw (Join-Path $dir 'pending-layout.json') | ConvertFrom-Json
    $nodes = [Collections.Generic.List[object]]::new()
    function Visit($node) { if($node.attributes.id -like '*lab*') { $nodes.Add($node.attributes) }; foreach($child in $node.children) { Visit $child } }
    Visit $tree
    $metadata = $nodes | Where-Object id -eq 'lab-metadata'
    $expected = 'enabled=' + $On.ToString().ToLowerInvariant()
    if ($metadata.text -like "*supported=true; level=0; $expected*") { return $nodes }
    Start-Sleep -Milliseconds 350
  }
  throw 'Native reference not ready, not EXQUISITE, or the phone is locked; no golden image accepted.'
}
function Capture([ValidateSet('native-on','native-off','native-repeat')][string]$Name) {
  # Both HDC endpoints have been observed to retain trailing bytes on overwrite.
  # A fresh filename prevents old screenshot data surviving after PNG IEND.
  Native @('shell','rm','-f',"/data/local/tmp/lm-$Name.png") | Out-Null
  $localPng = Join-Path $dir "$Name.png"
  if (Test-Path -LiteralPath $localPng) { Remove-Item -LiteralPath $localPng }
  Native @('shell','uitest','screenCap','-p',"/data/local/tmp/lm-$Name.png") | Out-Null
  Native @('file','recv',"/data/local/tmp/lm-$Name.png",(Join-Path $dir "$Name.png")) | Out-Null
  Copy-Item -LiteralPath (Join-Path $dir 'pending-layout.json') -Destination (Join-Path $dir "$Name-layout.json") -Force
}
try {
  Native @('install','-r',(Join-Path $dir 'material-lab.hap')) | Out-Null
  $ability = if ($Scene.EndsWith('-tiers')) { 'MaterialTierAbility' } else { 'MaterialLabAbility' }
  $launch = Native @('shell','aa','start','-a',$ability,'-b','com.lxlia.player')
  if (($launch -join ' ') -notlike '*start ability successfully*') { throw ($launch -join "`n") }
  $nodes = Layout $true
  Start-Sleep -Milliseconds 700
  Capture 'native-on'
  $toggle = $nodes | Where-Object id -eq 'material-lab-toggle'
  $bounds = [regex]::Matches($toggle.bounds,'\d+') | ForEach-Object { [int]$_.Value }
  $x = [int](($bounds[0]+$bounds[2])/2); $y = [int](($bounds[1]+$bounds[3])/2)
  Native @('shell','uitest','uiInput','click',"$x","$y") | Out-Null
  $null = Layout $false
  Start-Sleep -Milliseconds 700
  Capture 'native-off'
  Native @('shell','uitest','uiInput','click',"$x","$y") | Out-Null
  $null = Layout $true
  Start-Sleep -Milliseconds 700
  Capture 'native-repeat'
  $reference = Join-Path $dir "references/$Scene"
  if (Test-Path -LiteralPath $reference) {
    $archive = Join-Path $dir ("reference-history/" + $Scene + '-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss-fff'))
    New-Item -ItemType Directory -Path (Split-Path -Parent $archive) -Force | Out-Null
    Copy-Item -LiteralPath $reference -Destination $archive -Recurse
  }
  New-Item -ItemType Directory -Path $reference -Force | Out-Null
  foreach($name in @('native-on','native-off','native-repeat')) {
    Copy-Item -LiteralPath (Join-Path $dir "$name.png"),(Join-Path $dir "$name-layout.json") -Destination $reference -Force
  }
  $hashes = [ordered]@{}
  Get-ChildItem -LiteralPath $reference -File | Where-Object Extension -in '.png','.json' | ForEach-Object { $hashes[$_.Name] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
  [ordered]@{ capturedAt=(Get-Date).ToUniversalTime().ToString('o'); device=$Target; model=(Native @('shell','param','get','const.product.model') -join '').Trim(); scene=$Scene; metadata=($nodes|Where-Object id -eq 'lab-metadata').text; hashes=$hashes } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $reference 'capture.json')
  Write-Output "Native $Scene reference captured and verified."
} finally {
  Native @('install','-r',(Join-Path $dir 'normal-before-lab.hap')) | Out-Null
  Native @('shell','aa','start','-a','EntryAbility','-b','com.lxlia.player') | Out-Null
  foreach ($name in @('native-on','native-off','native-repeat')) { Native @('shell','rm','-f',"/data/local/tmp/lm-$name.png") | Out-Null }
}
