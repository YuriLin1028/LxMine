const { chromium } = require('../../apps/desktop/node_modules/playwright');
const fs = require('fs'), path = require('path'), cp = require('child_process'), assert = require('assert/strict');
const { root, hashes, sourceFiles } = require('./common.cjs');
process.chdir(root);
const watchdog=setTimeout(()=>{console.error('Portable verification timed out without a complete result');process.exit(1);},90000);
(async () => {
  const exe = path.resolve(process.argv[2] || 'releases/windows/LxMine-0.1.0-Portable-Liquid-20261018.exe');
  const out = path.join(__dirname, 'artifacts/portable-' + Date.now());
  fs.mkdirSync(out, { recursive: true });
  const env = { ...process.env, MINERADIO_STARTUP_QA_HIDDEN: '1', MINERADIO_STARTUP_QA_USER_DATA: path.join(out, 'profile'), MINERADIO_STARTUP_QA_EXIT_MS: '60000', MINERADIO_KEEP_BACKGROUND_RENDERING: '1', MINERADIO_NO_DESKTOP_SHORTCUT: '1', MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE: '1', PORT: '33729' };
  delete env.ELECTRON_RUN_AS_NODE;
  const proc = cp.spawn(exe, ['--remote-debugging-port=33730', '--remote-allow-origins=*'], { env, stdio: 'ignore', windowsHide: true });
  let browser;
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch('http://127.0.0.1:33730/json/version')).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    browser = await chromium.connectOverCDP('http://127.0.0.1:33730');
    console.log('Portable CDP connected:',out);
    const pages = browser.contexts().flatMap(context => context.pages());
    const page = pages.find(page => !page.url().includes('desktop-lyrics')) || pages[0];
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console',message=>{if(message.text().startsWith('Portable QA:'))console.log(message.text());});
    await page.waitForFunction(() => document.title === 'LxMine' && window.__lxmine?.S && document.querySelector('.glass-surface'));
    console.log('Portable application model ready');
    await page.waitForTimeout(1500);
    const result = await page.evaluate(async () => {
      const files = ['index.html', 'lxmine/material.js', 'lxmine/style.css', 'lxmine/app.js','lxmine/pagination.js','lxmine/popup-motion.js'];
      const loadedHashes = {};
      for (const file of files) {
        const response = await fetch('/' + file);
        if (!response.ok) throw Error('Missing packaged resource: ' + file);
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        loadedHashes['apps/desktop/public/' + file] = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
        console.log('Portable QA: hashed '+file);
      }
      console.log('Portable QA: requesting public homepage');
      const feed=await window.lxMusic.home('kw'),state=await window.desktopWindow.getState();
      console.log('Portable QA: homepage and tray returned');
      const publicHome={source:feed.source,sections:feed.sections.filter(s=>s.items.length).length,foreignItems:feed.sections.some(s=>s.items.some(item=>(item.lxSource||item.source)!=='kw'))};
      const accountStatus=await fetch('/api/login/status').then(r=>r.status);
      return { title: document.title, hasAppModel: !!window.__lxmine?.S, hasSearch: !!document.getElementById('search-node'), skins: document.querySelectorAll('.glass-surface').length, displacementMaps: document.querySelectorAll('feDisplacementMap').length, productionCalibrationDisabled: typeof window.LxGlass.calibrate === 'undefined', publicHome,trayAvailable:state.trayAvailable,accountStatus,accountBridgeRemoved:typeof window.desktopWindow.openNeteaseMusicLogin==='undefined',loadedHashes };
    });
    fs.writeFileSync(path.join(out,'observed.json'),JSON.stringify(result,null,2));
    assert(result.hasAppModel && result.hasSearch && result.skins > 0 && result.displacementMaps > 0 && result.productionCalibrationDisabled);
    assert.deepEqual(result.loadedHashes, hashes(sourceFiles), 'Portable loaded bytes must match approved source');
    assert.equal(result.publicHome.source,'kw');assert(result.publicHome.sections>=8&&!result.publicHome.foreignItems);
    assert(result.trayAvailable&&result.accountBridgeRemoved&&result.accountStatus===410);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(out, 'startup.png') });
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ status: 'PASS', exe, ...result, errors }, null, 2));
    console.log(JSON.stringify({ status: 'PASS', exe, out, ...result, errors }));
    await page.evaluate(()=>{window.desktopWindow.close('exit');}).catch(()=>{});
  } catch(error){console.error('Portable verification failed:',error);throw error;} finally {
    if (browser) {
      try { await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,2000))]); }
      catch {}
    }
    proc.unref();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(()=>clearTimeout(watchdog));
