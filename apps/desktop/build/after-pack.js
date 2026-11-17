const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function assertNoBundledSources(appOutDir) {
  const resources = path.join(appOutDir, 'resources');
  const archive = path.join(resources, 'app.asar');
  const sourcePath = /(?:^|\/)(?:dev-source\.js|lx-sources-default\.json)$|^\/?(?:desktop\/)?(?:音源|sources)\//;
  let bundled;
  if (fs.existsSync(archive)) {
    bundled = require('@electron/asar').listPackage(archive).filter(entry => sourcePath.test(entry));
  } else {
    const appRoot = path.join(resources, 'app');
    const candidates = ['desktop/lx-sources-default.json', 'dev-source.js', 'desktop/dev-source.js', 'sources', 'desktop/sources', '音源', 'desktop/音源'];
    bundled = candidates.filter(candidate => {
      const fullPath = path.join(appRoot, candidate);
      if (!fs.existsSync(fullPath)) return false;
      if (fs.statSync(fullPath).isFile()) return true;
      return fs.readdirSync(fullPath, { recursive: true, withFileTypes: true }).some(entry => entry.isFile());
    });
  }
  if (bundled.length) throw new Error(`安装包包含预置音源资源：${bundled.join(', ')}`);
}

function findNewestRceditInCache(cacheRoot) {
  if (!cacheRoot || !fs.existsSync(cacheRoot)) return null;
  var newest = null;
  var stack = [cacheRoot];
  while (stack.length) {
    var dir = stack.pop();
    var entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    entries.forEach(function(entry) {
      var fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        return;
      }
      if (entry.isFile() && entry.name.toLowerCase() === 'rcedit-x64.exe') {
        var stat = fs.statSync(fullPath);
        if (!newest || stat.mtimeMs > newest.mtimeMs) newest = { path: fullPath, mtimeMs: stat.mtimeMs };
      }
    });
  }
  return newest && newest.path;
}

function resolveRcedit(projectDir) {
  var candidates = [
    path.join(projectDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe')
  ];
  var localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    var cached = findNewestRceditInCache(path.join(localAppData, 'electron-builder', 'Cache', 'winCodeSign'));
    if (cached) candidates.push(cached);
  }
  candidates.push(path.join(projectDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe'));
  var hit = candidates.find(function(candidate) { return candidate && fs.existsSync(candidate); });
  if (!hit) throw new Error('No usable rcedit executable was found for LxMine icon injection.');
  return hit;
}

module.exports = async function afterPack(context) {
  assertNoBundledSources(context.appOutDir);
  if (context.electronPlatformName !== 'win32') return;

  const appName = context.packager.appInfo.productFilename || 'LxMine';
  const productName = context.packager.appInfo.productName || appName;
  const companyName = context.packager.appInfo.companyName || productName;
  const exePath = path.join(context.appOutDir, `${appName}.exe`);
  const iconPath = path.join(context.packager.info.buildResourcesDir, 'icon.ico');
  const rceditPath = resolveRcedit(context.packager.projectDir);

  if (!fs.existsSync(exePath)) throw new Error(`LxMine executable was not found: ${exePath}`);
  if (!fs.existsSync(iconPath)) throw new Error(`LxMine icon was not found: ${iconPath}`);

  const version = context.packager.appInfo.version;
  console.log(`  • injecting LxMine resources  rcedit=${rceditPath}`);
  execFileSync(rceditPath, [
    exePath,
    '--set-icon', iconPath,
    '--set-version-string', 'FileDescription', productName,
    '--set-version-string', 'ProductName', productName,
    '--set-version-string', 'CompanyName', companyName,
    '--set-version-string', 'OriginalFilename', `${appName}.exe`,
    '--set-file-version', version,
    '--set-product-version', version
  ], { stdio: 'inherit' });
};
