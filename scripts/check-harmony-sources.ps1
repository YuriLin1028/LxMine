param([Parameter(Mandatory)][string]$Path)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw '请使用 PowerShell 7。' }
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Assert-NoBundledSources([System.IO.Compression.ZipArchive]$archive, [string]$label) {
    $sourceFiles = @($archive.Entries | Where-Object {
        $_.FullName -match '(?:^|/)(?:sources/|dev-source\.js$|lx-sources-default\.json$)'
    })
    if ($sourceFiles.Count -gt 0) {
        throw "安装包 $label 包含预置音源资源，请先移出打包目录。$($sourceFiles.FullName -join ', ')"
    }
}

$packagePath = (Resolve-Path -LiteralPath $Path).Path
$package = [System.IO.Compression.ZipFile]::OpenRead($packagePath)
try {
    if ([System.IO.Path]::GetExtension($packagePath) -eq '.app') {
        $hapEntries = @($package.Entries | Where-Object { $_.FullName -like '*.hap' })
        if ($hapEntries.Count -eq 0) { throw "APP 包里没有 HAP，$packagePath" }
        foreach ($hapEntry in $hapEntries) {
            $hapStream = $hapEntry.Open()
            try {
                $hap = [System.IO.Compression.ZipArchive]::new($hapStream, [System.IO.Compression.ZipArchiveMode]::Read)
                try { Assert-NoBundledSources $hap $hapEntry.FullName }
                finally { $hap.Dispose() }
            }
            finally { $hapStream.Dispose() }
        }
    }
    else {
        Assert-NoBundledSources $package $packagePath
    }
}
finally { $package.Dispose() }
Write-Host "无内置音源校验通过，$packagePath"
