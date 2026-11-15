const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {collectAll}=require('../../apps/desktop/public/lxmine/pagination.js');
const os=require('os'),path=require('path');
const {importPlaylist}=require('../../apps/desktop/shared/lx-playlists.cjs');
const {BuiltInPlaylistLibrary}=require('../../apps/desktop/desktop/built-in-playlist-library.js');
const rows=n=>Array.from({length:n},(_,id)=>({source:'wy',id:String(id)}));
test('all rows beyond old 30/50/500/1000 caps, preserving order',async()=>{
 const all=rows(2307),calls=[];
 const result=await collectAll(async(page,limit)=>{calls.push(page);return {items:all.slice((page-1)*limit,page*limit),total:all.length};});
 assert.deepEqual(result.items,all);assert.equal(calls.length,47);assert.equal(result.complete,true);
});
test('expanded group entries do not prematurely satisfy provider page totals',async()=>{
 const result=await collectAll(async(page)=>({items:page<=3?rows(100).map(r=>({...r,id:page+'-'+r.id})):[],total:150}));
 assert.equal(result.items.length,300);assert.equal(result.page,3);
});
test('provider repeating its first page terminates with an explicit partial warning',async()=>{
 const result=await collectAll(async()=>({items:rows(50),total:1000}));
 assert.equal(result.items.length,50);assert.equal(result.complete,false);assert.match(result.warning,/停止返回/);
});
test('retry a failed page, preserve earlier results if still unavailable',async()=>{
 let calls=0;
 const result=await collectAll(async(page)=>{calls++;if(page===2)throw Error('offline');return {items:rows(50),total:200};});
 assert.equal(calls,3);assert.equal(result.items.length,50);assert.equal(result.complete,false);
});
test('query cancellation prevents subsequent page requests',async()=>{
 let cancelled=false,calls=0;
 const result=await collectAll(async()=>{calls++;return {items:rows(50),total:1000};},{cancelled:()=>cancelled,onPage:()=>{cancelled=true}});
 assert.equal(calls,1);assert.equal(result.cancelled,true);
});
test('same numeric ID from different providers is retained',async()=>{
 const result=await collectAll(async()=>({items:[{source:'wy',id:'1'},{source:'kw',id:'1'}],total:2,hasMore:false}));assert.equal(result.items.length,2);
});

test('large imported playlists survive persistence beyond the old 5000-track cap',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lxmine-large-library-'));
 try{
  const library=new BuiltInPlaylistLibrary({userDataPath:directory});
  await library.importLists([{name:'large',tracks:rows(6007).map(r=>({...r,name:'Song '+r.id,provider:'wy'}))}]);
  const reopened=new BuiltInPlaylistLibrary({userDataPath:directory});
  assert.equal(reopened.listSync().playlists[0].trackCount,6007);
  const id=reopened.listSync().playlists[0].id;
  const result=await collectAll(async(page,limit)=>{const r=reopened.page(id,{offset:(page-1)*limit,limit});return {...r,items:r.tracks};},{limit:500});
  assert.equal(result.items.length,6007);assert.equal(result.complete,true);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});

test('QQ playlist pagination advances by actual rows when provider returns fewer than requested',async()=>{
 const calls=[],all=Array.from({length:807},(_,id)=>({id,mid:'qq-'+id,name:'Song '+id,singer:[{name:'Artist'}],album:{id:1,name:'Album'}}));
 const result=await importPlaylist('12345','tx',{json:async(url,options)=>{
  if(url.includes('fcg_ucc_getcdinfo'))return {code:0,cdlist:[{dissname:'Large',total_song_num:all.length,songlist:all.slice(0,100)}]};
  const offset=JSON.parse(options.body).req_1.param.song_begin;calls.push(offset);
  return {code:0,req_1:{code:0,data:{total_song_num:all.length,dirinfo:{title:'Large'},songlist:all.slice(offset,offset+200)}}};
 }});
 assert.deepEqual(calls,[0,200,400,600,800]);assert.equal(result[0].songs.length,807);
});
test('playlist full endpoint walks the complete index and never skips missing metadata',async()=>{
 const source=fs.readFileSync(require.resolve('../../apps/desktop/server.js'),'utf8');
 const a=source.indexOf('async function fetchAllNeteasePlaylistTracks(id)'),b=source.indexOf('\nasync function fetchNeteasePlaylistTracksPage',a);
 const all=rows(1307),calls=[];
 const context={NETEASE_TRACK_STREAM_PAGE_SIZE:100,fetchNeteasePlaylistTracksPage:async(id,limit,offset)=>{calls.push(offset);return {rawTracks:all.slice(offset,offset+limit),playlistMeta:{id,trackCount:all.length},total:all.length,nextOffset:Math.min(offset+limit,all.length),hasMore:offset+limit<all.length}},mergeUniqueNeteaseTracks:(out,list,seen)=>{for(const item of list)if(!seen.has(item.id)){seen.add(item.id);out.push(item)}}};
 vm.createContext(context);vm.runInContext(source.slice(a,b)+';this.run=fetchAllNeteasePlaylistTracks;',context);
 const result=await context.run('large');assert.equal(result.rawTracks.length,1307);assert.equal(calls.at(-1),1300);
});
