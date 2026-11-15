const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out=path.resolve('qa/catalogue/artifacts/lyrics-restart-'+Date.now());fs.mkdirSync(out,{recursive:true});
const launch=()=>_electron.launch({executablePath:path.resolve('apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.resolve('apps/desktop')],env:{...process.env,MINERADIO_STARTUP_QA_HIDDEN:'1',MINERADIO_STARTUP_QA_USER_DATA:path.join(out,'profile'),MINERADIO_NO_DESKTOP_SHORTCUT:'1',MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE:'1'}});
(async()=>{
 for(let cycle=0;cycle<3;cycle++){
  const app=await launch();try{
   const page=await app.firstWindow();await page.waitForFunction(()=>window.__lxmine?.S);await page.waitForTimeout(1800);
   if(cycle===0){await page.evaluate(()=>window.desktopWindow.setDesktopLyricsLocked(true));await page.waitForFunction(()=>window.__lxmine.S.desktopLyricsLocked);await page.evaluate(()=>window.desktopWindow.setDesktopLyricsEnabled(true,{clickThrough:false}));await page.waitForFunction(()=>window.__lxmine.S.desktopLyrics&&!window.__lxmine.S.desktopLyricsLocked);}
   if(cycle===1){assert(await page.evaluate(()=>window.__lxmine.S.desktopLyrics),'App teardown overwrote the enabled preference');assert(app.windows().some(p=>p.url().includes('desktop-lyrics.html')));await page.evaluate(()=>window.desktopWindow.setDesktopLyricsEnabled(false));await page.waitForFunction(()=>!window.__lxmine.S.desktopLyrics);}
   if(cycle===2){assert.equal(await page.evaluate(()=>window.__lxmine.S.desktopLyrics),false);assert(!app.windows().some(p=>p.url().includes('desktop-lyrics.html')));}
  }finally{await app.close();}
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'PASS',enabledSurvivesAppQuit:true,explicitCloseSurvivesRestart:true},null,2));console.log('PASS: enabled preference survives app quit; explicit close survives restart.');
})().catch(error=>{console.error(error);process.exitCode=1;});
