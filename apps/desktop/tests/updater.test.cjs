'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const updater = require('../desktop/updater.cjs');

test('selectWindowsAsset prefers exact Setup exe over Portable exe', () => {
  const assets = [
    {
      name: 'LxMine-1.3.1-Portable.exe',
      browser_download_url: 'https://github.com/YuriLin1028/LxMine/releases/download/v1.3.1/LxMine-1.3.1-Portable.exe',
    },
    {
      name: 'LxMine-1.3.1-Setup.exe',
      browser_download_url: 'https://github.com/YuriLin1028/LxMine/releases/download/v1.3.1/LxMine-1.3.1-Setup.exe',
    },
  ];
  const chosen = updater.selectWindowsAsset(assets, 'v1.3.1');
  assert.equal(chosen && chosen.name, 'LxMine-1.3.1-Setup.exe');
});

test('isAdoptableExecDir accepts marker dir and standard LxMine dir, rejects portable temp dir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lxmine-updater-test-'));
  try {
    const marked = path.join(root, 'CustomFolder');
    fs.mkdirSync(marked, { recursive: true });
    fs.writeFileSync(path.join(marked, '.lxmine-install-root'), 'LxMine install root\r\n');
    assert.equal(updater.isAdoptableExecDir(marked), true);

    const legacy = path.join(root, 'LxMine');
    fs.mkdirSync(path.join(legacy, 'resources', 'app'), { recursive: true });
    fs.writeFileSync(path.join(legacy, 'LxMine.exe'), '');
    fs.writeFileSync(path.join(legacy, 'resources', 'app', 'package.json'), '{"version":"1.3.0"}');
    assert.equal(updater.isAdoptableExecDir(legacy), true);

    const portableTemp = path.join(root, 'nsABC12.tmp');
    fs.mkdirSync(path.join(portableTemp, 'resources', 'app'), { recursive: true });
    fs.writeFileSync(path.join(portableTemp, 'LxMine.exe'), '');
    fs.writeFileSync(path.join(portableTemp, 'resources', 'app', 'package.json'), '{"version":"1.3.0"}');
    assert.equal(updater.isAdoptableExecDir(portableTemp), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildUpdateScript passes /S /D=, verifies UTF-8 package.json version, and parses cleanly under Windows PowerShell 5.1 with Chinese paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lxmine-upd-中文-'));
  try {
    const installerPath = path.join(root, 'LxMine-1.3.1-Setup.exe');
    const execDir = path.join(root, '应用 目录', 'LxMine');
    const logPath = path.join(root, 'update.log');
    const script = updater.buildUpdateScript({
      oldPid: 0,
      installerPath,
      execDir,
      expectedVersion: '1.3.1',
      assetName: 'LxMine-1.3.1-Setup.exe',
      installedSha: 'a'.repeat(64),
      logPath,
    });
    assert.match(script, /\/S \/D=\$targetDir/);
    assert.match(script, /Test-UpgradeSucceeded/);
    assert.match(script, /falling back to visible interactive installer/i);

    if (process.platform === 'win32') {
      const psFile = path.join(root, 'apply-update.ps1');
      fs.writeFileSync(psFile, '\uFEFF' + script, 'utf8');
      const rawBuf = fs.readFileSync(psFile);
      assert.deepEqual([...rawBuf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      // Parse script AST with Windows PowerShell 5.1 and verify zero syntax errors + intact Chinese path
      const checkCmd = [
        '$errors = $null',
        `$ast = [System.Management.Automation.Language.Parser]::ParseFile('${psFile.replace(/'/g, "''")}', [ref]$null, [ref]$errors)`,
        'if ($errors.Count -gt 0) { Write-Error ($errors | Out-String); exit 2 }',
        'if (-not $ast.Extent.Text.Contains("应用 目录")) { Write-Error "Chinese path corrupted"; exit 3 }',
        'Write-Output "PARSE_OK"',
      ].join('; ');
      const out = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', checkCmd], { encoding: 'utf8' });
      assert.match(out, /PARSE_OK/);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('readInstalledAssetReceipt and writeInstalledAssetReceipt round-trip SHA-256 digest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lxmine-receipt-'));
  const prevAppData = process.env.APPDATA;
  try {
    process.env.APPDATA = path.join(root, 'AppData');
    const targetDir = path.join(root, 'LxMine');
    fs.mkdirSync(targetDir, { recursive: true });
    const sha = 'b'.repeat(64);
    updater.writeInstalledAssetReceipt({
      version: '1.3.1',
      name: 'LxMine-1.3.1-Setup.exe',
      digest: sha,
      installedAt: Date.now(),
    }, targetDir);
    const digests = updater.readInstalledAssetReceipt(targetDir);
    assert.equal(digests.has(sha), true);
  } finally {
    if (prevAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = prevAppData;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
