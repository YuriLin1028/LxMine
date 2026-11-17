#Requires -Version 7.0
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$websitePath = Join-Path $repositoryRoot 'website'
$repository = 'YuriLin1028/LxMine'
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$publishPath = [IO.Path]::GetFullPath((Join-Path $temporaryRoot ('lxmine-website-' + [Guid]::NewGuid().ToString('N'))))
$temporaryPrefix = $temporaryRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $publishPath.StartsWith($temporaryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The publish checkout must be inside the temporary directory.'
}

function Invoke-Checked {
    param([string] $Program, [Parameter(ValueFromRemainingArguments = $true)] [string[]] $Arguments)
    $result = & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program failed with exit code $LASTEXITCODE."
    }
    return $result
}

if (-not (Test-Path -LiteralPath (Join-Path $websitePath 'index.html'))) {
    throw "Website source is missing at $websitePath."
}

# Publish only the website directory from an isolated temporary Git repository.
# The main checkout can contain unrelated work in progress.
$remote = Invoke-Checked git @('-C', $repositoryRoot, 'remote', 'get-url', 'origin')
if ($remote -notmatch '^https://github\.com/YuriLin1028/LxMine(?:\.git)?$') {
    throw 'The origin remote must point to YuriLin1028/LxMine.'
}
$authorName = Invoke-Checked git @('-C', $repositoryRoot, 'config', 'user.name')
$authorEmail = Invoke-Checked git @('-C', $repositoryRoot, 'config', 'user.email')
$release = (Invoke-Checked gh @('api', "repos/$repository/releases/latest")) | ConvertFrom-Json
$currentPagesText = & gh api "repos/$repository/pages" 2>$null
$configuredDomain = ''
if ($LASTEXITCODE -eq 0) {
    $configuredDomain = [string](($currentPagesText | ConvertFrom-Json).cname)
}
$snapshot = [ordered]@{
    tag_name = $release.tag_name
    html_url = $release.html_url
    published_at = $release.published_at
    draft = $release.draft
    prerelease = $release.prerelease
    assets = @($release.assets | ForEach-Object {
        [ordered]@{
            name = $_.name
            size = $_.size
            browser_download_url = $_.browser_download_url
            digest = $_.digest
        }
    })
}

try {
    New-Item -ItemType Directory -Path $publishPath | Out-Null
    Invoke-Checked git @('-C', $publishPath, 'init', '--quiet') | Out-Null
    Invoke-Checked git @('-C', $publishPath, 'config', 'core.autocrlf', 'input') | Out-Null
    Invoke-Checked git @('-C', $publishPath, 'remote', 'add', 'origin', $remote) | Out-Null
    $existingBranch = Invoke-Checked git @('-C', $publishPath, 'ls-remote', '--heads', 'origin', 'gh-pages')
    if ($existingBranch) {
        Invoke-Checked git @('-C', $publishPath, 'fetch', '--quiet', '--depth=1', 'origin', 'gh-pages') | Out-Null
        Invoke-Checked git @('-C', $publishPath, 'checkout', '--quiet', '-b', 'gh-pages', 'FETCH_HEAD') | Out-Null
        # Remove the previous deployment's tracked files from this temporary checkout.
        Invoke-Checked git @('-C', $publishPath, 'rm', '-r', '--quiet', '--ignore-unmatch', '.') | Out-Null
    } else {
        Invoke-Checked git @('-C', $publishPath, 'checkout', '--quiet', '--orphan', 'gh-pages') | Out-Null
    }

    Get-ChildItem -LiteralPath $websitePath -Force | Copy-Item -Destination $publishPath -Recurse -Force
    $snapshot | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $publishPath 'release.json') -Encoding utf8NoBOM
    if ($configuredDomain) {
        # Keep an attached domain and canonical URLs consistent on subsequent releases.
        Set-Content -LiteralPath (Join-Path $publishPath 'CNAME') -Value $configuredDomain -Encoding utf8NoBOM
        $customOrigin = "https://$configuredDomain/"
        foreach ($relativePath in @('index.html', 'robots.txt', 'sitemap.xml')) {
            $filePath = Join-Path $publishPath $relativePath
            $content = Get-Content -LiteralPath $filePath -Raw
            $content.Replace('https://yurilin1028.github.io/LxMine/', $customOrigin) | Set-Content -LiteralPath $filePath -Encoding utf8NoBOM -NoNewline
        }
    }
    Invoke-Checked git @('-C', $publishPath, 'add', '--all') | Out-Null
    & git -C $publishPath diff --cached --quiet
    if ($LASTEXITCODE -eq 1) {
        Invoke-Checked git @('-C', $publishPath, '-c', "user.name=$authorName", '-c', "user.email=$authorEmail", 'commit', '--quiet', '-m', "Publish LxMine website ($($release.tag_name))") | Out-Null
        Invoke-Checked git @('-C', $publishPath, 'push', 'origin', 'HEAD:refs/heads/gh-pages') | Out-Null
    } elseif ($LASTEXITCODE -ne 0) {
        throw 'Unable to inspect the deployment changes.'
    }
    $commit = Invoke-Checked git @('-C', $publishPath, 'rev-parse', 'HEAD')

    # Pushing gh-pages can enable Pages automatically. Re-read after the push.
    $pagesText = & gh api "repos/$repository/pages" 2>$null
    if ($LASTEXITCODE -ne 0) {
        $pagesText = & gh api --method POST "repos/$repository/pages" -f 'source[branch]=gh-pages' -f 'source[path]=/' 2>$null
        if ($LASTEXITCODE -ne 0) {
            # Recover when another enablement request completed concurrently.
            $pagesText = Invoke-Checked gh @('api', "repos/$repository/pages")
        }
    }
    $pages = $pagesText | ConvertFrom-Json
    if ($pages.source.branch -ne 'gh-pages' -or $pages.source.path -ne '/' -or $pages.build_type -ne 'legacy') {
        Invoke-Checked gh @('api', '--method', 'PUT', "repos/$repository/pages", '-f', 'build_type=legacy', '-f', 'source[branch]=gh-pages', '-f', 'source[path]=/') | Out-Null
    }
    $siteUrl = $pages.html_url
    Invoke-Checked gh @('api', '--method', 'PATCH', "repos/$repository", '-f', "homepage=$siteUrl") | Out-Null
    Write-Output "Published source $commit. Waiting for GitHub Pages."

    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $buildText = & gh api "repos/$repository/pages/builds/latest" 2>$null
        if ($LASTEXITCODE -eq 0) {
            $build = $buildText | ConvertFrom-Json
            if ($build.commit -eq $commit -and $build.status -eq 'built') {
                Write-Output "GitHub Pages is ready at $siteUrl"
                return
            }
            if ($build.commit -eq $commit -and $build.status -eq 'errored') {
                throw "GitHub Pages build failed. $($build.error.message)"
            }
        }
        Start-Sleep -Seconds 5
    }
    throw "GitHub Pages is still building. Inspect https://github.com/$repository/actions."
} finally {
    # Check the absolute target before recursively deleting the owned temporary directory.
    $resolvedPublishPath = [IO.Path]::GetFullPath($publishPath)
    if ($resolvedPublishPath.StartsWith($temporaryPrefix, [StringComparison]::OrdinalIgnoreCase) -and
        ([IO.Path]::GetFileName($resolvedPublishPath)).StartsWith('lxmine-website-') -and
        (Test-Path -LiteralPath $resolvedPublishPath)) {
        Remove-Item -LiteralPath $resolvedPublishPath -Recurse -Force
    }
}
