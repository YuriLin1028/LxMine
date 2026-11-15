const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path');
const {root}=require('./common.cjs');
(async()=>{const app=await _electron.launch({executablePath:path.join(root,'apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.join(__dirname,'electron-lab.cjs'),'--force-device-scale-factor=3.5','--disable-features=CalculateNativeWinOcclusion']});try{
 const p=await app.firstWindow();await p.waitForLoadState();const trials=[];let best;
 for(const menu of [.15,.2,.25])for(const sheet of [.3,.35,.4]){
  const style=await p.addStyleTag({content:`.glass.popover{box-shadow:inset 0 0 0 .5px rgba(255,255,255,${menu}),0 8px 24px rgba(0,0,0,.08)!important}.glass.modal{box-shadow:inset 0 0 0 .5px rgba(255,255,255,${sheet}),0 8px 24px rgba(0,0,0,.08)!important}`});
  const metrics=[];for(const scene of ['grid-tiers','type-tiers']){await p.evaluate(s=>setScene(s),scene);const png=await p.screenshot();metrics.push(...(await p.evaluate(png=>comparePixels(png),png.toString('base64'))).filter(m=>['lab-menu','lab-sheet'].includes(m.id)).map(m=>({...m,scene})))}
  const score=metrics.reduce((s,m)=>s+m.outlineMAE,0);const t={menu,sheet,score,metrics};trials.push(t);if(!best||score<best.score)best=t;await style.evaluate(n=>n.remove());
 }
 fs.writeFileSync(path.join(__dirname,'artifacts/outline-trials.json'),JSON.stringify(trials,null,2));console.log(JSON.stringify(best));
}finally{await app.close()}})().catch(e=>{console.error(e);process.exitCode=1});
