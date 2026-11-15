const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {hashes,sourceFiles}=require('./common.cjs');
const base=path.join(__dirname,'artifacts/native-menu-20261019'),out=path.join(base,'motion');
fs.mkdirSync(out,{recursive:true});
const native=JSON.parse(fs.readFileSync(path.join(base,'entry-heldout.json')));
(async()=>{
 const app=await _electron.launch({executablePath:path.resolve('apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.resolve('apps/desktop'),'--disable-features=CalculateNativeWinOcclusion','--force-device-scale-factor=1'],env:{...process.env,MINERADIO_STARTUP_QA_HIDDEN:'1',MINERADIO_STARTUP_QA_USER_DATA:path.join(out,'profile-'+Date.now()),MINERADIO_KEEP_BACKGROUND_RENDERING:'1',MINERADIO_NO_DESKTOP_SHORTCUT:'1',MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE:'1'}});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>window.__lxmine&&window.LxPopupMotion);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(1200,800);w.setOpacity(0);w.webContents.setBackgroundThrottling(false);w.showInactive()});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>{document.querySelector('#splash')?.remove();window.__lxmine.S.current={id:'motion-fixture',provider:'local',name:'Menu motion',artist:'Fixture'};window.__lxmine.openDetail()});
  await page.waitForTimeout(1400);
  // Real input starts the actual production popup; pause only its timeline for
  // repeatable fixed-phase pixel captures, never replace the production model.
  await page.locator('#style-btn').click();await page.waitForTimeout(850);
  await page.keyboard.press('Escape');await page.waitForTimeout(250);
  await page.locator('#style-btn').click();
  const menu=page.locator('.anchored-menu:not(.closing)');
  assert.equal(await menu.locator('.menu-header,.menu-check').count(),0,'Select-style popups must have neither title nor checkmarks');
  assert(!/[✓✔]/.test(await menu.innerText()));
  assert.equal(await menu.locator('.menu-row.checked').count(),1);
  assert.equal(await menu.locator('.menu-row.checked').evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(49, 122, 247, 0.4)');
  await menu.evaluate(n=>{window.__popupAnimation=n.getAnimations()[0];window.__popupAnimation.pause()});
  const first=native.samples[0],metrics=[];
  for(let index=0;index<native.samples.length;index++){
   const sample=native.samples[index],time=(sample.time-first.time)*1000+24.576;
   const actual=await menu.evaluate((n,time)=>{
    window.__popupAnimation.currentTime=time;
    const s=getComputedStyle(n),m=new DOMMatrixReadOnly(s.transform);
    return {scale:Math.hypot(m.a,m.b),x:m.e/n.offsetWidth,y:m.f,opacity:Number(s.opacity),filter:getComputedStyle(n.querySelector('.glass-surface')).backdropFilter,width:n.offsetWidth};
   },time);
   const predictedHeaderX=854-368*actual.scale+actual.x*406;
   const predictedHeaderY=224+46*actual.scale+actual.y*(894/376);
   metrics.push({time,registrationConfidence:sample.confidence,scaleError:Math.abs(actual.scale-sample.scale),xErrorCSS:Math.abs(predictedHeaderX-sample.x)/(894/376),yErrorCSS:Math.abs(predictedHeaderY-sample.y)/(894/376),opacityEstimateError:Math.abs(actual.opacity-sample.opacityEstimate),...actual});
   if([0,6,12,22,28].includes(index))await page.screenshot({path:path.join(out,'phase-'+Math.round(time)+'.png')});
  }
  // Blended low-contrast frames have ambiguous template maxima; retain them in
  // the report, but only use confidently registered native pixels as a gate.
  const reliable=metrics.filter(m=>m.registrationConfidence>=.82);assert(reliable.length>=20);
  fs.writeFileSync(path.join(out,'samples.json'),JSON.stringify(metrics,null,2));
  // Native repetitions differ by one recorded frame during acceleration:
  // the measured 2% scale variation moves this header about 4.2 CSS pixels.
  assert(reliable.every(m=>m.scaleError<=.025&&m.xErrorCSS<=5&&m.yErrorCSS<=3),'Held-out native header registration differs from production trajectory');
  assert.equal(new Set(metrics.map(m=>m.filter)).size,1,'Material changed during popup motion');
  // The old scale(.92) opening must fail this independently captured trajectory.
  const negativeScaleError=Math.abs(.92-first.scale);assert(negativeScaleError>.08);
  // Closing during an unfinished entry must preserve the current geometry.
  await menu.evaluate(n=>window.__popupAnimation.currentTime=125);
  const before=await menu.evaluate(n=>getComputedStyle(n).transform);
  await page.keyboard.press('Escape');
  const closing=page.locator('.anchored-menu.closing');
  const close=await closing.evaluate(n=>{const a=n.getAnimations()[0];a.pause();a.currentTime=0;return getComputedStyle(n).transform});
  const matrix=s=>s.match(/-?\d+(?:\.\d+)?/g).map(Number);
  assert(matrix(before).every((v,i)=>Math.abs(v-matrix(close)[i])<.02),'Interrupted close jumped');
  await closing.evaluate(n=>n.getAnimations()[0].finish());await page.waitForFunction(()=>!document.querySelector('.anchored-menu'));
  const references=['entry-heldout.json','motion-track.json','native.mp4'].map(f=>'qa/material/artifacts/native-menu-20261019/'+f);
  const report={status:'PASS',method:'Actual production popup, real clicks, fixed-phase composed PNGs; held-out native header registration (opacity is an estimate)',limits:{registrationConfidence:.82,scale:.025,xCSS:5,yCSS:3},metrics,negativeScaleError,interruptedClose:true,hashes:hashes([...sourceFiles,...references,'qa/material/popup-motion.cjs'])};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,reliableSamples:reliable.length,totalSamples:metrics.length,maxScaleError:Math.max(...reliable.map(m=>m.scaleError)),maxXError:Math.max(...reliable.map(m=>m.xErrorCSS)),maxYError:Math.max(...reliable.map(m=>m.yErrorCSS))}));
 }finally{await app.close()}
})().catch(e=>{fs.writeFileSync(path.join(out,'failure.txt'),e.stack);console.error(e);process.exitCode=1});
