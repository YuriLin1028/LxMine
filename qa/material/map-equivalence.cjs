/* Differential check against the immutable, previously shipped renderer. */
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const original=path.resolve('releases/windows/runtime/bundle-eef7f60599fed7cb/resources/app/public/lxmine/material.js');
const current=path.resolve('apps/desktop/public/lxmine/material.js');
const {hashes,sourceFiles}=require('./common.cjs');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex'),'444e6988494eee12578975c25e135caf95e9a5d014ea106779409ed879f20c55');
function render(file,w,h,r,kind,profile={}){
 const maps=[];const element=()=>({style:{setProperty(){}},dataset:{},append(){},setAttribute(){},remove(){},querySelectorAll(){return []}});
 const context={window:{},location:{search:'?materialLab=1'},URLSearchParams,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>1,matchMedia:()=>({matches:false}),getComputedStyle:()=>({borderTopWidth:'0',borderRightWidth:'0',borderBottomWidth:'0',borderLeftWidth:'0',borderTopLeftRadius:String(r),borderTopRightRadius:String(r),borderBottomRightRadius:String(r),borderBottomLeftRadius:String(r),borderRadius:String(r)}),document:{querySelector:element,createElementNS:element,createElement:tag=>{
  if(tag!=='canvas')return element();const canvas={width:0,height:0};let pixels;
  canvas.getContext=()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:data=>pixels=data.data});
  canvas.toDataURL=()=>{maps.push(Buffer.from(pixels));return 'data:image/png;base64,AA==';};canvas.toBlob=callback=>{maps.push(Buffer.from(pixels));callback(null);};return canvas;
 }}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context);context.window.LxGlass.calibrate(profile);
 const host={...element(),isConnected:true,offsetWidth:w,offsetHeight:h,matches:selector=>kind==='popup'?selector==='.anchored-menu':kind==='sheet'?selector==='.modal'||selector==='.modal,.popover':kind==='menu'?selector==='.popover'||selector==='.modal,.popover':false};
 const start=performance.now();context.window.LxGlass.prepare(host);return {maps,ms:performance.now()-start};
}
const scenes=[[244,52,26,'control'],[244,72,36,'control'],[64,64,32,'control'],[212,112,28,'control'],[44,44,22,'control'],[540,54,27,'control'],[1240,44,22,'control'],[900,760,24,'control'],[1000,800,28,'control'],[152,152,20,'popup'],[162,582,20,'popup'],[600,700,32,'sheet']];
const reports=[];
for(const scene of scenes){const before=render(original,...scene),after=render(current,...scene);assert.equal(before.maps.length,2);assert.equal(after.maps.length,2);for(let i=0;i<2;i++)assert(before.maps[i].equals(after.maps[i]),'Optical map bytes changed: '+scene.join('/')+' channel '+i);reports.push({scene,referenceMs:before.ms,currentMs:after.ms,bytes:after.maps.reduce((n,b)=>n+b.length,0)});}
for(const profile of [{decay:4,tangentDecay:3,tangentCap:12,envOffset:2},{decay:1,tangentDecay:5,envOffset:-4,envWidth:5,envStart:2}]){const before=render(original,840,540,28,'control',profile),after=render(current,840,540,28,'control',profile);for(let i=0;i<2;i++)assert(before.maps[i].equals(after.maps[i]),'Calibration map bytes changed');}
const profile=file=>JSON.stringify(vm.runInNewContext('('+fs.readFileSync(file,'utf8').match(/let optical = (\{[^\r\n]+\});/)[1]+')'));
assert.equal(profile(current),profile(original),'Optical profile changed from the restored Windows release');
const baselineDirectory=path.dirname(original);
const popupRules=file=>Array.from(fs.readFileSync(file,'utf8').matchAll(/([^{}]+)\{([^{}]*)\}/g))
 .filter(match=>/anchored-menu|menu-|\.glass\.(?:modal|popover)/.test(match[1]) && !match[1].includes('body.light-theme'))
 .map(match=>(match[1]+'{'+match[2]+'}').replace(/\s+/g,' ').trim());
assert.deepEqual(popupRules(path.join(baselineDirectory,'style.css')),popupRules('apps/desktop/public/lxmine/style.css'),'Popup styles changed');
const popupMotion=fs.readFileSync(path.join(baselineDirectory,'popup-motion.js'));
assert(popupMotion.equals(fs.readFileSync('apps/desktop/public/lxmine/popup-motion.js')),'Popup motion changed');
const referenceFiles=['material.js','style.css','popup-motion.js'].map(file=>path.relative(process.cwd(),path.join(baselineDirectory,file)).replaceAll('\\','/'));
const report={status:'SOURCE_PARITY',reference:original,referenceMaterialSHA256:'444e6988494eee12578975c25e135caf95e9a5d014ea106779409ed879f20c55',
 opticalProfileEqual:true,mapBytesEqual:true,popupStylesEqual:true,popupMotionEqual:true,nativePopupReferencesAvailable:false,popupComparisonAppearance:'original dark appearance',
 scenes:reports.length,calibrationVariants:2,reports,hashes:hashes([...sourceFiles,...referenceFiles,'qa/material/map-equivalence.cjs'])};
fs.writeFileSync(path.join(__dirname,'artifacts/map-equivalence.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,scenes:reports.length,calibrationVariants:2,opticalProfileEqual:true,popupStylesEqual:true,popupMotionEqual:true}));
