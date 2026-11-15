const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path');
const base=path.join(__dirname,'artifacts/native-menu-20261019');
const {hashes,sourceFiles,sha}=require('./common.cjs');
const expected=['quality','style','select','quality-type','style-type','select-type'];
const passes=m=>m.mae<=8&&m.rimMAE<=12&&m.centreMAE<=8&&m.outlineMAE<=24&&m.outsideMAE<=6&&m.ssim>=.92&&(m.semanticMAE===null||m.semanticMAE<=8);
const flatten=n=>[...(n.attributes?[n.attributes]:[]),...(n.children||[]).flatMap(flatten)];
const bounds=a=>a.bounds.match(/\d+/g).map(Number);
(async()=>{
 const capture=JSON.parse(fs.readFileSync(path.join(base,'capture.json'),'utf8'));
 for(const [key,file]of [['nativePlayerSHA256','apps/harmony/entry/src/main/ets/components/NativePlayer.ets'],['nativeSettingsSHA256','apps/harmony/entry/src/main/ets/components/NativeSettings.ets']]){
  if(capture[key]?.toLowerCase()!==sha(file))throw new Error('Native popup source changed since capture: '+file);
 }
 const app=await _electron.launch({executablePath:path.resolve('apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.join(__dirname,'electron-lab.cjs'),'--force-device-scale-factor=3.5','--disable-features=CalculateNativeWinOcclusion'],env:{...process.env,LM_SYSTEM_MENU:'1'}});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>window.LxGlass&&window.measure);
  const scenes=expected.filter(s=>fs.existsSync(path.join(base,s+'-layout.json'))),trials=[];
  const customIndex=process.argv.indexOf('--profiles');
  const rim=process.argv.includes('--rim'),fine=process.argv.includes('--fine'),detail=process.argv.includes('--detail'),optical=process.argv.includes('--optical'),fit=process.argv.includes('--fit')||rim||fine||optical||detail||customIndex>=0;
  const candidates=optical?[1,20,45,90].flatMap(amplitudeCap=>[0,.12].map(tangentGain=>({amplitudeCap,tangentGain}))):rim?[.35,.45,.55,.65].flatMap(rimAlpha=>[20,24,28,32].map(renderRadius=>({rimAlpha,renderRadius}))):fine?[5,6,7].flatMap(sigma=>[.63,.67,.71].flatMap(alpha=>[[18,18,18],[26,28,31],[30,30,30]].map(color=>({sigma,edgeSigma:sigma,alpha,color})))):fit?[4,6,8,10,12,16].flatMap(sigma=>[.2,.35,.5,.65,.8].map(alpha=>({sigma,edgeSigma:sigma,alpha,color:[26,28,31]}))):[null];
  let best;
  const list=customIndex>=0?JSON.parse(fs.readFileSync(process.argv[customIndex+1],'utf8')):detail?[3.5,4,4.5,5].flatMap(sigma=>[.67,.69,.71].flatMap(alpha=>[[26,28,31],[30,30,30]].map(color=>({sigma,edgeSigma:sigma,alpha,color})))):candidates;
  for(const popup of list){
   if(popup&&!rim)await page.evaluate(popup=>LxGlass.calibrate({popup}),popup);
   const metrics=[];
   for(const scene of scenes){
    const nodes=flatten(JSON.parse(fs.readFileSync(path.join(base,scene+'-layout.json'),'utf8'))),menu=nodes.find(a=>a.type==='Menu'),rect=bounds(menu);
    const texts=nodes.filter(a=>a.type==='Text'&&a.text).map(bounds).filter(r=>r[0]>=rect[0]&&r[1]>=rect[1]&&r[2]<=rect[2]&&r[3]<=rect[3]);
    const semantics=nodes.filter(a=>a.type==='Option'&&a.selected==='true'&&a.backgroundColor&&a.backgroundColor!=='#00000000').map(a=>({bounds:bounds(a),color:a.backgroundColor,role:'selected-option'}));
    const options=nodes.filter(a=>a.type==='Option').map(a=>({bounds:bounds(a),selected:a.selected==='true'}));
    await page.evaluate(v=>setup(v),{bounds:rect,texts,semantics,options,scene});
    if(rim||popup?.renderRadius)await page.evaluate(({rimAlpha=.35,renderRadius})=>{document.getElementById('probe').style.boxShadow=`inset 0 0 0 .5px rgba(255,255,255,${rimAlpha}),0 8px 24px rgba(0,0,0,.08)`;document.getElementById('probe').style.borderRadius=renderRadius+'px';LxGlass.prepare(document.getElementById('probe'));},popup);
    let backgroundMAD=null;
    if(!fit){await page.locator('#probe').evaluate(n=>n.style.visibility='hidden');const bare=await page.screenshot({fullPage:true});backgroundMAD=await page.evaluate(png=>measureBare(png),bare.toString('base64'));await page.locator('#probe').evaluate(n=>n.style.visibility='');}
    const png=await page.screenshot({fullPage:true});const measured=await page.evaluate(png=>measure(png),png.toString('base64'));metrics.push({...measured,backgroundMAD,optionCount:options.length,referenceComponent:options.length?'Select':'Menu'});
    if(!fit)fs.writeFileSync(path.join(base,scene+'-pc.png'),png);
   }
   const score=metrics.reduce((s,m)=>s+m.mae+m.rimMAE*.3+Math.max(0,.92-m.ssim)*100,0)/metrics.length;
   const trial={popup,score,metrics};trials.push(trial);
   if(!best||score<best.score)best=trial;
  }
  let negativeControl=null;
  if(!fit&&scenes.length){
   // The old custom-surface menu profile must not pass as the real system Menu.
   const scene=scenes[0],nodes=flatten(JSON.parse(fs.readFileSync(path.join(base,scene+'-layout.json'),'utf8'))),rect=bounds(nodes.find(a=>a.type==='Menu'));
   const texts=nodes.filter(a=>a.type==='Text'&&a.text).map(bounds).filter(r=>r[0]>=rect[0]&&r[1]>=rect[1]&&r[2]<=rect[2]&&r[3]<=rect[3]);
   await page.evaluate(()=>LxGlass.calibrate({popup:{sigma:1.9,edgeSigma:1.9,alpha:.88,color:[26,28,31]}}));
   const semantics=nodes.filter(a=>a.type==='Option'&&a.selected==='true'&&a.backgroundColor&&a.backgroundColor!=='#00000000').map(a=>({bounds:bounds(a),color:a.backgroundColor,role:'selected-option'}));
   const options=nodes.filter(a=>a.type==='Option').map(a=>({bounds:bounds(a),selected:a.selected==='true'}));
   await page.evaluate(v=>setup(v),{bounds:rect,texts,semantics,options,scene});
   const png=await page.screenshot({fullPage:true});negativeControl=await page.evaluate(png=>measure(png),png.toString('base64'));
   fs.writeFileSync(path.join(base,'negative-old-profile.png'),png);
  }
  const references=[...scenes.flatMap(scene=>['on.png','repeat.png','layout.json'].map(suffix=>'qa/material/artifacts/native-menu-20261019/'+scene+'-'+suffix)),...['capture.json','native-off-grid.png','native-off-type.png','native-off.png'].map(file=>'qa/material/artifacts/native-menu-20261019/'+file)].filter(file=>fs.existsSync(path.resolve(file)));
  for(const override of Object.values(capture.referenceOverrides||{}))for(const key of ['on','repeat','layout','rejected'])if(override[key])references.push('qa/material/artifacts/native-menu-20261019/'+override[key]);
  const negativeControlRejected=!!negativeControl&&!passes(negativeControl);
  const status=!fit&&scenes.length===expected.length&&negativeControlRejected&&best.metrics.every(m=>m.referenceComponent==='Select'&&m.optionCount>=3&&passes(m)&&m.repeatMAD!==null&&m.repeatMAD<1&&m.backgroundMAD<.5)?'PASS':fit?'CANDIDATE':'INCOMPLETE_OR_FAIL';
  const report={status,mode:fit?'candidate':'default-source',best,trials,negativeControl,negativeControlRejected,hashes:hashes([...sourceFiles,...references,'qa/material/system-menu.cjs','qa/material/system-menu-lab.html','qa/material/native/NativeMenuLab.ets','apps/harmony/entry/src/main/ets/components/NativePlayer.ets','apps/harmony/entry/src/main/ets/components/NativeSettings.ets'])};
  fs.writeFileSync(path.join(base,fit?'fit.json':'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(best));
  fs.writeFileSync(path.join(base,'trial-'+Date.now()+'.json'),JSON.stringify(report,null,2));
  if(!fit&&status!=='PASS')process.exitCode=1;
 }finally{await app.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
