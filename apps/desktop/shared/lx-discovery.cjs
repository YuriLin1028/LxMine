/* Public discovery protocols referenced from LX Music musicSdk (Apache-2.0).
 * Independent normalization; no provider account or playback URL is used. */
(function(root){'use strict';
const _discCache = new Map();
function _cached(key, ttlMs, fn){
 const now=Date.now();
 const hit=_discCache.get(key);
 if(hit&&hit.exp>now)return hit.promise;
 const p=Promise.resolve().then(fn).then(val=>{
  _discCache.set(key,{promise:Promise.resolve(val),exp:Date.now()+ttlMs});
  if(_discCache.size>120)_discCache.delete(_discCache.keys().next().value);
  return val;
 }).catch(err=>{
  const cur=_discCache.get(key);
  if(cur&&cur.promise===p)_discCache.delete(key);
  throw err;
 });
 _discCache.set(key,{promise:p,exp:now+15000});
 return p;
}
function createDiscovery(io){
 const json=io.json, normalize=io.normalizeSong;
 const collect=io.collectAll;
 const headers=source=>({headers:{Referer:source==='tx'?'https://y.qq.com/':'https://music.163.com/','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'}});
 const qq=(module,method,param)=>json('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data='+encodeURIComponent(JSON.stringify({comm:{cv:1602,ct:20},request:{module,method,param}})),headers('tx')).then(r=>{if(r.code||r.request?.code)throw Error('QQ 公开推荐暂不可用');return r.request.data;});
 const clean=v=>String(v||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/<[^>]*>/g,'');
 const art=v=>clean(v).replace('{size}','400').replace(/^\/\//,'https://').replace(/^http:/,'https:');
 function playlist(raw,source,kind='songlist'){
  const basic=raw.basic||raw.Playlist?.basic||raw;
  const rawCover=basic.cover?.medium_url||basic.cover?.default_url||basic.coverImgUrl||basic.picUrl||basic.frontPicUrl||basic.headPicUrl||basic.mbFrontPicUrl||basic.listenPicUrl||basic.banner_9||basic.banner7url||basic.imgurl||basic.img||basic.pic5||basic.pic2||basic.pic||'';
  return {source,kind,id:String(basic.tid||basic.specialid||basic.topId||basic.rankid||basic.id||''),name:clean(basic.title||basic.specialname||basic.name||basic.rankname),cover:art(rawCover),count:Number(basic.song_cnt||basic.trackCount||basic.songcount||basic.total||basic.totalNum)||0,playCount:Number(basic.play_cnt||basic.playCount||basic.listencnt||basic.playcount)||0,period:basic.period||''};
 }
 async function section({source='wy',type='hot',category='',page=1,limit=36}){
  if(!['wy','tx','kw','kg'].includes(source))throw Error('未知首页平台');
  const cacheKey=`sec:${source}:${type}:${category}:${page}:${limit}`;
  return _cached(cacheKey, type==='charts'?180000:120000, async()=>{
  let items=[],total=0;
  if(type==='charts'){
   if(source==='wy'){const r=await json('https://music.163.com/api/toplist/detail',headers(source));items=(r.list||[]).map(x=>playlist(x,source));}
   if(source==='tx'){const r=await qq('musicToplist.ToplistInfoServer','GetAll',{});items=(r.group||[]).flatMap(g=>g.toplist||[]).map(x=>playlist(x,source,'chart'));}
   if(source==='kg'){const r=await json('http://mobilecdnbj.kugou.com/api/v5/rank/list?version=9108&plat=0&showtype=2&parentid=0&apiver=6&area_code=1&withsong=1');items=(r.data?.info||[]).map(x=>playlist(x,source,'chart'));}
   if(source==='kw'){const r=await json('http://wapi.kuwo.cn/api/pc/bang/list');const seen=new Set();function walk(node){if(node.sourceid&&String(node.source)==='2'&&!seen.has(String(node.sourceid))){seen.add(String(node.sourceid));items.push(playlist({...node,id:node.sourceid,coverImgUrl:node.pic5||node.pic2||node.pic},source,'chart'));}for(const child of node.child||[])walk(child);}walk(r);}
   return {items,total:items.length,hasMore:false};
  }
  if(source==='wy'){
   if(type==='quality'){
    let before=0,r;for(let n=1;n<=page;n++){r=await json('https://music.163.com/api/playlist/highquality/list?'+new URLSearchParams({cat:category||'全部',limit:String(limit),before:String(before)}),headers(source));if(r.code!==200)throw Error('网易云精品歌单暂不可用');if(n<page&&!r.more)return {items:[],total:Number(r.total)||0,hasMore:false};before=Number(r.lasttime||r.playlists?.at(-1)?.updateTime)||0;}
    return {items:(r.playlists||[]).map(x=>playlist(x,source)),total:Number(r.total)||0,hasMore:r.more};
   }
   if(type==='recommend'&&!category){const r=await json('https://music.163.com/api/personalized/playlist?limit='+limit,headers(source));items=(r.result||[]).map(x=>playlist(x,source));total=items.length;return {items,total,hasMore:false};}
   const r=await json('https://music.163.com/api/playlist/list?'+new URLSearchParams({cat:category||'全部',order:type==='latest'?'new':'hot',offset:String((page-1)*limit),limit:String(limit)}),headers(source));if(r.code!==200)throw Error('网易云歌单暂不可用');items=(r.playlists||[]).map(x=>playlist(x,source));total=Number(r.total)||items.length;
  }else if(source==='kw'){
   const r=await json('http://wapi.kuwo.cn/api/pc/classify/playlist/'+(category?'getTagPlayList':'getRcmPlayList')+'?loginUid=0&loginSid=0&appUid=76039576&'+new URLSearchParams({pn:String(page),rn:String(limit),order:type==='latest'?'new':'hot',...(category?{id:category}:{})}));
   if(r.code!==200)throw Error('酷我推荐暂不可用');items=(r.data?.data||[]).map(x=>playlist(x,source));total=Number(r.data?.total)||items.length;
  }else if(source==='kg'){
   const r=await json('http://www2.kugou.kugou.com/yueku/v9/special/getSpecial?is_ajax=1&cdn=cdn&'+new URLSearchParams({t:({recommend:'5',latest:'7',favorite:'3',rising:'8'})[type]||'6',p:String(page),...(category?{c:category}:{})}));
   items=(r.special_db||[]).map(x=>playlist(x,source));total=Number(r.total||r.total_count)||0;
  }else{
   if(type==='recommend'&&!category){const r=await qq('music.playlist.PlaylistSquare','GetRecommendWhole',{IsReqFeed:true,FeedReq:{From:(page-1)*limit,Size:limit}});items=(r.FeedRsp?.List||[]).map(x=>playlist(x,source));total=Number(r.FeedRsp?.FromLimit)||items.length;return {items,total,hasMore:!!r.FeedRsp?.HasMore};}
   const id=Number(category)||(type==='latest'?2:3),r=await qq('playlist.PlayListCategoryServer','get_category_content',{titleid:id,caller:'0',category_id:id,size:limit,page:page-1,use_page:1});items=(r.content?.v_item||[]).map(x=>playlist(x,source));total=Number(r.content?.total_cnt)||items.length;
  }
  return {items:items.filter(x=>x.id&&x.name),total,page,limit};
  });
 }
 async function categories(source){
  if(source==='wy')return ['华语','欧美','粤语','流行','民谣','电子','轻音乐','古风'].map(name=>({id:name,name}));
  return _cached(`cat:${source}`, 600000, async()=>{
   if(source==='tx'){const r=await qq('playlist.PlaylistAllCategoriesServer','get_all_categories',{qq:''});return (r.v_group||[]).flatMap(g=>g.v_item||[]).filter(x=>x.id&&x.name).map(x=>({id:String(x.id),name:clean(x.name)}));}
   if(source==='kw'){const r=await json('http://wapi.kuwo.cn/api/pc/classify/playlist/getTagList?cmd=rcm_keyword_playlist&user=0&prod=kwplayer_pc_9.0.5.0&vipver=9.0.5.0&source=kwplayer_pc_9.0.5.0&loginUid=0&loginSid=0&appUid=76039576');return (r.data||[]).flatMap(g=>g.data||[]).filter(x=>x.id&&x.name&&String(x.digest)!=='43').map(x=>({id:String(x.id),name:clean(x.name)}));}
   const r=await json('http://www2.kugou.kugou.com/yueku/v9/special/getSpecial?is_smarty=1&cdn=cdn&t=5');
   const list=[];function walk(x){if(!x||typeof x!=='object')return;if(x.special_id&&x.special_name)list.push({id:String(x.special_id),name:clean(x.special_name)});for(const v of Object.values(x))if(typeof v==='object')if(Array.isArray(v))v.forEach(walk);else walk(v);}walk(r);return list;
  });
 }
 async function tracks(item){
  const source=item.source||'wy',id=item.id;
  if(item.kind!=='chart'||source==='wy'){
   if(source==='wy'){
    if(typeof io.importPlaylist==='function'){
     try{const lists=await io.importPlaylist(String(id),'wy');const pl=lists&&lists[0];if(pl&&Array.isArray(pl.songs)&&pl.songs.length)return {items:pl.songs,total:pl.songs.length,complete:true,warning:pl.warning||''};}catch(_){}
    }
    let r;
    try{r=await json('https://music.163.com/api/v6/playlist/detail?id='+encodeURIComponent(id)+'&n=1000&s=0',headers(source));}catch(_){r=null;}
    if((!r||r.code!==200||!r.playlist)&&typeof io.linuxEncrypt==='function'){
     try{r=await json('https://music.163.com/api/linux/forward',{method:'POST',headers:{...headers(source).headers,'Content-Type':'application/x-www-form-urlencoded'},body:'eparams='+io.linuxEncrypt({method:'POST',url:'https://music.163.com/api/v3/playlist/detail',params:{id,n:100000,s:0}})});}catch(_){}
    }
    if(!r||r.code!==200||!r.playlist)throw Error('网易云歌单暂不可用');
    const ids=(r.playlist.trackIds||[]).map(x=>String(x.id)),byId=new Map((r.playlist.tracks||[]).map(x=>[String(x.id),x]));
    const missingBatches=[];
    for(let offset=0;offset<ids.length;offset+=50){const batch=ids.slice(offset,offset+50).filter(id=>!byId.has(id));if(batch.length)missingBatches.push(batch);}
    for(let bi=0;bi<missingBatches.length;bi+=3){
     const group=await Promise.all(missingBatches.slice(bi,bi+3).map(batch=>json('https://music.163.com/api/song/detail?ids='+encodeURIComponent(JSON.stringify(batch)),headers(source))));
     for(const detail of group){if(detail.code!==200)throw Error('歌曲详情暂不可用');for(const song of detail.songs||[])byId.set(String(song.id),song);}
    }
    const songs=(ids.length?ids.map(id=>byId.get(id)).filter(Boolean):Array.from(byId.values())).map(x=>normalize(x,source));const missing=ids.length-songs.length;
    return {items:songs,total:ids.length,complete:true,unavailable:missing,warning:missing>0?missing+' 首歌曲的平台资料暂不可获取，已显示其余全部歌曲':''};
   }
   if(source==='kg')return collect(async(page,limit)=>{const r=await json('http://mobilecdnbj.kugou.com/api/v3/special/song?specialid='+encodeURIComponent(id)+'&page='+page+'&pagesize='+limit+'&version=9108&plat=0');if(!Array.isArray(r.data?.info))throw Error('酷狗歌单暂不可用');return {items:r.data.info.map(x=>kgSong(x)),total:Number(r.data.total||r.data.songcount)||0};},{limit:100});
   const lists=await io.importPlaylist(String(id),source);return {items:lists[0]?.songs||[],complete:true};
  }
  return collect(async(page,limit)=>{
   if(source==='kw'){const r=await json('http://kbangserver.kuwo.cn/ksong.s?'+new URLSearchParams({from:'pc',fmt:'json',pn:String(page-1),rn:String(limit),type:'bang',data:'content',id,show_copyright_off:'0',pcmp4:'1',isbang:'1'}));if(!Array.isArray(r.musiclist))throw Error('酷我榜单暂不可用');return {items:r.musiclist.map(x=>normalize(x,source)),total:Number(r.num)||0};}
   if(source==='kg'){const r=await json('http://mobilecdnbj.kugou.com/api/v3/rank/song?version=9108&ranktype=1&plat=0&pagesize='+limit+'&area_code=1&page='+page+'&rankid='+id+'&with_res_tag=0&show_portrait_mv=1');if(!Array.isArray(r.data?.info))throw Error('酷狗榜单暂不可用');return {items:r.data.info.map(kgSong),total:Number(r.data.total)||0};}
   const r=await qq('musicToplist.ToplistInfoServer','GetDetail',{topId:Number(id),offset:(page-1)*limit,num:limit,period:item.period||''});return {items:(r.songInfoList||[]).map(x=>normalize(x,'tx')),total:Number(r.data?.totalNum||r.totalNum)||0};
  },{limit:100});
 }
 function kgSong(x){const parts=String(x.filename||x.name||'').split(' - ');return normalize({...x,name:x.songname||x.song_name||(parts.length>1?parts.slice(1).join(' - '):parts[0]),singer:x.singername||x.singer_name||(parts.length>1?parts[0]:''),hashes:{'128k':x.hash,'320k':x['320hash'],flac:x.sqhash}},'kg');}
 async function home(source){
  const specs=source==='wy'?[['playlists','推荐歌单','recommend'],['hot','热门歌单','hot'],['quality','精品歌单','quality'],['charts','排行榜','charts']]:source==='tx'?[['playlists','为你推荐歌单','recommend'],['hot','热门歌单','hot'],['latest','最新歌单','latest'],['charts','巅峰榜','charts']]:source==='kg'?[['playlists','精选歌单','recommend'],['hot','最热歌单','hot'],['latest','最新歌单','latest'],['favorite','热藏歌单','favorite'],['rising','飙升歌单','rising'],['charts','酷狗榜单','charts']]:[['playlists','热门推荐','recommend'],['latest','新晋歌单','latest'],['charts','酷我榜单','charts']];
  let tags=[];try{tags=await categories(source);}catch(_){}
  tags.slice(0,6).forEach(tag=>specs.push(['category-'+tag.id,tag.name,'hot',tag.id]));
  const sections=await Promise.all(specs.map(async([id,title,type,category])=>{try{const r=await section({source,type,category});return {id,title,kind:'playlist',items:r.items,request:{source,type,category:category||''}};}catch(e){return {id,title,kind:'playlist',items:[],error:e.message,request:{source,type,category:category||''}};}}));
  let newSongs=[];try{
   if(source==='wy'){const r=await json('https://music.163.com/api/personalized/newsong?limit=30',headers(source));newSongs=(r.result||[]).map(x=>normalize(x.song||x,source));}
   else {const chart=sections.find(x=>x.id==='charts').items[0];if(chart){const r=await tracks(chart);newSongs=r.items.slice(0,30);}}
  }catch(_){}
  sections.splice(1,0,{id:'newSongs',title:source==='wy'?'新歌速递':source==='tx'?'巅峰榜精选':source==='kg'?'TOP500 精选':'酷我榜单精选',kind:'song',items:newSongs});
  return {source,sections,playlists:sections[0].items,newSongs,charts:sections.find(x=>x.id==='charts').items,similar:[]};
 }
 // 合并首页用的轻量协议：并发拉取推荐/热门/榜单/分类与网易云新歌，减少串行往返延迟。
 async function homeLite(source){
  if(!['wy','tx','kw','kg'].includes(source))throw Error('未知首页平台');
  const catsPromise=categories(source).catch(()=>[]);
  const wyNewPromise=source==='wy'
   ? _cached('wy:newsong',120000,()=>json('https://music.163.com/api/personalized/newsong?limit=30',headers(source)).then(r=>(r.result||[]).map(x=>normalize(x.song||x,source)))).catch(()=>[])
   : null;
  const sections=await Promise.all([['recommend','recommend',''],['hot','hot',''],['charts','charts','']].map(async([id,type,category])=>{
   try{const r=await section({source,type,category});return {id,items:r.items.filter(x=>x.id&&x.name)};}
   catch(e){return {id,items:[]};}
  }));
  const pick=id=>(sections.find(x=>x.id===id)||{items:[]}).items;
  let newSongs=[];
  if(wyNewPromise){
   newSongs=await wyNewPromise;
  }else{
   try{const first=pick('charts')[0];if(first){const r=await tracks(first);newSongs=r.items.slice(0,30);}}catch(_){}
  }
  const cats=await catsPromise;
  return {source,recommend:pick('recommend'),hot:pick('hot'),charts:pick('charts'),newSongs,categories:cats.slice(0,8)};
 }
 async function similarSongs(song){
  const target=song&&typeof song==='object'?song:{};
  const name=clean(target.name||'').trim();
  const singer=clean(target.singer||target.artist||'').trim();
  const primaryArtist=singer.split(/[、/,，;&]+/).map(s=>s.trim()).find(Boolean)||'';
  const origKey=`${target.source||''}:${target.id||''}`;
  const normKey=(n,s)=>clean(n).toLowerCase().replace(/[\s\-_()（）【】[\]·.,!?'"`]+/g,'')+'|'+clean(s).split(/[、/,，;&]+/)[0].toLowerCase().replace(/\s+/g,'');
  const origNorm=normKey(name,singer);
  const seenKey=new Set([origKey]);
  const seenNorm=new Set(origNorm!=='|'?[origNorm]:[]);
  const out=[];
  const pushSongs=(list,src)=>{
   for(const raw of list||[]){
    const item=raw&&raw.source&&raw.id?raw:normalize(raw,src||'wy');
    if(!item||!item.id||!item.name)continue;
    const k=`${item.source}:${item.id}`;
    const nk=normKey(item.name,item.singer);
    if(seenKey.has(k)||seenNorm.has(nk))continue;
    seenKey.add(k);seenNorm.add(nk);
    out.push(item);
    if(out.length>=30)break;
   }
  };
  let wyId=(target.source==='wy'&&/^\d+$/.test(String(target.id||'')))?String(target.id):'';
  if(!wyId&&name){
   try{
    const q=primaryArtist?`${name} ${primaryArtist}`:name;
    const r=await json('https://music.163.com/api/cloudsearch/pc?'+new URLSearchParams({s:q,type:'1',offset:'0',limit:'6'}),headers('wy'));
    const list=r?.result?.songs||[];
    const exact=list.find(x=>normKey(x.name,(x.ar||x.artists||[]).map(a=>a.name).join('、'))===origNorm)||list[0];
    if(exact&&exact.id)wyId=String(exact.id);
   }catch(_){}
  }
  if(wyId){
   try{
    const r=await json('https://music.163.com/api/discovery/simiSong?'+new URLSearchParams({id:wyId,limit:'30'}),headers('wy'));
    if(Array.isArray(r?.songs)&&r.songs.length)pushSongs(r.songs,'wy');
   }catch(_){}
  }
  if(out.length<18&&(primaryArtist||name)){
   try{
    const q=primaryArtist||name;
    const r=await json('https://music.163.com/api/cloudsearch/pc?'+new URLSearchParams({s:q,type:'1',offset:'0',limit:'30'}),headers('wy'));
    if(Array.isArray(r?.result?.songs))pushSongs(r.result.songs,'wy');
   }catch(_){}
  }
  return {items:out,total:out.length};
 }
 // 协同过滤+风格混排个性推荐：基于多首种子歌曲的相似推荐并发融合，并去重/按歌手多样性重排。
 async function personalizedMix(seeds, excludeKeys){
  const list=Array.isArray(seeds)?seeds.filter(s=>s&&s.name).slice(0,4):[];
  if(!list.length)return {items:[],total:0};
  const blocked=new Set(Array.isArray(excludeKeys)?excludeKeys:[]);
  const seenKey=new Set();
  const seenNorm=new Set();
  const artistCounts=new Map();
  const normKey=(n,s)=>clean(n).toLowerCase().replace(/[\s\-_()（）【】[\]·.,!?'"`]+/g,'')+'|'+clean(s).split(/[、/,，;&]+/)[0].toLowerCase().replace(/\s+/g,'');
  list.forEach(s=>{
   seenKey.add(`${s.source||''}:${s.id||''}`);
   const nk=normKey(s.name,s.singer||s.artist||'');
   if(nk!=='|')seenNorm.add(nk);
  });
  const batches=await Promise.allSettled(list.map(seed=>similarSongs(seed)));
  const buckets=batches.map((res,idx)=>res.status==='fulfilled'&&Array.isArray(res.value?.items)?{seed:list[idx],items:res.value.items}:null).filter(Boolean);
  const out=[];
  let cursor=0;
  while(out.length<36){
   let progressed=false;
   for(const b of buckets){
    while(cursor<b.items.length){
     const item=b.items[cursor];
     if(!item||!item.id||!item.name)break;
     const k=`${item.source}:${item.id}`;
     const nk=normKey(item.name,item.singer||item.artist||'');
     const artKey=clean(item.singer||item.artist||'').split(/[、/,，;&]+/)[0].toLowerCase();
     if(blocked.has(k)||blocked.has(nk)||seenKey.has(k)||seenNorm.has(nk)||(artKey&&(artistCounts.get(artKey)||0)>=2)){
      b.items.splice(cursor,1);
      continue;
     }
     seenKey.add(k);seenNorm.add(nk);
     if(artKey)artistCounts.set(artKey,(artistCounts.get(artKey)||0)+1);
     out.push(Object.assign({},item,{recommendationReason:b.seed&&b.seed.name?`因为你听过「${b.seed.name}」`:'猜你喜欢'}));
     b.items.splice(cursor,1);
     progressed=true;
     break;
    }
    if(out.length>=36)break;
   }
   if(!progressed)break;
  }
  return {items:out,total:out.length};
 }
 return {home,homeLite,section,categories,tracks,similarSongs,personalizedMix};
}
const api={createDiscovery};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LxDiscovery=api;
})(typeof window!=='undefined'?window:globalThis);
