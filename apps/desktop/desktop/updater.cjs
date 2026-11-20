const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO = 'YuriLin1028/LxMine';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASE_SNAPSHOT_URLS = [
  `https://yurilin1028.github.io/LxMine/windows-release.json`,
  `https://gh-proxy.org/https://raw.githubusercontent.com/${REPO}/gh-pages/windows-release.json`,
  `https://ghfast.top/https://raw.githubusercontent.com/${REPO}/gh-pages/windows-release.json`,
  `https://yurilin1028.github.io/LxMine/release.json`,
  `https://gh-proxy.org/https://raw.githubusercontent.com/${REPO}/gh-pages/release.json`,
  `https://ghfast.top/https://raw.githubusercontent.com/${REPO}/gh-pages/release.json`,
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
  const candidates = [GITHUB_API_URL, ...RELEASE_SNAPSHOT_URLS];
  // Race all endpoints in parallel, preferring the highest valid version (or GitHub API when tied).
  const results = await Promise.allSettled(candidates.map(url => fetchJson(url, 8500)));
  const valid = [];
  for (let i = 0; i < results.length; i += 1) {
    if (results[i].status === 'fulfilled') {
      valid.push({ data: results[i].value, isPrimary: i === 0 });
    }
  }
  if (!valid.length) {
    const firstErr = results.find(r => r.status === 'rejected');
    throw new Error(firstErr && firstErr.reason ? firstErr.reason.message : '无法连接更新服务器');
  }
  valid.sort((a, b) => {
    const cmp = compareVersions(b.data.tag_name, a.data.tag_name);
    if (cmp !== 0) return cmp;
    return (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0);
  });
  return valid[0].data;
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
  const current = String(currentVersion || '1.1.0').replace(/^v/i, '');
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

  // Launch silent overwrite install via NSIS (/S) and automatically restart LxMine after installation completes.
  const installedSha = (downloaded.sha256 || asset.digest || '').toLowerCase();
  const receiptVersionMatch = String(asset.name || '').match(/LxMine-([^-]+)-/i);
  const receiptVersion = receiptVersionMatch ? receiptVersionMatch[1] : '';
  const escapedVersion = receiptVersion.replace(/'/g, "''");
  const escapedAssetName = String(asset.name || safeName).replace(/'/g, "''");
  const escapedSha = installedSha.replace(/'/g, "''");
  const APP_GUID_REG = 'HKCU:\\Software\\c7f26fab-4afd-5130-b2a9-63f950112de4';
  const psScript = path.join(updateDir, 'apply-update.ps1');
  const escapedInstaller = destPath.replace(/'/g, "''");
  const execDir = process.execPath ? path.dirname(process.execPath) : '';
  const hasMarker = execDir && fs.existsSync(path.join(execDir, '.lxmine-install-root'));
  const escapedExecDir = (hasMarker ? execDir : '').replace(/'/g, "''");
  const scriptContent = [
    `$oldPid = ${process.pid}`,
    'Wait-Process -Id $oldPid -Timeout 5 -ErrorAction SilentlyContinue',
    'Get-Process -Name "LxMine" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue',
    'Start-Sleep -Milliseconds 1000',
    `$appGuidReg = '${APP_GUID_REG}'`,
    `$targetDir = '${escapedExecDir}'`,
    'if (-not $targetDir) {',
    '  $guidProps = Get-ItemProperty $appGuidReg -ErrorAction SilentlyContinue',
    '  if ($guidProps -and $guidProps.InstallLocation) { $targetDir = [string]$guidProps.InstallLocation }',
    '}',
    'if (-not $targetDir) {',
    '  $reg = Get-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*" -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match "^LxMine" -and $_.InstallLocation } | Select-Object -First 1',
    '  if ($reg) { $targetDir = [string]$reg.InstallLocation }',
    '}',
    'if ($targetDir) { $targetDir = $targetDir.TrimEnd("\\") }',
    'if (-not $targetDir) {',
    '  if (Test-Path "D:\\") {',
    '    if (Test-Path "D:\\LxMine\\.lxmine-install-root") {',
    '      $targetDir = "D:\\LxMine"',
    '    } else {',
    '      $targetDir = "D:\\Program Files\\LxMine"',
    '    }',
    '  } else {',
    '    $targetDir = Join-Path $env:LOCALAPPDATA "Programs\\LxMine"',
    '  }',
    '}',
    'try {',
    '  if (-not (Test-Path $appGuidReg)) { New-Item -Path $appGuidReg -Force | Out-Null }',
    '  Set-ItemProperty -Path $appGuidReg -Name "InstallLocation" -Value $targetDir',
    '} catch {}',
    `$p = Start-Process -FilePath '${escapedInstaller}' -ArgumentList '/S' -PassThru -Wait`,
    'Start-Sleep -Milliseconds 600',
    'if ($p -and $p.ExitCode -eq 0 -and (Test-Path (Join-Path $targetDir "LxMine.exe"))) {',
    '  try {',
    '    $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()',
    '    $receiptJson = [ordered]@{',
    `      version = '${escapedVersion}'`,
    `      name = '${escapedAssetName}'`,
    `      digest = '${escapedSha}'`,
    '      installedAt = $nowMs',
    '    } | ConvertTo-Json -Compress',
    '    $utf8NoBom = [Text.UTF8Encoding]::new($false)',
    '    $appDataDir = Join-Path $env:APPDATA "LxMine"',
    '    if (-not (Test-Path $appDataDir)) { New-Item -ItemType Directory -Path $appDataDir -Force | Out-Null }',
    '    [IO.File]::WriteAllText((Join-Path $appDataDir "installed-update.json"), $receiptJson, $utf8NoBom)',
    '    if (Test-Path $targetDir) {',
    '      [IO.File]::WriteAllText((Join-Path $targetDir ".lxmine-installed-asset.json"), $receiptJson, $utf8NoBom)',
    '    }',
    '  } catch {}',
    '}',
    '$guidAfter = Get-ItemProperty $appGuidReg -ErrorAction SilentlyContinue',
    '$regAfter = Get-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*" -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match "^LxMine" -and $_.InstallLocation } | Select-Object -First 1',
    '$candidates = @()',
    'if ($targetDir) { $candidates += (Join-Path $targetDir "LxMine.exe") }',
    'if ($guidAfter -and $guidAfter.InstallLocation) { $candidates += (Join-Path $guidAfter.InstallLocation "LxMine.exe") }',
    'if ($regAfter -and $regAfter.InstallLocation) { $candidates += (Join-Path $regAfter.InstallLocation "LxMine.exe") }',
    'if (Test-Path "D:\\LxMine\\.lxmine-install-root") { $candidates += "D:\\LxMine\\LxMine.exe" }',
    '$candidates += "D:\\Program Files\\LxMine\\LxMine.exe"',
    '$candidates += (Join-Path $env:LOCALAPPDATA "Programs\\LxMine\\LxMine.exe")',
    '$candidates += (Join-Path $env:LOCALAPPDATA "LxMine\\LxMine.exe")',
    '$candidates += (Join-Path $env:ProgramFiles "LxMine\\LxMine.exe")',
    '$exe = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1',
    'if (-not $exe) {',
    `  Start-Process -FilePath '${escapedInstaller}' -Wait`,
    '  $guidRetry = Get-ItemProperty $appGuidReg -ErrorAction SilentlyContinue',
    '  if ($guidRetry -and $guidRetry.InstallLocation) { $exe = Join-Path $guidRetry.InstallLocation "LxMine.exe" }',
    '}',
    'if ($exe -and (Test-Path $exe)) {',
    '  try {',
    '    $lnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "LxMine.lnk"',
    '    $ws = New-Object -ComObject WScript.Shell',
    '    $sc = $ws.CreateShortcut($lnk)',
    '    $sc.TargetPath = $exe',
    '    $sc.WorkingDirectory = Split-Path -Parent $exe',
    '    $sc.Save()',
    '  } catch {}',
    '  Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe)',
    '}',
  ].join('\r\n');
  fs.writeFileSync(psScript, scriptContent, 'utf8');

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
        setTimeout(() => { try { appInstance.exit(0); } catch (_) {} }, 1800);
      }
    } catch (_) {}
  }, 350);

  return { ok: true, filePath: destPath };
}

module.exports = {
  REPO,
  DOWNLOAD_MIRRORS,
  parseSemver,
  compareVersions,
  validateAssetUrl,
  selectWindowsAsset,
  readInstalledAssetReceipt,
  writeInstalledAssetReceipt,
  checkForUpdate,
  downloadAndLaunchInstaller,
  cancelActiveDownload,
};
