const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out=path.resolve('.research/catalogue-ui-20261019');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const app=await _electron.launch({executablePath:path.resolve('apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.resolve('apps/desktop'),'--disable-features=CalculateNativeWinOcclusion','--force-device-scale-factor=1'],env:{...process.env,MINERADIO_STARTUP_QA_HIDDEN:'1',MINERADIO_STARTUP_QA_USER_DATA:path.join(out,'profile-'+Date.now()),MINERADIO_NO_DESKTOP_SHORTCUT:'1',MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE:'1'}});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>window.__lxmine?.S&&window.LxPagination);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(1200,800);w.setOpacity(0);w.webContents.setBackgroundThrottling(false);w.showInactive();});
  await page.evaluate(()=>document.querySelector('#splash')?.remove());
  await app.evaluate(({ipcMain})=>{
   ipcMain.removeHandler('lxmine-search');
   ipcMain.handle('lxmine-search',async(_,{query,source,type,page,limit})=>{
    if(query==='old')await new Promise(r=>setTimeout(r,200));
    const total=137,first=(page-1)*limit,count=Math.max(0,Math.min(limit,total-first));
    return {items:Array.from({length:count},(_,n)=>{const id=String(first+n);return type==='music'?{id,name:query+'-'+id,provider:source,source,artist:'Fixture'}:{id,name:query+'-'+id,source,kind:type,artist:'Fixture'};}),total,page,limit};
   });
  });
  await page.locator('#search-node').click();await page.locator('#search-input').fill('完整列表');await page.locator('#search-input').press('Enter');
  const tests=[];
  for(const [kind,label]of [['music','综合'],['songlist','歌单'],['artist','歌手'],['album','专辑'],['lyric','歌词'],['podcast','播客']]){
   if(kind!=='music')await page.locator('#search-chips button').filter({hasText:new RegExp('^'+label+'$')}).click();
   await page.waitForFunction(k=>!window.__lxmine.S.search.loading&&(k==='music'?window.__lxmine.S.search.results:window.__lxmine.S.search.entities).length>0,kind);
   const value=await page.evaluate(k=>({kind:k,count:(k==='music'?window.__lxmine.S.search.results:window.__lxmine.S.search.entities).length,rendered:document.querySelectorAll('#search-results .search-row').length,more:document.querySelectorAll('.load-more').length}),kind);
   const expected=['music','songlist'].includes(kind)?548:137;
   assert.equal(value.count,expected);assert.equal(value.rendered,expected);assert.equal(value.more,0);tests.push(value);
  }
  await page.locator('#search-input').fill('old');await page.locator('#search-input').press('Enter');
  await page.locator('#search-input').fill('new');await page.locator('#search-input').press('Enter');
  await page.waitForFunction(()=>!window.__lxmine.S.search.loading&&window.__lxmine.S.search.query==='new');await page.waitForTimeout(400);
  assert(await page.evaluate(()=>window.__lxmine.S.search.entities.every(x=>x.name.startsWith('new-'))));
  await page.screenshot({path:path.join(out,'search-complete.png')});
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'PASS',tests,cancellation:true},null,2));console.log(JSON.stringify(tests));
 }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
