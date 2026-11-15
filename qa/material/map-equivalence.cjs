/* Differential check against the immutable, previously shipped renderer. */
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const original=path.resolve('releases/windows/runtime/bundle-a83d66593bef98b0/resources/app/public/lxmine/material.js');
const current=path.resolve('apps/desktop/public/lxmine/material.js');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex'),'f722b175ea21a8222caacc00ac01e016dce1ab98f1e6c49f501a742a8d286d03');
function render(file,w,h,r,kind,profile={}){
 const maps=[];const element=()=>({style:{setProperty(){}},dataset:{},append(){},setAttribute(){},remove(){},querySelectorAll(){return []}});
 const context={window:{},location:{search:'?materialLab=1'},URLSearchParams,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>1,matchMedia:()=>({matches:false}),getComputedStyle:()=>({borderTopWidth:'0',borderRightWidth:'0',borderBottomWidth:'0',borderLeftWidth:'0',borderTopLeftRadius:String(r),borderTopRightRadius:String(r),borderBottomRightRadius:String(r),borderBottomLeftRadius:String(r),borderRadius:String(r)}),document:{querySelector:element,createElementNS:element,createElement:tag=>{
  if(tag!=='canvas')return element();const canvas={width:0,height:0};let pixels;
  canvas.getContext=()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:data=>pixels=data.data});
  canvas.toDataURL=()=>{maps.push(Buffer.from(pixels));return 'data:image/png;base64,AA==';};return canvas;
 }}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context);context.window.LxGlass.calibrate(profile);
 const host={...element(),isConnected:true,offsetWidth:w,offsetHeight:h,matches:selector=>kind==='popup'?selector==='.anchored-menu':kind==='sheet'?selector==='.modal'||selector==='.modal,.popover':kind==='menu'?selector==='.popover'||selector==='.modal,.popover':false};
 const start=performance.now();context.window.LxGlass.prepare(host);return {maps,ms:performance.now()-start};
}
const scenes=[[244,52,26,'control'],[244,72,36,'control'],[64,64,32,'control'],[212,112,28,'control'],[44,44,22,'control'],[540,54,27,'control'],[1240,44,22,'control'],[900,760,24,'control'],[1000,800,28,'control'],[152,152,20,'popup'],[162,582,20,'popup'],[600,700,32,'sheet']];
const reports=[];
for(const scene of scenes){const before=render(original,...scene),after=render(current,...scene);assert.equal(before.maps.length,2);assert.equal(after.maps.length,2);for(let i=0;i<2;i++)assert(before.maps[i].equals(after.maps[i]),'Optical map bytes changed: '+scene.join('/')+' channel '+i);reports.push({scene,referenceMs:before.ms,currentMs:after.ms,bytes:after.maps.reduce((n,b)=>n+b.length,0)});}
for(const profile of [{decay:4,tangentDecay:3,tangentCap:12,envOffset:2},{decay:1,tangentDecay:5,envOffset:-4,envWidth:5,envStart:2}]){const before=render(original,840,540,28,'control',profile),after=render(current,840,540,28,'control',profile);for(let i=0;i<2;i++)assert(before.maps[i].equals(after.maps[i]),'Calibration map bytes changed');}
fs.writeFileSync(path.resolve('.research/map-equivalence-dockunlock.json'),JSON.stringify({status:'PASS',reference:original,reports},null,2));console.log(JSON.stringify({status:'PASS',scenes:reports.length,calibrationVariants:2,reports:reports.filter(r=>r.scene[0]>=840)}));
