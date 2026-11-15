if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7 required'}
$ErrorActionPreference='Stop'
$hdc='D:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe'
$target=$env:LXMINE_DEVICE
$out=Join-Path $PSScriptRoot 'artifacts/native-select-regression';New-Item -ItemType Directory -Path $out -Force|Out-Null
function Native([string[]]$a){$r=& $hdc -t $target @a|Out-String;if($r -match '\[Fail\]|not found|error:'){throw $r};return $r}
function Walk($n){if($n.attributes){$n.attributes};foreach($c in $n.children){Walk $c}}
function Dump([string]$label){$r='/data/local/tmp/lxm-select-'+$label+'.json';$p=Join-Path $out ($label+'.json');Native @('shell','uitest','dumpLayout','-p',$r)|Out-Null;Native @('file','recv',$r,$p)|Out-Null;return @(Walk (Get-Content $p -Raw|ConvertFrom-Json))}
function Tap($n){if(!$n){throw 'Missing target'};$b=[regex]::Matches($n.bounds,'\d+')|ForEach-Object{[int]$_.Value};Native @('shell','uitest','uiInput','click',([int](($b[0]+$b[2])/2)).ToString(),([int](($b[1]+$b[3])/2)).ToString())|Out-Null;Start-Sleep -Milliseconds 1000}
Start-Sleep -Milliseconds 1000
$nodes=Dump 'home';$cover=$nodes|Where-Object id -EQ 'dock-cover'|Select-Object -First 1;Tap $cover
$nodes=Dump 'detail';$results=@();$geometry=@()
foreach($select in @($nodes|Where-Object type -EQ 'Select')){
 $b=[regex]::Matches($select.bounds,'\d+')|ForEach-Object{[int]$_.Value}
 $width=$b[2]-$b[0];$height=$b[3]-$b[1]
 if($width -gt 134 -or $height -gt 134){throw "Native Select trigger exceeds its 38vp slot: $width x $height"}
 $geometry+=@{width=$width;height=$height}
}
foreach($kind in @('quality','style')){
 Tap ($nodes|Where-Object id -EQ "player-$kind"|Select-Object -First 1)
 $opened=Dump $kind;$options=@($opened|Where-Object type -EQ 'Option');$selected=@($options|Where-Object selected -EQ 'true')
 if($options.Count -lt 3 -or $selected.Count -ne 1){throw "Wrong native Select state: $kind"}
 if($options.text -match '✓|✔|MineRadio 动效'){throw "Old menu label retained: $kind"}
 $r='/data/local/tmp/lxm-select-'+$kind+'.png';Native @('shell','uitest','screenCap','-p',$r)|Out-Null;Native @('file','recv',$r,(Join-Path $out ($kind+'.png')))|Out-Null
 $results+=@{kind=$kind;options=$options.Count;selected=$selected[0].text;background=$selected[0].backgroundColor;checkmarks=$false;header=$false}
 Native @('shell','uitest','uiInput','keyEvent','Back')|Out-Null;Start-Sleep -Milliseconds 300
}
Native @('shell','uitest','uiInput','keyEvent','Back')|Out-Null
@{status='PASS';results=$results;triggerGeometry=$geometry;normalHapSHA256=(Get-FileHash 'apps/harmony/entry/build/default/outputs/default/entry-default-signed.hap').Hash}|ConvertTo-Json -Depth 5|Set-Content (Join-Path $out report.json)
$results|ConvertTo-Json -Depth 5
