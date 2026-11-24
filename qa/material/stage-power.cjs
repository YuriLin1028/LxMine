'use strict';
const { _electron } = require('../../apps/desktop/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, hashes, sourceFiles } = require('./common.cjs');

function fixtureAudio() {
  const rate = 16000, samples = rate * 40;
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) data.writeInt16LE(Math.round(4000 * Math.sin(index / rate * Math.PI * 440)), 44 + index * 2);
  return 'data:audio/wav;base64,' + data.toString('base64');
}

(async () => {
  const directory = path.join(__dirname, 'artifacts/stage-power');
  fs.mkdirSync(directory, { recursive: true });
  const env = { ...process.env, MINERADIO_STARTUP_QA_HIDDEN: '1', MINERADIO_STARTUP_QA_USER_DATA: path.join(directory, 'profile-' + Date.now()),
    MINERADIO_NO_DESKTOP_SHORTCUT: '1', MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: path.join(root, 'apps/desktop/node_modules/electron/dist/electron.exe'),
    args: [path.join(root, 'apps/desktop'), '--disable-features=CalculateNativeWinOcclusion', '--force-device-scale-factor=1'], env });
  const report = { errors: [], sourceHashes: hashes(sourceFiles) };
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.waitForFunction(() => window.__lxmine && document.getElementById('dock-copy'));
    const input = await page.context().newCDPSession(page);
    await input.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    async function swipe(points, deltaX, deltaY) {
      const touchPoints = points.map((point, index) => ({ ...point, id: index + 1, radiusX: 2, radiusY: 2, force: 1 }));
      await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
      for (let step = 1; step <= 8; step++) {
        await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints.map(point => ({ ...point, x: point.x + deltaX * step / 8, y: point.y + deltaY * step / 8 })) });
        await page.waitForTimeout(24);
      }
      await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(100);
    }
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setSize(1200, 800); window.setOpacity(0); window.webContents.setBackgroundThrottling(false); window.showInactive();
    });
    await page.evaluate(() => document.getElementById('splash')?.remove());
    let stage;
    const snapshot = () => stage.evaluate(() => ({
      presentation: { ...window.__lxmineStagePresentation }, diagnostics: window.lxmineStage.diagnostics(),
      pixels: renderer.domElement.width * renderer.domElement.height, renderedFrames: renderer.info.render.frame,
      analysisSource: audio.getAttribute('src'), buffers: { ...renderer.info.memory }, parentPlaying: parent.__lxmine.S.playing,
    }));
    await page.evaluate(async url => {
      document.getElementById('audio').muted = true;
      document.getElementById('audio').loop = true;
      window.__lxmine.S.styleName = 'mine-7';
      window.__lxmine.S.appearance = 'dark';
      await window.__lxmine.playSong({ id: 'power-qa', name: '性能测试节拍', artist: 'LxMine', provider: 'local', localUrl: url, durationMs: 40000 });
    }, fixtureAudio());
    await page.waitForFunction(() => window.__lxmine.S.playing);
    await page.waitForTimeout(2500);
    const homeSnapshot = () => page.evaluate(() => ({ src: document.getElementById('stage-frame').getAttribute('src'),
      engine: !!document.getElementById('stage-frame').contentWindow.lxmineStage,
      background: getComputedStyle(document.getElementById('stage')).backgroundColor,
      parentPlaying: __lxmine.S.playing, pixels: 0 }));
    report.home = await homeSnapshot();
    assert.equal(report.home.src, '/mine-stage/harmony-stage.html');
    assert.equal(report.home.engine, true, 'Startup did not warm the rendering engine');
    assert.equal(report.home.background, 'rgb(21, 22, 25)');
    assert.equal(report.home.parentPlaying, true);
    stage = page.frames().find(frame => frame.url().includes('harmony-stage.html'));
    await stage.waitForFunction(() => lxmineStage.diagnostics().prewarmed);
    report.prewarmed = await snapshot();
    assert.equal(report.prewarmed.presentation.visible, false);
    assert(report.prewarmed.pixels <= 16);
    assert.equal(report.prewarmed.analysisSource, null);

    const enterStart = Date.now();
    await page.locator('#dock-copy').click();
    await page.waitForFunction(() => document.getElementById('stage-frame').contentWindow.lxmineStage);
    stage = page.frames().find(frame => frame.url().includes('harmony-stage.html'));
    assert(stage, 'Production stage is missing');
    await stage.waitForFunction(() => window.__lxmineStagePresentation.visible && window.__lxmineStagePresentation.detail);
    assert.equal(await stage.locator('body').evaluate(node => node.classList.contains('render-deep-sleep')), false);
    await stage.waitForFunction(() => Number(getComputedStyle(document.getElementById('canvas-container')).opacity) >= .99);
    await page.waitForFunction(() => __lxmine.S.dynamicStageReady);
    report.firstEntryMs = Date.now() - enterStart;
    assert(report.firstEntryMs < 1000, 'Opening a prewarmed playback stage stalled');
    await page.waitForTimeout(3500);
    const frameStart = await snapshot(), measuredAt = Date.now();
    await page.waitForTimeout(2000);
    report.detail = await snapshot();
    report.detail.observedFps = Math.round((report.detail.renderedFrames - frameStart.renderedFrames) * 1000 / (Date.now() - measuredAt));
    assert.equal(report.detail.presentation.detail, true);
    assert.equal(report.detail.diagnostics.perf.targetFps, 0, 'Visible playback is capped below display VSync');
    assert.equal(report.detail.diagnostics.audioPaused, false);
    assert.equal(report.detail.diagnostics.audioContext, 'running');
    assert(report.detail.observedFps >= 45, 'Playback stage failed its frame budget');
    report.presetWarmth = [];
    await page.evaluate(() => document.addEventListener('click', event => {
      if (event.target.closest('.menu-row')) window.__presetRequestedAt = Date.now();
    }, true));
    const presetCount = await stage.evaluate(() => presetMeta.length);
    for (let index = 0; index < presetCount; index++) {
      await page.locator('#style-btn').click();
      const before = await stage.evaluate(() => renderer.info.render.frame);
      await page.locator('.menu-row').nth(index + 2).click();
      await stage.waitForFunction(({ index, before }) => {
        if (fx.preset !== index || renderer.info.render.frame <= before) return false;
        if (index === SKULL_PRESET_INDEX && !skullParticleGroup?.visible) return false;
        if (index === MineradioSonicWorkshop.INDEX) {
          const frame = document.getElementById('sonic-workshop-layer')?.querySelector('iframe');
          return frame?.contentWindow.__mineradioPowerDiagnostics?.().visible === true;
        }
        return true;
      }, { index, before });
      const elapsed = Date.now() - await page.evaluate(() => __presetRequestedAt);
      report.presetWarmth.push({ index, firstFrameMs: elapsed });
      assert(elapsed < 1000, 'A prewarmed preset stalled at first activation, preset ' + index);
      if (index === 8) {
        const child = stage.childFrames().find(frame => frame.url().includes('mineradio-bridge.html'));
        await child.evaluate(() => {
          window.__qaWorkshopClicks = 0;
          document.addEventListener('click', () => __qaWorkshopClicks++, true);
          window.__qaWorkshopAngles = [];
          window.__qaWorkshopProperties = __mineradioApplyProperties;
          window.__mineradioApplyProperties = properties => {
            __qaWorkshopAngles.push(properties.cameraAngleX);
            __qaWorkshopProperties(properties);
          };
        });
        await stage.evaluate(() => MineradioSonicWorkshop.pushProperties(true));
        await page.waitForTimeout(50);
        const beforeAngle = await child.evaluate(() => __qaWorkshopAngles.at(-1));
        const beforeInput = await stage.evaluate(() => ({ theta: orbit.userTheta, seeks: lxmineLyricSeekDiagnostics().commits }));
        const point = await stage.evaluate(() => {
          for (let y = innerHeight * .35; y < innerHeight * .65; y += 8) {
            if (lxmineLyricHitTest(12, y) < 0) return { x: 12, y, width: innerWidth };
          }
          throw new Error('No workshop scene touch target');
        });
        for (let turn = 0; turn < 8; turn++) await swipe([point], point.width - 28, 0);
        await swipe([point], 0, 0);
        report.workshopInput = await child.evaluate(() => ({ angle: __qaWorkshopAngles.at(-1), clicks: __qaWorkshopClicks }));
        assert(Math.abs(report.workshopInput.angle - beforeAngle) > 360, 'Workshop scene ignored the full orbit gesture');
        assert.equal(report.workshopInput.clicks, 1, 'Workshop tap did not reach its scene');
        assert.equal(await stage.evaluate(() => lxmineLyricSeekDiagnostics().commits), beforeInput.seeks);
        const theta = await stage.evaluate(() => orbit.userTheta);
        assert(Math.abs(theta - beforeInput.theta) > Math.PI * 2);
        await child.evaluate(() => { window.__mineradioApplyProperties = __qaWorkshopProperties; });
      }
    }
    await page.locator('#style-btn').click(); await page.locator('.menu-row').nth(9).click();
    await page.waitForTimeout(400);
    await stage.waitForFunction(() => stageLyrics.current?.userData.lyric.rowLayers.some(row =>
      row.lineIndex === stageLyrics.currentIdx && row.readability && row.glow));
    await page.evaluate(() => {
      document.getElementById('audio').pause();
      window.__qaOriginalLyrics = __lxmine.S.lyrics;
      __lxmine.S.lyrics = Array.from({ length: 60 }, (_, index) => ({ time: index * 500, text: '暂停更新歌词 ' + index }));
      __lxmine.pushStageMetadata();
    });
    await stage.waitForFunction(() => !playing && stageLyrics.currentIdx !== -1 && stageLyrics.currentText.includes('暂停更新歌词'));
    report.pausedLyricUpdate = true;
    await stage.evaluate(() => lxmineStage.seek(5));
    await stage.waitForFunction(() => !playing && stageLyrics.currentIdx === 10);
    report.pausedLyricSeek = true;
    await page.evaluate(async () => {
      __lxmine.S.lyrics = window.__qaOriginalLyrics;
      __lxmine.pushStageMetadata();
      await document.getElementById('audio').play();
    });
    await page.evaluate(() => { document.getElementById('audio').currentTime = 15; });
    await stage.waitForFunction(() => lxmineNativeTime() >= 15);
    await page.evaluate(() => {
      __lxmine.S.lyrics = Array.from({ length: 60 }, (_, index) => ({ time: index * 500, text: '屏幕上下连续渐隐歌词 ' + index }));
      __lxmine.pushStageMetadata();
    });
    await stage.waitForFunction(() => lyricsLines.length === 60 && stageLyrics.currentIdx >= 25 && stageLyrics.current?.userData?.lyric?.rowLayers?.filter(row => row.mesh?.visible).length >= 9);
    await page.waitForTimeout(1200);
    report.dynamicLyrics = await stage.evaluate(() => {
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const data = stageLyrics.current.userData.lyric;
      const rows = data.rowLayers.filter(row => row.mesh?.visible).map(row => {
        const point = row.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
        return { index: row.lineIndex, y: (1 - point.y) * innerHeight / 2 };
      });
      return { mode: fx.lyricDisplayMode, position: lxmineNativeTime(), expected: findStageLyricIndexAtTime(lxmineNativeTime()), index: stageLyrics.currentIdx,
        target: data.trackTargetLineIndex, pending: data.trackPendingPayload?.trackIndex, parentPosition: parent.__lxmine.S.position,
        lineCount: lyricDisplayLineCountForMode(fx.lyricDisplayMode), residentRows: data.rowLayers.length,
        height: innerHeight, rows, edgeMask: renderer.info.programs.some(program => program.fragmentShader && renderer.getContext().getShaderSource(program.fragmentShader).includes('lyricScreenY')) };
    });
    assert.equal(report.dynamicLyrics.mode, 'cinema');
    assert(Math.min(...report.dynamicLyrics.rows.map(row => row.y)) < report.dynamicLyrics.height * .15, 'Dynamic lyrics stop above the upper screen edge');
    assert(Math.max(...report.dynamicLyrics.rows.map(row => row.y)) > report.dynamicLyrics.height * .85, 'Dynamic lyrics stop before the lower screen edge');
    assert(report.dynamicLyrics.residentRows <= report.dynamicLyrics.lineCount + 8);
    assert(report.dynamicLyrics.edgeMask, 'Dynamic lyrics have no screen-space alpha fade');
    await page.screenshot({ path: path.join(directory, 'full-height-dynamic.png') });
    const lyricTouchPoint = () => stage.evaluate(() => {
      scene.updateMatrixWorld(true);
      const rows = stageLyrics.current.userData.lyric.rowLayers.filter(row => row.mesh?.visible && !row.isTranslation);
      const points = rows.map(row => {
        const point = row.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
        return { x: (point.x + 1) * innerWidth / 2, y: (1 - point.y) * innerHeight / 2, index: row.lineIndex };
      }).sort((a, b) => Math.abs(a.y - innerHeight / 2) - Math.abs(b.y - innerHeight / 2));
      const point = points.find(point => point.y > innerHeight * .25 && point.y < innerHeight * .7 && lxmineLyricHitTest(point.x, point.y) === point.index);
      if (!point) throw new Error('No visible lyric center is available for input');
      return { ...point, time: lyricsLines[point.index].t };
    });
    const rotationBefore = await stage.evaluate(() => ({ theta: orbit.userTheta, seeks: lxmineLyricSeekDiagnostics().commits }));
    await stage.evaluate(() => {
      window.__qaGestureEvents = [];
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend']) window.addEventListener(type, event => {
        __qaGestureEvents.push({ type, target: event.target.id || event.target.tagName, x: event.clientX, y: event.clientY });
      }, true);
    });
    const lyricPoint = await lyricTouchPoint();
    report.lyricGestureTarget = await page.evaluate(point => ({ element: document.elementFromPoint(point.x, point.y)?.outerHTML.slice(0, 200), frame: getComputedStyle(document.getElementById('stage-frame')).pointerEvents,
      plain: getComputedStyle(document.getElementById('plain-stage-frame')).pointerEvents }), lyricPoint);
    await swipe([lyricPoint], 0, -100);
    report.lyricGestureRaw = await stage.evaluate(() => ({ events: __qaGestureEvents, seek: lxmineLyricSeekDiagnostics(), touch: lxmineTouchDiagnostics(), track: currentCoverSong()?.id }));
    assert(await stage.evaluate(() => lxmineLyricPreviewTime() != null), 'Single-finger lyric scrolling did not move the lyric viewport');
    assert.equal(await stage.evaluate(() => lxmineLyricSeekDiagnostics().commits), rotationBefore.seeks);
    assert.equal(await stage.evaluate(() => orbit.userTheta), rotationBefore.theta);
    await page.waitForTimeout(600);
    const clickLyric = await lyricTouchPoint();
    await swipe([{ x: clickLyric.x, y: clickLyric.y }], 0, 0);
    assert.equal(await stage.evaluate(() => lxmineLyricSeekDiagnostics().commits), ++rotationBefore.seeks);
    assert(Math.abs(await page.evaluate(() => __lxmine.S.position / 1000) - clickLyric.time) < .5, 'Clicking a lyric sought a different line time');
    let outsidePoint;
    for (let turn = 0; turn < 4; turn++) {
      const point = await stage.evaluate(() => {
        for (let y = innerHeight * .35; y <= innerHeight * .6; y += 8) {
          for (let x = 16; x < innerWidth / 5; x += 8) if (lxmineLyricHitTest(x, y) < 0) return { x, y };
        }
        throw new Error('No scene area outside the lyric rows is available for rotation');
      });
      outsidePoint = point;
      await swipe([point], 1100 - point.x, 20);
    }
    report.rotation = await stage.evaluate(() => ({ theta: orbit.userTheta, seeks: lxmineLyricSeekDiagnostics().commits, activeTouches: lxmineTouchDiagnostics().active }));
    assert(Math.abs(report.rotation.theta - rotationBefore.theta) > Math.PI * 2, 'Single-finger scene dragging blocked 360-degree rotation');
    assert.equal(report.rotation.seeks, rotationBefore.seeks, 'Scene rotation sought the lyric track');
    assert.equal(report.rotation.activeTouches, 0);
    const tapsBefore = await stage.evaluate(() => lxmineTouchDiagnostics().taps);
    await swipe([outsidePoint], 0, 0);
    assert.equal(await stage.evaluate(() => lxmineTouchDiagnostics().taps), tapsBefore + 1);
    assert.equal(await stage.evaluate(() => lxmineLyricSeekDiagnostics().commits), rotationBefore.seeks);
    await swipe([{ x: 500, y: 350 }, { x: 650, y: 350 }], 0, 110);
    assert(await page.locator('body').evaluate(node => node.classList.contains('detail-immersive')));
    await swipe([{ x: 500, y: 450 }, { x: 650, y: 450 }], 0, -110);
    assert.equal(await page.locator('body').evaluate(node => node.classList.contains('detail-immersive')), false);

    await page.locator('#detail-back').click();
    await page.waitForTimeout(1500);
    report.returnedHome = await homeSnapshot();
    assert.equal(report.returnedHome.engine, true);
    report.sleep = await snapshot();
    assert.equal(report.sleep.presentation.visible, false);
    assert.equal(report.sleep.analysisSource, null);
    assert(report.sleep.pixels <= 16);
    const workshop = stage.childFrames().find(frame => frame.url().includes('mineradio-bridge.html'));
    assert(workshop, 'The prewarmed workshop cache was discarded');
    const dormantWorkshop = await workshop.evaluate(() => __mineradioPowerDiagnostics());
    assert.equal(dormantWorkshop.visible, false);
    assert(dormantWorkshop.pixels <= 4);
    const sleepingFrame = report.sleep.renderedFrames;
    await page.waitForTimeout(500);
    assert.equal((await snapshot()).renderedFrames, sleepingFrame);
    assert.equal((await workshop.evaluate(() => __mineradioPowerDiagnostics())).frames, dormantWorkshop.frames);
    assert.equal(report.returnedHome.parentPlaying, true);

    await page.locator('#nav [data-tab="settings"]').click();
    await page.locator('.setting-row').filter({ hasText: '外观与背景' }).click();
    const appearance = page.locator('.setting-row').filter({ has: page.getByText('外观', { exact: true }) }).getByRole('button');
    await appearance.click(); await page.locator('.menu-row').filter({ hasText: '浅色' }).click();
    await page.waitForFunction(() => document.body.classList.contains('light-theme'));
    report.light = await homeSnapshot();
    assert.equal(report.light.background, 'rgb(220, 224, 229)');
    assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).color), 'rgb(23, 24, 26)');
    await appearance.click(); await page.locator('.menu-row').filter({ hasText: '跟随系统' }).click();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => !document.body.classList.contains('light-theme'));
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.body.classList.contains('light-theme'));

    await page.locator('#dock-copy').click();
    await page.waitForFunction(() => document.getElementById('stage-frame').contentWindow.lxmineStage);
    await page.locator('#style-btn').click();
    assert.equal(await page.locator('.menu-row').nth(1).innerText(), '关闭动效');
    await stage.evaluate(() => { window.__powerQaIdentity = Math.random(); });
    const dynamicIdentity = await stage.evaluate(() => window.__powerQaIdentity);
    await page.locator('.menu-row').nth(1).click();
    await page.waitForFunction(() => __lxmine.S.styleName === 'off' && __lxmine.S.detailOpen);
    await page.waitForFunction(() => document.getElementById('plain-stage-frame').contentWindow.lxmineStage?.diagnostics().plain);
    const plain = page.frames().find(frame => frame.url().includes('plain-stage.html'));
    report.plain = await plain.evaluate(() => ({ ...lxmineStage.diagnostics(), canvases: document.querySelectorAll('canvas').length, audio: document.querySelectorAll('audio').length }));
    assert.equal(report.plain.canvases, 0); assert.equal(report.plain.audio, 0); assert.equal(report.plain.analyser, false);
    assert.equal(await page.evaluate(() => __lxmine.S.playing), true);
    await page.evaluate(() => {
      __lxmine.S.lyrics = [{ time: 0, text: '纯文字歌词' }, { time: 2000, text: '保留歌词颜色' }, { time: 6000, text: '左对齐滚动' }];
      __lxmine.pushStageMetadata();
    });
    await plain.waitForFunction(() => document.querySelectorAll('.line').length === 3);
    await page.waitForTimeout(300);
    assert.equal(await plain.locator('.line').first().evaluate(node => getComputedStyle(node).textAlign), 'left');
    const viewport = await plain.locator('#viewport').evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, height: innerHeight, mask: getComputedStyle(node).maskImage, background: getComputedStyle(document.body).backgroundColor };
    });
    report.plainVisibility = await page.evaluate(() => ({ detail: __lxmine.S.detailOpen, style: __lxmine.S.styleName, classes: document.body.className,
      iframe: document.getElementById('plain-stage-frame').outerHTML, display: getComputedStyle(document.getElementById('plain-stage-frame')).display,
      viewport: document.getElementById('plain-stage-frame').getBoundingClientRect().toJSON() }));
    report.plainViewport = viewport;
    assert.equal(viewport.top, 0);
    assert.equal(viewport.bottom, viewport.height);
    assert.match(viewport.mask, /linear-gradient/);
    assert.equal(viewport.background, 'rgba(0, 0, 0, 0)');
    assert(await plain.locator('.line.active').evaluate(node => Number(getComputedStyle(node).transform.match(/matrix\(([^,]+)/)?.[1]) >= 1.05));
    const sleepingDynamic = await snapshot();
    assert.equal(sleepingDynamic.analysisSource, null);
    assert(sleepingDynamic.pixels <= 16);
    await plain.evaluate(() => {
      lxmineStage.metadata({ id: 'anchor-qa', lines: [{ timeMs: 0, text: '原始定位' }, { timeMs: 1000, text: '当前歌词' }], lyricOffset: 0 });
      lxmineStage.clock({ positionMs: 1000, playing: false });
    });
    await page.waitForTimeout(400);
    await plain.waitForFunction(() => !lxmineStage.diagnostics().scrolling);
    report.plain.anchorError = await plain.locator('.line.active .main').evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return Math.abs(bounds.top + bounds.height / 2 - innerHeight * .5);
    });
    assert(report.plain.anchorError <= 2, 'Plain lyrics changed the active glyph anchor');
    await page.evaluate(() => {
      const audio = document.getElementById('audio'); audio.pause(); audio.currentTime = .25;
      __lxmine.S.position = 250;
      __lxmine.S.lyrics = [{ time: 0, text: '逐字色彩跟随', words: [
        { text: '逐字', timeMs: 0, durationMs: 1000 }, { text: '色彩跟随', timeMs: 1000, durationMs: 2000 }
      ] }, { time: 4000, text: '下一行' }];
      __lxmine.pushStageMetadata();
    });
    await page.waitForTimeout(300);
    const karaokeBefore = await plain.locator('.line.active .main').screenshot();
    report.plain.karaokeBefore = await plain.evaluate(() => ({ progress: lxmineStage.diagnostics().karaokeProgress,
      feather: lxmineStage.diagnostics().karaokeFeather,
      masks: [...document.querySelectorAll('.karaoke-char')].map(node => node.style.getPropertyValue('--karaoke-mask')) }));
    await page.evaluate(() => { document.getElementById('audio').currentTime = .75; __lxmine.S.position = 750; });
    await plain.evaluate(() => lxmineStage.clock({ positionMs: 750, playing: false }));
    await page.waitForTimeout(100);
    const karaokeAfter = await plain.locator('.line.active .main').screenshot();
    report.plain.karaokeAfter = await plain.evaluate(() => ({ progress: lxmineStage.diagnostics().karaokeProgress,
      masks: [...document.querySelectorAll('.karaoke-char')].map(node => node.style.getPropertyValue('--karaoke-mask')) }));
    const dynamicProgress = await stage.evaluate(() => [getLyricLineProgress(lyricsLines[0], lyricsLines[1], .25),
      getLyricLineProgress(lyricsLines[0], lyricsLines[1], .75)]);
    assert(Math.abs(report.plain.karaokeBefore.progress - dynamicProgress[0]) < 1e-9);
    assert(Math.abs(report.plain.karaokeAfter.progress - dynamicProgress[1]) < 1e-9);
    assert.equal(report.plain.karaokeBefore.feather, .030);
    assert.match(report.plain.karaokeBefore.masks[0], /0\.84375/);
    assert.equal(report.plain.karaokeBefore.masks[1], 'linear-gradient(transparent,transparent)');
    assert.equal(report.plain.karaokeAfter.masks[0], 'none');
    assert.match(report.plain.karaokeAfter.masks[1], /0\.84375/);
    assert.notDeepEqual(karaokeBefore, karaokeAfter, 'Actual lyric pixels did not follow word progress');
    report.plain.completedWordIdle = await plain.evaluate(async () => {
      const original = window.requestAnimationFrame;
      let frames = 0;
      window.requestAnimationFrame = callback => original(time => { frames++; callback(time); });
      try {
        lxmineStage.metadata({ id: 'completed-word-idle', duration: 300000, lines: [{ timeMs: 0, text: '静',
          words: [{ text: '静', timeMs: 0, durationMs: 0 }] }] });
        lxmineStage.clock({ positionMs: 1000, playing: true });
        await new Promise(resolve => setTimeout(resolve, 250));
        const before = frames;
        await new Promise(resolve => setTimeout(resolve, 250));
        return { extraFrames: frames - before, progress: lxmineStage.diagnostics().karaokeProgress };
      } finally {
        window.requestAnimationFrame = original;
        lxmineStage.clock({ positionMs: 1000, playing: false });
      }
    });
    assert.equal(report.plain.completedWordIdle.progress, 1);
    assert.equal(report.plain.completedWordIdle.extraFrames, 0, 'Completed lyrics kept an idle animation loop running');
    await page.evaluate(() => document.getElementById('audio').pause());
    await plain.evaluate(() => {
      lxmineStage.metadata({ id: 'seek-qa', lines: Array.from({ length: 20 }, (_, index) => ({ timeMs: index * 1000, text: '点击滚动歌词 ' + index })) });
      lxmineStage.clock({ positionMs: 0, playing: false });
      window.__lxmineNative.seek = timeMs => lxmineStage.clock({ positionMs: timeMs, playing: false });
    });
    await page.waitForTimeout(600);
    const scrollStart = await plain.locator('#viewport').evaluate(node => node.scrollTop);
    await plain.locator('.line').nth(10).evaluate(node => node.click());
    await page.waitForTimeout(80);
    const scrollMiddle = await plain.locator('#viewport').evaluate(node => node.scrollTop);
    await page.waitForTimeout(1000);
    const scrollEnd = await plain.locator('#viewport').evaluate(node => node.scrollTop);
    assert(scrollMiddle > scrollStart && scrollMiddle < scrollEnd, 'Lyric seeking snapped instead of scrolling');
    await swipe([{ x: 600, y: 420 }], 0, -150);
    const singleScroll = await plain.locator('#viewport').evaluate(node => node.scrollTop);
    assert(singleScroll > scrollEnd + 50, 'Plain lyrics did not scroll with one finger');
    await page.waitForTimeout(600);
    const beforeTwoFingers = await plain.locator('#viewport').evaluate(node => node.scrollTop);
    await swipe([{ x: 500, y: 350 }, { x: 650, y: 350 }], 0, 110);
    assert(await page.locator('body').evaluate(node => node.classList.contains('detail-immersive')));
    assert(Math.abs(await plain.locator('#viewport').evaluate(node => node.scrollTop) - beforeTwoFingers) <= 1, 'Two-finger immersive gesture scrolled plain lyrics');
    await swipe([{ x: 500, y: 450 }, { x: 650, y: 450 }], 0, -110);
    assert.equal(await page.locator('body').evaluate(node => node.classList.contains('detail-immersive')), false);
    assert.equal(await plain.locator('.line').first().evaluate(node => getComputedStyle(node).webkitTapHighlightColor), 'rgba(0, 0, 0, 0)');
    // Re-enter the cached plain stage while its previous manual-scroll lock is
    // still live. A mode switch must follow the latest native clock immediately.
    await plain.evaluate(() => {
      lxmineStage.presentation({ visible: false, detail: false });
      lxmineStage.clock({ positionMs: 15000, playing: false });
      lxmineStage.presentation({ visible: true, detail: true });
    });
    await page.waitForTimeout(100);
    report.plain.wakeAnchor = await plain.evaluate(() => {
      const diagnostic = lxmineStage.diagnostics();
      return { index: diagnostic.lyricIndex, error: Math.abs(diagnostic.glyphY - innerHeight * .5) };
    });
    assert.equal(report.plain.wakeAnchor.index, 15);
    assert(report.plain.wakeAnchor.error <= 2, 'Cached plain lyrics retained the old browse position on wake');
    await page.waitForTimeout(300);
    report.plain.focusScales = await plain.evaluate(() => {
      const lines = [...document.querySelectorAll('.line')], index = lxmineStage.diagnostics().lyricIndex;
      return [-3, -2, -1, 0, 1, 2, 3].map(offset => Number(getComputedStyle(lines[index + offset]).transform.match(/matrix\(([^,]+)/)[1]));
    });
    assert(Math.abs(report.plain.focusScales[3] - 1.18) < .001);
    for (let step = 1; step <= 3; step++) {
      assert(report.plain.focusScales[3 - step] < report.plain.focusScales[4 - step]);
      assert(Math.abs(report.plain.focusScales[3 - step] - report.plain.focusScales[3 + step]) < .001);
    }
    await page.evaluate(() => document.getElementById('audio').play());
    await page.locator('#style-btn').click(); await page.locator('.menu-row').filter({ hasText: '音域回响 · 地形' }).click();
    const wakeStart = Date.now();
    await page.waitForFunction(() => __lxmine.S.dynamicStageReady && document.getElementById('stage-frame').style.opacity === '1');
    report.wakeMs = Date.now() - wakeStart;
    assert.equal(await stage.evaluate(() => window.__powerQaIdentity), dynamicIdentity, 'Switching effects recreated the warm engine');
    assert(report.wakeMs < 1000, 'Enabling a warm effect stalled');
    stage = page.frames().find(frame => frame.url().includes('harmony-stage.html'));
    await page.waitForTimeout(1800);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
    await page.waitForTimeout(1500);
    const hidden = await homeSnapshot();
    await page.waitForTimeout(1200);
    report.background = await homeSnapshot();
    assert.equal(report.background.engine, true);
    assert.equal(report.background.src, '/mine-stage/harmony-stage.html');
    assert.equal(await page.locator('#plain-stage-frame').getAttribute('src'), '/mine-stage/plain-stage.html');
    assert.equal(hidden.engine, true);
    report.backgroundSleep = await snapshot();
    assert.equal(report.backgroundSleep.presentation.visible, false);
    assert.equal(report.backgroundSleep.analysisSource, null);
    assert(report.backgroundSleep.pixels <= 16);
    const backgroundFrame = report.backgroundSleep.renderedFrames;
    await page.waitForTimeout(500);
    assert.equal((await snapshot()).renderedFrames, backgroundFrame);
    assert.equal(report.background.parentPlaying, true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
    await page.waitForTimeout(700);
    await stage.evaluate(() => parent.postMessage({ type: 'lxmine-stage-degraded' }, location.origin));
    await page.waitForFunction(() => __lxmine.S.stageGraphicsFailed && document.getElementById('stage-frame').getAttribute('src') === 'about:blank');
    report.graphicsFallback = await page.evaluate(() => ({ plain: document.body.classList.contains('plain-stage'),
      pointerEvents: document.getElementById('plain-stage-frame').style.pointerEvents, opacity: document.getElementById('plain-stage-frame').style.opacity,
      playing: __lxmine.S.playing, styleName: __lxmine.S.styleName }));
    assert.equal(report.graphicsFallback.plain, true);
    assert.equal(report.graphicsFallback.pointerEvents, 'auto');
    assert.equal(report.graphicsFallback.opacity, '1');
    assert.equal(report.graphicsFallback.playing, true);
    assert.equal(report.graphicsFallback.styleName, 'mine-7');
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
  } finally {
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
    await app.close();
  }
  console.log(JSON.stringify({ status: report.status, homePixels: report.home.pixels, homeEngine: report.home.engine, plainWebgl: report.plain.webgl,
    detailFps: report.detail.observedFps, backgroundPixels: report.background.pixels }));
})().catch(error => { console.error(error); process.exitCode = 1; });
