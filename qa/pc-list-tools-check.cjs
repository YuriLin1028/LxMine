const { _electron: electron } = require('playwright');

(async () => {
  const app = await electron.launch({
    executablePath: 'D:/LxMine/apps/desktop/node_modules/electron/dist/electron.exe',
    args: ['.'],
    cwd: 'D:/LxMine/apps/desktop',
    env: Object.assign({}, process.env, {
      MINERADIO_STARTUP_QA_USER_DATA: 'D:/LxMine/qa/electron-test-profile-list-tools',
      MINERADIO_STARTUP_QA_HIDDEN: '1'
    })
  });
  const page = await app.firstWindow();
  await page.waitForTimeout(9000);
  await page.waitForSelector('.banner-card', { timeout: 20000 }).catch(() => {});
  console.log('home new songs tools', await page.evaluate(() => {
    const section = document.querySelector('.section[data-section="newSongs"]');
    return {
      tools: !!section?.querySelector('.list-tools'),
      play: !!section?.querySelector('.list-tools-play'),
      sort: !!section?.querySelector('.list-tools-sort'),
      rows: section?.querySelectorAll('.song-row').length
    };
  }));
  await page.evaluate(() => window.__lxmine.setTab('library'));
  await page.waitForTimeout(1200);
  const tiles = await page.evaluate(() => Array.from(document.querySelectorAll('.mosaic-tile h3')).map(node => node.textContent));
  console.log('library tiles', tiles);

  // Open a feed chart from home (fresh QA profile has no imported library charts).
  await page.evaluate(() => window.__lxmine.setTab('home'));
  await page.waitForTimeout(500);
  if (await page.locator('.banner-card').count()) {
    await page.locator('.banner-card').first().click();
    await page.waitForTimeout(2400);
  }
  console.log('playlist header', await page.evaluate(() => ({
    title: document.querySelector('#page-title')?.textContent,
    actions: Array.from(document.querySelectorAll('#header-actions button')).map(node => node.getAttribute('aria-label')),
    tools: !!document.querySelector('.list-tools'),
    sortBtn: !!document.querySelector('.hero-actions .pill-btn:not(.accent)'),
    rows: document.querySelectorAll('.song-row').length
  })));
  await page.screenshot({ path: 'D:/LxMine/qa/pc-playlist-tools.png' });

  // Search within the list via the header action.
  await page.evaluate(() => document.querySelector('#header-actions button[aria-label="搜索本列表"]')?.click());
  await page.waitForTimeout(300);
  const firstSong = await page.evaluate(() => document.querySelector('.song-row .row-main strong')?.textContent || '');
  const key = firstSong.replace(/^\d+\s+/, '').slice(0, 2);
  await page.fill('.list-tools-input', key);
  await page.waitForTimeout(500);
  console.log('after filter', { key, rows: await page.evaluate(() => document.querySelectorAll('.song-row').length), count: await page.evaluate(() => document.querySelector('.list-tools-count')?.textContent) });
  await page.fill('.list-tools-input', '');
  await page.waitForTimeout(400);

  // Sort by name via the hero button.
  await page.evaluate(() => Array.from(document.querySelectorAll('.hero-actions .pill-btn')).find(node => node.textContent === '排列')?.click());
  await page.waitForTimeout(300);
  console.log('sort menu', await page.evaluate(() => Array.from(document.querySelectorAll('.anchored-menu .menu-row')).map(node => node.textContent)));
  await page.evaluate(() => Array.from(document.querySelectorAll('.anchored-menu .menu-row')).find(node => node.textContent === '歌名首字母')?.click());
  await page.waitForTimeout(500);
  console.log('sorted first rows', await page.evaluate(() => Array.from(document.querySelectorAll('.song-row .row-main strong')).slice(0, 3).map(node => node.textContent)));

  // Manual order dialog.
  await page.evaluate(() => Array.from(document.querySelectorAll('.hero-actions .pill-btn')).find(node => node.textContent === '排列')?.click());
  await page.waitForTimeout(300);
  await page.evaluate(() => Array.from(document.querySelectorAll('.anchored-menu .menu-row')).find(node => node.textContent === '手动排列')?.click());
  await page.waitForTimeout(400);
  console.log('manual dialog', await page.evaluate(() => ({
    open: !!document.querySelector('.manual-order-backdrop'),
    rows: document.querySelectorAll('.manual-order-row').length,
    first: document.querySelector('.manual-order-row strong')?.textContent,
    handles: document.querySelectorAll('.manual-order-handle').length,
    moveButtons: document.querySelectorAll('.manual-order-move').length
  })));
  await page.locator('.manual-order-row').nth(0).dragTo(page.locator('.manual-order-row').nth(2));
  await page.waitForTimeout(400);
  console.log('manual after drag', await page.evaluate(() => Array.from(document.querySelectorAll('.manual-order-row strong')).slice(0, 4).map(node => node.textContent)));
  await page.evaluate(() => Array.from(document.querySelectorAll('.manual-order-foot .pill-btn')).find(node => node.textContent === '完成')?.click());
  await page.waitForTimeout(500);
  console.log('manual applied', await page.evaluate(() => Array.from(document.querySelectorAll('.song-row .row-main strong')).slice(0, 3).map(node => node.textContent)));
  await page.screenshot({ path: 'D:/LxMine/qa/pc-playlist-sorted.png' });

  // Local page header actions and list tools.
  await page.evaluate(() => {
    window.__lxmine.S.localTracks = [
      { source: 'local', id: 'qa-local-1', name: '本地测试甲', singer: '测试歌手', albumName: '测试专辑', durationMs: 180000, qualitys: [], coverUrl: '' },
      { source: 'local', id: 'qa-local-2', name: '本地测试乙', singer: '另一位', albumName: '另一张', durationMs: 200000, qualitys: [], coverUrl: '' }
    ];
    window.__lxmine.setTab('library');
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const tile = Array.from(document.querySelectorAll('.mosaic-tile')).find(node => /本地音乐/.test(node.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(900);
  console.log('local page', await page.evaluate(() => ({
    title: document.querySelector('#page-title')?.textContent,
    actions: Array.from(document.querySelectorAll('#header-actions button')).map(node => node.getAttribute('aria-label')),
    tools: !!document.querySelector('.list-tools'),
    rows: document.querySelectorAll('.song-row').length,
    play: !!document.querySelector('.list-tools-play'),
    sort: !!document.querySelector('.list-tools-sort')
  })));
  await page.screenshot({ path: 'D:/LxMine/qa/pc-local-tools.png' });

  await app.close();
})().catch(error => { console.error(error); process.exit(1); });
