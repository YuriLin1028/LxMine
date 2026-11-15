const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 const app=await _electron.launch({executablePath:path.resolve('apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.join(__dirname,'electron-lab.cjs'),'--force-device-scale-factor=3.5','--disable-features=CalculateNativeWinOcclusion']});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>document.querySelectorAll('[data-material]').length===4);
  const results=[];
  for(const params of [{tangentGain:0},{tangentGain:.12,tangentCap:8,tangentDecay:2.5}]){
   await page.evaluate(p=>LxGlass.calibrate(p),params);
   const scenes=[];
   for(const scene of ['grid','grid-tiers']){
    await page.evaluate(s=>setScene(s),scene);const png=await page.screenshot();await page.evaluate(png=>comparePixels(png),png.toString('base64'));
    const curve=await page.evaluate(()=>shoulderCurves());scenes.push({scene,...curve});
   }
   results.push({params,scenes});console.log(JSON.stringify({params,scenes:scenes.map(s=>({scene:s.scene,max:s.maxPhaseError,mean:s.meanPhaseError,corr:s.minCorrelation,worst:s.samples.filter(r=>r.phaseError>.75)}))}));
  }
  fs.writeFileSync(path.join(__dirname,'artifacts/tangent-fit.json'),JSON.stringify(results,null,2));
 }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
