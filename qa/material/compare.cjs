const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {root,limits,sourceFiles,hashes,passes,scenes}=require('./common.cjs');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const run=path.join(__dirname,'artifacts/runs',stamp);fs.mkdirSync(run,{recursive:true});
const flatten=node=>[...(node.attributes?[node.attributes]:[]),...(node.children||[]).flatMap(flatten)];
(async()=>{
  const app=await _electron.launch({executablePath:path.join(root,'apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.join(__dirname,'electron-lab.cjs'),'--force-device-scale-factor=3.5','--disable-features=CalculateNativeWinOcclusion'],timeout:30000});
  try{
    const page=await app.firstWindow();await page.waitForFunction(()=>document.querySelectorAll('[data-material="contour-lens"]').length===4);await page.waitForTimeout(300);
    const results=[],negative=[];
    const evidenceFiles=[...sourceFiles,'qa/material/common.cjs','qa/material/compare.cjs','qa/material/lab.html','qa/material/electron-lab.cjs'];
    const override=process.env.LM_FIT==='1';
    if(override)await page.evaluate(o=>LxGlass.calibrate(o),JSON.parse(fs.readFileSync(path.join(__dirname,'artifacts/fit-best.json'))).params);
    for(const scene of scenes){
      const folder=path.join(__dirname,'artifacts/references',scene);
      const on=flatten(JSON.parse(fs.readFileSync(path.join(folder,'native-on-layout.json'))));
      const off=flatten(JSON.parse(fs.readFileSync(path.join(folder,'native-off-layout.json'))));
      const repeat=flatten(JSON.parse(fs.readFileSync(path.join(folder,'native-repeat-layout.json'))));
      for(const list of [on,repeat])assert(list.find(n=>n.id==='lab-metadata')?.text.includes('DPR=3.5; supported=true; level=0; enabled=true'),'Reference must be EXQUISITE native material, enabled');
      assert(off.find(n=>n.id==='lab-metadata')?.text.includes('enabled=false'),'Missing native off reference');
      await page.evaluate(scene=>setScene(scene),scene);
      const hidden=await page.addStyleTag({content:'.glass{visibility:hidden!important}'});
      const bare=await page.screenshot();await page.evaluate(png=>verifyBackdrop(png),bare.toString('base64'));
      await hidden.evaluate(n=>n.remove());await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const png=await page.screenshot(),metrics=await page.evaluate(p=>comparePixels(p),png.toString('base64'));
      const geometry=await page.evaluate(()=>[...document.querySelectorAll('.glass')].map(n=>({id:n.id,r:n.getBoundingClientRect().toJSON(),d:devicePixelRatio})));
      for(const n of geometry){const bounds=on.find(a=>a.id===n.id).bounds.match(/\d+/g).map(Number);assert(Math.abs(n.r.x*n.d-bounds[0])<.25&&Math.abs(n.r.y*n.d-bounds[1])<.25&&Math.abs(n.r.right*n.d-bounds[2])<.25&&Math.abs(n.r.bottom*n.d-bounds[3])<.25,'Native/PC geometry differs');}
      const preflight=await page.evaluate(()=>referenceChecks());assert.equal(preflight.status,'PASS',JSON.stringify(preflight));
      // Local optical quality is part of the gate: global MAE/SSIM can pass
      // while an 8-bit displacement field still shows contour banding.
      const smoothness=await page.evaluate(()=>surfaceSmoothness());
      const shoulder=['grid','grid-tiers'].includes(scene)?await page.evaluate(()=>shoulderCurves()):null;
      results.push({scene,preflight,metrics,smoothness,shoulder});fs.writeFileSync(path.join(run,scene+'-pc.png'),png);
      const sheet=await page.evaluate(b=>makeSheet(b),png.toString('base64'));
      fs.writeFileSync(path.join(run,scene+'-comparison.png'),Buffer.from(sheet,'base64'));
      fs.copyFileSync(path.join(run,scene+'-comparison.png'),path.join(__dirname,'artifacts/comparison-'+scene+'.png'));
      // A gate unable to reject ordinary blur is not a refraction gate.
      await page.evaluate(()=>document.querySelectorAll('feDisplacementMap').forEach(n=>{n.dataset.originalScale=n.getAttribute('scale');n.setAttribute('scale','0')}));
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const flat=await page.screenshot();negative.push(...await page.evaluate(p=>comparePixels(p),flat.toString('base64')));
      await page.evaluate(()=>document.querySelectorAll('feDisplacementMap').forEach(n=>n.setAttribute('scale',n.dataset.originalScale)));
      for(const file of ['native-on.png','native-off.png','native-repeat.png','native-on-layout.json','native-off-layout.json','native-repeat-layout.json'])evidenceFiles.push('qa/material/artifacts/references/'+scene+'/'+file);
    }
    const opticalPass=results.every(s=>s.metrics.every(passes)&&s.smoothness.every(x=>x.ratio<=1.5)&&(!s.shoulder||!s.shoulder.samples.length||s.shoulder.maxPhaseError<=.75));
    const report={status:opticalPass&&!negative.every(passes)?'PASS':'FAIL',capturedAt:new Date().toISOString(),calibrationOverride:override,thresholds:limits,dpr:await page.evaluate(()=>devicePixelRatio),pixels:results,negativeControlPassed:negative.every(passes),hashes:hashes(evidenceFiles)};
    fs.writeFileSync(path.join(run,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(__dirname,'artifacts/pixel-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({status:report.status,run,negativeControlPassed:report.negativeControlPassed,pixels:results}));
    if(report.status!=='PASS')process.exitCode=1;
  }finally{await app.close()}
})().catch(error=>{fs.writeFileSync(path.join(run,'failure.txt'),error.stack);console.error(error);process.exitCode=2});
