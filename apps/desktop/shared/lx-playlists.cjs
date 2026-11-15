/* LxMine playlist interchange. Protocol fields are based on LX Music musicSdk (Apache-2.0),
 * independently normalized here; transport and encryption are injected for Node / ArkWeb. */
(function (root) {
  'use strict';
  const sources = ['kw', 'kg', 'wy', 'tx'];
  const str = value => value == null ? '' : String(value);
  const clean = value => str(value).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
  const number = value => Math.max(0, Number(value) || 0);
  const seconds = value => typeof value === 'string' && /^\d+:\d{2}$/.test(value) ? value.split(':').reduce((total, part) => total * 60 + Number(part), 0) : number(value);
  function song(raw, source) {
    source = raw.source || source;
    if (!sources.includes(source)) throw new Error('不支持的歌曲平台：' + source);
    const ref = raw.sourceRef && raw.sourceRef.providerData || {};
    const album = raw.album || {};
    const artists = raw.ar || raw.artists || raw.singer;
    let singer = Array.isArray(artists) ? artists.map(a => a.name).join('、') : str(artists || raw.artist || raw.ARTIST || ref.singer);
    const albumInfo = raw.al || (typeof album === 'object' ? album : {});
    const id = str(raw.songmid || raw.mid || raw.hash || raw.FileHash || raw.rid || raw.musicrid || raw.MUSICRID || raw.id).replace(/^MUSIC_/, '');
    if (!id) throw new Error('歌曲缺少平台标识');
    const duration = raw.durationMs != null ? number(raw.durationMs) : raw.dt != null ? number(raw.dt) : source === 'wy' && raw.duration != null ? number(raw.duration) : seconds(raw.duration || raw.interval || raw.DURATION) * 1000;
    const albumId = str(raw.albumId || raw.albumid || raw.ALBUMID || albumInfo.mid || albumInfo.id);
    const hashes = raw.hashes || {};
    if (raw._types) for (const quality of Object.keys(raw._types)) hashes[quality] = raw._types[quality].hash;
    return { id, source, hash: source === 'kg' ? id : undefined, hashes,
      name: clean(raw.name || raw.title || raw.songname || raw.SONGNAME), singer: clean(singer).replace(/&/g, '、'),
      albumName: clean(raw.albumName || raw.albumname || raw.ALBUM || albumInfo.name || (typeof album === 'string' ? album : '')),
      albumId, durationMs: duration, qualitys: raw.qualitys || raw.types && raw.types.map(t => t.type) || ['128k', '320k'],
      coverUrl: str(raw.coverUrl || raw.img || raw.pic || raw.picUrl || albumInfo.picUrl || (source === 'tx' && albumId ? 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + albumId + '.jpg' : '')) };
  }
  function playlist(name, items, source) {
    const seen = new Set();
    const songs = items.map(raw => song(raw, source)).filter(item => {
      const key = item.source + ':' + item.id;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    return { id: 'lx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), kind: 'lx', name: clean(name || '导入的歌单'), songs,
      songIds: songs.map(s => s.source + ':' + s.id), createdAt: Date.now(), updatedAt: Date.now() };
  }
  function fromJson(text) {
    const data = JSON.parse(text);
    let lists = Array.isArray(data) ? data : data.playlists || data.lists || data.data && data.data.lists || data;
    if (!Array.isArray(lists)) lists = [lists];
    const result = lists.map(list => {
      const items = list.songs || list.musicList || list.list;
      if (!Array.isArray(items)) throw new Error('需要含 songs / musicList / list 的歌单 JSON');
      const normalized = playlist(list.name || list.title, items, list.source);
      if (list.kind === 'lx' && typeof list.id === 'string') {
        normalized.id = list.id;
        normalized.isFavorite = Boolean(list.isFavorite);
        normalized.createdAt = number(list.createdAt) || normalized.createdAt;
        normalized.updatedAt = number(list.updatedAt) || normalized.updatedAt;
      }
      return normalized;
    });
    if (!result.length) throw new Error('文件中没有歌单');
    return result;
  }
  function parseLink(input, selected) {
    const match = input.trim().match(/https?:\/\/[^\s<>"，]+/i);
    if (!match) {
      if (/^\d+$/.test(input.trim()) && sources.includes(selected)) return { source: selected, id: input.trim() };
      throw new Error('请粘贴歌单分享链接，或选择平台后输入歌单 ID');
    }
    const link = match[0];
    const host = link.match(/^https?:\/\/([^/:?#]+)/i)[1].toLowerCase();
    let source;
    if (host === 'music.163.com' || host.endsWith('.music.163.com') || host === '163cn.tv') source = 'wy';
    else if (host === 'y.qq.com' || host.endsWith('.y.qq.com') || host === 'c6.y.qq.com') source = 'tx';
    else if (host === 'kuwo.cn' || host.endsWith('.kuwo.cn')) source = 'kw';
    else if (host === 'kugou.com' || host.endsWith('.kugou.com')) source = 'kg';
    else throw new Error('仅支持网易云、QQ、酷我、酷狗的歌单链接');
    const idMatch = source === 'kg' ? link.match(/(?:specialid=|\/special\/single\/|\/plist\/list\/)(\d+)/) : link.match(/(?:[?&#](?:id|disstid|pid)=|\/playlist(?:_detail)?\/)(\d+)/);
    return { source, id: idMatch && idMatch[1], link };
  }
  /** Fully materialize before saving; failed pages never become a misleading partial import. */
  async function importPlaylist(input, selected, io) {
    if (/^[\[{]/.test(input.trim())) return fromJson(input);
    let target = parseLink(input, selected);
    if (!target.id && target.link && io.resolve) {
      const resolved = await io.resolve(target.link);
      target = parseLink(resolved, selected);
    }
    if (!target.id) throw new Error('分享短链无法解析，请使用网页版完整歌单链接或歌单 ID');
    const id = target.id, source = target.source;
    if (source === 'wy') {
      const payload = await io.json('https://music.163.com/api/linux/forward', { method: 'POST', headers: { Referer: 'https://music.163.com/', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'eparams=' + io.linuxEncrypt({ method: 'POST', url: 'https://music.163.com/api/v3/playlist/detail', params: { id, n: 100000, s: 0 } }) });
      const list = payload.playlist || payload.result;
      if (payload.code !== 200 || !list) throw new Error(payload.message || '歌单不可访问，可能为私密或已删除');
      const ids = (list.trackIds || []).map(track => track.id);
      let tracks = list.tracks || [];
      if (ids.length > tracks.length) {
        tracks = [];
        for (let start = 0; start < ids.length; start += 500) {
          const batch = ids.slice(start, start + 500);
          const detail = await io.json('https://music.163.com/api/song/detail?ids=' + encodeURIComponent(JSON.stringify(batch)) + '&id=' + batch[0]);
          if (detail.code !== 200 || !Array.isArray(detail.songs) || detail.songs.length !== batch.length) throw new Error('歌曲详情未完整返回，请稍后重试');
          tracks.push(...detail.songs);
        }
      }
      if (ids.length && tracks.length !== ids.length) throw new Error('歌单未完整返回，未保存');
      const result = playlist(list.name, tracks, source); result.id = 'lx-import-wy-' + id; return [result];
    }
    if (source === 'tx') {
      const data = await io.json('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=' + id + '&format=json&platform=yqq.json&needNewCode=0', { headers: { Referer: 'https://y.qq.com/' } });
      const list = data.cdlist && data.cdlist[0];
      if (data.code !== 0 || !list || !Array.isArray(list.songlist)) throw new Error('QQ 歌单不可访问，可能为私密或已删除');
      let tracks=list.songlist,total=number(list.total_song_num||list.songnum),name=list.dissname;
      if(total>tracks.length){
        tracks=[];const seen=new Set();
        for(let offset=0;tracks.length<total;){
          // Public protocol used by LX Music's tx/songList getListDetail2.
          const body={comm:{cv:4747474,ct:24,format:'json',inCharset:'utf-8',outCharset:'utf-8',platform:'yqq.json',needNewCode:1,uin:0},
            req_1:{module:'music.srfDissInfo.aiDissInfo',method:'uniform_get_Dissinfo',param:{disstid:Number(id),userinfo:1,tag:1,orderlist:1,song_begin:offset,song_num:500,onlysonglist:0,enc_host_uin:''}}};
          const page=await io.json('https://u.y.qq.com/cgi-bin/musicu.fcg',{method:'POST',headers:{Referer:'https://y.qq.com/','Content-Type':'application/json'},body:JSON.stringify(body)});
          const result=page.req_1?.data;
          if(page.code!==0||page.req_1?.code!==0||!Array.isArray(result?.songlist))throw new Error('QQ 未完整返回歌单，请重试');
          total=number(result.total_song_num)||total;name=result.dirinfo?.title||name;
          let added=0;
          for(const track of result.songlist){const key=String(track.mid||track.songmid||track.id);if(!seen.has(key)){seen.add(key);tracks.push(track);added++;}}
          if(!added&&tracks.length<total)throw new Error('QQ 已停止返回新歌曲，请重试');
          offset+=result.songlist.length;
        }
      }
      const result = playlist(name, tracks, source); result.id = 'lx-import-tx-' + id; return [result];
    }
    if (source === 'kw') {
      let name = '', total = 1, items = [];const seen=new Set();
      for (let page = 0; items.length < total; page++) {
        const data = await io.json('https://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pid=' + id + '&pn=' + page + '&rn=100&encode=utf8&keyset=pl2012&identity=kuwo&pcmp4=1&vipver=MUSIC_9.0.5.0_W1&newver=1');
        if (data.result !== 'ok' || !Array.isArray(data.musiclist)) throw new Error('酷我歌单不可访问');
        name = data.title; total = number(data.total);
        if (!data.musiclist.length && items.length < total) throw new Error('酷我歌单未完整返回，未保存');
        const fresh=data.musiclist.filter(track=>{const key=String(track.id||track.musicrid||track.MUSICRID||JSON.stringify(track));if(seen.has(key))return false;seen.add(key);return true;});
        if(!fresh.length&&items.length<total)throw new Error('酷我未继续返回新歌曲，请重试');
        items.push(...fresh);
      }
      const result = playlist(name, items, source); result.id = 'lx-import-kw-' + id; return [result];
    }
    throw new Error('酷狗分享链接暂未接通，请从 LX 导出 JSON 后导入；不会导入空歌单');
  }
  const api = { normalizeSong: song, fromJson, parseLink, importPlaylist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LxPlaylists = api;
})(typeof window !== 'undefined' ? window : globalThis);
