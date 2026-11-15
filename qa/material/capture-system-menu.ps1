param([string]$Target=$env:LXMINE_DEVICE)
if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7 required'}
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$hdc='D:\Program Files\Huawei\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe'
$base=Join-Path $PSScriptRoot 'artifacts/native-menu-20261019'
$runId=[DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$run=Join-Path $base "references-$runId";New-Item -ItemType Directory -Path $run | Out-Null
function Native([string[]]$Arguments){
  for($retry=0;$retry -lt 60;$retry++){
    $output=& $hdc -t $Target @Arguments 2>&1 | Out-String
    if($output -notmatch 'Device not found|connect.*failed|Offline|No connected|E001005|not found or connected'){if($output -match '\[Fail\]|error:'){throw $output};return $output}
    Start-Sleep -Milliseconds 500
  }
  throw "Device unavailable for 30s: $output"
}
function Nodes($node){if($node.attributes){$node.attributes};foreach($child in $node.children){Nodes $child}}
function Layout([string]$name){
  $remote="/data/local/tmp/lxm-menu-$runId-$name.json";$local=Join-Path $run "$name.json"
  Native @('shell','uitest','dumpLayout','-a','-p',$remote)|Out-Null;Native @('file','recv',$remote,$local)|Out-Null
  return @(Nodes (Get-Content -LiteralPath $local -Raw|ConvertFrom-Json))
}
function Capture([string]$name){
  $remote="/data/local/tmp/lxm-menu-$runId-$name.png";$local=Join-Path $run "$name.png"
  Native @('shell','uitest','screenCap','-p',$remote)|Out-Null;Native @('file','recv',$remote,$local)|Out-Null
  Copy-Item -LiteralPath $local -Destination (Join-Path $base "$name.png") -Force
}
function TapNode($nodes,[string]$id){
  $node=$nodes|Where-Object id -EQ $id|Select-Object -First 1;if(!$node){throw "Missing native target: $id"}
  $b=[regex]::Matches($node.bounds,'\d+')|ForEach-Object{[int]$_.Value}
  Native @('shell','uitest','uiInput','click',([int](($b[0]+$b[2])/2)).ToString(),([int](($b[1]+$b[3])/2)).ToString())|Out-Null
}
function OpenMenu($nodes,[string]$id,[string]$scene){
  for($attempt=0;$attempt -lt 3;$attempt++){
    TapNode $nodes $id;Start-Sleep -Milliseconds 1100
    $opened=Layout "$scene-open-$attempt"
    if($opened|Where-Object type -EQ 'Menu'){return $opened}
  }
  throw "Native menu did not open: $scene"
}
try {
Native @('install','-r',(Join-Path $PSScriptRoot 'artifacts/material-lab.hap'))|Out-Null
Native @('shell','aa','start','-a','NativeMenuAbility','-b','com.lxlia.player')|Out-Null
Start-Sleep -Milliseconds 1500
foreach($background in @('grid','type')){
  Native @('shell','uitest','uiInput','click','300','1200')|Out-Null
  Start-Sleep -Milliseconds 400
  $nodes=Layout "off-$background-layout"
  $metadata=($nodes|Where-Object id -EQ 'menu-lab-metadata').text
  if($background -eq 'grid' -and $metadata -match 'scene=type'){
    TapNode $nodes 'menu-lab-background';Start-Sleep -Milliseconds 400;$nodes=Layout 'off-grid-layout-reset';$metadata=($nodes|Where-Object id -EQ 'menu-lab-metadata').text
  }
  if($metadata -notmatch "DPR=3.5; supported=true; level=0; scene=$background"){throw "Wrong native material state: $metadata"}
  Capture "native-off-$background"
  if($background -eq 'grid'){Copy-Item -LiteralPath (Join-Path $run 'native-off-grid.png') -Destination (Join-Path $base 'native-off.png') -Force}
  foreach($kind in @('quality','style','select')){
    $id=if($kind -eq 'select'){'menu-lab-select'}else{"player-$kind"}
    $scene=if($background -eq 'grid'){$kind}else{"$kind-type"}
    $menuNodes=OpenMenu $nodes $id $scene
    $menuNodes=Layout "$scene-layout"
    Copy-Item -LiteralPath (Join-Path $run "$scene-layout.json") -Destination (Join-Path $base "$scene-layout.json") -Force
    if(!($menuNodes|Where-Object type -EQ 'Menu')){throw "Native menu did not open: $scene"}
    Capture "$scene-on"
    Native @('shell','uitest','uiInput','click','300','1200')|Out-Null;Start-Sleep -Milliseconds 250
    OpenMenu $nodes $id "$scene-repeat"|Out-Null;Capture "$scene-repeat"
    Native @('shell','uitest','uiInput','click','300','1200')|Out-Null;Start-Sleep -Milliseconds 300
  }
  if($background -eq 'grid'){TapNode $nodes 'menu-lab-background';Start-Sleep -Milliseconds 500}
}
[ordered]@{capturedAt=[DateTimeOffset]::UtcNow.ToString('o');target=$Target;metadata=$metadata;referenceFolder=$run;nativePlayerSHA256=(Get-FileHash (Join-Path $root 'apps/harmony/entry/src/main/ets/components/NativePlayer.ets')).Hash;nativeSettingsSHA256=(Get-FileHash (Join-Path $root 'apps/harmony/entry/src/main/ets/components/NativeSettings.ets')).Hash;normalHapSHA256=(Get-FileHash (Join-Path $root 'apps/harmony/entry/build/default/outputs/default/entry-default-signed.hap')).Hash;probeHapSHA256=(Get-FileHash (Join-Path $PSScriptRoot 'artifacts/material-lab.hap')).Hash;scenes=@('quality','style','select','quality-type','style-type','select-type')}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $base 'capture.json')
Write-Output "Native system menus captured: $run"
} finally {
  $normal=Join-Path $root 'apps/harmony/entry/build/default/outputs/default/entry-default-signed.hap'
  $available=& $hdc list targets | Out-String
  if($available -match [regex]::Escape($Target)){
    Native @('install','-r',$normal)|Out-Null
    Native @('shell','aa','start','-a','EntryAbility','-b','com.lxlia.player')|Out-Null
    Write-Output 'Restored normal LxMine HAP without clearing data.'
  } else {Write-Warning 'USB offline: normal HAP restore remains pending.'}
}
