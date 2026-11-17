const { _electron } = require('../../apps/desktop/node_modules/playwright');
const { PNG } = require('../../apps/desktop/node_modules/pngjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { root, hashes, sourceFiles } = require('./common.cjs');

function difference(a, b) {
  a = PNG.sync.read(a); b = PNG.sync.read(b);
  assert.equal(a.width, b.width); assert.equal(a.height, b.height);
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c] - b.data[i + c]);
  return sum / (a.width * a.height * 3);
}
function audioFixture() {
  const bytes = Buffer.alloc(44 + 16000 * 40 * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return 'data:audio/wav;base64,' + bytes.toString('base64');
}

(async () => {
  const directory = path.join(__dirname, 'artifacts/player-visibility'); fs.mkdirSync(directory, { recursive: true });
  const env = { ...process.env, MINERADIO_STARTUP_QA_HIDDEN: '1', MINERADIO_STARTUP_QA_USER_DATA: path.join(directory, 'profile-' + Date.now()),
    MINERADIO_NO_DESKTOP_SHORTCUT: '1', MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: path.join(root, 'apps/desktop/node_modules/electron/dist/electron.exe'),
    args: [path.join(root, 'apps/desktop'), '--disable-features=CalculateNativeWinOcclusion', '--force-device-scale-factor=1'], env });
  const report = { errors: [], sourceHashes: hashes(sourceFiles) };
  try {
    const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.message));
    await page.waitForFunction(() => window.__lxmine && document.getElementById('dock-copy'));
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]; window.setSize(1200, 800); window.setOpacity(0);
      window.webContents.setBackgroundThrottling(false); window.showInactive();
    });
    await page.evaluate(() => document.getElementById('splash')?.remove());
    await page.evaluate(async url => {
      document.getElementById('audio').muted = true;
      __lxmine.S.styleName = 'off'; __lxmine.S.appearance = 'dark';
      await __lxmine.playSong({ id: 'visibility-qa', provider: 'local', name: '歌词稳定与沉浸测试', localUrl: url, durationMs: 40000 });
    }, audioFixture());
    await page.locator('#dock-copy').click();
    const plain = page.frames().find(frame => frame.url().includes('plain-stage.html'));
    assert(plain); await plain.waitForFunction(() => !!window.lxmineStage);
    await page.waitForTimeout(1800);
    await page.evaluate(() => {
      document.getElementById('audio').pause(); document.getElementById('audio').currentTime = 5.25;
      __lxmine.S.playing = false; __lxmine.S.position = 5250;
      __lxmine.S.lyrics = Array.from({ length: 30 }, (_, i) => ({ time: i * 10000, text: '歌词保持稳定，逐字色彩持续跟随播放' }));
      __lxmine.pushStageMetadata();
    });
    await page.waitForTimeout(800);
    await plain.evaluate(() => { window.__stableGlyphs = [...document.querySelectorAll('.karaoke-char')]; window.__stableBuilds = lxmineStage.diagnostics().karaokeBuilds; });
    const before = await plain.locator('#viewport').screenshot();
    for (let i = 0; i < 12; i++) { await page.evaluate(() => __lxmine.pushStageMetadata()); await page.waitForTimeout(25); }
    const after = await plain.locator('#viewport').screenshot();
    fs.writeFileSync(path.join(directory, 'lyrics-before.png'), before); fs.writeFileSync(path.join(directory, 'lyrics-after.png'), after);
    report.lyrics = await plain.evaluate(() => ({ retained: __stableGlyphs.every((node, i) => document.querySelectorAll('.karaoke-char')[i] === node),
      count: __stableGlyphs.length, buildsBefore: __stableBuilds, buildsAfter: lxmineStage.diagnostics().karaokeBuilds,
      focusError: Math.abs(lxmineStage.diagnostics().glyphY - innerHeight / 2),
      paddingError: Math.abs(parseFloat(getComputedStyle(document.getElementById('lyrics')).paddingTop) - innerHeight / 2) }));
    report.lyrics.pixelMAE = difference(before, after);
    assert(report.lyrics.count > 5 && report.lyrics.retained, 'Repeated native metadata rebuilt the karaoke glyphs');
    assert.equal(report.lyrics.buildsBefore, report.lyrics.buildsAfter);
    assert(report.lyrics.pixelMAE < 1, 'Repeated metadata made paused lyrics flash');
    assert(report.lyrics.focusError < 1, 'Plain lyric focus drifted');
    assert(report.lyrics.paddingError < 1, 'Cached viewport lost the lyric centering space');

    const snapshot = () => page.evaluate(() => ({ immersive: document.body.classList.contains('detail-immersive'),
      alpha: Number(getComputedStyle(document.getElementById('dock-stack')).opacity), inert: document.getElementById('dock-stack').inert,
      pointer: getComputedStyle(document.getElementById('timeline')).pointerEvents }));
    await page.locator('#immersive-btn').click(); await page.waitForTimeout(60); report.hideMid = await snapshot();
    assert(report.hideMid.alpha > 0 && report.hideMid.alpha < 1, 'Immersive entry has no composed transition');
    await page.waitForTimeout(300); report.hidden = await snapshot();
    assert.equal(report.hidden.alpha, 0); assert.equal(report.hidden.inert, true); assert.equal(report.hidden.pointer, 'none');
    await page.screenshot({ path: path.join(directory, 'immersive.png') });
    await page.locator('#immersive-btn').click(); await page.waitForTimeout(60); report.showMid = await snapshot();
    assert(report.showMid.alpha > 0 && report.showMid.alpha < 1, 'Immersive exit has no composed transition');
    await page.waitForTimeout(300);
    for (let i = 0; i < 4; i++) {
      await page.locator('#immersive-btn').click(); await page.waitForTimeout(45);
      await page.locator('#immersive-btn').click(); await page.waitForTimeout(320);
      const state = await snapshot(); assert.equal(state.alpha, 1); assert.equal(state.inert, false);
    }
    // A warmed but hidden dynamic frame must not issue immersive commands.
    await page.evaluate(() => document.getElementById('stage-frame').contentWindow.__lxmineNative?.immersive('0'));
    assert.equal((await snapshot()).immersive, false);
    await page.locator('#immersive-btn').click(); await page.waitForTimeout(320);
    await page.keyboard.press('Escape'); await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => __lxmine.S.detailOpen), false);
    report.mainPages = [];
    for (const tab of ['home', 'library', 'settings']) {
      await page.locator(`.nav-item[data-tab="${tab}"]`).click(); await page.waitForTimeout(400);
      const state = await snapshot(); assert.equal(state.alpha, 1); assert.equal(state.inert, false);
      report.mainPages.push({ tab, ...state });
    }
    await page.evaluate(() => document.body.classList.add('detail-immersive'));
    assert.equal((await snapshot()).alpha, 1, 'A stale immersive class hid the main-page dock');
    await page.evaluate(() => document.body.classList.remove('detail-immersive'));
    assert.deepEqual(report.errors, []); report.status = 'PASS';
  } catch (error) { report.status = 'FAIL'; report.error = error.stack; throw error; }
  finally { fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2)); await app.close(); }
  console.log(JSON.stringify({ status: report.status, glyphsStable: report.lyrics.retained, pixelMAE: report.lyrics.pixelMAE, mainPages: report.mainPages.length }));
})().catch(error => { console.error(error); process.exitCode = 1; });
