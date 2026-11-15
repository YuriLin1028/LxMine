/* Public discovery protocols referenced from LX Music musicSdk (Apache-2.0).
 * Independent normalization; no provider account or playback URL is used. */
(function(root){'use strict';
function createDiscovery(io){
 const json=io.json, normalize=io.normalizeSong;
 const collect=io.collectAll;
 const headers=source=>({headers:{Referer:source==='tx'?'https://y.qq.com/':'https://music.163.com/'}});
 const qq=(module,method,param)=>json('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data='+encodeURIComponent(JSON.stringify({comm:{cv:1602,ct:20},request:{module,method,param}})),headers('tx')).then(r=>{if(r.code||r.request?.code)throw Error('QQ 公开推荐暂不可用');return r.request.data;});
 const clean=v=>String(v||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/<[^>]*>/g,'');
 const art=v=>String(v||'').replace('{size}','400');
 function playlist(raw,source,kind='songlist'){
  const basic=raw.basic||raw.Playlist?.basic||raw;
  return {source,kind,id:String(basic.tid||basic.specialid||basic.topId||basic.rankid||basic.id||''),name:clean(basic.title||basic.specialname||basic.name||basic.rankname),cover:art(basic.cover?.medium_url||basic.cover?.default_url||basic.coverImgUrl||basic.picUrl||basic.img||basic.imgurl||basic.frontPicUrl||basic.banner_9),count:Number(basic.song_cnt||basic.trackCount||basic.songcount||basic.total||basic.totalNum)||0,playCount:Number(basic.play_cnt||basic.playCount||basic.listencnt||basic.playcount)||0,period:basic.period||''};
 }
 async function section({source='wy',type='hot',category='',page=1,limit=36}){
  if(!['wy','tx','kw','kg'].includes(source))throw Error('未知首页平台');
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
 }
 async function categories(source){
  if(source==='wy')return ['华语','欧美','粤语','流行','民谣','电子','轻音乐','古风'].map(name=>({id:name,name}));
  if(source==='tx'){const r=await qq('playlist.PlaylistAllCategoriesServer','get_all_categories',{qq:''});return (r.v_group||[]).flatMap(g=>g.v_item||[]).filter(x=>x.id&&x.name).map(x=>({id:String(x.id),name:clean(x.name)}));}
  if(source==='kw'){const r=await json('http://wapi.kuwo.cn/api/pc/classify/playlist/getTagList?cmd=rcm_keyword_playlist&user=0&prod=kwplayer_pc_9.0.5.0&vipver=9.0.5.0&source=kwplayer_pc_9.0.5.0&loginUid=0&loginSid=0&appUid=76039576');return (r.data||[]).flatMap(g=>g.data||[]).filter(x=>x.id&&x.name&&String(x.digest)!=='43').map(x=>({id:String(x.id),name:clean(x.name)}));}
  const r=await json('http://www2.kugou.kugou.com/yueku/v9/special/getSpecial?is_smarty=1&cdn=cdn&t=5');
  const list=[];function walk(x){if(!x||typeof x!=='object')return;if(x.special_id&&x.special_name)list.push({id:String(x.special_id),name:clean(x.special_name)});for(const v of Object.values(x))if(typeof v==='object')if(Array.isArray(v))v.forEach(walk);else walk(v);}walk(r);return list;
 }
 async function tracks(item){
  const source=item.source||'wy',id=item.id;
  if(item.kind!=='chart'){
   if(source==='wy'){
    const r=await json('https://music.163.com/api/v6/playlist/detail?id='+encodeURIComponent(id)+'&n=0',headers(source));if(r.code!==200||!r.playlist)throw Error('网易云歌单暂不可用');
    const ids=(r.playlist.trackIds||[]).map(x=>String(x.id)),byId=new Map((r.playlist.tracks||[]).map(x=>[String(x.id),x]));
    for(let offset=0;offset<ids.length;offset+=200){const batch=ids.slice(offset,offset+200).filter(id=>!byId.has(id));if(!batch.length)continue;const detail=await json('https://music.163.com/api/song/detail?ids='+encodeURIComponent(JSON.stringify(batch)),headers(source));if(detail.code!==200)throw Error('歌曲详情暂不可用');for(const song of detail.songs||[])byId.set(String(song.id),song);}
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
 // 合并首页用的轻量协议：只要推荐/热门/榜单/新歌/分类，不带分类标签分区。
 async function homeLite(source){
  if(!['wy','tx','kw','kg'].includes(source))throw Error('未知首页平台');
  const sections=await Promise.all([['recommend','recommend',''],['hot','hot',''],['charts','charts','']].map(async([id,type,category])=>{
   try{const r=await section({source,type,category});return {id,items:r.items.filter(x=>x.id&&x.name)};}
   catch(e){return {id,items:[]};}
  }));
  const pick=id=>(sections.find(x=>x.id===id)||{items:[]}).items;
  let newSongs=[];
  try{
   if(source==='wy'){const r=await json('https://music.163.com/api/personalized/newsong?limit=30',headers(source));newSongs=(r.result||[]).map(x=>normalize(x.song||x,source));}
   else{const first=pick('charts')[0];if(first){const r=await tracks(first);newSongs=r.items.slice(0,30);}}
  }catch(_){}
  let cats=[];
  try{cats=await categories(source);}catch(_){}
  return {source,recommend:pick('recommend'),hot:pick('hot'),charts:pick('charts'),newSongs,categories:cats.slice(0,8)};
 }
 return {home,homeLite,section,categories,tracks};
}
const api={createDiscovery};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LxDiscovery=api;
})(typeof window!=='undefined'?window:globalThis);
