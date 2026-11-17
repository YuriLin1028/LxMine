'use strict';
const { _electron } = require('../../apps/desktop/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');

(async () => {
  const dir = path.join(__dirname, 'artifacts/source-batch-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  const script = name => `/*\n * @name ${name}\n */\nconst name = '${name}';`;
  const paths = [['first.js', script('Batch First')], ['bad.txt', 'invalid'],
    ['repeat.js', script('Batch First')], ['last.js', script('Batch Last')]].map(([name, content]) => {
      const file = path.join(dir, name); fs.writeFileSync(file, content); return file;
    });
  const env = { ...process.env, MINERADIO_STARTUP_QA_HIDDEN: '1', MINERADIO_STARTUP_QA_USER_DATA: path.join(dir, 'profile'),
    MINERADIO_NO_DESKTOP_SHORTCUT: '1', MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: path.join(root, 'apps/desktop/node_modules/electron/dist/electron.exe'),
    args: [path.join(root, 'apps/desktop'), '--disable-features=CalculateNativeWinOcclusion'], env });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => window.__lxmine);
    await app.evaluate(({ BrowserWindow, dialog }, paths) => {
      const win = BrowserWindow.getAllWindows()[0]; win.setSize(1280, 900); win.setOpacity(0); win.showInactive();
      dialog.showOpenDialog = async options => { global.__batchDialogOptions = options; return { canceled: false, filePaths: paths }; };
    }, paths);
    await page.evaluate(() => document.getElementById('splash')?.remove());
    const existing = await page.evaluate(script => lxMusic.importSource(script), script('Existing Active'));
    await page.evaluate(() => __lxmine.setTab('settings'));
    await page.getByText('个音源 · 当前使用', { exact: false }).click();
    await page.getByRole('button', { name: '批量导入音源', exact: true }).click();
    const result = page.locator('.modal').filter({ hasText: '音源导入结果' });
    await result.waitFor();
    assert.match(await result.textContent(), /已导入 2 个音源，跳过 1 个重复，1 个失败/);
    assert.match(await result.textContent(), /bad.txt/);
    const state = await page.evaluate(() => lxMusic.sources());
    assert.equal(state.activeId, existing.id);
    assert.deepEqual(state.sources.map(source => source.name), ['Existing Active', 'Batch First', 'Batch Last']);
    const options = await app.evaluate(() => global.__batchDialogOptions);
    assert(options.properties.includes('multiSelections'));
    await page.screenshot({ path: path.join(dir, 'results.png') });
    await result.getByRole('button', { name: '完成', exact: true }).click();
    await result.waitFor({ state: 'detached' });
    assert.equal(await result.count(), 0);
    await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); });
    await page.getByRole('button', { name: '批量导入音源', exact: true }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === '批量导入音源')?.disabled);
    assert.deepEqual(await page.evaluate(() => lxMusic.sources()), state);
    const report = { status: 'PASS', files: 4, imported: 2, skipped: 1, failed: 1,
      activePreserved: true, nativeDialogMultiSelect: true, cancellationPreserved: true, artifact: dir };
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(__dirname, 'artifacts/source-batch-latest.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await app.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
