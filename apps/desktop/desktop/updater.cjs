const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO = 'YuriLin1028/LxMine';
const RELEASE_SNAPSHOT_URLS = [
  `https://yurilin1028.github.io/LxMine/windows-release.json`,
  `https://gh-proxy.org/https://raw.githubusercontent.com/${REPO}/gh-pages/windows-release.json`,
  `https://ghfast.top/https://raw.githubusercontent.com/${REPO}/gh-pages/windows-release.json`,
];
const DOWNLOAD_MIRRORS = [
  { name: 'GH-Proxy', prefix: 'https://gh-proxy.org/' },
  { name: 'GHFast', prefix: 'https://ghfast.top/' },
  { name: 'GitHub', prefix: '' },
];

let activeDownload = null;

function parseSemver(version) {
  const clean = String(version || '').trim().replace(/^v/i, '').split(/[-+]/)[0];
  const parts = clean.split('.').map(n => parseInt(n, 10));
  if (!parts.length || parts.some(n => !Number.isFinite(n) || n < 0)) return null;
  while (parts.length < 3) parts.push(0);
  return parts;
}

function compareVersions(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function validateAssetUrl(value) {
  try {
    const url = new URL(String(value || ''));
    decodeURIComponent(url.pathname);
    return url.origin === 'https://github.com'
      && url.pathname.startsWith(`/${REPO}/releases/download/`)
      && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function selectWindowsAsset(assets, tagName) {
  const list = Array.isArray(assets) ? assets.filter(a => a && typeof a.name === 'string' && validateAssetUrl(a.browser_download_url)) : [];
  const version = String(tagName || '').replace(/^v/i, '');
  const exactSetup = `lxmine-${version}-setup.exe`.toLowerCase();
  return list.find(a => a.name.toLowerCase() === exactSetup)
    || list.find(a => /setup\.exe$/i.test(a.name))
    || list.find(a => /\.exe$/i.test(a.name) && !/portable/i.test(a.name))
    || list.find(a => /\.exe$/i.test(a.name))
    || null;
}

function fetchJson(url, timeoutMs = 8000, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const parsed = new URL(url);
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'LxMine-Updater/1.1',
        'Accept': 'application/vnd.github+json, application/json',
      },
      timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        fetchJson(nextUrl, timeoutMs, redirects + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > 2 * 1024 * 1024) {
          req.destroy(new Error('Response too large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!data || typeof data.tag_name !== 'string' || !Array.isArray(data.assets)) {
            reject(new Error('Invalid release payload'));
            return;
          }
          if (data.draft || data.prerelease) {
            reject(new Error('Not a stable release'));
            return;
          }
          resolve(data);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
  });
}

async function fetchLatestRelease() {
  // Windows 端严格隔离，仅拉取 windows-release.json；任一镜像返回后最多等待 1200ms 择优，避免慢镜像拖累 8.5s。
  const candidates = RELEASE_SNAPSHOT_URLS.slice();
  return new Promise((resolve, reject) => {
    const valid = [];
    let settled = 0;
    let firstErr = null;
    let done = false;
    let graceTimer = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (graceTimer) clearTimeout(graceTimer);
      if (!valid.length) {
        reject(new Error(firstErr ? firstErr.message : '无法连接更新服务器'));
        return;
      }
      valid.sort((a, b) => {
        const cmp = compareVersions(b.data.tag_name, a.data.tag_name);
        if (cmp !== 0) return cmp;
        return a.idx - b.idx;
      });
      resolve(valid[0].data);
    };
    candidates.forEach((url, idx) => {
      fetchJson(url, 8500).then((data) => {
        valid.push({ data, idx });
        settled += 1;
        if (settled >= candidates.length || idx === 0) finish();
        else if (!graceTimer) graceTimer = setTimeout(finish, 1200);
      }).catch((err) => {
        if (!firstErr) firstErr = err;
        settled += 1;
        if (settled >= candidates.length) finish();
      });
    });
  });
}

function getReceiptPaths(execDir) {
  const paths = [];
  if (execDir) {
    paths.push(path.join(execDir, '.lxmine-installed-asset.json'));
  }
  if (process.env.APPDATA) {
    paths.push(path.join(process.env.APPDATA, 'LxMine', 'installed-update.json'));
  }
  return paths;
}

function readInstalledAssetReceipt(execDir) {
  const digests = new Set();
  for (const filePath of getReceiptPaths(execDir)) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      const data = JSON.parse(raw);
      if (data && typeof data.digest === 'string') {
        const clean = data.digest.trim().toLowerCase();
        if (clean) digests.add(clean);
      }
    } catch (_) {}
  }
  return digests;
}

function writeInstalledAssetReceipt(receipt, targetDir) {
  const payload = JSON.stringify({
    version: String((receipt && receipt.version) || ''),
    name: String((receipt && receipt.name) || ''),
    digest: String((receipt && receipt.digest) || '').trim().toLowerCase(),
    installedAt: Number(receipt && receipt.installedAt) || Date.now(),
  });
  if (process.env.APPDATA) {
    try {
      const appDataDir = path.join(process.env.APPDATA, 'LxMine');
      fs.mkdirSync(appDataDir, { recursive: true });
      fs.writeFileSync(path.join(appDataDir, 'installed-update.json'), payload, 'utf8');
    } catch (_) {}
  }
  if (targetDir && fs.existsSync(targetDir)) {
    try {
      fs.writeFileSync(path.join(targetDir, '.lxmine-installed-asset.json'), payload, 'utf8');
    } catch (_) {}
  }
}

async function checkForUpdate(currentVersion) {
  const current = String(currentVersion || '1.3.0').replace(/^v/i, '');
  const release = await fetchLatestRelease();
  const rawLatest = String(release.tag_name || '').replace(/^v/i, '');
  const latestVersion = rawLatest.split('.').slice(0, 3).join('.');
  const baseCurrent = current.split('.').slice(0, 3).join('.');
  const asset = selectWindowsAsset(release.assets, 'v' + latestVersion);
  const cmp = compareVersions(latestVersion, baseCurrent);
  const digest = asset && typeof asset.digest === 'string' && /^sha256:[a-f\d]{64}$/i.test(asset.digest)
    ? asset.digest.slice(7).toLowerCase()
    : '';
  const execDir = process.execPath ? path.dirname(process.execPath) : '';
  let installedMtimeMs = 0;
  if (!process.defaultApp) {
    const candidates = [
      execDir ? path.join(execDir, '.lxmine-install-root') : '',
      execDir ? path.join(execDir, 'Uninstall LxMine.exe') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'app.asar') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'app', 'desktop', 'updater.cjs') : '',
      process.execPath || '',
    ].filter(Boolean);
    for (const p of candidates) {
      try {
        const t = fs.statSync(p).mtimeMs || 0;
        if (t > installedMtimeMs) installedMtimeMs = t;
      } catch (_) {}
    }
  }
  const knownDigests = !process.defaultApp ? readInstalledAssetReceipt(execDir) : new Set();
  const alreadyInstalledDigest = !!(digest && knownDigests.has(digest));
  const remoteTimeMs = Date.parse((asset && asset.updated_at) || release.published_at || '') || 0;
  const sameVersionNewer = cmp === 0
    && !!asset
    && !alreadyInstalledDigest
    && remoteTimeMs > 0
    && installedMtimeMs > 0
    && remoteTimeMs > installedMtimeMs + 2700000;
  const hasUpdate = !!asset && (cmp > 0 || sameVersionNewer);
  return {
    ok: true,
    currentVersion: baseCurrent,
    latestVersion,
    tagName: 'v' + latestVersion,
    hasUpdate,
    publishedAt: release.published_at || '',
    notes: String(release.body || '').trim(),
    releaseUrl: release.html_url || `https://github.com/${REPO}/releases/tag/v${latestVersion}`,
    asset: asset ? {
      name: asset.name,
      size: Number(asset.size) || 0,
      downloadUrl: asset.browser_download_url,
      digest,
    } : null,
  };
}

function downloadFromUrl(url, destPath, onProgress, signal, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('已取消下载'));
    if (redirects > 6) return reject(new Error('重定向次数过多'));
    const parsed = new URL(url);
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'LxMine-Updater/1.1' },
      timeout: 25000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        downloadFromUrl(nextUrl, destPath, onProgress, signal, redirects + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const total = Number(res.headers['content-length']) || 0;
      const hash = crypto.createHash('sha256');
      const file = fs.createWriteStream(destPath);
      let received = 0;
      let firstChunkChecked = false;
      let lastEmit = 0;

      const cleanup = (err) => {
        try { file.destroy(); } catch (_) {}
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(err);
      };

      signal.onAbort = () => {
        req.destroy();
        cleanup(new Error('已取消下载'));
      };

      res.on('data', (chunk) => {
        if (signal.aborted) return;
        if (!firstChunkChecked) {
          firstChunkChecked = true;
          const head = chunk.subarray(0, 64).toString('utf8').trim().toLowerCase();
          if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('{')) {
            req.destroy();
            cleanup(new Error('镜像返回了非安装包内容'));
            return;
          }
        }
        hash.update(chunk);
        received += chunk.length;
        const now = Date.now();
        if (now - lastEmit > 160) {
          lastEmit = now;
          onProgress({ received, total, percent: total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0 });
        }
      });

      res.on('error', (err) => cleanup(err));
      file.on('error', (err) => cleanup(err));
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          if (signal.aborted) return;
          if (received <= 0 || (total > 0 && received < total)) {
            cleanup(new Error('安装包下载不完整'));
            return;
          }
          resolve({ size: received, sha256: hash.digest('hex') });
        });
      });
    });
    signal.onAbort = () => {
      req.destroy();
      reject(new Error('已取消下载'));
    };
    req.on('timeout', () => req.destroy(new Error('下载超时')));
    req.on('error', reject);
  });
}

function cancelActiveDownload() {
  if (activeDownload) {
    activeDownload.aborted = true;
    try { activeDownload.onAbort && activeDownload.onAbort(); } catch (_) {}
    activeDownload = null;
    return { ok: true };
  }
  return { ok: false };
}

function isAdoptableExecDir(execDir) {
  if (!execDir) return false;
  const trimmed = String(execDir).replace(/[\\/]+$/, '');
  if (!trimmed) return false;
  if (fs.existsSync(path.join(trimmed, '.lxmine-install-root'))) return true;
  if (/\\lxmine$/i.test(trimmed)
    && fs.existsSync(path.join(trimmed, 'LxMine.exe'))
    && fs.existsSync(path.join(trimmed, 'resources', 'app', 'package.json'))) {
    return true;
  }
  return false;
}

function escapePsSingle(value) {
  return String(value || '').replace(/'/g, "''");
}

function buildUpdateScript({
  oldPid,
  installerPath,
  execDir = '',
  expectedVersion = '',
  assetName = '',
  installedSha = '',
  logPath = '',
}) {
  const APP_GUID_REG = 'HKCU:\\Software\\c7f26fab-4afd-5130-b2a9-63f950112de4';
  const UNINST_GUID_REG = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\c7f26fab-4afd-5130-b2a9-63f950112de4';
  const escapedInstaller = escapePsSingle(installerPath);
  const escapedExecDir = escapePsSingle(execDir);
  const escapedVersion = escapePsSingle(expectedVersion);
  const escapedAssetName = escapePsSingle(assetName);
  const escapedSha = escapePsSingle(installedSha);
  const escapedLogPath = escapePsSingle(logPath || path.join(path.dirname(installerPath || '.'), 'update.log'));

  return [
    '$ErrorActionPreference = "Continue"',
    '$utf8NoBom = [Text.UTF8Encoding]::new($false)',
    `$logPath = '${escapedLogPath}'`,
    'function Write-UpdateLog([string]$msg) {',
    '  try {',
    '    $ts = [DateTime]::Now.ToString("yyyy-MM-dd HH:mm:ss.fff")',
    '    [IO.File]::AppendAllText($logPath, "[$ts] $msg`r`n", $utf8NoBom)',
    '  } catch {}',
    '}',
    'function Get-LxMineVersion([string]$dir) {',
    '  if (-not $dir) { return "" }',
    '  $pkg = Join-Path $dir "resources\\app\\package.json"',
    '  if (-not (Test-Path $pkg)) { return "" }',
    '  try {',
    '    $raw = [IO.File]::ReadAllText($pkg, $utf8NoBom)',
    '    $obj = $raw | ConvertFrom-Json',
    '    if ($obj -and $obj.version) { return ([string]$obj.version).Trim() }',
    '  } catch {}',
    '  return ""',
    '}',
    'function Get-LxMineMtimeTicks([string]$dir) {',
    '  if (-not $dir) { return [int64]0 }',
    '  [int64]$best = 0',
    '  foreach ($rel in @(".lxmine-install-root", "LxMine.exe", "resources\\app\\package.json")) {',
    '    $p = Join-Path $dir $rel',
    '    if (Test-Path $p) {',
    '      try {',
    '        $t = (Get-Item $p -ErrorAction Stop).LastWriteTimeUtc.Ticks',
    '        if ($t -gt $best) { $best = $t }',
    '      } catch {}',
    '    }',
    '  }',
    '  return $best',
    '}',
    'function Normalize-LxMineDir([string]$dir) {',
    '  if (-not $dir) { return "" }',
    '  $d = $dir.Trim().Trim(\'"\').TrimEnd("\\")',
    '  if (-not $d) { return "" }',
    '  if ($d -notmatch "\\\\LxMine$") { $d = Join-Path $d "LxMine" }',
    '  return $d',
    '}',
    'function Test-UpgradeSucceeded([string]$dir, [string]$expectedVer, [string]$prevVer, [int64]$prevTicks) {',
    '  if (-not $dir) { return $false }',
    '  if (-not (Test-Path (Join-Path $dir "LxMine.exe"))) { return $false }',
    '  $afterVer = Get-LxMineVersion $dir',
    '  $afterTicks = Get-LxMineMtimeTicks $dir',
    '  if ($expectedVer) {',
    '    if ($afterVer -ne $expectedVer) { return $false }',
    '    if ($prevVer -eq $expectedVer -and $prevTicks -gt 0 -and $afterTicks -le $prevTicks) { return $false }',
    '    return $true',
    '  }',
    '  if ($prevTicks -gt 0) { return ($afterTicks -gt $prevTicks) }',
    '  return ($afterVer -ne "")',
    '}',
    `$oldPid = ${Number(oldPid) || 0}`,
    `$installer = '${escapedInstaller}'`,
    `$appGuidReg = '${APP_GUID_REG}'`,
    `$uninstGuidReg = '${UNINST_GUID_REG}'`,
    `$expectedVersion = '${escapedVersion}'`,
    `$execDir = '${escapedExecDir}'`,
    'Write-UpdateLog "=== LxMine update started: oldPid=$oldPid expected=$expectedVersion execDir=$execDir installer=$installer ==="',
    'if (-not (Test-Path $installer)) {',
    '  Write-UpdateLog "ERROR: installer not found at $installer"',
    '  exit 1',
    '}',
    'if ($oldPid -gt 0) { Wait-Process -Id $oldPid -Timeout 4 -ErrorAction SilentlyContinue }',
    'for ($i = 0; $i -lt 16; $i++) {',
    '  $procs = @(Get-Process -Name "LxMine" -ErrorAction SilentlyContinue)',
    '  if ($procs.Count -eq 0) { break }',
    '  foreach ($proc in $procs) {',
    '    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}',
    '  }',
    '  Start-Sleep -Milliseconds 500',
    '}',
    'Start-Sleep -Milliseconds 600',
    '$targetDir = $execDir',
    'if (-not $targetDir) {',
    '  $guidProps = Get-ItemProperty $appGuidReg -ErrorAction SilentlyContinue',
    '  if ($guidProps -and $guidProps.InstallLocation) { $targetDir = [string]$guidProps.InstallLocation }',
    '}',
    'if (-not $targetDir) {',
    '  $reg = Get-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*" -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match "^LxMine" -and $_.InstallLocation } | Select-Object -First 1',
    '  if ($reg) { $targetDir = [string]$reg.InstallLocation }',
    '}',
    'if (-not $targetDir) {',
    '  if (Test-Path "D:\\") {',
    '    if ((Test-Path "D:\\LxMine\\.lxmine-install-root") -or (-not (Test-Path "D:\\LxMine"))) {',
    '      $targetDir = "D:\\LxMine"',
    '    } else {',
    '      $targetDir = "D:\\Program Files\\LxMine"',
    '    }',
    '  } else {',
    '    $targetDir = Join-Path $env:LOCALAPPDATA "Programs\\LxMine"',
    '  }',
    '}',
    '$targetDir = Normalize-LxMineDir $targetDir',
    '$beforeVer = Get-LxMineVersion $targetDir',
    '$beforeTicks = Get-LxMineMtimeTicks $targetDir',
    'Write-UpdateLog "Resolved targetDir=$targetDir beforeVer=$beforeVer beforeTicks=$beforeTicks"',
    'try {',
    '  if (-not (Test-Path $appGuidReg)) { New-Item -Path $appGuidReg -Force | Out-Null }',
    '  Set-ItemProperty -Path $appGuidReg -Name "InstallLocation" -Value $targetDir',
    '  if (-not (Test-Path (Join-Path $targetDir ".lxmine-install-root"))) {',
    '    if (Test-Path $uninstGuidReg) { Remove-Item -Path $uninstGuidReg -Recurse -Force -ErrorAction SilentlyContinue }',
    '  }',
    '} catch { Write-UpdateLog "Registry pre-seed warn: $_" }',
    '$p = $null',
    'try {',
    '  $p = Start-Process -FilePath $installer -ArgumentList "/S /D=$targetDir" -PassThru -Wait',
    '} catch { Write-UpdateLog "Silent NSIS launch error: $_" }',
    'Start-Sleep -Milliseconds 600',
    '$exitCode = if ($p) { $p.ExitCode } else { -1 }',
    '$afterVerTarget = Get-LxMineVersion $targetDir',
    '$afterTicksTarget = Get-LxMineMtimeTicks $targetDir',
    '$actualDir = $targetDir',
    '$verified = ($exitCode -eq 0) -and (Test-UpgradeSucceeded $targetDir $expectedVersion $beforeVer $beforeTicks)',
    'Write-UpdateLog "Silent NSIS finished: exitCode=$exitCode afterVer=$afterVerTarget afterTicks=$afterTicksTarget verified=$verified"',
    'if (-not $verified) {',
    '  $guidAfter = Get-ItemProperty $appGuidReg -ErrorAction SilentlyContinue',
    '  if ($guidAfter -and $guidAfter.InstallLocation) {',
    '    $altDir = Normalize-LxMineDir ([string]$guidAfter.InstallLocation)',
    '    if ($altDir -and ($altDir -ne $targetDir) -and ($exitCode -eq 0) -and (Test-UpgradeSucceeded $altDir $expectedVersion "" 0)) {',
    '      $actualDir = $altDir',
    '      $verified = $true',
    '      Write-UpdateLog "Verified install at registry dir instead: $actualDir"',
    '    }',
    '  }',
    '}',
    '$usedInteractive = $false',
    'if (-not $verified) {',
    '  $usedInteractive = $true',
    '  Write-UpdateLog "Silent upgrade did not verify; falling back to visible interactive installer."',
    '  try {',
    '    $p2 = Start-Process -FilePath $installer -PassThru -Wait',
    '    Write-UpdateLog "Interactive installer finished: exitCode=$($p2.ExitCode)"',
    '  } catch { Write-UpdateLog "Interactive installer launch error: $_" }',
    '  Start-Sleep -Milliseconds 600',
    '  $guidRetry = Get-ItemProperty $appGuidReg -ErrorAction SilentlyContinue',
    '  $retryCandidates = @()',
    '  if ($guidRetry -and $guidRetry.InstallLocation) { $retryCandidates += (Normalize-LxMineDir ([string]$guidRetry.InstallLocation)) }',
    '  if ($targetDir) { $retryCandidates += $targetDir }',
    '  foreach ($candDir in ($retryCandidates | Select-Object -Unique)) {',
    '    $prevV = if ($candDir -eq $targetDir) { $beforeVer } else { "" }',
    '    $prevT = if ($candDir -eq $targetDir) { $beforeTicks } else { [int64]0 }',
    '    if (Test-UpgradeSucceeded $candDir $expectedVersion $prevV $prevT) {',
    '      $actualDir = $candDir',
    '      $verified = $true',
    '      Write-UpdateLog "Interactive install verified at $actualDir (ver=$(Get-LxMineVersion $actualDir))"',
    '      break',
    '    }',
    '  }',
    '}',
    'if ($verified -and $actualDir -and (Test-Path (Join-Path $actualDir "LxMine.exe"))) {',
    '  try {',
    '    $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()',
    '    $receiptJson = [ordered]@{',
    `      version = '${escapedVersion}'`,
    `      name = '${escapedAssetName}'`,
    `      digest = '${escapedSha}'`,
    '      installedAt = $nowMs',
    '    } | ConvertTo-Json -Compress',
    '    $appDataDir = Join-Path $env:APPDATA "LxMine"',
    '    if (-not (Test-Path $appDataDir)) { New-Item -ItemType Directory -Path $appDataDir -Force | Out-Null }',
    '    [IO.File]::WriteAllText((Join-Path $appDataDir "installed-update.json"), $receiptJson, $utf8NoBom)',
    '    [IO.File]::WriteAllText((Join-Path $actualDir ".lxmine-installed-asset.json"), $receiptJson, $utf8NoBom)',
    '    Write-UpdateLog "Receipt written for version=$expectedVersion at $actualDir"',
    '  } catch { Write-UpdateLog "Receipt write error: $_" }',
    '  $exe = Join-Path $actualDir "LxMine.exe"',
    '  try {',
    '    $lnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "LxMine.lnk"',
    '    $ws = New-Object -ComObject WScript.Shell',
    '    $sc = $ws.CreateShortcut($lnk)',
    '    $sc.TargetPath = $exe',
    '    $sc.WorkingDirectory = $actualDir',
    '    $sc.Save()',
    '  } catch { Write-UpdateLog "Desktop shortcut update warn: $_" }',
    '  $alreadyRunning = $false',
    '  if ($usedInteractive) {',
    '    $alreadyRunning = @(Get-Process -Name "LxMine" -ErrorAction SilentlyContinue).Count -gt 0',
    '  }',
    '  if (-not $alreadyRunning) {',
    '    Write-UpdateLog "Relaunching $exe"',
    '    Start-Process -FilePath $exe -WorkingDirectory $actualDir',
    '  } else {',
    '    Write-UpdateLog "LxMine already running after interactive installer; skipping duplicate launch."',
    '  }',
    '} else {',
    '  Write-UpdateLog "Upgrade not verified; skipped fake receipt and did not silently relaunch old version."',
    '}',
  ].join('\r\n');
}

async function downloadAndLaunchInstaller(asset, onProgress, appInstance) {
  if (!asset || !validateAssetUrl(asset.downloadUrl)) {
    throw new Error('无效的更新包地址');
  }
  cancelActiveDownload();
  const signal = { aborted: false, onAbort: null };
  activeDownload = signal;

  const updateDir = path.join(os.tmpdir(), 'LxMine-Update');
  fs.mkdirSync(updateDir, { recursive: true });
  const safeName = path.basename(asset.name || 'LxMine-Setup.exe').replace(/[^\w.\-]/g, '_');
  const destPath = path.join(updateDir, safeName);
  try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) {}

  let lastError = null;
  let downloaded = null;
  for (const mirror of DOWNLOAD_MIRRORS) {
    if (signal.aborted) throw new Error('已取消下载');
    const url = mirror.prefix + asset.downloadUrl;
    onProgress({ stage: 'downloading', mirror: mirror.name, received: 0, total: asset.size || 0, percent: 0 });
    try {
      const result = await downloadFromUrl(url, destPath, (p) => {
        onProgress({ stage: 'downloading', mirror: mirror.name, ...p });
      }, signal);
      if (asset.digest && result.sha256.toLowerCase() !== asset.digest.toLowerCase()) {
        try { fs.unlinkSync(destPath); } catch (_) {}
        throw new Error('安装包 SHA-256 校验未通过');
      }
      downloaded = result;
      break;
    } catch (err) {
      lastError = err;
      if (signal.aborted) throw err;
    }
  }
  activeDownload = null;
  if (!downloaded) {
    throw new Error(`下载失败：${lastError ? lastError.message : '所有镜像源均不可用'}`);
  }

  onProgress({ stage: 'installing', received: downloaded.size, total: downloaded.size, percent: 100 });

  // Launch silent overwrite install via NSIS (/S /D=<targetDir>), verify upgraded version, and automatically restart LxMine.
  const installedSha = (downloaded.sha256 || asset.digest || '').toLowerCase();
  const receiptVersionMatch = String(asset.name || '').match(/LxMine-([^-]+)-/i);
  const receiptVersion = (receiptVersionMatch ? receiptVersionMatch[1] : String(asset.version || '')).replace(/^v/i, '');
  const psScript = path.join(updateDir, 'apply-update.ps1');
  const logPath = path.join(updateDir, 'update.log');
  const execDir = process.execPath ? path.dirname(process.execPath) : '';
  const adoptableExecDir = isAdoptableExecDir(execDir) ? execDir : '';
  const scriptContent = buildUpdateScript({
    oldPid: process.pid,
    installerPath: destPath,
    execDir: adoptableExecDir,
    expectedVersion: receiptVersion,
    assetName: String(asset.name || safeName),
    installedSha,
    logPath,
  });
  // Prepend UTF-8 BOM so Windows PowerShell 5.1 parses non-ASCII (e.g. Chinese usernames/install dirs) cleanly.
  fs.writeFileSync(psScript, '\uFEFF' + scriptContent, 'utf8');

  const child = spawn('powershell.exe', [
    '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', psScript,
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  setTimeout(() => {
    try {
      if (appInstance) {
        appInstance.quit();
        setTimeout(() => { try { appInstance.exit(0); } catch (_) {} }, 1200);
      }
    } catch (_) {}
  }, 250);

  return { ok: true, filePath: destPath };
}

module.exports = {
  REPO,
  DOWNLOAD_MIRRORS,
  parseSemver,
  compareVersions,
  validateAssetUrl,
  selectWindowsAsset,
  isAdoptableExecDir,
  buildUpdateScript,
  readInstalledAssetReceipt,
  writeInstalledAssetReceipt,
  checkForUpdate,
  downloadAndLaunchInstaller,
  cancelActiveDownload,
};
