const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 const app=await _electron.launch({executablePath:path.resolve('apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.join(__dirname,'electron-lab.cjs'),'--force-device-scale-factor=3.5','--disable-features=CalculateNativeWinOcclusion']});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>document.querySelectorAll('[data-material]').length===4);const results=[];
  for(const params of [{mapDensity:1},{mapDensity:2},{mapDensity:3.5},{mapDensity:7}]){
   await page.evaluate(p=>LxGlass.calibrate(p),params);const scenes=[];
   for(const scene of ['grid','type','grid-tiers','type-tiers']){
    await page.evaluate(s=>setScene(s),scene);const png=await page.screenshot();const metrics=await page.evaluate(png=>comparePixels(png),png.toString('base64'));
    const smooth=await page.evaluate(()=>surfaceSmoothness());scenes.push({scene,smooth,metrics:metrics.filter(m=>m.id.includes('circle'))});
    if(scene==='type'){fs.writeFileSync(path.join(__dirname,'artifacts/smooth-'+params.mapDensity+'.png'),png)}
   }
   results.push({params,scenes});console.log(JSON.stringify({params,scenes}));
  }
  fs.writeFileSync(path.join(__dirname,'artifacts/smoothness-fit.json'),JSON.stringify(results,null,2));
 }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
