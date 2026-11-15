const { _electron: electron } = require('playwright');

(async () => {
  const app = await electron.launch({
    executablePath: 'D:/LxMine/apps/desktop/node_modules/electron/dist/electron.exe',
    args: ['.'],
    cwd: 'D:/LxMine/apps/desktop',
    env: Object.assign({}, process.env, {
      MINERADIO_STARTUP_QA_USER_DATA: 'D:/LxMine/qa/electron-test-profile',
      MINERADIO_STARTUP_QA_HIDDEN: '1'
    })
  });
  const page = await app.firstWindow();
  await page.waitForTimeout(8000);
  await page.waitForSelector('.banner-card', { timeout: 20000 }).catch(() => {});
  console.log('home', await page.evaluate(() => ({
    w: innerWidth, h: innerHeight, body: document.body.className,
    title: document.querySelector('#page-title')?.textContent,
    banners: document.querySelectorAll('.banner-card').length,
    cards: document.querySelectorAll('.card').length
  })));
  console.log('home-lists', await page.evaluate(() => {
    const el = document.querySelector('.song-list');
    return {
      count: document.querySelectorAll('.song-list').length,
      bg: el && getComputedStyle(el).backgroundColor,
      border: el && getComputedStyle(el).border,
      radius: el && getComputedStyle(el).borderRadius
    };
  }));
  console.log('home-geo', await page.evaluate(() => {
    const view = document.querySelector('#view')?.getBoundingClientRect();
    const head = document.querySelector('.section[data-section="newSongs"] h2')?.getBoundingClientRect();
    const row = document.querySelector('.section[data-section="newSongs"] .song-row')?.getBoundingClientRect();
    return { w: innerWidth, view: view && { left: view.left, width: view.width }, headLeft: head?.left, row: row && { left: row.left, right: row.right } };
  }));
  await page.evaluate(() => document.querySelector('.section[data-section="newSongs"]')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'D:/LxMine/qa/pc-home-newsongs.png' });
  await page.evaluate(() => document.querySelector('#app')?.scrollTo({ top: 0 }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'D:/LxMine/qa/pc-home.png' });

  const banner = page.locator('.banner-card').first();
  if (await banner.count()) {
    await banner.click();
    await page.waitForTimeout(1400);
  }
  console.log('detail', await page.evaluate(() => {
    const back = document.querySelector('#back-btn');
    const title = document.querySelector('#page-title');
    const r1 = back?.getBoundingClientRect();
    const r2 = title?.getBoundingClientRect();
    return {
      title: title?.textContent, body: document.body.className,
      back: r1 && { top: r1.top, height: r1.height, center: r1.top + r1.height / 2 },
      titleBox: r2 && { top: r2.top, height: r2.height, center: r2.top + r2.height / 2 },
      lineHeight: title && getComputedStyle(title).lineHeight
    };
  }));
  console.log('detail-geo', await page.evaluate(() => {
    const view = document.querySelector('#view')?.getBoundingClientRect();
    const title = document.querySelector('#page-title')?.getBoundingClientRect();
    const row = document.querySelector('.song-row')?.getBoundingClientRect();
    return { w: innerWidth, view: view && { left: view.left, width: view.width }, titleLeft: title?.left, row: row && { left: row.left, right: row.right } };
  }));
  await page.screenshot({ path: 'D:/LxMine/qa/pc-detail.png' });

  await page.evaluate(() => window.__lxmine.setTab('library'));
  await page.waitForTimeout(900);
  console.log('library-geo', await page.evaluate(() => {
    const view = document.querySelector('#view')?.getBoundingClientRect();
    const title = document.querySelector('#page-title')?.getBoundingClientRect();
    const card = document.querySelector('.mosaic-tile')?.getBoundingClientRect();
    return { w: innerWidth, view: view && { left: view.left, width: view.width }, titleLeft: title?.left, card: card && { left: card.left, right: card.right } };
  }));
  await page.evaluate(() => {
    const names = ['热歌榜', '新歌榜', '原创榜'];
    names.forEach((name, i) => window.__lxmine.S.library.push({ id: 'qa-' + i, name, cover: '', trackCount: (i + 1) * 40 }));
    window.__lxmine.setTab('library');
  });
  await page.waitForTimeout(700);
  console.log('library-card-sizes', await page.evaluate(() => {
    const grid = document.querySelector('.playlist-mosaic');
    return {
      columns: grid && getComputedStyle(grid).gridTemplateColumns,
      autoRows: grid && getComputedStyle(grid).gridAutoRows,
      tiles: Array.from(document.querySelectorAll('.mosaic-tile')).map(card => {
        const r = card.getBoundingClientRect();
        const art = card.querySelector('.art')?.getBoundingClientRect();
        return {
          w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
          artW: art && Math.round(art.width * 10) / 10,
          col: getComputedStyle(card).gridColumn, row: getComputedStyle(card).gridRow,
          name: card.querySelector('h3')?.textContent
        };
      })
    };
  }));
  const beforeOrder = await page.evaluate(() => Array.from(document.querySelectorAll('.mosaic-tile h3')).map(node => node.textContent));
  const refreshButton = page.locator('button[aria-label="随机排列"]');
  if (await refreshButton.count()) {
    await refreshButton.click();
    await page.waitForTimeout(800);
  }
  const afterOrder = await page.evaluate(() => Array.from(document.querySelectorAll('.mosaic-tile h3')).map(node => node.textContent));
  console.log('refresh-mosaic', { before: beforeOrder, after: afterOrder, changed: beforeOrder.join('|') !== afterOrder.join('|') });
  await page.screenshot({ path: 'D:/LxMine/qa/pc-library-wide.png' });
  await page.evaluate(() => { window.__lxmine.setTab('home'); window.__lxmine.openSearch(); });
  await page.waitForTimeout(700);
  console.log('landing-geo', await page.evaluate(() => {
    const block = document.querySelector('#search-results .history-block')?.getBoundingClientRect();
    const box = document.querySelector('#search-box')?.getBoundingClientRect();
    const results = document.querySelector('#search-results')?.getBoundingClientRect();
    return { w: innerWidth, block: block && { left: block.left, width: block.width }, boxLeft: box?.left, results: results && { left: results.left, width: results.width } };
  }));
  await page.screenshot({ path: 'D:/LxMine/qa/pc-search-landing.png' });
  await page.fill('#search-input', '周杰伦');
  await page.press('#search-input', 'Enter');
  await page.waitForTimeout(8000);
  console.log('search-wide', await page.evaluate(() => ({
    w: innerWidth, body: document.body.className,
    songRows: document.querySelectorAll('#search-results .song-row').length,
    oldSearchRows: document.querySelectorAll('#search-results .search-row').length,
    listCards: document.querySelectorAll('#search-results .list-card').length,
    grid: document.querySelector('#search-results .song-row') && getComputedStyle(document.querySelector('#search-results .song-row')).gridTemplateColumns,
    expand: document.querySelector('#search-results .row-expand') && getComputedStyle(document.querySelector('#search-results .row-expand')).display,
    like: document.querySelector('#search-results .row-actions .row-like') && getComputedStyle(document.querySelector('#search-results .row-actions .row-like')).display,
    plus: document.querySelector('#search-results .row-actions .row-add') && getComputedStyle(document.querySelector('#search-results .row-actions .row-add')).display,
    lazyPanel: document.querySelector('#search-results .song-expand')?.children.length
  })));
  console.log('search-geo', await page.evaluate(() => {
    const row = document.querySelector('#search-results .song-row')?.getBoundingClientRect();
    const status = document.querySelector('#search-results .search-status')?.getBoundingClientRect();
    return { w: innerWidth, row: row && { left: row.left, right: row.right }, statusLeft: status?.left };
  }));
  await page.screenshot({ path: 'D:/LxMine/qa/pc-search-wide.png' });

  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setSize(520, 900);
  });
  await page.waitForTimeout(1200);
  console.log('search-narrow', await page.evaluate(() => ({
    w: innerWidth, body: document.body.className,
    expand: document.querySelector('#search-results .row-expand') && getComputedStyle(document.querySelector('#search-results .row-expand')).display,
    like: document.querySelector('#search-results .row-actions .row-like') && getComputedStyle(document.querySelector('#search-results .row-actions .row-like')).display,
    plus: document.querySelector('#search-results .row-actions .row-add') && getComputedStyle(document.querySelector('#search-results .row-actions .row-add')).display
  })));
  await page.screenshot({ path: 'D:/LxMine/qa/pc-search-narrow.png' });

  const expand = page.locator('#search-results .row-expand').first();
  if (await expand.count()) {
    await expand.click();
    await page.waitForTimeout(400);
  }
  console.log('search-narrow-expanded', await page.evaluate(() => {
    const item = document.querySelector('#search-results .song-item');
    const panel = item?.querySelector('.song-expand');
    return {
      open: item?.classList.contains('open'),
      display: panel && getComputedStyle(panel).display,
      children: panel?.children.length,
      like: panel?.querySelector('.row-like') && getComputedStyle(panel.querySelector('.row-like')).display
    };
  }));
  await page.screenshot({ path: 'D:/LxMine/qa/pc-search-narrow-expanded.png' });

  await app.close();
})().catch(error => { console.error(error); process.exit(1); });
