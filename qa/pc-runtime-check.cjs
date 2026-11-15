const { _electron: electron } = require('playwright');

(async () => {
  const path = require('path');
  const current = require('D:/LxMine/releases/windows/runtime/current.json');
  const bundle = path.resolve('D:/LxMine/releases/windows/runtime', path.dirname(current.entry));
  const app = await electron.launch({
    executablePath: bundle + '/LxMine.exe',
    args: [],
    env: Object.assign({}, process.env, {
      MINERADIO_STARTUP_QA_USER_DATA: 'D:/LxMine/qa/electron-runtime-profile',
      MINERADIO_STARTUP_QA_HIDDEN: '1'
    })
  });
  const page = await app.firstWindow();
  await page.waitForTimeout(9000);
  await page.waitForSelector('.banner-card', { timeout: 20000 }).catch(() => {});
  console.log('runtime home', await page.evaluate(() => ({
    title: document.querySelector('#page-title')?.textContent,
    banners: document.querySelectorAll('.banner-card').length,
    newSongsTools: !!document.querySelector('.section[data-section="newSongs"] .list-tools'),
    agent: navigator.userAgent.includes('Electron')
  })));
  await page.evaluate(() => window.__lxmine.setTab('library'));
  await page.waitForTimeout(1200);
  console.log('runtime library', await page.evaluate(() => ({
    tiles: Array.from(document.querySelectorAll('.mosaic-tile h3')).map(node => node.textContent),
    favorites: Array.from(document.querySelectorAll('.mosaic-tile h3')).filter(node => node.textContent === '我喜欢的').length,
    covers: Array.from(document.querySelectorAll('.mosaic-tile .art')).map(node => getComputedStyle(node).backgroundImage !== 'none')
  })));
  await page.evaluate(() => {
    const tile = Array.from(document.querySelectorAll('.mosaic-tile')).find(node => /本地音乐/.test(node.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(900);
  console.log('runtime local', await page.evaluate(() => ({
    actions: Array.from(document.querySelectorAll('#header-actions button')).map(node => node.getAttribute('aria-label')),
    tools: !!document.querySelector('.list-tools'),
    play: !!document.querySelector('.list-tools-play'),
    sort: !!document.querySelector('.list-tools-sort')
  })));
  await page.screenshot({ path: 'D:/LxMine/qa/pc-runtime-local.png' });
  await app.close();
})().catch(error => { console.error(error); process.exit(1); });
