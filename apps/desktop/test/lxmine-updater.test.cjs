const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compareVersions,
  validateAssetUrl,
  selectWindowsAsset,
} = require('../desktop/updater.cjs');

test('compareVersions compares semver strings accurately', () => {
  assert.equal(compareVersions('1.2.0', '1.1.0'), 1);
  assert.equal(compareVersions('v1.1.1', '1.1.0'), 1);
  assert.equal(compareVersions('1.1.0', 'v1.1.0'), 0);
  assert.equal(compareVersions('1.0.9', '1.1.0'), -1);
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
});

test('validateAssetUrl allows only YuriLin1028/LxMine GitHub release downloads', () => {
  assert.equal(validateAssetUrl('https://github.com/YuriLin1028/LxMine/releases/download/v1.2.0/LxMine-1.2.0-Setup.exe'), true);
  assert.equal(validateAssetUrl('https://github.com/other/LxMine/releases/download/v1.2.0/LxMine-1.2.0-Setup.exe'), false);
  assert.equal(validateAssetUrl('https://evil.example/YuriLin1028/LxMine/releases/download/v1.2.0/LxMine.exe'), false);
});

test('selectWindowsAsset prefers Setup.exe over Portable.exe', () => {
  const assets = [
    { name: 'LxMine-1.2.0-Portable.exe', browser_download_url: 'https://github.com/YuriLin1028/LxMine/releases/download/v1.2.0/LxMine-1.2.0-Portable.exe', size: 100 },
    { name: 'LxMine-1.2.0-Setup.exe', browser_download_url: 'https://github.com/YuriLin1028/LxMine/releases/download/v1.2.0/LxMine-1.2.0-Setup.exe', size: 120 },
  ];
  const picked = selectWindowsAsset(assets, 'v1.2.0');
  assert.equal(picked.name, 'LxMine-1.2.0-Setup.exe');
});
