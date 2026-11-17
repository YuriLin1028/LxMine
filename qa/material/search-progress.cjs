const { _electron } = require('../../apps/desktop/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { root, hashes, sourceFiles } = require('./common.cjs');

(async () => {
  const directory = path.join(__dirname, 'artifacts/search-progress');
  fs.mkdirSync(directory, { recursive: true });
  const env = { ...process.env, MINERADIO_STARTUP_QA_HIDDEN: '1',
    MINERADIO_STARTUP_QA_USER_DATA: path.join(directory, 'profile-' + Date.now()),
    MINERADIO_NO_DESKTOP_SHORTCUT: '1', MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: path.join(root, 'apps/desktop/node_modules/electron/dist/electron.exe'),
    args: [path.join(root, 'apps/desktop'), '--disable-features=CalculateNativeWinOcclusion', '--force-device-scale-factor=1'], env });
  const report = { sourceHashes: hashes(sourceFiles), samples: [], errors: [] };
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.waitForFunction(() => window.__lxmine);
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setSize(1200, 800); window.setOpacity(0); window.showInactive();
      window.webContents.setBackgroundThrottling(false);
      ipcMain.removeHandler('lxmine-search');
      ipcMain.handle('lxmine-search', async (_, { source, type, page, limit }) => {
        await new Promise(resolve => setTimeout(resolve, source === 'kw' ? 260 : 150));
        const total = type === 'music' ? 1000 : 600;
        const start = (page - 1) * limit;
        return { total, hasMore: start + limit < total, items: Array.from({ length: Math.min(limit, total - start) }, (_, i) => ({
          source, provider: source, id: source + '-' + (start + i), kind: type,
          name: '连续追加歌曲 ' + String(start + i).padStart(4, '0'), singer: '分页测试', artist: '分页测试'
        })) };
      });
    });
    await page.evaluate(() => {
      document.getElementById('splash')?.remove();
      __lxmine.S.search.platform = 'all'; __lxmine.S.search.kind = 'music';
      __lxmine.openSearch();
    });
    await page.locator('#search-input').fill('分页滚动回归');
    await page.locator('#search-input').press('Enter');
    await page.waitForFunction(() => __lxmine.S.search.results.length >= 300);
    await page.evaluate(() => {
      window.__searchList = document.querySelector('.search-song-host');
      window.__firstRows = [...__searchList.children].slice(0, 100);
    });
    await page.mouse.move(700, 460);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(180);
      report.samples.push(await page.evaluate(() => ({ count: __lxmine.S.search.results.length,
        loading: __lxmine.S.search.loading, scrollTop: document.getElementById('search-body').scrollTop,
        sameList: __searchList === document.querySelector('.search-song-host'),
        retained: __firstRows.every((row, index) => __searchList.children[index] === row) })));
    }
    assert(report.samples.some(sample => sample.loading));
    assert(report.samples.at(-1).count > report.samples[0].count);
    assert(report.samples.every(sample => sample.sameList && sample.retained));
    assert(report.samples.at(-1).scrollTop > report.samples[0].scrollTop + 1000);
    const beforeFinish = report.samples.at(-1).scrollTop;
    report.viewport = await page.evaluate(() => {
      const rect = document.getElementById('search-body').getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: innerHeight };
    });
    assert(Math.abs(report.viewport.top) < 1 && Math.abs(report.viewport.bottom - report.viewport.height) < 1,
      'Search rows must continue behind the header and dock through the full window height');
    await page.screenshot({ path: path.join(directory, 'search-middle.png') });
    await page.waitForFunction(() => !__lxmine.S.search.loading, { timeout: 45000 });
    report.complete = await page.evaluate(() => ({ count: __lxmine.S.search.results.length,
      rows: document.querySelector('.search-song-host').children.length,
      scrollTop: document.getElementById('search-body').scrollTop,
      sameList: __searchList === document.querySelector('.search-song-host'),
      retained: __firstRows.every((row, index) => __searchList.children[index] === row) }));
    assert.equal(report.complete.count, 4000);
    assert.equal(report.complete.rows, 4000);
    assert(report.complete.sameList && report.complete.retained);
    assert(report.complete.scrollTop >= beforeFinish - 1);
    await page.mouse.wheel(0, 1000000);
    await page.waitForTimeout(400);
    report.bottom = await page.evaluate(() => {
      const scroller = document.getElementById('search-body');
      return { top: scroller.scrollTop, maximum: scroller.scrollHeight - scroller.clientHeight,
        lastVisible: document.querySelector('.search-song-host').lastElementChild.getBoundingClientRect().top < scroller.getBoundingClientRect().bottom };
    });
    assert(Math.abs(report.bottom.top - report.bottom.maximum) < 2 && report.bottom.lastVisible);
    await page.screenshot({ path: path.join(directory, 'search-bottom.png') });
    assert.equal(report.errors.length, 0);
    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
    await app.close();
  }
  console.log(JSON.stringify(report));
})();
