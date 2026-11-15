const { _electron } = require('../../apps/desktop/node_modules/playwright');
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const {hashes,sourceFiles}=require('./common.cjs');
const scenario = process.argv[2] || 'optics';
if (!['optics','app','resize'].includes(scenario)) throw new Error('Unknown material scenario');
const out = path.resolve('qa/material/artifacts/motion/' + scenario);
fs.mkdirSync(out, { recursive: true });
const tone = () => {
  const rate = 16000, seconds = 45, n = rate * seconds, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(5000 * Math.sin(i / rate * Math.PI * 2 * 220) * (.25 + .75 * Math.pow(Math.max(0, Math.sin(i / rate * Math.PI * 3)), 6))), 44 + i * 2);
  return 'data:audio/wav;base64,' + b.toString('base64');
};
(async () => {
  const packaged = process.env.LM_PACKAGED === '1';
  const app = await _electron.launch({
    executablePath: path.resolve(packaged ? 'apps/desktop/dist/win-unpacked/LxMine.exe' : 'apps/desktop/node_modules/electron/dist/electron.exe'),
    args: [...(packaged ? [] : [path.resolve('apps/desktop')]), '--disable-features=CalculateNativeWinOcclusion', '--force-device-scale-factor=1'],
    env: { ...process.env, MINERADIO_STARTUP_QA_HIDDEN: '1', MINERADIO_STARTUP_QA_USER_DATA: path.join(out, 'profile-' + Date.now()), MINERADIO_KEEP_BACKGROUND_RENDERING: '1', MINERADIO_NO_DESKTOP_SHORTCUT: '1', MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE: '1' }, timeout: 45000
  });
  let traceSession=null,traceEvents=[];
  try {
    const page = await app.firstWindow();
    if(process.env.LM_TRACE==='1'){
      traceSession=await page.context().newCDPSession(page);
      traceSession.on('Tracing.dataCollected',event=>traceEvents.push(...event.value));
      await traceSession.send('Tracing.start',{categories:'devtools.timeline,v8,disabled-by-default-devtools.timeline,disabled-by-default-v8.gc,disabled-by-default-v8.cpu_profiler',options:'record-as-much-as-possible'});
    }
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.waitForLoadState('domcontentloaded');
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1200, 800); w.setOpacity(0); w.webContents.setBackgroundThrottling(false); w.showInactive(); });
    await page.waitForFunction(() => window.__lxmine && document.querySelector('[data-material="contour-lens"]'));
    await page.waitForTimeout(4000);
    await page.evaluate(() => document.querySelector('#splash')?.remove());
    const result = { scenario, packaged, errors, sourceHashes:hashes(sourceFiles), dpr: await page.evaluate(() => devicePixelRatio) };
    const sample = async () => page.evaluate(() => {
      window.__perf = { frames: [], longTasks: [], longTaskDetails:[], slowFrames: [], phase: 'start' }; let last;
      window.__perf.observer = new PerformanceObserver(list => list.getEntries().forEach(e => {window.__perf.longTasks.push(e.duration);window.__perf.longTaskDetails.push({start:e.startTime,duration:e.duration,name:e.name,attribution:e.attribution.map(a=>({type:a.containerType,src:a.containerSrc,id:a.containerId})),phase:window.__perf.phase});}));
      window.__perf.observer.observe({ type: 'longtask' });
      function frame(t) { if (last) { const dt=t-last; window.__perf.frames.push(dt); if(dt>20)window.__perf.slowFrames.push({at:t,dt,phase:window.__perf.phase}); } last = t; window.__perf.raf = requestAnimationFrame(frame); }
      window.__perf.raf = requestAnimationFrame(frame);
    });
    const finish = async () => page.evaluate(() => {
      const p = window.__perf; cancelAnimationFrame(p.raf); p.observer.disconnect(); p.frames.sort((a, b) => a - b);
      return { count: p.frames.length, p95: p.frames[Math.ceil(p.frames.length * .95) - 1], max: p.frames.at(-1), longTasks: p.longTasks, longTaskDetails:p.longTaskDetails,slowFrames:p.slowFrames };
    });
    result.captures=[];
    const shot = async name => {
      const start=await page.evaluate(()=>performance.now());
      await page.screenshot({ path: path.join(out, name + '.png') });
      const end=await page.evaluate(()=>performance.now());
      result.captures.push({name,start,end});
    };
    if (scenario === 'optics') {
      await page.evaluate(() => {
        document.querySelector('#stage-frame').style.display = 'none'; document.querySelector('#app').style.visibility = 'hidden'; document.querySelector('#page-veil').style.display = 'none';
        const bg = document.createElement('div');
        bg.style.cssText = 'position:fixed;inset:0;z-index:1;background:repeating-linear-gradient(90deg,#173e59 0 38px,#d1b36b 38px 76px,#783b42 76px 114px);font:bold 42px sans-serif;color:white;line-height:42px';
        bg.textContent = ('曲面折射 背景文字 0123456789 ').repeat(120); document.body.prepend(bg);
        const button = document.createElement('button'); button.id = 'optical-probe'; button.className = 'glass light';
        button.style.cssText = 'position:fixed;left:100px;top:300px;width:640px;height:90px;border-radius:45px;z-index:50;font:bold 28px sans-serif;color:white';
        button.innerHTML = '<span style="position:relative">LxMine · 清晰文字</span>'; document.body.append(button);
      });
      await page.waitForTimeout(600);
      const probe = page.locator('#optical-probe');
      const png = async name => { const b = await probe.screenshot(); fs.writeFileSync(path.join(out, name + '.png'), b); return b.toString('base64'); };
      const lens = await png('lens');
      await page.evaluate(() => document.querySelectorAll('feDisplacementMap').forEach(n => (n.dataset.qaScale = n.getAttribute('scale'), n.setAttribute('scale', '0'))));
      await page.waitForTimeout(80); const flat = await png('no-displacement');
      await page.evaluate(() => document.querySelectorAll('feDisplacementMap').forEach(n => n.setAttribute('scale', n.dataset.qaScale)));
      await page.waitForTimeout(80);
      result.opticalPixels = await page.evaluate(async ([a, b]) => {
        const decode = async p => { const i = new Image(); i.src = 'data:image/png;base64,' + p; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return { data: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }; };
        const aa = await decode(a), bb = await decode(b); let rim = 0, centre = 0, nr = 0, nc = 0;
        for (let y = 0; y < aa.h; y++) for (let x = 0; x < aa.w; x++) {
          if (x < 100 || x > aa.w - 100) continue;
          const i = (y * aa.w + x) * 4, d = (Math.abs(aa.data[i] - bb.data[i]) + Math.abs(aa.data[i + 1] - bb.data[i + 1]) + Math.abs(aa.data[i + 2] - bb.data[i + 2])) / 3;
          if (y > 2 && y < 14 || y > aa.h - 14 && y < aa.h - 2) { rim += d; nr++; }
          if (y > 30 && y < aa.h - 30) { centre += d; nc++; }
        }
        return { rimMAD: rim / nr, centreMAD: centre / nc };
      }, [lens, flat]);
      assert(result.opticalPixels.rimMAD > 2, 'Displacement must affect real rendered pixels');
      assert(result.opticalPixels.centreMAD < 1, 'Refraction must decay before readable centre');
      await page.mouse.move(400, 345); await page.mouse.down(); await page.mouse.move(470, 355, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(700);
      // Neutralize ONLY the moving backdrop for the foreground-pixel invariant.
      await page.addStyleTag({ content: '#optical-probe .glass-surface{background:#202224!important;backdrop-filter:none!important} #optical-probe::after{display:none}' });
      const before = await png('content-before');
      const read = () => probe.evaluate(n => ({ rect: n.getBoundingClientRect().toJSON(), skin: getComputedStyle(n.querySelector('.glass-surface')).transform, filter: n.querySelector('.glass-surface').style.getPropertyValue('--lens-filter') }));
      result.before = await read(); await sample();
      await page.mouse.down(); await page.mouse.move(540, 369, { steps: 12 }); await page.waitForTimeout(100);
      result.drag = await read(); const dragged = await png('content-drag');
      await page.mouse.up(); result.release = [];
      for (const wait of [60, 80, 160, 350]) { await page.waitForTimeout(wait); result.release.push(await read()); }
      result.frames = await finish();
      result.contentMAD = await page.evaluate(async ([a, b]) => {
        const decode = async p => { const i = new Image(); i.src = 'data:image/png;base64,' + p; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(180, 25, 280, 40).data; };
        const aa = await decode(a), bb = await decode(b); let sum = 0; for (let i = 0; i < aa.length; i++) sum += Math.abs(aa[i] - bb[i]); return sum / aa.length;
      }, [before, dragged]);
      assert(result.contentMAD < 1); assert.deepEqual(result.before.rect, result.drag.rect);
      assert.equal(new Set([result.before, result.drag, ...result.release].map(s => s.filter)).size, 1);
      assert.notEqual(result.before.skin, result.drag.skin);
    } else if (scenario === 'resize') {
      const sequence = [[980,700], [900,700], [1440,900], [800,1100], [1200,800]];
      const resize = async ([w,h]) => {
        const state=await app.evaluate(({BrowserWindow,powerMonitor}, [w,h]) => {
          const win=BrowserWindow.getAllWindows().find(win=>!win.webContents.getURL().includes('desktop-lyrics'));
          win.setSize(w,h);win.webContents.setBackgroundThrottling(false);if(win.isMinimized())win.restore();win.showInactive();
          return {visible:win.isVisible(),minimized:win.isMinimized(),throttled:win.webContents.getBackgroundThrottling(),bounds:win.getBounds(),idle:powerMonitor.getSystemIdleState(60)};
        },[w,h]);
        (result.composition||(result.composition=[])).push(state);
        assert(state.visible&&!state.minimized&&!state.throttled,'Resize sample must remain genuinely composed');
        await page.waitForTimeout(700);
        const visibility=await page.evaluate(()=>document.visibilityState);assert.equal(visibility,'visible');
      };
      for (const size of sequence) await resize(size);
      result.layouts = []; await sample();
      if(traceSession)await page.evaluate(()=>console.timeStamp('sample-start:'+performance.now()));
      for (const size of sequence) {
        await page.evaluate(size=>{window.__perf.phase='resize-'+size.join('x');},size);
        await resize(size);
        const state = await page.evaluate(() => {
          const nodes = ['#search-node','#nav','#dock'].map(selector => {
            const n = document.querySelector(selector), surface = n.querySelector('.glass-surface');
            const r = n.getBoundingClientRect(), skin = surface.getBoundingClientRect();
            const match = surface.style.getPropertyValue('--lens-filter').match(/#([^)]*)/);
            return { selector, rect: r.toJSON(), skin: skin.toJSON(), filterExists: !!document.getElementById(match?.[1]), overflow: getComputedStyle(n).overflow };
          });
          return { viewport: [innerWidth,innerHeight], nodes };
        });
        result.layouts.push(state);
        await shot('layout-' + size.join('x'));
        for (const n of state.nodes) { assert(n.filterExists); assert(n.rect.left >= 0 && n.rect.right <= state.viewport[0] + 1); assert.equal(n.overflow, 'visible'); }
      }
      result.frames = await finish();
      await page.locator('#nav [data-tab="library"]').click(); await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => window.__lxmine.S.tab), 'library');
      await page.locator('#nav [data-tab="settings"]').click(); await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => window.__lxmine.S.tab), 'settings');
      await page.locator('#nav [data-tab="home"]').click(); await page.waitForTimeout(500);
      const b = await page.locator('#search-node').boundingBox(); await page.mouse.move(b.x+30,b.y+20); await page.mouse.down(); await page.mouse.move(b.x+80,b.y+25);
      await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.mouse.up(); await page.waitForTimeout(700);
      assert.equal(await page.locator('.material-dragging').count(),0);
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.locator('#search-node').dispatchEvent('pointerdown', {pointerId:1,button:0,isPrimary:true});
      assert.equal(await page.locator('#search-node .glass-surface').evaluate(n=>getComputedStyle(n).transform),'none');
      await page.emulateMedia({reducedMotion:'no-preference'});
    } else {
      await page.evaluate(async url => {
        document.querySelector('#audio').muted=true;
        window.__lxmine.S.styleName = 'mine-7';
        await window.__lxmine.playSong({ id: 'material-qa', name: 'LxMine 材质验收', artist: '本地测试节拍', provider: 'local', localUrl: url, durationMs: 45000 });
      }, tone());
      await page.waitForFunction(() => window.__lxmine.S.playing);
      await page.waitForTimeout(2000); await shot('home');
      await page.locator('#dock-copy').click(); await page.waitForTimeout(1300);
      // Warm the entire scenario, including the different panel-filter graph,
      // rather than warming only the detail capsule and cold-testing menus.
      await page.locator('#quality-btn').click(); await page.waitForTimeout(600);
      await page.locator('.menu-backdrop').click({ position: { x: 10, y: 150 } }); await page.waitForTimeout(300);
      await page.locator('#style-btn').click(); await page.waitForTimeout(850);
      await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      await page.locator('[data-action="queue"]').click(); await page.waitForTimeout(700);
      await page.keyboard.press('Escape'); await page.waitForTimeout(350);
      await page.locator('#detail-back').click(); await page.waitForTimeout(1300);
      await sample();
      const mark=phase=>page.evaluate(phase=>{window.__perf.phase=phase},phase);
      await mark('detail-enter');
      await page.locator('#dock-copy').click(); await page.waitForTimeout(1300); await shot('detail');
      result.stage = await page.evaluate(() => document.querySelector('#stage-frame').contentWindow.lxmineStage.diagnostics());
      await mark('quality-menu');await page.locator('#quality-btn').click(); await page.waitForTimeout(600); await shot('popover');
      result.popoverFilter = await page.locator('.popover').evaluate(n => getComputedStyle(n).backdropFilter);
      await page.locator('.menu-backdrop').click({ position: { x: 10, y: 150 } }); await page.waitForTimeout(300);
      result.popupCycles=[];
      for(let cycle=0;cycle<6;cycle++){
        const selector=cycle%2?'#style-btn':'#quality-btn';await mark('popup-cycle-'+cycle);
        await page.locator(selector).click();await page.waitForTimeout(cycle===4?90:800);
        result.popupCycles.push(await page.locator('.anchored-menu').evaluate(n=>({width:n.offsetWidth,height:n.offsetHeight,filter:getComputedStyle(n.querySelector('.glass-surface')).backdropFilter})));
        await page.keyboard.press('Escape');await page.waitForTimeout(250);
        assert.equal(await page.locator('.anchored-menu').count(),0);
      }
      await mark('queue-sheet');await page.locator('[data-action="queue"]').click(); await page.waitForTimeout(700); await shot('queue');
      await page.keyboard.press('Escape');
      result.frames = await finish();
      assert(result.stage.analyser && result.stage.playing && result.stage.frequencyPeak > 0);
      assert(result.popoverFilter.includes('lm-lens-'));
    }
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(result, null, 2));
    assert.equal(result.dpr, 1); assert(!await page.evaluate(() => matchMedia('(prefers-reduced-motion:reduce)').matches));
    assert(result.frames.p95 < 33.5); assert(result.frames.max < 50); assert.equal(result.frames.longTasks.length, 0);
    assert.equal(errors.length, 0);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  } finally {
    if(traceSession){const done=new Promise(resolve=>traceSession.once('Tracing.tracingComplete',resolve));await traceSession.send('Tracing.end');await Promise.race([done,new Promise(resolve=>setTimeout(resolve,5000))]);fs.writeFileSync(path.join(out,'trace.json'),JSON.stringify({traceEvents}));}
    await app.close();
  }
})().catch(e => { fs.writeFileSync(path.join(out, 'failure.txt'), e.stack); console.error(e); process.exitCode = 1; });
