const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out=path.resolve('qa/catalogue/artifacts/lyrics-unlock');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const app=await _electron.launch({executablePath:path.resolve('apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.resolve('apps/desktop'),'--disable-features=CalculateNativeWinOcclusion','--force-device-scale-factor=1'],env:{...process.env,MINERADIO_STARTUP_QA_HIDDEN:'1',MINERADIO_STARTUP_QA_USER_DATA:path.join(out,'profile-'+Date.now()),MINERADIO_NO_DESKTOP_SHORTCUT:'1',MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE:'1'}});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>window.__lxmine?.S);
  await page.evaluate(()=>window.desktopWindow.setDesktopLyricsEnabled(true,{clickThrough:false,text:'鼠标解锁回归测试'}));await page.waitForTimeout(700);
  const overlay=app.windows().find(p=>p.url().includes('desktop-lyrics.html'));assert(overlay);await overlay.waitForLoadState('domcontentloaded');
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='LxMine Desktop Lyrics');w.setOpacity(0);const original=w.setIgnoreMouseEvents.bind(w);w.setIgnoreMouseEvents=(ignored,options)=>{w.__qaIgnored=ignored;return original(ignored,options);};});
  const ignored=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='LxMine Desktop Lyrics').__qaIgnored);
  const center=async()=>{const rect=await overlay.locator('#lyricViewport').boundingBox();await overlay.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2,{steps:4});await overlay.waitForTimeout(350);};
  for(let cycle=0;cycle<4;cycle++){
   await center();await overlay.locator('#lockText').click();await page.waitForFunction(()=>window.__lxmine.S.desktopLyricsLocked);await center();
   assert.equal(await overlay.locator('#lockText').innerText(),'解锁');assert.equal(await ignored(),true,'Locked lyric text must remain mouse-through');
   const before=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='LxMine Desktop Lyrics').getBounds());
   await overlay.mouse.down();await overlay.mouse.move(400,220,{steps:4});await overlay.mouse.up();await overlay.waitForTimeout(200);
   const after=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='LxMine Desktop Lyrics').getBounds());assert.deepEqual(after,before,'Locked lyrics moved');
   const unlockTarget=cycle%2?'#lockHint .lock-icon':'#lockText';
   await center();await overlay.locator(unlockTarget).hover();await overlay.waitForTimeout(220);assert.equal(await ignored(),false,'Unlock button was still mouse-through');
   if(!cycle)await overlay.screenshot({path:path.join(out,'locked-unlock-button.png')});
   await overlay.locator(unlockTarget).click();await page.waitForFunction(()=>!window.__lxmine.S.desktopLyricsLocked);assert(await overlay.locator('body').evaluate(n=>n.classList.contains('unlocked')));
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'PASS',realMouseUnlockCycles:4,lockedTextMouseThrough:true,lockedCannotDrag:true,unlockButtonReceivesMouse:true},null,2));console.log('PASS: 4 actual mouse lock/unlock cycles, locked text stays mouse-through and cannot move.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
