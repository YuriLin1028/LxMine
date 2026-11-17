const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const {root,hashes,sourceFiles}=require('./common.cjs');
process.chdir(root);
const dir=path.join(__dirname,'artifacts'),approval=path.join(dir,'approved.json');
fs.mkdirSync(dir,{recursive:true});
if(fs.existsSync(approval))fs.copyFileSync(approval,path.join(dir,'approved-before-'+Date.now()+'.json'));
fs.writeFileSync(approval,JSON.stringify({status:'RUNNING',startedAt:new Date().toISOString()}));
try{
  const source=hashes(sourceFiles);
  const execute=(file,args=[])=>{const r=cp.spawnSync(process.execPath,[path.join(__dirname,file),...args],{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000,env:{...process.env,LM_FIT:'',LM_PACKAGED:'',LM_TRACE:''}});if(r.status!==0){process.stderr.write(r.stdout||'');process.stderr.write(r.stderr||'');throw Error(`${file} ${args.join(' ')} failed (${r.status})`);}};
  console.log('Comparing native grid/type references, contours, shadows and negative control…');
  execute('compare.cjs');
  const pixels=JSON.parse(fs.readFileSync(path.join(dir,'pixel-report.json')));
  assert.equal(pixels.status,'PASS');assert.equal(pixels.calibrationOverride,false);assert.equal(pixels.negativeControlPassed,false);
  let systemMenus,popupMotion;
  const nativePopupFiles=['capture.json','entry-heldout.json','motion-track.json','native.mp4'];
  if(nativePopupFiles.every(file=>fs.existsSync(path.join(dir,'native-menu-20261019',file)))){
    console.log('Comparing actual system Menu and Select on paired native backgrounds…');
    execute('system-menu.cjs');
    systemMenus=JSON.parse(fs.readFileSync(path.join(dir,'native-menu-20261019/report.json')));
    assert.equal(systemMenus.status,'PASS');
    execute('popup-motion.cjs');
    popupMotion=JSON.parse(fs.readFileSync(path.join(dir,'native-menu-20261019/motion/report.json')));
    assert.equal(popupMotion.status,'PASS');
  }else{
    console.log('Legacy native popup captures unavailable. Verifying byte-identical optics and unchanged popup styles/motion against the restored Windows release.');
    execute('map-equivalence.cjs');
    systemMenus=JSON.parse(fs.readFileSync(path.join(dir,'map-equivalence.json')));
    assert.equal(systemMenus.status,'SOURCE_PARITY');
    popupMotion=systemMenus;
  }
  for(const scene of pixels.pixels){
    assert(scene.smoothness&&scene.smoothness.length,`No smoothness samples for ${scene.scene}`);
    assert(scene.smoothness.every(x=>x.ratio<=1.5),`Sphere contour roughness exceeds native gate in ${scene.scene}`);
    if(scene.shoulder&&scene.shoulder.samples.length) assert(scene.shoulder.maxPhaseError<=.75,`Capsule shoulder displacement exceeds gate in ${scene.scene}`);
  }
  const motion=[];
  for(const scenario of ['optics','app','resize']){
    console.log('Real input / composed Electron / frame gate:',scenario);
    execute('motion.cjs',[scenario]);
    const report=JSON.parse(fs.readFileSync(path.join(dir,'motion',scenario,'report.json')));
    assert.deepEqual(report.sourceHashes,source);motion.push(report);
    // Electron's GPU/compositor teardown is asynchronous. Let the previous
    // composed window settle before measuring the next fresh scenario; without
    // this, resize inherits a one-frame GPU spike from the playback scenario.
    if(scenario!=='resize')Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20000);
  }
  execute('stage-power.cjs');
  const stagePower=JSON.parse(fs.readFileSync(path.join(dir,'stage-power/report.json')));
  assert.equal(stagePower.status,'PASS');
  assert.deepEqual(stagePower.sourceHashes,source);
  execute('player-visibility.cjs');
  const playerVisibility=JSON.parse(fs.readFileSync(path.join(dir,'player-visibility/report.json')));
  assert.equal(playerVisibility.status,'PASS');
  assert.deepEqual(playerVisibility.sourceHashes,source);
  execute('control-press.cjs');
  const controlPress=JSON.parse(fs.readFileSync(path.join(dir,'control-press/report.json')));
  assert.equal(controlPress.status,'PASS');
  assert.deepEqual(controlPress.sourceHashes,source);
  execute('stage-background.cjs');
  const stageBackground=JSON.parse(fs.readFileSync(path.join(dir,'stage-background/report.json')));
  assert.equal(stageBackground.status,'PASS');
  assert.deepEqual(stageBackground.sourceHashes,source);
  assert.deepEqual(hashes(sourceFiles),source,'Source changed during verification');
  for(const [file,hash] of Object.entries(source))assert.equal(pixels.hashes[file],hash);
  const harness=['qa/material/check.cjs','qa/material/motion.cjs','qa/material/stage-power.cjs','qa/material/player-visibility.cjs','qa/material/control-press.cjs','qa/material/stage-background.cjs','qa/material/common.cjs','apps/desktop/build/verify-material.cjs','apps/desktop/package.json'];
  const report={...pixels,status:'PASS',verifiedAt:new Date().toISOString(),systemMenus,popupMotion,motion,stagePower,playerVisibility,controlPress,stageBackground,hashes:{...pixels.hashes,...systemMenus.hashes,...popupMotion.hashes,...hashes(harness)}};
  fs.writeFileSync(approval,JSON.stringify(report,null,2));
  require(path.join(root,'apps/desktop/build/verify-material.cjs'))();
  console.log('PASS: source-bound native pixel and motion gates.');
}catch(error){fs.writeFileSync(approval,JSON.stringify({status:'FAIL',failedAt:new Date().toISOString(),error:error.stack},null,2));console.error(error);process.exitCode=1;}
