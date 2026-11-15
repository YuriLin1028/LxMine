const { _electron } = require('../../apps/desktop/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const out=path.resolve('qa/catalogue/artifacts/wallpaper-display');fs.mkdirSync(out,{recursive:true});
const pwsh='pwsh.exe';
const shellAction=action=>cp.execFileSync(pwsh,['-NoProfile','-Command',`if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 required' }; (New-Object -ComObject Shell.Application).${action}()`],{windowsHide:true});
(async()=>{
 const app=await _electron.launch({executablePath:path.resolve(process.env.LM_QA_EXE||'apps/desktop/node_modules/electron/dist/electron.exe'),args:[...(process.env.LM_QA_EXE?[]:[path.resolve('apps/desktop')]),'--disable-features=CalculateNativeWinOcclusion'],env:{...process.env,MINERADIO_STARTUP_QA_HIDDEN:'1',MINERADIO_STARTUP_QA_USER_DATA:path.join(out,'profile-'+Date.now()),MINERADIO_NO_DESKTOP_SHORTCUT:'1',MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE:'1'}});
 const log=fs.createWriteStream(path.join(out,'runtime.log'));app.process().stdout?.pipe(log);app.process().stderr?.pipe(log);
 let minimized=false;
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>window.__lxmine?.S);
  shellAction('MinimizeAll');minimized=true;
  await page.waitForTimeout(800);
  const enabled=await page.evaluate(()=>window.desktopWindow.setWallpaperMode(true,{opacity:0.8}));
  if(!enabled.ok)throw Error(JSON.stringify(enabled));
  const host=app.windows().find(p=>p.url().includes('wallpaper=1'));if(!host)throw Error('No wallpaper host');
  await host.evaluate(()=>{const el=document.createElement('div');el.id='display-canary';el.style='position:fixed;inset:0;z-index:2147483647;background:rgb(17,201,97);display:block!important';document.body.append(el);});
  await host.waitForTimeout(1000);
  const samples=[];
  for(let i=0;i<24;i++){
   if(i===12){await host.evaluate(()=>document.querySelector('#display-canary').style.background='rgb(201,17,97)');await new Promise(resolve=>setTimeout(resolve,350));}
   const sample=await app.evaluate(async({desktopCapturer,screen},index)=>{
    const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:960,height:540}});
    const src=sources.find(s=>String(s.display_id)===String(screen.getPrimaryDisplay().id))||sources[0];
    const img=src.thumbnail,sz=img.getSize(),b=img.toBitmap();let match=0,total=0;
    for(let y=Math.floor(sz.height*.25);y<sz.height*.75;y+=3)for(let x=Math.floor(sz.width*.25);x<sz.width*.75;x+=3){const k=(y*sz.width+x)*4;total++;const blue=b[k],green=b[k+1],red=b[k+2];if(index<12?(green>red+30):(red>green+30))match++;}
    const center=(Math.floor(sz.height/2)*sz.width+Math.floor(sz.width/2))*4;
    return {index,phase:index<12?'green':'magenta',visibleRatio:match/total,centerBGRA:Array.from(b.subarray(center,center+4)),width:sz.width,height:sz.height,png:index===0||index===12?img.toPNG().toString('base64'):null};
   },i);if(sample.png)fs.writeFileSync(path.join(out,'actual-display.png'),Buffer.from(sample.png,'base64'));delete sample.png;samples.push(sample);await new Promise(resolve=>setTimeout(resolve,250));
  }
  const native=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('wallpaper=1'));return w?{visible:w.isVisible(),opacity:w.getOpacity(),bounds:w.getBounds(),title:w.getTitle()}:{visible:false,windows:BrowserWindow.getAllWindows().map(w=>w.webContents.getURL())};});
  await host.evaluate(()=>document.querySelector('#display-canary').remove());
  await new Promise(resolve=>setTimeout(resolve,300));
  const scene=await app.evaluate(async({desktopCapturer,screen})=>{const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:1280,height:720}});return(sources.find(s=>String(s.display_id)===String(screen.getPrimaryDisplay().id))||sources[0]).thumbnail.toPNG().toString('base64');});
  fs.writeFileSync(path.join(out,'scene-display.png'),Buffer.from(scene,'base64'));
  const report={status:native.visible&&native.opacity===0.8&&samples.every(s=>s.visibleRatio>.9)?'PASS':'FAIL',packaged:!!process.env.LM_QA_EXE,native,pairedColorContrast:true,samples};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  await page.evaluate(()=>window.desktopWindow.setWallpaperMode(false));
  if(report.status!=='PASS')process.exitCode=1;
 }finally{await app.close();if(minimized)shellAction('UndoMinimizeALL');}
})().catch(e=>{console.error(e);process.exitCode=1;});
