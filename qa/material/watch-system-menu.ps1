if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7 required'}
$ErrorActionPreference='Stop'
$hdc='D:\Program Files\Huawei\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe'
$deadline=[DateTimeOffset]::UtcNow.AddMinutes(20)
while([DateTimeOffset]::UtcNow -lt $deadline){
  $targets=& $hdc list targets | Out-String
  if($env:LXMINE_DEVICE -and $targets -match [regex]::Escape($env:LXMINE_DEVICE)){
    try {
      & (Join-Path $PSScriptRoot 'capture-system-menu.ps1')
      if($LASTEXITCODE -ne 0){throw 'Capture incomplete'}
      Write-Output 'CAPTURE_COMPLETE';exit 0
    }catch{Write-Output ((Get-Date -Format o)+' capture interrupted: '+$_.Exception.Message)}
  }
  Start-Sleep -Seconds 5
}
throw 'USB connection did not remain available long enough to complete the native menu references.'
