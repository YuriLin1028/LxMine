const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out=path.resolve('qa/material/artifacts/dock-20261019');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const app=await _electron.launch({executablePath:path.resolve('apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.resolve('apps/desktop'),'--disable-features=CalculateNativeWinOcclusion','--force-device-scale-factor=1'],env:{...process.env,MINERADIO_STARTUP_QA_HIDDEN:'1',MINERADIO_STARTUP_QA_USER_DATA:path.join(out,'profile-'+Date.now()),MINERADIO_NO_DESKTOP_SHORTCUT:'1',MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE:'1'}});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>window.__lxmine?.S);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setOpacity(0);w.webContents.setBackgroundThrottling(false);w.showInactive();});
  await page.evaluate(()=>{document.querySelector('#splash')?.remove();window.__lxmine.S.current={id:'dock-layout-fixture',name:'测试歌曲名称',artist:'测试歌手',provider:'local'};});
  await page.waitForTimeout(1200);const reports=[];
  const geometry=()=>page.evaluate(()=>{
   const r=n=>n.getBoundingClientRect().toJSON(),dock=document.querySelector('#dock'),cover=document.querySelector('.dock-cover');
   return {phone:document.body.classList.contains('phone-layout'),compact:document.body.classList.contains('phone-compact'),dock:r(dock),cover:r(cover),inner:r(document.querySelector('#cover-inner')),nav:r(document.querySelector('#nav')),buttons:[...document.querySelectorAll('#dock-controls button')].filter(n=>getComputedStyle(n).display!=='none').map(n=>({action:n.dataset.action,...r(n)})),copy:r(document.querySelector('#dock-copy'))};
  });
  for(const [width,height]of [[420,900],[540,960],[800,1100],[1200,800]]){
   await app.evaluate(({BrowserWindow},[w,h])=>BrowserWindow.getAllWindows()[0].setSize(w,h),[width,height]);
   await page.evaluate(()=>window.__lxmine.setTab('home'));await page.waitForTimeout(650);
   await page.evaluate(()=>{const spacer=document.createElement('div');spacer.style.height='3000px';document.querySelector('#main').appendChild(spacer)});
   await page.mouse.move(width/2,400);await page.mouse.wheel(0,500);await page.waitForTimeout(650);
   const compact=await geometry();assert.equal(compact.cover.width,44);assert.equal(compact.inner.width,38);if(compact.phone){assert(compact.compact);assert.equal(compact.dock.height,54);assert.equal(compact.nav.x,24);assert.equal(compact.dock.x,90);assert.equal(compact.nav.width,compact.dock.height);assert.equal(compact.nav.height,compact.dock.height);assert(Math.abs(compact.nav.y-compact.dock.y)<1);}
   await page.locator('#search-node').click();await page.waitForTimeout(700);const search=await geometry();assert.equal(search.cover.width,44);assert.equal(search.inner.width,38);assert.equal(search.cover.height,44);
   await page.screenshot({path:path.join(out,`search-${width}.png`)});await page.locator('#search-back').click();await page.waitForTimeout(650);
   await page.locator('#dock-copy').click();await page.waitForTimeout(900);const detail=await geometry();
   if(detail.phone){assert.equal(detail.dock.height,68);assert.equal(detail.cover.width,48);}
   for(const b of detail.buttons)assert(b.x>=detail.dock.x-1&&b.right<=detail.dock.right+1,'Button clipped/overflowing: '+b.action);
   assert(detail.copy.width>=45,'Song title was squeezed out');
   if(detail.dock.width<=440&&detail.phone)assert(detail.buttons.some(b=>b.action==='more'));
   const quality=await page.locator('#quality-btn').boundingBox(),comments=await page.locator('#comments-btn').boundingBox(),style=await page.locator('#style-btn').boundingBox();
   assert(quality.x>width/2&&quality.x<comments.x&&comments.x<style.x,'Quality button moved out of its original right-side toolbar');
   await page.locator('#quality-btn').click();await page.waitForTimeout(850);
   const origin=await page.locator('.anchored-menu:not(.closing)').evaluate(n=>{const r=document.querySelector('#quality-btn').getBoundingClientRect(),o=getComputedStyle(n).transformOrigin.split(' ').map(parseFloat);return {dx:parseFloat(n.style.left)+o[0]-(r.x+r.width/2),dy:parseFloat(n.style.top)+o[1]-(r.y+r.height/2)};});assert(Math.abs(origin.dx)<1&&Math.abs(origin.dy)<1);
   await page.keyboard.press('Escape');await page.waitForTimeout(200);
   await page.screenshot({path:path.join(out,`detail-${width}.png`)});
   reports.push({width,height,compact,search,detail,quality,origin});await page.locator('#detail-back').click();await page.waitForTimeout(700);
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'PASS',reports},null,2));console.log(JSON.stringify(reports.map(r=>({width:r.width,detailHeight:r.detail.dock.height,cover:r.detail.cover.width,buttons:r.detail.buttons.map(b=>b.action),titleWidth:r.detail.copy.width}))));
 }finally{await app.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
