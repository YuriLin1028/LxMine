const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path');const{root,scenes,passes}=require('./common.cjs');
(async()=>{const app=await _electron.launch({executablePath:path.join(root,'apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.join(__dirname,'electron-lab.cjs'),'--force-device-scale-factor=3.5','--disable-features=CalculateNativeWinOcclusion']});try{
 const p=await app.firstWindow();await p.waitForLoadState();const trials=[];let best;
 for(const bottom of ['rgba(0,0,0,.22)','rgba(255,255,255,0)','rgba(255,255,255,.08)','rgba(255,255,255,.16)','rgba(255,255,255,.24)']){
  const style=await p.addStyleTag({content:`.glass:not(.modal):not(.popover)>.glass-surface{box-shadow:inset 0 .75px 0 rgba(255,255,255,.2),inset 0 -.75px 0 ${bottom},0 8px 24px rgba(0,0,0,.08)!important}`});
  const metrics=[];for(const scene of scenes){await p.evaluate(s=>setScene(s),scene);const png=await p.screenshot();metrics.push(...(await p.evaluate(png=>comparePixels(png),png.toString('base64'))).map(m=>({...m,scene})))}
  const controls=metrics.filter(m=>!['lab-menu','lab-sheet'].includes(m.id)),score=controls.reduce((s,m)=>s+m.outlineMAE,0)+controls.reduce((s,m)=>s+Math.max(0,.92-m.ssim)*200+Math.max(0,m.rimMAE-12)*5+Math.max(0,m.allInsideMAE-8)*5,0);
  const t={bottom,score,metrics,pass:metrics.every(passes)};trials.push(t);if(!best||score<best.score)best=t;await style.evaluate(n=>n.remove());
 }
 fs.writeFileSync(path.join(__dirname,'artifacts/control-rim-trials.json'),JSON.stringify(trials,null,2));console.log(JSON.stringify(best));
}finally{await app.close()}})().catch(e=>{console.error(e);process.exitCode=1});
