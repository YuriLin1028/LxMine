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
  `https://gh-proxy.org/https://raw.githubusercontent.com/${REPO}/gh-pages/release.json`,
  `https://ghfast.top/https://raw.githubusercontent.com/${REPO}/gh-pages/release.json`,
  `https://yurilin1028.github.io/LxMine/release.json`,
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

async function checkForUpdate(currentVersion) {
  const current = String(currentVersion || '1.1.0').replace(/^v/i, '');
  const release = await fetchLatestRelease();
  const latestVersion = String(release.tag_name || '').replace(/^v/i, '');
  const asset = selectWindowsAsset(release.assets, release.tag_name);
  const cmp = compareVersions(latestVersion, current);
  let installedMtimeMs = 0;
  try { installedMtimeMs = fs.statSync(path.join(__dirname, '..', 'package.json')).mtimeMs || 0; } catch (_) {}
  const remoteTimeMs = Date.parse((asset && asset.updated_at) || release.published_at || '') || 0;
  const sameVersionNewer = cmp === 0 && !!asset && remoteTimeMs > 0 && installedMtimeMs > 0 && remoteTimeMs > installedMtimeMs + 120000;
  const hasUpdate = cmp > 0 || sameVersionNewer;
  const digest = asset && typeof asset.digest === 'string' && /^sha256:[a-f\d]{64}$/i.test(asset.digest)
    ? asset.digest.slice(7).toLowerCase()
    : '';
  return {
    ok: true,
    currentVersion: current,
    latestVersion,
    tagName: release.tag_name,
    hasUpdate,
    publishedAt: release.published_at || '',
    notes: String(release.body || '').trim(),
    releaseUrl: release.html_url || `https://github.com/${REPO}/releases/tag/${release.tag_name}`,
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
  const psScript = path.join(updateDir, 'apply-update.ps1');
  const escapedInstaller = destPath.replace(/'/g, "''");
  const scriptContent = [
    'Start-Sleep -Milliseconds 1200',
    `$p = Start-Process -FilePath '${escapedInstaller}' -ArgumentList '/S' -PassThru -Wait`,
    'Start-Sleep -Milliseconds 600',
    '$candidates = @(',
    '  (Join-Path $env:LOCALAPPDATA "Programs\\LxMine\\LxMine.exe"),',
    '  (Join-Path $env:LOCALAPPDATA "LxMine\\LxMine.exe"),',
    '  (Join-Path $env:ProgramFiles "LxMine\\LxMine.exe")',
    ')',
    '$exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1',
    'if ($exe) { Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) }',
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
    try { appInstance && appInstance.quit(); } catch (_) {}
  }, 450);

  return { ok: true, filePath: destPath };
}

module.exports = {
  REPO,
  DOWNLOAD_MIRRORS,
  parseSemver,
  compareVersions,
  validateAssetUrl,
  selectWindowsAsset,
  checkForUpdate,
  downloadAndLaunchInstaller,
  cancelActiveDownload,
};
