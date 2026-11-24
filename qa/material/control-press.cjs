'use strict';
const { _electron } = require('../../apps/desktop/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('../../apps/desktop/node_modules/pngjs');
const { root, hashes, sourceFiles } = require('./common.cjs');

(async () => {
  const directory = path.join(__dirname, 'artifacts/control-press');
  fs.mkdirSync(directory, { recursive: true });
  const env = { ...process.env, MINERADIO_STARTUP_QA_HIDDEN: '1', MINERADIO_STARTUP_QA_USER_DATA: path.join(directory, 'profile-' + Date.now()),
    MINERADIO_NO_DESKTOP_SHORTCUT: '1', MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: path.join(root, 'apps/desktop/node_modules/electron/dist/electron.exe'),
    args: [path.join(root, 'apps/desktop'), '--disable-features=CalculateNativeWinOcclusion', '--force-device-scale-factor=1'], env });
    const report = { sourceHashes: hashes(sourceFiles), controls: [], dock: [], errors: [] };
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.waitForFunction(() => window.__lxmine);
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1280, 900); window.setOpacity(0); window.webContents.setBackgroundThrottling(false); window.showInactive(); });
    await page.evaluate(() => document.getElementById('splash')?.remove());
    await page.evaluate(() => {
      window.__pressEvents = [];
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'blur']) window.addEventListener(type, event => {
        __pressEvents.push({ type, target: event.target.id || event.target.tagName, primary: event.isPrimary });
      }, true);
    });
    await page.waitForTimeout(1800);
    await page.evaluate(() => {
      const songs = Array.from({ length: 4 }, (_, index) => ({ source: 'wy', id: 'press-' + index,
        name: '控件拖拽验证 ' + index, artist: 'LxMine' }));
      const playlist = { source: 'wy', id: 'press-playlist', name: '控件验证歌单', count: songs.length };
      const state = __lxmine.S;
      state.feedToken++;
      state.feedLoading = false;
      state.feed = { source: 'all', newSongs: songs, dailySongs: songs,
        daily: { id: 'daily-30', name: '每日三十首', count: songs.length }, charts: [playlist],
        sections: [{ id: 'playlists', title: '推荐歌单', kind: 'playlist', items: [playlist] }] };
      __lxmine.setTab('home');
    });
    await page.locator('.home-chip').last().waitFor();
    function contentGeometry(element) {
      const skin = element.querySelector(':scope > .glass-surface') || element;
      const content = [];
      for (const node of element.childNodes) {
        let bounds;
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          bounds = range.getBoundingClientRect();
        } else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('glass-surface')) {
          bounds = node.getBoundingClientRect();
        }
        if (bounds?.width > 0 && bounds?.height > 0) content.push(bounds.toJSON());
      }
      return { skin: skin.getBoundingClientRect().toJSON(), content };
    }
    function assertContentFollows(before, current, label) {
      assert.equal(current.content.length, before.content.length, label + ' content changed during the gesture');
      const sx = current.skin.width / before.skin.width;
      const sy = current.skin.height / before.skin.height;
      for (let index = 0; index < before.content.length; index++) {
        const original = before.content[index];
        const expected = {
          x: current.skin.x + (original.x - before.skin.x) * sx,
          y: current.skin.y + (original.y - before.skin.y) * sy,
          width: original.width * sx,
          height: original.height * sy
        };
        for (const key of ['x', 'y', 'width', 'height']) {
          assert(Math.abs(current.content[index][key] - expected[key]) < .15,
            label + ' content did not follow its skin: ' + index + '/' + key);
        }
      }
    }
    async function checkControls(scope) {
      const selector = scope === 'menu' ? '.menu-row:visible' : scope === 'dialog' ? '[role="dialog"] button:visible' : 'button:visible:not(:disabled),input[type="range"]:visible,select:visible,input[type="checkbox"]:visible,input[type="radio"]:visible';
      const controls = await page.locator(selector).elementHandles();
      for (const node of controls) {
        if (await node.evaluate(element => !!element.closest('#dock,#nav'))) continue;
        if (await node.evaluate(element => !!element.closest('#view'))) { await node.scrollIntoViewIfNeeded(); await page.waitForTimeout(120); }
        const bounds = await node.boundingBox();
        const viewport = page.viewportSize() || await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
        if (!bounds || bounds.x < 0 || bounds.x + bounds.width > viewport.width || bounds.y < 0 || bounds.y + bounds.height > viewport.height) continue;
        const hittable = await node.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
        });
        if (!hittable) continue;
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        const beforeContent = await node.evaluate(contentGeometry);
        await page.mouse.down();
        await page.waitForFunction(element => Math.abs((parseFloat(getComputedStyle(element).scale) || 1) - 1.03) < .0005, node, { timeout: 1000 });
        const state = await node.evaluate(element => ({ label: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 30),
          id: element.id, classes: element.className,
          scale: parseFloat(getComputedStyle(element).scale), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
          active: document.querySelectorAll('.control-pressed').length }));
        if (Math.abs(state.scale - 1.03) >= .001 || !Number.isFinite(state.scale)) report.failedPress = { scope, bounds, ...state, events: await page.evaluate(() => __pressEvents.slice(-12)) };
        assert(Math.abs(state.scale - 1.03) < .001, scope + ' ' + state.label + ' did not enlarge');
        assert(Math.abs(state.width / bounds.width - 1.03) < .002, scope + ' ' + state.label + ' did not render its enlarged width');
        assert(Math.abs(state.height / bounds.height - 1.03) < .002, scope + ' ' + state.label + ' did not render its enlarged height');
        assert.equal(state.active, 1, 'A neighboring control shared the press state');
        assertContentFollows(beforeContent, await node.evaluate(contentGeometry), scope + ' ' + state.label + ' press');
        await page.mouse.move(bounds.x + bounds.width / 2 + Math.min(60, bounds.width * .35),
          bounds.y + bounds.height / 2 + Math.min(16, bounds.height * .25), { steps: 3 });
        await page.waitForTimeout(150);
        const draggedContent = await node.evaluate(contentGeometry);
        assertContentFollows(beforeContent, draggedContent, scope + ' ' + state.label + ' drag');
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y > 200 ? 100 : 800); await page.mouse.up();
        await page.waitForFunction(element => Math.abs((parseFloat(getComputedStyle(element).scale) || 1) - 1) < .001, node, { timeout: 1000 });
        const released = await node.evaluate(element => parseFloat(getComputedStyle(element).scale) || 1);
        if (Math.abs(released - 1) >= .001) report.failedRelease = { scope, ...state, released, events: await page.evaluate(() => __pressEvents.slice(-12)) };
        assert(Math.abs(released - 1) < .001);
        report.controls.push({ scope, ...state, contentGroups: beforeContent.content.length, contentFollowedDrag: true });
      }
    }
    async function checkDock(scope) {
      await page.waitForTimeout(1100);
      for (const target of ['#nav .nav-item', '#dock-copy', '#dock button']) {
        for (const node of await page.locator(target + ':visible').elementHandles()) {
          const bounds = await node.boundingBox();
          if (!bounds || bounds.width < 4) continue;
          const before = await node.evaluate(element => {
            const host = element.closest('#dock,#nav'), skin = host.querySelector('.glass-surface');
            const label = element.querySelector('strong') || element.querySelector('span') || element.querySelector('svg') || element;
            let labelBounds = label.getBoundingClientRect();
            if (label === element) {
              const text = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
              if (text) { const range = document.createRange(); range.selectNodeContents(text); labelBounds = range.getBoundingClientRect(); }
            }
            return { skin: skin.getBoundingClientRect().toJSON(), label: labelBounds.toJSON(),
              text: label.textContent.trim(), background: label.style.backgroundColor,
              id: element.id || element.dataset.tab || element.getAttribute('aria-label'), hittable: element.contains(document.elementFromPoint(element.getBoundingClientRect().x + element.offsetWidth / 2, element.getBoundingClientRect().y + element.offsetHeight / 2)) };
          });
          if (!before.hittable) continue;
          if (before.text) await node.evaluate(element => {
            const label = element.querySelector('strong') || element.querySelector('span') || element;
            // Keep the glyph background constant for the released-state pixel
            // comparison. During a press the content deliberately grows.
            label.style.backgroundColor = getComputedStyle(document.body).getPropertyValue('--bg').trim();
          });
          await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          await page.waitForTimeout(300);
          const clip = { x: Math.floor(before.label.x), y: Math.floor(before.label.y), width: Math.ceil(before.label.width + 1), height: Math.ceil(before.label.height + 1) };
          const baseline = before.text ? PNG.sync.read(await page.screenshot({ clip })) : null;
          await page.mouse.down(); await page.waitForTimeout(450);
          const held = await node.evaluate(element => {
            const host = element.closest('#dock,#nav'), label = element.querySelector('strong') || element.querySelector('span') || element.querySelector('svg') || element;
            let labelBounds = label.getBoundingClientRect();
            if (label === element) {
              const text = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
              if (text) { const range = document.createRange(); range.selectNodeContents(text); labelBounds = range.getBoundingClientRect(); }
            }
            return { skin: host.querySelector('.glass-surface').getBoundingClientRect().toJSON(), label: labelBounds.toJSON(), contentScale: parseFloat(getComputedStyle(host).getPropertyValue('--material-content-scale')) || 1, active: document.querySelectorAll('.control-pressed').length };
          });
          assert(Math.abs(held.skin.width / before.skin.width - 1.03) < .002, scope + ' ' + before.id + ' glass did not enlarge');
          assert(Math.abs(held.skin.height / before.skin.height - 1.03) < .002);
          const sx = held.skin.width / before.skin.width, sy = held.skin.height / before.skin.height;
          const expected = {
            width: before.label.width * sx, height: before.label.height * sy,
            x: held.skin.x + held.skin.width / 2 + (before.label.x - before.skin.x - before.skin.width / 2) * sx,
            y: held.skin.y + held.skin.height / 2 + (before.label.y - before.skin.y - before.skin.height / 2) * sy
          };
          for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(held.label[key] - expected[key]) < .15, 'Dock content did not follow its skin: ' + before.id + '/' + key);
          assert(Math.abs(held.contentScale - 1.03) < .001); assert.equal(held.active, 0, 'Dock button received an extra scale');
          let heldInkMAE = null, returnedInkMAE = null;
          function pixelMAE(first, second) {
            let error = 0, count = 0;
            for (let y = 1; y < first.height - 1; y++) for (let x = 1; x < first.width - 1; x++) {
              const offset = (y * first.width + x) * 4; count++;
              for (let channel = 0; channel < 3; channel++) error += Math.abs(first.data[offset + channel] - second.data[offset + channel]);
            }
            assert(count > 3, 'No text pixels sampled: ' + before.id);
            return error / (count * 3);
          }
          if (baseline) {
            const pressedPixels = PNG.sync.read(await page.screenshot({ clip }));
            heldInkMAE = pixelMAE(baseline, pressedPixels);
            assert(heldInkMAE > .05, 'Dock glyph pixels did not visibly grow: ' + before.id);
            if (target === '#dock-copy') fs.writeFileSync(path.join(directory, 'text-' + scope + '-before.png'), PNG.sync.write(baseline));
          }
          await node.evaluate(element => { element.dataset.pressEvidence = '1'; });
          if (target === '#dock-copy') await page.screenshot({ path: path.join(directory, 'dock-' + scope + '-held.png') });
          await page.mouse.move(10, 400); await page.mouse.up(); await page.waitForTimeout(450);
          const released = await node.evaluate(element => ({ width: element.closest('#dock,#nav').querySelector('.glass-surface').getBoundingClientRect().width,
            scale: parseFloat(getComputedStyle(element.closest('#dock,#nav')).getPropertyValue('--material-content-scale')) || 1 }));
          assert(Math.abs(released.width - before.skin.width) < .2); assert(Math.abs(released.scale - 1) < .001);
          if (baseline) {
            const returnedPixels = PNG.sync.read(await page.screenshot({ clip }));
            returnedInkMAE = pixelMAE(baseline, returnedPixels);
            if (returnedInkMAE >= 1) {
              fs.writeFileSync(path.join(directory, 'text-before.png'), PNG.sync.write(baseline));
              fs.writeFileSync(path.join(directory, 'text-returned.png'), PNG.sync.write(returnedPixels));
              report.failedInk = { scope, id: before.id, returnedInkMAE, clip };
            }
            assert(returnedInkMAE < 1, 'Dock glyph pixels did not return to their original position: ' + before.id + ' / ' + returnedInkMAE);
          }
          if (before.text) await node.evaluate((element, background) => {
            const label = element.querySelector('strong') || element.querySelector('span') || element;
            label.style.backgroundColor = background;
          }, before.background);
          report.dock.push({ scope, id: before.id, scale: sx, contentScale: held.contentScale, synchronized: true, heldInkMAE, returnedInkMAE });
        }
      }
    }
    await checkControls('home');
    await checkDock('home');
    await page.evaluate(() => __lxmine.setTab('settings'));
    await page.locator('.setting-row').filter({ hasText: '外观与背景' }).click();
    await page.locator('.setting-select-trigger').first().waitFor();
    await page.waitForTimeout(700);
    await checkControls('settings');
    await checkDock('settings');
    await page.evaluate(() => __lxmine.openSearch());
    await checkDock('single-row');
    await page.keyboard.press('Escape');
    await page.evaluate(() => __lxmine.setTab('settings'));
    await page.locator('.setting-row').filter({ hasText: '外观与背景' }).click();
    await page.locator('.setting-select-trigger').first().waitFor();
    const appearance = page.locator('.setting-row').filter({ has: page.getByText('外观', { exact: true }) }).getByRole('button');
    await appearance.click();
    await page.waitForTimeout(850);
    await checkControls('menu');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { __lxmine.S.current = { id: 'dock-press-qa', name: '底栏按压验证', artist: 'LxMine' }; __lxmine.openDetail(); });
    await checkDock('player');
    await checkControls('player');
    const styleBtn = page.locator('#style-btn');
    await styleBtn.focus();
    const beforeKeyboard = await styleBtn.evaluate(contentGeometry);
    await page.keyboard.down('Space');
    await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.getElementById('style-btn')).scale) - 1.03) < .0005);
    assertContentFollows(beforeKeyboard, await styleBtn.evaluate(contentGeometry), 'keyboard style press');
    await page.keyboard.up('Space');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    assert.equal(await styleBtn.evaluate(element => element.style.scale), '');
    report.keyboard = 'PASS';
    await page.locator('#detail-back').click();
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog');
      dialog.style.cssText = 'position:fixed;z-index:99999;left:400px;top:400px;padding:20px;background:#151619';
      const button = document.createElement('button'); button.textContent = '动态创建的弹窗按钮'; button.onclick = () => {};
      dialog.appendChild(button); document.body.appendChild(dialog);
    });
    await checkControls('dialog');
    assert(report.controls.length >= 20);
    assert.equal(report.controls.filter(control => control.scope === 'home' && control.classes.includes('home-chip')).length, 5);
    assert(report.controls.some(control => control.id === 'style-btn' && control.contentGroups > 0));
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
  } finally { fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2)); await app.close(); }
  console.log(JSON.stringify({ status: report.status, checkedControls: report.controls.length, scale: 1.03 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
