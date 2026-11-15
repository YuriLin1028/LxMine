/* LxMine public catalogue metadata, shared by desktop and ArkWeb. */
(function(root){ 'use strict';
function createCatalogue(io) {
const json = io.json;
function clean(value) { return String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
async function searchPlaylists({ query, source, page = 1, limit = 20 }) {
  let items, total;
  if (source === 'kw') {
    const result = await json('https://search.kuwo.cn/r.s?' + new URLSearchParams({ all: query, pn: String(page - 1), rn: String(limit), rformat: 'json', encoding: 'utf8', ver: 'mbox', ft: 'playlist', pay: '0' }));
    items = (result.abslist || []).map(item => ({ id: String(item.playlistid || item.PLAYLISTID || item.id), name: clean(item.name || item.NAME), cover: item.pic || item.picurl || item.img || '', artist: clean(item.nickname || item.uname || item.username), count: Number(item.total || item.songnum) || 0 }));
    total = Number(result.TOTAL || result.total) || items.length;
  } else if (source === 'tx') {
    const result = await json('http://c.y.qq.com/soso/fcgi-bin/client_music_search_songlist?' + new URLSearchParams({ page_no: String(page - 1), num_per_page: String(limit), format: 'json', query, remoteplace: 'txt.yqq.playlist', inCharset: 'utf8', outCharset: 'utf-8' }), { headers: { Referer: 'https://y.qq.com/portal/search.html' } });
    if (result.code !== 0) throw new Error('QQ 歌单检索暂时不可用');
    items = (result.data?.list || []).map(item => ({ id: String(item.dissid), name: clean(item.dissname), cover: item.imgurl || '', artist: clean(item.creator?.name), count: Number(item.song_count) || 0 })); total = Number(result.data?.sum) || items.length;
  } else if (source === 'kg') {
    const result = await json('https://msearchretry.kugou.com/api/v3/search/special?' + new URLSearchParams({ keyword: query, page: String(page), pagesize: String(limit), showtype: '10', filter: '0', version: '7910', sver: '2' }));
    if (result.errcode) throw new Error('酷狗歌单检索暂时不可用');
    items = (result.data?.info || []).map(item => ({ id: String(item.specialid), name: clean(item.specialname), cover: String(item.imgurl || '').replace('{size}', '400'), artist: clean(item.nickname), count: Number(item.songcount) || 0 })); total = Number(result.data?.total) || items.length;
  } else {
    const result = await json('https://music.163.com/api/search/get/web?' + new URLSearchParams({ s: query, type: '1000', offset: String((page - 1) * limit), limit: String(limit) }), { headers: { Referer: 'https://music.163.com/' } });
    if (result.code !== 200) throw new Error('网易云歌单检索暂时不可用');
    items = (result.result?.playlists || []).map(item => ({ id: String(item.id), name: clean(item.name), cover: item.coverImgUrl || '', artist: clean(item.creator?.nickname), count: Number(item.trackCount) || 0 })); total = Number(result.result?.playlistCount) || items.length;
  }
  return { source, type: 'songlist', page, limit, total, items: items.filter(item => item.id && item.id !== 'undefined' && item.name).map(item => ({ ...item, source, kind: 'songlist' })) };
}

async function searchEntities({ query, source, type, page = 1, limit = 20 }) {
  if (type === 'songlist') return searchPlaylists({ query, source, page, limit });
  if (source !== 'wy') throw new Error('此平台暂未提供该类型的公开检索');
  const codes = { artist: '100', album: '10', lyric: '1006', podcast: '1009' };
  if (!codes[type]) throw new Error('不支持的检索类型');
  const result = await json('https://music.163.com/api/search/get/web?' + new URLSearchParams({ s: query, type: codes[type], offset: String((page - 1) * limit), limit: String(limit) }), { headers: { Referer: 'https://music.163.com/' } });
  if (result.code !== 200) throw new Error('检索暂时不可用');
  const data = result.result || {};
  const keys = { artist: ['artists', 'artistCount'], album: ['albums', 'albumCount'], lyric: ['songs', 'songCount'], podcast: ['djRadios', 'djRadiosCount'] }[type];
  const items = (data[keys[0]] || []).map(item => ({ id: String(item.id), name: clean(item.name), cover: item.picUrl || item.cover || item.album?.picUrl || item.al?.picUrl || '', artist: clean(item.artist?.name || item.dj?.nickname || (item.artists || item.ar || []).map(artist => artist.name).join('、')), source, kind: type, ...(type === 'lyric' ? { song: wySong(item) } : {}) }));
  return { source, type, page, limit, total: Number(data[keys[1]]) || items.length, items };
}

function wySong(item) {
  const album = item.al || item.album || {};
  return { source: 'wy', id: String(item.id), name: clean(item.name), singer: (item.ar || item.artists || []).map(artist => clean(artist.name)).join('、'),
    albumName: clean(album.name), albumId: String(album.id || ''), coverUrl: album.picUrl || '', durationMs: Number(item.dt || item.duration) || 0, qualitys: ['128k', '320k', 'flac'] };
}
async function entityTracks({ id, source, kind, page = 1, limit = 50, all = false }) {
  if(all&&kind!=='album') {
    const collect=io.collectAll||(typeof module!=='undefined'&&module.exports?require('../public/lxmine/pagination.js').collectAll:root.LxPagination.collectAll);
    return collect((next,size)=>entityTracks({id,source,kind,page:next,limit:size}),{limit});
  }
  if (source !== 'wy') throw new Error('此平台暂未开放该详情类型');
  let data, songs, total;
  const headers = { Referer: 'https://music.163.com/' };
  if (kind === 'artist') {
    data = await json('https://music.163.com/api/v1/artist/songs?' + new URLSearchParams({id,order:'hot',offset:String((page-1)*limit),limit:String(limit)}), { headers });
    songs = data.songs || []; total = Number(data.total) || songs.length;
  } else if (kind === 'album') {
    data = await json('https://music.163.com/api/album/' + encodeURIComponent(id), { headers });
    songs = data.songs || data.album?.songs || []; total = songs.length;
  } else if (kind === 'podcast') {
    data = await json('https://music.163.com/api/dj/program/byradio?radioId=' + encodeURIComponent(id) + '&limit=' + limit + '&offset=' + ((page - 1) * limit), { headers });
    songs = (data.programs || []).map(program => ({ ...program.mainSong, name: program.name, album: { name: program.radio?.name, picUrl: program.coverUrl } }));
    total = Number(data.count) || songs.length;
  } else throw new Error('不支持的详情类型');
  if (data.code !== 200) throw new Error('公开详情暂不可用');
  return { items: songs.map(wySong), total, page, limit, ...(typeof data.more==='boolean'?{hasMore:data.more}:{}) };
}

return { searchEntities, entityTracks };
}
const api={createCatalogue};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LxCatalogue=api;
})(typeof window!=='undefined'?window:globalThis);
