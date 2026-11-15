const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path');
const {root}=require('./common.cjs');
const scene=process.argv[2]||'type';
if(!['grid','type'].includes(scene))throw Error('Expected grid or type');
(async()=>{
  let source=fs.readFileSync(path.join(__dirname,'fixture.svg'),'utf8');
  if(scene==='grid')source=source.replace(/<text\b[\s\S]*?<\/text>/g,'');
  const app=await _electron.launch({executablePath:path.join(root,'apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.join(__dirname,'electron-lab.cjs'),'--force-device-scale-factor=1']});
  try{
    const page=await app.firstWindow();await page.waitForLoadState();
    const data=await page.evaluate(async svg=>{const i=new Image();i.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await i.decode();const c=document.createElement('canvas');c.width=1260;c.height=2520;c.getContext('2d').drawImage(i,0,0,1260,2520);return c.toDataURL().split(',')[1]},source);
    fs.writeFileSync(path.join(__dirname,'fixture.png'),Buffer.from(data,'base64'));console.log('Native fixture:',scene);
  }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
