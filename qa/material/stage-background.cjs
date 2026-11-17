'use strict';
const { _electron } = require('../../apps/desktop/node_modules/playwright');
const { PNG } = require('../../apps/desktop/node_modules/pngjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, hashes, sourceFiles } = require('./common.cjs');

(async () => {
  const directory = path.join(__dirname, 'artifacts/stage-background');
  fs.mkdirSync(directory, { recursive: true });
  const env = { ...process.env, MINERADIO_STARTUP_QA_HIDDEN: '1', MINERADIO_STARTUP_QA_USER_DATA: path.join(directory, 'profile-' + Date.now()),
    MINERADIO_NO_DESKTOP_SHORTCUT: '1', MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: path.join(root, 'apps/desktop/node_modules/electron/dist/electron.exe'),
    args: [path.join(root, 'apps/desktop'), '--disable-features=CalculateNativeWinOcclusion', '--force-device-scale-factor=1'], env });
  const report = { sourceHashes: hashes(sourceFiles), scenes: [], errors: [] };
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.waitForFunction(() => window.__lxmine);
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1200, 800); window.setOpacity(0); window.webContents.setBackgroundThrottling(false); window.showInactive(); });
    await page.evaluate(() => document.getElementById('splash')?.remove());
    const cover = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
      const context = canvas.getContext('2d'); context.fillStyle = '#e24a43'; context.fillRect(0, 0, 64, 128);
      context.fillStyle = '#325bd0'; context.fillRect(64, 0, 64, 128); return canvas.toDataURL();
    });
    const wav = Buffer.alloc(44 + 16000 * 40);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    const audio = 'data:audio/wav;base64,' + wav.toString('base64');
    for (const mode of ['off', 'mine-0', 'mine-7']) for (const art of [false, true]) for (const theme of ['dark', 'light']) {
      await page.evaluate(async ({ cover, mode, art, theme, audio }) => {
        const state = __lxmine.S;
        state.styleName = mode; state.appearance = theme;
        document.getElementById('audio').muted = true;
        await __lxmine.playSong({ id: 'background-qa-' + art + '-' + mode + '-' + theme, name: '背景与歌词对比', artist: 'LxMine', provider: 'local', cover: art ? cover : '', localUrl: audio, durationMs: 40000 });
        document.getElementById('audio').pause();
        state.lyrics = Array.from({ length: 30 }, (_, index) => ({ time: index * 2000, text: '背景与歌词对比 ' + index }));
        state.position = 20000; __lxmine.openDetail(); __lxmine.pushStageMetadata();
      }, { cover, mode, art, theme, audio });
      await page.waitForFunction(theme => document.body.classList.contains('light-theme') === (theme === 'light'), theme);
      const frameId = mode === 'off' ? 'plain-stage-frame' : 'stage-frame';
      await page.waitForFunction(id => document.getElementById(id).contentWindow.lxmineStage, frameId);
      await page.waitForFunction(({ id, theme }) => document.getElementById(id).contentWindow.document.body.classList.contains('light-theme') === (theme === 'light'), { id: frameId, theme });
      await page.waitForTimeout(700);
      if (mode !== 'off') {
        await page.waitForFunction(() => __lxmine.S.dynamicStageReady);
        await page.frames().find(frame => frame.url().includes('harmony-stage.html')).waitForFunction(() =>
          stageLyrics.current?.userData?.lyric?.rowLayers?.some(row => row.mesh?.visible && row.mat?.uniforms?.uOpacity?.value > .05));
      }
      const name = [mode, art ? 'cover' : 'empty', theme].join('-');
      const png = await page.screenshot({ path: path.join(directory, name + '.png') });
      const pixels = PNG.sync.read(png);
      const sample = (x, y) => { const offset = (y * pixels.width + x) * 4; return [...pixels.data.subarray(offset, offset + 3)]; };
      const left = sample(80, 400), right = sample(1120, 400);
      const brightness = [...left, ...right].reduce((total, value) => total + value, 0) / 6;
      const colorDifference = Math.abs(left[0] - right[0]) + Math.abs(left[2] - right[2]);
      report.scenes.push({ mode, art, theme, brightness, colorDifference, layers: await page.evaluate(() =>
        ['body', '#stage', '#stage-fallback', '#stage-frame', '#plain-stage-frame', '#detail-overlay'].map(selector => {
          const element = document.querySelector(selector), style = getComputedStyle(element);
          return { selector, bg: style.backgroundColor, image: style.backgroundImage.slice(0, 70), display: style.display, opacity: style.opacity, bounds: element.getBoundingClientRect().toJSON() };
        })) });
      if (art) assert(colorDifference > 25, 'The rendered cover is hidden: ' + name);
      if (theme === 'light') assert(brightness > 120, 'Light stage is too dark: ' + name);
      else assert(brightness < 120, 'Dark stage is too bright: ' + name);
      if (mode !== 'off') {
        const dynamic = page.frames().find(frame => frame.url().includes('harmony-stage.html'));
        const backgrounds = await dynamic.evaluate(() =>
          ['html', 'body', '#canvas-container'].map(selector => getComputedStyle(document.querySelector(selector)).backgroundColor));
        assert(backgrounds.every(color => color === 'rgba(0, 0, 0, 0)'));
        const ink = await dynamic.evaluate(() => ({ wash: !!scene.getObjectByName('lxmine-light-lyric-wash'), theme: LxMineAppearance.uniform.value,
          shaderErrors: renderer.info.programs.filter(program => program.diagnostics?.runnable === false).length,
          fogLayers: (stageLyrics.current?.userData?.lyric?.rowLayers || []).filter(row => row.mesh?.visible && (row.readability?.visible || row.glow?.visible)).length }));
        report.scenes.at(-1).lyricInk = ink;
        assert.equal(ink.wash, false, 'A full-screen white wash obscured the scene');
        assert.equal(ink.shaderErrors, 0, 'Lyric shader did not compile');
        assert.equal(ink.theme, theme === 'light' ? 1 : 0);
        if (theme === 'light') assert.equal(ink.fogLayers, 0, 'Light lyrics retained a diffuse glow layer');
      }
    }
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => { __lxmine.S.appearance = 'system'; __lxmine.pushStageMetadata(); });
    await page.waitForFunction(() => !document.body.classList.contains('light-theme'));
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.body.classList.contains('light-theme') && document.getElementById('stage-frame').contentWindow.LxMineAppearance.isLight());
    assert.deepEqual(report.errors, []); report.status = 'PASS';
  } finally { fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2)); await app.close(); }
  console.log(JSON.stringify({ status: report.status, scenes: report.scenes.map(({ mode, art, theme, brightness, colorDifference }) => ({ mode, art, theme, brightness, colorDifference })) }));
})().catch(error => { console.error(error); process.exitCode = 1; });
