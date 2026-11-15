const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out=path.resolve('qa/catalogue/artifacts/home-ui');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const app=await _electron.launch({executablePath:path.resolve('apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.resolve('apps/desktop'),'--disable-features=CalculateNativeWinOcclusion','--force-device-scale-factor=1'],env:{...process.env,MINERADIO_STARTUP_QA_HIDDEN:'1',MINERADIO_STARTUP_QA_USER_DATA:path.join(out,'profile-'+Date.now()),MINERADIO_NO_DESKTOP_SHORTCUT:'1',MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE:'1'}});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>window.__lxmine?.S);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(1200,800);w.setOpacity(0);w.showInactive();w.webContents.setBackgroundThrottling(false);});
  await page.evaluate(()=>document.querySelector('#splash')?.remove());
  const tray=await page.evaluate(()=>window.desktopWindow.getState());assert.equal(tray.trayAvailable,true);
  const platforms=[];
  for(const source of ['wy','tx','kw','kg']){
   await page.locator('.home-platform[data-source="'+source+'"]').click();
   await page.waitForFunction(s=>window.__lxmine.S.feed?.source===s&&document.querySelectorAll('.section').length>=8,source,{timeout:60000});
   await page.waitForTimeout(800);const count=await page.locator('.section').count();platforms.push({source,count});
   await page.mouse.move(600,440);await page.mouse.wheel(0,750);await page.waitForTimeout(600);
   const sticky=await page.locator('.home-platforms').boundingBox();assert(sticky.y>=90&&sticky.y<110,'Provider selector is not sticky');
   await page.screenshot({path:path.join(out,source+'.png')});
  }
  await page.locator('.home-platform[data-source="wy"]').click();await page.waitForTimeout(600);
  const narrow=[];
  const responsive=await page.context().newCDPSession(page);
  for(const width of [320,360,420,540,800,1200]){
    await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(Math.max(420,width),900),width);
    await responsive.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await page.waitForTimeout(600);
    await page.mouse.move(width/2,450);await page.mouse.wheel(0,600);await page.waitForTimeout(600);
    const geometry=await page.locator('#home-platforms').evaluate(n=>({viewport:innerWidth,parent:n.parentElement.tagName,z:getComputedStyle(n).zIndex,searchZ:getComputedStyle(document.querySelector('#search-node')).zIndex,buttons:[...n.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect(),label=b.querySelector('.home-platform-label');return {source:b.dataset.source,x:r.x,right:r.right,width:r.width,overflow:label.scrollWidth>label.clientWidth,topmost:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})}));
    assert.equal(geometry.viewport,width);
    assert.equal(geometry.parent,'BODY');assert.equal(geometry.z,geometry.searchZ);for(const b of geometry.buttons){assert(b.x>=12&&b.right<=width-12);assert(!b.overflow,'Platform text overflow at '+width);assert(b.topmost,'Platform is covered at '+width);}
    narrow.push({width,...geometry});await page.screenshot({path:path.join(out,'platform-'+width+'.png')});
  }
  await responsive.send('Emulation.clearDeviceMetricsOverride');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1200,800));await page.waitForTimeout(500);
  await page.locator('.section[data-section="charts"] .more-ball').click();await page.waitForTimeout(500);assert.equal(await page.locator('.home-platforms').isVisible(),false);
  await page.evaluate(()=>window.__lxmine.setTab('settings'));await page.waitForTimeout(500);assert.equal(await page.locator('.setting-select-chevron').count(),0);
  assert.equal(await page.evaluate(()=>typeof window.desktopWindow.openNeteaseMusicLogin),'undefined');
  const account=await page.evaluate(()=>fetch('/api/login/status').then(r=>r.status));assert.equal(account,410);
  await page.evaluate(()=>{window.__lxmine.S.current={id:'fixture',provider:'local',name:'桌面歌词测试',artist:'Fixture'};window.__lxmine.openDetail();});await page.waitForTimeout(850);
  const origins=[];
  for(const id of ['quality-btn','style-btn']){
   await page.locator('#'+id).click();await page.waitForTimeout(800);
   const geo=await page.evaluate(id=>{const a=document.getElementById(id).getBoundingClientRect(),m=document.querySelector('.anchored-menu'),s=getComputedStyle(m),origin=s.transformOrigin.split(' ').map(parseFloat);return {id,ratio:Number(m.dataset.popupOriginX),dx:parseFloat(m.style.left)+origin[0]-(a.left+a.width/2),dy:parseFloat(m.style.top)+origin[1]-(a.top+a.height/2)};},id);
   assert(Math.abs(geo.dx)<1&&Math.abs(geo.dy)<1,'Popup origin is not its trigger center');assert(id==='quality-btn'?geo.ratio<.5:geo.ratio>.5);origins.push(geo);await page.keyboard.press('Escape');await page.waitForTimeout(200);
  }
  await page.locator('#detail-back').click();await page.waitForTimeout(800);
  await page.evaluate(()=>window.desktopWindow.setDesktopLyricsEnabled(true,{enabled:true,clickThrough:false,text:'歌词测试'}));
  await page.waitForTimeout(700);let overlay=app.windows().find(p=>p.url().includes('desktop-lyrics.html'));assert(overlay);await overlay.waitForLoadState('domcontentloaded');
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='LxMine Desktop Lyrics');w.setOpacity(0);});
  const stage=await overlay.locator('#stage').boundingBox();await overlay.mouse.move(stage.x+stage.width/2,stage.y+stage.height/2);await overlay.waitForTimeout(350);
  await overlay.locator('#lockText').click();await page.waitForFunction(()=>window.__lxmine.S.desktopLyricsLocked===true);
  await page.evaluate(()=>window.desktopWindow.setDesktopLyricsLocked(false));await overlay.waitForFunction(()=>document.body.classList.contains('unlocked'));
  await overlay.mouse.move(stage.x+stage.width/2,stage.y+stage.height/2);await overlay.waitForTimeout(350);
  const before=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='LxMine Desktop Lyrics').getBounds());
  await overlay.mouse.down();await overlay.mouse.move(stage.x+stage.width/2+30,stage.y+stage.height/2+15,{steps:5});await overlay.mouse.up();await overlay.waitForTimeout(200);
  const after=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='LxMine Desktop Lyrics').getBounds());assert(after.x!==before.x||after.y!==before.y,'Left drag did not move lyrics');
  await overlay.locator('#closeLyricsBtn').click();await page.waitForFunction(()=>!window.__lxmine.S.desktopLyrics);
  await page.evaluate(async()=>{for(let i=0;i<12;i++)await window.desktopWindow.updateDesktopLyrics({enabled:true,clickThrough:false,text:'旧刷新消息'});});await page.waitForTimeout(1500);
  assert(!app.windows().some(p=>p.url().includes('desktop-lyrics.html')),'Lyrics resurrected after close');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lxmine.pc.v1')).desktopLyrics),false);
  assert.deepEqual(errors,[]);
  const report={status:'PASS',tray:true,platforms,narrow,origins,noAccountEntry:true,lyricLeftDrag:true,lyricLockRecovery:true,lyricClosePersisted:true,noResurrectionAfter12Updates:true,errors};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
