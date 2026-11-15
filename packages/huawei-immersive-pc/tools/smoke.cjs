#!/usr/bin/env node
'use strict';

/**
 * Real Chromium smoke test for the example. It verifies the things that are
 * easy to break while porting: the optical skin actually receives a filter,
 * popup geometry/motion origin, selected-row color, flip direction, modal and
 * sheet lifecycle, search morph, staged detail timing and frame budget.
 *
 * Requires Playwright. The repository's desktop app already installs it; the
 * resolver also accepts a package-local node_modules or PLAYWRIGHT_MODULE.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('./serve.cjs');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');

function loadPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_MODULE) candidates.push(process.env.PLAYWRIGHT_MODULE);
  candidates.push(path.join(root, 'node_modules', 'playwright'));
  candidates.push(path.join(root, '..', '..', 'apps', 'desktop', 'node_modules', 'playwright'));
  for (const candidate of candidates) {
    try { return require(candidate); } catch (_) {}
  }
  return null;
}

async function main() {
  const playwright = loadPlaywright();
  if (!playwright) {
    console.error('Playwright is not installed. Run `npm i -D playwright` in this package,');
    console.error('or run this script inside the LxMine repository where apps/desktop provides it.');
    process.exit(2);
  }

  fs.mkdirSync(artifacts, { recursive: true });
  const server = createServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port + '/examples/';

  const report = { status: 'PASS', base, checks: [], metrics: {} };
  let browser = null;
  let electronApp = null;
  let page = null;
  let engine = '';
  const gpuArgs = process.platform === 'win32'
    ? ['--force-device-scale-factor=1', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11']
    : ['--force-device-scale-factor=1'];

  function findElectron() {
    const candidates = [];
    if (process.env.ELECTRON_BINARY) candidates.push(process.env.ELECTRON_BINARY);
    for (const base of [root, path.join(root, '..', '..', 'apps', 'desktop')]) {
      try {
        const binary = require(require.resolve('electron', { paths: [base] }));
        if (typeof binary === 'string') candidates.push(binary);
      } catch (_) {}
    }
    candidates.push(path.join(root, '..', '..', 'apps', 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe'));
    return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
  }

  // Preference: the repository Electron (same compositor as the target), then
  // Playwright-managed Chromium, then installed Edge/Chrome. Set
  // HX_SMOKE_ENGINE=chromium|edge|electron to force one.
  const forced = process.env.HX_SMOKE_ENGINE || '';
  const electronBinary = forced === 'chromium' || forced === 'edge' ? null : findElectron();
  if (electronBinary && playwright._electron) {
    electronApp = await playwright._electron.launch({
      executablePath: electronBinary,
      args: [path.join(__dirname, 'electron-main.cjs')],
      env: Object.assign({}, process.env, { HX_DEMO_URL: base })
    });
    page = await electronApp.firstWindow();
    engine = 'electron';
  } else {
    const bundled = playwright.chromium.executablePath();
    if (bundled && fs.existsSync(bundled)) {
      browser = await playwright.chromium.launch({
        headless: true,
        executablePath: bundled,
        args: gpuArgs
      });
      engine = 'chromium';
    } else {
      try {
        browser = await playwright.chromium.launch({
          channel: 'msedge',
          headless: true,
          args: gpuArgs
        });
        engine = 'edge';
      } catch (_) {
        browser = await playwright.chromium.launch({
          channel: 'chrome',
          headless: true,
          args: gpuArgs
        });
        engine = 'chrome';
      }
    }
    page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1
    });
  }
  report.engine = engine;
  report.dpr = await page.evaluate(() => devicePixelRatio);

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-hx-material-ready') === '1');
    await page.waitForFunction(() => document.querySelectorAll('.hx-glass__skin').length >= 10);
    await page.waitForTimeout(2200);

    const material = await page.evaluate(() => {
      const skin = document.querySelector('.demo-card .hx-glass__skin');
      const style = getComputedStyle(skin);
      const rect = skin.getBoundingClientRect();
      return {
        hosts: document.querySelectorAll('.hx-glass[data-hx-glass="ready"]').length,
        skins: document.querySelectorAll('.hx-glass__skin').length,
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
        width: rect.width,
        height: rect.height
      };
    });
    assert.ok(material.hosts >= 10, 'expected at least 10 decorated glass hosts, got ' + material.hosts);
    assert.ok(material.skins >= 10, 'expected at least 10 optical skins');
    assert.ok(/url\(/.test(material.backdropFilter), 'optical skin has no SVG lens filter: ' + material.backdropFilter);
    assert.ok(material.width > 20 && material.height > 20, 'optical skin has no area');
    report.metrics.material = material;

    await page.screenshot({ path: path.join(artifacts, 'demo-desktop.png') });

    // Frame budget on the idle scene.
    async function measureFrames() {
      return page.evaluate(() => new Promise((resolve) => {
        const samples = [];
        let last = performance.now();
        function tick(time) {
          samples.push(time - last);
          last = time;
          if (samples.length < 120) requestAnimationFrame(tick);
          else {
            const stable = samples.slice(10);
            const sorted = stable.slice().sort((a, b) => a - b);
            resolve({
              p95: sorted[Math.floor(sorted.length * 0.95)],
              max: sorted[sorted.length - 1],
              median: sorted[Math.floor(sorted.length * 0.5)]
            });
          }
        }
        requestAnimationFrame(tick);
      }));
    }
    await page.evaluate(() => new Promise((resolve) => {
      let count = 0;
      function tick() { if (++count < 30) requestAnimationFrame(tick); else resolve(); }
      requestAnimationFrame(tick);
    }));
    // Electron uses the same compositor path as the target application, so the
    // formal 33.5ms gate applies. Headless Chromium/Edge may run on a software
    // rasterizer; keep a looser functional ceiling and record the engine.
    const frameLimit = engine === 'electron' ? 33.5 : 55;
    let frames = await measureFrames();
    if (frames.p95 >= frameLimit) {
      await page.waitForTimeout(400);
      const retry = await measureFrames();
      if (retry.p95 < frames.p95) frames = retry;
    }
    frames.limit = frameLimit;
    report.metrics.frames = frames;
    assert.ok(frames.p95 < frameLimit,
      'frame interval p95 is ' + frames.p95.toFixed(1) + 'ms (limit ' + frameLimit + 'ms, engine ' + engine + ')');

    // Anchored menu, top anchor.
    await page.click('#quality-btn');
    await page.waitForTimeout(900);
    const menu = await page.evaluate(() => {
      const node = document.querySelector('.hx-popup');
      const row = node && node.querySelector('.hx-popup__row.is-checked');
      const skin = node && node.querySelector('.hx-glass__skin');
      if (!node || !row) return null;
      const rect = node.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const style = getComputedStyle(row);
      return {
        width: rect.width,
        height: rect.height,
        above: node.classList.contains('is-above'),
        rows: node.querySelectorAll('.hx-popup__row').length,
        rowHeight: rowRect.height,
        color: style.color,
        background: style.backgroundColor,
        backdropFilter: getComputedStyle(skin).backdropFilter || getComputedStyle(skin).webkitBackdropFilter,
        role: node.getAttribute('role')
      };
    });
    assert.ok(menu, 'anchored menu did not open');
    assert.ok(menu.width >= 152, 'menu width ' + menu.width + ' < 152');
    assert.ok(menu.height >= 152, 'menu height ' + menu.height + ' < 152');
    assert.ok(menu.rowHeight >= 47.5, 'menu row height ' + menu.rowHeight + ' < 48');
    assert.strictEqual(menu.rows, 3, 'quality menu should have three rows');
    assert.strictEqual(menu.color, 'rgb(94, 159, 255)', 'selected row color is ' + menu.color);
    assert.strictEqual(menu.background, 'rgba(49, 122, 247, 0.4)', 'selected row background is ' + menu.background);
    assert.ok(/url\(/.test(menu.backdropFilter), 'menu lost its optical filter');
    assert.strictEqual(menu.role, 'menu');
    report.metrics.menu = menu;
    await page.screenshot({ path: path.join(artifacts, 'demo-menu.png') });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(260);
    assert.strictEqual(await page.locator('.hx-popup').count(), 0, 'menu did not unmount after Escape');

    // Bottom anchor must flip above the dock.
    await page.click('#demo-dock [aria-label="更多"]');
    await page.waitForTimeout(900);
    const flipped = await page.evaluate(() => {
      const node = document.querySelector('.hx-popup');
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        above: node.classList.contains('is-above'),
        top: rect.top,
        bottom: rect.bottom,
        viewport: innerHeight
      };
    });
    assert.ok(flipped && flipped.above, 'bottom-anchored menu did not flip above');
    assert.ok(flipped.bottom <= flipped.viewport, 'flipped menu overflows the viewport');
    report.metrics.flipped = flipped;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(260);

    // Modal.
    await page.click('#modal-btn');
    await page.waitForTimeout(650);
    assert.strictEqual(await page.locator('.hx-modal').count(), 1, 'modal did not open');
    const modal = await page.evaluate(() => {
      const node = document.querySelector('.hx-modal');
      const style = getComputedStyle(node);
      return { width: node.getBoundingClientRect().width, radius: style.borderRadius, opacity: style.opacity };
    });
    assert.ok(modal.width <= 560.5 && modal.width >= 400, 'modal width is ' + modal.width);
    assert.strictEqual(modal.radius, '30px');
    report.metrics.modal = modal;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(320);
    assert.strictEqual(await page.locator('.hx-modal').count(), 0, 'modal did not unmount');

    // Sheet.
    await page.click('#sheet-btn');
    await page.waitForTimeout(650);
    const sheet = await page.evaluate(() => {
      const node = document.querySelector('.hx-sheet');
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        radius: getComputedStyle(node).borderTopLeftRadius,
        bottom: rect.bottom,
        viewport: innerHeight
      };
    });
    assert.ok(sheet, 'sheet did not open');
    assert.ok(Math.abs(sheet.bottom - sheet.viewport) < 1, 'sheet is not docked to the bottom');
    assert.strictEqual(sheet.radius, '32px');
    report.metrics.sheet = sheet;
    await page.screenshot({ path: path.join(artifacts, 'demo-sheet.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(340);
    assert.strictEqual(await page.locator('.hx-sheet').count(), 0, 'sheet did not unmount');

    // One-node search morph.
    await page.click('#demo-search-input');
    await page.waitForTimeout(650);
    const searchOpen = await page.evaluate(() => ({
      open: document.querySelector('#search-overlay').classList.contains('is-open'),
      parent: document.querySelector('#demo-search').parentElement.id,
      overlayClass: document.querySelector('#demo-search').className,
      focused: document.activeElement === document.querySelector('#demo-search-input')
    }));
    assert.ok(searchOpen.open, 'search overlay did not open');
    assert.strictEqual(searchOpen.parent, 'search-overlay-host', 'search node did not move into the overlay');
    assert.ok(searchOpen.focused, 'search input did not receive focus');
    report.metrics.searchOpen = searchOpen;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(650);
    const searchClosed = await page.evaluate(() => ({
      open: document.querySelector('#search-overlay').classList.contains('is-open'),
      parent: document.querySelector('#demo-search').parentElement.id
    }));
    assert.strictEqual(searchClosed.open, false, 'search overlay stayed open');
    assert.strictEqual(searchClosed.parent, 'search-slot', 'search node did not return to its slot');
    report.metrics.searchClosed = searchClosed;

    // Staged detail choreography.
    await page.click('#stage-btn');
    await page.waitForTimeout(80);
    const entering = await page.evaluate(() => ({
      open: document.body.classList.contains('is-stage-open'),
      entering: document.body.classList.contains('is-stage-entering'),
      leaving: document.body.classList.contains('is-stage-leaving')
    }));
    assert.ok(entering.open && entering.entering && !entering.leaving, 'stage did not start in the entering phase');
    await page.waitForTimeout(700);
    const revealed = await page.evaluate(() => ({
      entering: document.body.classList.contains('is-stage-entering'),
      open: document.body.classList.contains('is-stage-open'),
      opacity: getComputedStyle(document.querySelector('#demo-stage')).opacity
    }));
    assert.ok(!revealed.entering && revealed.open, 'stage did not settle after 620ms');
    report.metrics.stage = revealed;
    // The background reveal is a 700ms transition that starts at 620ms.
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(artifacts, 'demo-stage.png') });

    await page.click('#stage-back');
    await page.waitForTimeout(200);
    const leaving = await page.evaluate(() => document.body.classList.contains('is-stage-leaving'));
    assert.ok(leaving, 'stage did not hold 140ms before leaving');
    await page.waitForTimeout(500);
    const stageClosed = await page.evaluate(() => ({
      open: document.body.classList.contains('is-stage-open'),
      leaving: document.body.classList.contains('is-stage-leaving')
    }));
    assert.ok(!stageClosed.open && !stageClosed.leaving, 'stage did not close');
    report.metrics.stageClosed = stageClosed;

    assert.deepStrictEqual(pageErrors, [], 'page errors: ' + pageErrors.join(' | '));
    assert.deepStrictEqual(consoleErrors, [], 'console errors: ' + consoleErrors.join(' | '));
    report.consoleErrors = consoleErrors;
    report.pageErrors = pageErrors;
  } catch (error) {
    report.status = 'FAIL';
    report.error = error && error.stack || String(error);
    throw error;
  } finally {
    fs.writeFileSync(path.join(artifacts, 'smoke.json'), JSON.stringify(report, null, 2) + '\n');
    if (electronApp) await electronApp.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    console.log('Smoke report: ' + path.join(artifacts, 'smoke.json'));
    console.log('Screenshots: ' + artifacts);
    console.log('Status: ' + report.status);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
