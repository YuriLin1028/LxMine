const { _electron }=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path');
(async()=>{
  const app=await _electron.launch({executablePath:path.resolve('apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.join(__dirname,'electron-lab.cjs'),'--force-device-scale-factor=3.5','--disable-features=CalculateNativeWinOcclusion'],timeout:30000});
  const trials=[];
  try{
    const p=await app.firstWindow();await p.waitForFunction(()=>document.querySelectorAll('[data-material]').length===4);await p.waitForTimeout(500);
    const test=async params=>{
      await p.evaluate(params => LxGlass.calibrate(params), params);
      await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      let png; const metrics=[];
      for(const scene of ['grid-tiers','type-tiers']) {
        await p.evaluate(scene=>setScene(scene),scene);
        png=await p.screenshot(); const measured=await p.evaluate(b=>comparePixels(b),png.toString('base64'));
        metrics.push(...measured.map(m=>({...m,scene})));
      }
      const score=metrics.reduce((s,m)=>s+m.mae,0)/metrics.length + metrics.reduce((s,m)=>s+Math.max(0,.92-m.ssim)*150+Math.max(0,m.mae-8)+Math.max(0,m.rimMAE-12)+Math.max(0,m.allInsideMAE-8)+Math.max(0,m.outsideMAE-6),0)+metrics.reduce((s,m)=>s+m.outsideMAE,0)/metrics.length;
      const trial={at:new Date().toISOString(),params,score,metrics};trials.push(trial);fs.appendFileSync(path.join(__dirname,'artifacts/journal.jsonl'),JSON.stringify(trial)+'\n');
      if(!global.best||score<global.best.score){global.best=trial;fs.writeFileSync(path.join(__dirname,'artifacts/fit-best.png'),png);fs.writeFileSync(path.join(__dirname,'artifacts/fit-best.json'),JSON.stringify(trial,null,2));}
      console.log(JSON.stringify({trial:trials.length,params,score,best:global.best.score}));
    };
    for(const sigma of [1.9,2.2,2.5,3,4,6])for(const alpha of [.86,.88,.90,.92])await test({sheet:{sigma,alpha,color:[26,28,31]}});
    fs.writeFileSync(path.join(__dirname,'artifacts/fit-trials.json'),JSON.stringify(trials,null,2));
    console.log('BEST',JSON.stringify(global.best));
  }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
