const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {discovery}=require('../../apps/desktop/desktop/lx/catalogue.cjs');
const out=path.resolve('qa/catalogue/artifacts/home-live');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const report=[];
 for(const source of ['wy','tx','kw','kg']){
  const start=Date.now(),feed=await discovery.home(source);
  fs.writeFileSync(path.join(out,source+'.json'),JSON.stringify(feed,null,2));
  const populated=feed.sections.filter(s=>s.items.length);
  assert(populated.length>=8,source+' has too few public sections');
  assert(feed.sections.every(s=>s.items.every(item=>item.source===source)),source+' mixed another provider');
  assert(!feed.sections.some(s=>/每日推荐|私人FM|登录/.test(s.title)));
  const chart=feed.charts.find(item=>source==='kw'?item.id==='16':source==='tx'?item.id==='26':true);
  const songs=await discovery.tracks(chart);assert(songs.items.length>=100,source+' chart unexpectedly short');
  assert(songs.complete!==false,songs.warning);assert(songs.items.every(s=>s.source===source&&s.name&&s.id));
  const playlist=feed.playlists[0],listSongs=await discovery.tracks(playlist);
  assert(listSongs.items.length>0,source+' playlist empty');assert(listSongs.complete!==false,listSongs.warning);
  report.push({source,elapsedMs:Date.now()-start,sections:feed.sections.map(s=>({title:s.title,count:s.items.length,error:s.error})),chart:{id:chart.id,total:songs.items.length},playlist:{id:playlist.id,total:listSongs.items.length}});
  console.log(JSON.stringify(report.at(-1)));
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'PASS',report},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
