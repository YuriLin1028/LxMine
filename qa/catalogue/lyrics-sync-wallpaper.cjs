const { _electron } = require('../../apps/desktop/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const out = path.resolve('qa/catalogue/artifacts/lyrics-sync-wallpaper');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const profile = path.join(out, 'profile-' + Date.now());
  const app = await _electron.launch({
    executablePath: path.resolve(process.env.LM_QA_EXE || 'apps/desktop/node_modules/electron/dist/electron.exe'),
    args: [...(process.env.LM_QA_EXE ? [] : [path.resolve('apps/desktop')]), '--disable-features=CalculateNativeWinOcclusion', '--force-device-scale-factor=1'],
    env: { ...process.env, MINERADIO_STARTUP_QA_HIDDEN: '1', MINERADIO_STARTUP_QA_USER_DATA: profile,
      MINERADIO_NO_DESKTOP_SHORTCUT: '1', MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE: '1' }
  });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => window.__lxmine?.S && document.querySelector('#dock-controls'));
    await page.evaluate(() => {
      const s = window.__lxmine.S;
      s.current = { id: '123', source: 'kw', name: '回归测试歌曲', singer: '测试歌手' };
      s.lyrics = [{ time: 0, text: '这是桌面歌词第一行' }, { time: 10000, text: '这是第二行' }];
      s.position = 1000;
      window.__lxmine.setTab('settings');
    });
    await page.getByText('歌词设置', { exact: true }).click();
    await page.waitForFunction(() => window.__lxmine.S.currentView.name === 'lyrics-settings');
    const toggle = page.locator('.setting-row').filter({ has: page.getByText('显示桌面歌词', { exact: true }) }).locator('button');
    await toggle.click();
    await page.waitForTimeout(550);
    assert.equal(await page.evaluate(() => window.__lxmine.S.currentView.name), 'lyrics-settings');
    const overlay = app.windows().find(p => p.url().includes('/desktop-lyrics.html'));
    assert(overlay);
    await overlay.waitForFunction(() => document.querySelector('#line').textContent.includes('这是桌面歌词'));
    await page.locator('[data-action="desktop-lyrics"]').click();
    await page.waitForFunction(() => !window.__lxmine.S.desktopLyrics);
    assert.equal(await page.evaluate(() => window.__lxmine.S.currentView.name), 'lyrics-settings');
    await page.locator('[data-action="desktop-lyrics"]').click();
    await page.waitForTimeout(350);
    await page.evaluate(() => window.__lxmine.openDetail());
    const activeOverlay = app.windows().find(p => p.url().includes('/desktop-lyrics.html'));
    await activeOverlay.waitForFunction(() => document.querySelector('#line').textContent.includes('这是桌面歌词'));
    const shadow = await activeOverlay.locator('.stage').boundingBox();
    assert(shadow.height < 340, 'Unlocked shadow should be compact');
    const center = await activeOverlay.locator('#lyricViewport').boundingBox();
    await activeOverlay.mouse.move(center.x + center.width / 2, center.y + center.height / 2);
    await activeOverlay.waitForTimeout(450);
    const beforeResize = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'LxMine Desktop Lyrics').getBounds());
    const grip = await activeOverlay.locator('.resize-handle.e').boundingBox();
    assert(grip);
    await activeOverlay.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await activeOverlay.mouse.down();
    await activeOverlay.mouse.move(grip.x + grip.width / 2 + 64, grip.y + grip.height / 2, { steps: 8 });
    await activeOverlay.mouse.up();
    await activeOverlay.waitForTimeout(450);
    const afterResize = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'LxMine Desktop Lyrics').getBounds());
    assert(afterResize.width > beforeResize.width, 'Real pointer drag must resize lyrics');
    await activeOverlay.screenshot({ path: path.join(out, 'compact-lyrics.png') });

    await page.evaluate(() => {
      window.__lxmine.setTab('library');
      window.__lxmine.S.feedLoading = true;
      window.__lxmine.S.feedLoadingPlatform = window.__lxmine.S.homePlatform;
    });
    const status = await page.evaluate(() => window.lxMusic.syncStatus());
    const bundle = { protocol: 'lxlia-lansync/1', version: 1, device: { id: 'qa-harmony', name: '测试手机', platform: 'harmony' },
      sources: [], settings: {}, playlists: [{ id: 'harmony-qa', name: '手机同步的真实歌单', songs: [{ source: 'kw', id: '123', name: '同步歌曲', singer: '同步歌手' }] }] };
    const request = fetch('http://127.0.0.1:' + status.port + '/lxlia-sync/push', { method: 'POST', body: JSON.stringify(bundle) }).then(r => r.json());
    await page.getByRole('button', { name: '接收并覆盖', exact: true }).click({ timeout: 15000 });
    assert.equal((await request).accepted, true);
    await page.getByText('手机同步的真实歌单', { exact: true }).waitFor();
    const persisted = JSON.parse(fs.readFileSync(path.join(profile, 'built-in-playlists.json')));
    assert.equal(persisted.playlists[0].tracks[0].name, '同步歌曲');
    await page.getByText('手机同步的真实歌单', { exact: true }).click();
    await page.locator('.song-row strong').filter({ hasText: '同步歌曲' }).waitFor();
    console.log('PASS lyrics routes, populated overlay, compact bounds and real HTTP sync through song view');

    await app.evaluate(({ Menu }) => {
      const original = Menu.buildFromTemplate.bind(Menu);
      Menu.buildFromTemplate = template => {
        const menu = original(template);
        if (template.some(item => item.label === '退出壁纸模式')) global.__qaTrayMenu = menu;
        return menu;
      };
    });
    const enabled = await page.evaluate(() => window.desktopWindow.setWallpaperMode(true, { stage: window.__lxmine.S.wallpaperStage, clock: { positionMs: 1000, playing: false } }));
    assert.equal(enabled.ok, true, JSON.stringify(enabled));
    assert.equal(enabled.enabled, true);
    console.log('Wallpaper attached to native desktop');
    const wallpaper = app.windows().find(p => p.url().includes('wallpaper=1'));
    assert(wallpaper);
    await page.evaluate(() => window.__lxmine.setTab('settings'));
    assert.equal(await page.locator('#app').evaluate(n => getComputedStyle(n).display !== 'none'), true);
    await page.keyboard.press('Escape');
    assert.equal((await page.evaluate(() => window.desktopWindow.getWallpaperModeStatus())).status.enabled, true);
    assert.equal(await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Escape')), false);
    await app.evaluate(({ app }) => app.emit('second-instance', {}, [], process.cwd()));
    assert.equal((await page.evaluate(() => window.desktopWindow.getWallpaperModeStatus())).status.enabled, true);
    assert.equal(await wallpaper.locator('#desktop-mode-control-dock').isVisible(), false);
    await wallpaper.screenshot({ path: path.join(out, 'wallpaper-clean.png') });
    await page.getByRole('button', { name: '壁纸模式', exact: true }).click();
    await page.waitForFunction(() => !window.__lxmine.S.wallpaperMode);
    await page.waitForTimeout(350);
    assert.equal(app.windows().some(p => p.url().includes('wallpaper=1')), false);
    await page.getByRole('button', { name: '壁纸模式', exact: true }).click();
    await page.waitForFunction(() => window.__lxmine.S.wallpaperMode);
    await app.evaluate(() => {
      const item = global.__qaTrayMenu.items.find(item => item.label === '退出壁纸模式');
      if (!item?.visible) throw Error('Missing native tray exit item');
      item.click();
    });
    await page.waitForFunction(() => !window.__lxmine.S.wallpaperMode);
    await page.waitForTimeout(350);
    assert.equal(app.windows().some(p => p.url().includes('wallpaper=1')), false);
    const report = { status: 'PASS', lyricsSettingsRetained: true, detailDoesNotClearLyrics: true, shadow, realResize: { beforeResize, afterResize },
      sync: { actualHttp: true, blockedHomeIndependent: true, diskTracks: persisted.playlists[0].tracks.length, displayedSong: true },
      wallpaper: { independentHost: true, mainWindowUsable: true, escapeDoesNotExit: true, noGlobalEscape: true, secondInstanceKeepsWallpaper: true, cleanScene: true, settingsExit: true, nativeTrayExit: true }, packaged: !!process.env.LM_QA_EXE };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
