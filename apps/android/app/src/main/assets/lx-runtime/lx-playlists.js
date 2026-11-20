/* LxMine playlist interchange. Protocol fields are based on LX Music musicSdk (Apache-2.0),
 * independently normalized here; transport and encryption are injected for Node / ArkWeb. */
(function (root) {
  'use strict';
  const sources = ['kw', 'kg', 'wy', 'tx', 'mg', 'qishui'];
  const str = value => value == null ? '' : String(value);
  const clean = value => str(value).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
  const number = value => Math.max(0, Number(value) || 0);
  const seconds = value => typeof value === 'string' && /^\d+:\d{2}$/.test(value) ? value.split(':').reduce((total, part) => total * 60 + Number(part), 0) : number(value);
  function song(raw, source) {
    raw = raw.songInfo || raw;
    source = raw.source || source;
    if (!sources.includes(source)) throw new Error('不支持的歌曲平台：' + source);
    const meta = raw.meta || {};
    const ref = raw.sourceRef && raw.sourceRef.providerData || {};
    const album = raw.album || {};
    const artists = raw.ar || raw.artists || raw.singer;
    let singer = Array.isArray(artists) ? artists.map(a => a.name).join('、') : str(artists || raw.artist || raw.ARTIST || raw.SingerName || ref.singer);
    const albumInfo = raw.al || (typeof album === 'object' ? album : {});
    const hash = raw.hash || meta.hash || raw.FileHash;
    const id = str((source === 'kg' && hash) || raw.songmid || meta.songId || raw.mid || hash || raw.rid || raw.musicrid || raw.MUSICRID || raw.id).replace(/^MUSIC_/, '');
    if (!id) throw new Error('歌曲缺少平台标识');
    const duration = raw.durationMs != null ? number(raw.durationMs) : raw.dt != null ? number(raw.dt) : source === 'wy' && raw.duration != null ? number(raw.duration) : seconds(raw.duration || raw.interval || raw.DURATION || raw.Duration) * 1000;
    const albumId = str(raw.albumId || raw.albumid || raw.AlbumID || raw.ALBUMID || meta.albumMid || meta.albumId || albumInfo.mid || albumInfo.id);
    const hashes = { ...(raw.hashes || {}) };
    if (raw.HQFileHash) hashes['320k'] = raw.HQFileHash;
    if (raw.SQFileHash) hashes.flac = raw.SQFileHash;
    const qualityTypes = raw._types || meta._qualitys || {};
    for (const quality of Object.keys(qualityTypes)) if (qualityTypes[quality]?.hash) hashes[quality] = qualityTypes[quality].hash;
    return { id, source, hash: source === 'kg' ? id : undefined, hashes,
      name: clean(raw.name || raw.title || raw.songname || raw.SONGNAME || raw.SongName), singer: clean(singer).replace(/&/g, '、'),
      albumName: clean(raw.albumName || raw.albumname || raw.AlbumName || raw.ALBUM || meta.albumName || albumInfo.name || (typeof album === 'string' ? album : '')),
      albumId, durationMs: duration, qualitys: raw.qualitys || (raw.types || meta.qualitys)?.map(t => t.type) || ['128k', '320k'],
      ...(raw.strMediaMid || meta.strMediaMid ? { strMediaMid: str(raw.strMediaMid || meta.strMediaMid) } : {}),
      ...(raw.songId || meta.id ? { songId: str(raw.songId || meta.id) } : {}),
      coverUrl: clean(
        raw.coverUrl || raw.img || raw.pic || raw.picUrl || raw.Image ||
        raw.trans_param?.union_cover || raw.album_img || raw.imgUrl || raw.sizable_cover ||
        raw.albumpic || raw.hts_MVPIC || raw.pic120 ||
        meta.picUrl || albumInfo.picUrl ||
        (raw.web_albumpic_short ? 'https://img1.kuwo.cn/star/albumcover/' + raw.web_albumpic_short.replace(/^120\//, '500/') : '') ||
        (raw.web_artistpic_short ? 'https://img1.kuwo.cn/star/starheads/' + raw.web_artistpic_short.replace(/^120\//, '500/') : '') ||
        (source === 'tx' && (albumInfo.pmid || (albumId && !/^\d+$/.test(albumId))) ? 'https://y.gtimg.cn/music/photo_new/T002R500x500M000' + (albumInfo.pmid || albumId) + '.jpg' : '')
      ).replace('{size}', '400').replace(/^\/\//, 'https://').replace(/^http:/, 'https:') };
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
    let data = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (typeof data === 'string') data = JSON.parse(data);
    if (['playList', 'playList_v2', 'playListPart', 'playListPart_v2', 'defautlList'].includes(data?.type)) data = data.data;
    else if (['allData', 'allData_v2'].includes(data?.type)) {
      const content = data.data || data;
      if (Array.isArray(content.list)) data = content.list;
      else if (content.list && typeof content.list === 'object') {
        const lists = content.list;
        data = [lists.defaultList && { ...lists.defaultList, name: lists.defaultList.name || '默认列表' },
          lists.loveList && { ...lists.loveList, name: lists.loveList.name || '我喜欢的' }, ...(lists.userList || [])].filter(Boolean);
      } else data = content.playlists || content.playList || (content.defaultList ? [content.defaultList] : content);
    }
    if (!data || typeof data !== 'object') throw new Error('文件中的歌单数据无效');
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
  function parseLink(input, selected, depth = 0) {
    const match = input.trim().match(/https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'*+,;=%]+/i);
    if (!match) {
      if (depth < 2 && /%(?:25)?3a/i.test(input)) {
        try { return parseLink(decodeURIComponent(input), selected, depth + 1); } catch (_) {}
      }
      if (/^\d+$/.test(input.trim()) && sources.includes(selected)) return { source: selected, id: input.trim() };
      throw new Error('请粘贴歌单分享链接，或选择平台后输入歌单 ID');
    }
    const link = clean(match[0]).replace(/[，。！、；）】》」』).,;!\]}]+$/g, '');
    const host = link.match(/^https?:\/\/([^/:?#]+)/i)[1].toLowerCase();
    let source;
    if (host === 'music.163.com' || host.endsWith('.music.163.com') || host === '163cn.tv' || host === '163cn.link') source = 'wy';
    else if (host === 'y.qq.com' || host.endsWith('.y.qq.com') || host === 'url.cn') source = 'tx';
    else if (host === 'kuwo.cn' || host.endsWith('.kuwo.cn')) source = 'kw';
    else if (host === 'kugou.com' || host.endsWith('.kugou.com')) source = 'kg';
    else if (host === 'qishui.com' || host.endsWith('.qishui.com') || host === 'qishui.douyin.com' || host === 'music.douyin.com') source = 'qishui';
    else throw new Error('支持网易云、QQ、酷我、酷狗和汽水音乐的歌单分享');
    const idMatch = source === 'kg' ? link.match(/(?:specialid=|\/special\/single\/|\/plist\/list\/)(\d+)/i)
      : link.match(/(?:[?&#](?:id|disstid|pid|playlist_id)=|\/playlist(?:_detail)?\/)(\d+)/i);
    const collection = source === 'kg' && link.match(/(?:\/songlist\/|\/special\/single\/|[?&]global_collection_id=)(gcid_[a-z\d]+|collection_[\w]+)/i);
    if (collection) return { source, id: collection[1], link };
    return { source, id: idMatch && idMatch[1], link };
  }
  async function resolveLink(target, selected, io) {
    const visited = new Set();
    for (let attempt = 0; !target.id && attempt < 5; attempt++) {
      if (!target.link || visited.has(target.link)) break;
      visited.add(target.link);
      if (io.page) {
        const page = await io.page(target.link);
        const candidates = [page.url, page.location];
        const body = str(page.body);
        // Share pages expose canonical URLs even when a native HTTP client hides the final redirect URL.
        const canonical = body.match(/<link[^>]+(?:rel=["']canonical["'][^>]+href|href)=["']([^"']+)["']/i);
        if (canonical) candidates.push(clean(canonical[1]));
        const ogUrl = body.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
        if (ogUrl) candidates.push(clean(ogUrl[1]));
        let next = null;
        for (const candidate of candidates) {
          if (!candidate) continue;
          try {
            const parsed = parseLink(new URL(candidate, target.link).href, selected);
            if (parsed.source === target.source && parsed.id) return parsed;
            if (!next && parsed.source === target.source && parsed.link !== target.link) next = parsed;
          } catch (_) {}
        }
        const collection = target.source === 'kg' && body.match(/["']global_collection_id["']\s*[:=]\s*["']((?:collection_|gcid_)[\w]+)["']/i);
        if (collection) return { ...target, id: collection[1] };
        const embedded = body.match(target.source === 'qishui' ? /["']playlist_id["']\s*[:=]\s*["']?([1-9]\d*)/i
          : target.source === 'kg' ? /["']specialid["']\s*[:=]\s*["']?([1-9]\d*)/i
          : /["'](?:disstid|playlistId|playlist_id)["']\s*[:=]\s*["']?([1-9]\d*)/i);
        if (embedded) return { ...target, id: embedded[1] };
        if (!next) break;
        target = next;
      } else if (io.resolve) target = parseLink(await io.resolve(target.link), selected);
      else break;
    }
    return target;
  }

  function kugouSong(raw) {
    const parts = str(raw.filename || raw.name).split(' - ');
    return { ...raw, name: raw.songname || raw.song_name || (parts.length > 1 ? parts.slice(1).join(' - ') : parts[0]),
      singer: raw.singername || raw.singer_name || (parts.length > 1 ? parts[0] : ''),
      hashes: { '128k': raw.hash, '320k': raw['320hash'] || raw.hash_320, flac: raw.sqhash || raw.hash_flac },
      durationMs: raw.durationMs || (raw.timelen ? number(raw.timelen) : undefined) };
  }

  async function importKugouCollection(target, io) {
    let id = target.id;
    const headers = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 Version/11.0 Mobile/15A372 Safari/604.1', Referer: 'https://m3ws.kugou.com/share/index.php' };
    const signed = async (base, params, platform, body) => {
      const secret = platform === 'android' ? 'OIlwieks28dk2k092lksi2UIkp' : 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';
      const signature = io.md5(secret + params.split('&').sort().join('') + (body || '') + secret);
      const fields = new URLSearchParams(params);
      const result = await io.json(base + '?' + params + '&signature=' + signature,
        { headers: { ...headers, mid: fields.get('mid') || '', dfid: '-', clienttime: fields.get('clienttime') || '', 'Content-Type': 'application/json' }, ...(body ? { method: 'POST', body } : {}) });
      if (result.error_code || result.errcode || result.err_code) throw new Error(result.error || '酷狗歌单不可访问');
      return result.data || (Array.isArray(result.info) ? result : result.info) || result;
    };
    if (id.startsWith('gcid_')) {
      const body = JSON.stringify({ ret_info: 1, data: [{ id, id_type: 2 }] });
      const result = await signed('https://t.kugou.com/v1/songlist/batch_decode', 'dfid=-&appid=1005&mid=0&clientver=20109&clienttime=640612895&uuid=-', 'android', body);
      id = result.list?.[0]?.global_collection_id;
      if (!id) throw new Error('酷狗分享码已失效，请重新从应用分享歌单');
    }
    const common = 'srcappid=2919&clientver=20000&clienttime=1586163242519&mid=1586163242519&uuid=1586163242519&dfid=-';
    const identity = /^\d+$/.test(id) ? 'specialid=' + id + '&global_specialid=' : 'specialid=0&global_specialid=' + encodeURIComponent(id);
    const info = await signed('https://mobiles.kugou.com/api/v5/special/info_v2', 'appid=1058&' + identity + '&format=jsonp&' + common, 'web');
    if (!info || !info.specialname) throw new Error('酷狗歌单信息暂不可用');
    const advertised = number(info.songcount), tracks = [], seen = new Set(), pages = new Set();
    let total = advertised, fetched = 0;
    for (let page = 1; fetched < total; page++) {
      const data = await signed('https://mobiles.kugou.com/api/v5/special/song_v2', 'appid=1058&' + identity + '&plat=0&version=8000&page=' + page + '&pagesize=100&' + common, 'web');
      if (!Array.isArray(data.info)) throw new Error('酷狗歌单分页不可用，请重试');
      if (data.total != null) total = number(data.total);
      const fingerprint = data.info.map(track => track.hash).join('|');
      if (data.info.length && pages.has(fingerprint)) throw new Error('酷狗重复返回同一页，请重试');
      pages.add(fingerprint);
      for (const raw of data.info) {
        const track = song(kugouSong(raw), 'kg');
        if (seen.has(track.id)) continue;
        seen.add(track.id); tracks.push(track);
      }
      fetched += data.info.length;
      if (!data.info.length && fetched < total) throw new Error('酷狗歌单分页中断，请重试');
    }
    const list = playlist(info.specialname || '酷狗歌单', tracks, 'kg');
    list.id = 'lx-import-kg-' + id;
    if (advertised > tracks.length) list.warning = '酷狗标注 ' + advertised + ' 首，当前返回 ' + tracks.length + ' 首可见且不重复的曲目';
    return [list];
  }

  async function importQishui(id, io) {
    const tracks = [], seen = new Set(), cursors = new Set();
    let cursor = '', name = '汽水歌单', unavailable = 0, total = 0;
    while (true) {
      const params = new URLSearchParams({ aid: '386088', app_name: 'luna_pc', device_platform: 'windows', playlist_id: id, count: '100', cursor });
      const result = await io.json('https://api.qishui.com/luna/pc/playlist/detail?' + params,
        { headers: { 'User-Agent': 'LunaPC/3.3.0(359450208)', Referer: 'https://music.douyin.com/' } });
      const data = result.data || result;
      if (result.status_info?.status_code || !Array.isArray(data.media_resources)) throw new Error(result.status_info?.status_msg || '汽水歌单不可访问，请检查是否公开');
      name = data.playlist?.title || name;
      total = number(data.playlist?.count_tracks) || total;
      for (const media of data.media_resources) {
        const track = media.entity?.track_wrapper?.track || media.entity?.track;
        if (!track || !track.id || !track.name) { unavailable++; continue; }
        if (seen.has(str(track.id))) continue;
        seen.add(str(track.id));
        const cover = track.album?.url_cover;
        tracks.push({ id: str(track.id), source: 'qishui', name: track.name,
          singer: (track.artists || []).map(artist => artist.name).join('、'), albumName: track.album?.name || '',
          albumId: str(track.album?.id), durationMs: number(track.duration), qualitys: ['128k', '320k'],
          coverUrl: cover?.urls?.[0] && cover.uri ? cover.urls[0] + cover.uri + '~' + (cover.template_prefix || 'tplv-b829550vbb') + '-image.image' : '' });
      }
      if (!data.has_more) break;
      const next = str(data.next_cursor);
      if (!next || cursors.has(next)) throw new Error('汽水歌单分页中断，请重试');
      cursors.add(next); cursor = next;
    }
    const list = playlist(name, tracks, 'qishui');
    list.id = 'lx-import-qishui-' + id;
    unavailable = Math.max(unavailable, total - tracks.length);
    if (unavailable) list.warning = unavailable + ' 首歌曲已被平台隐藏，已保留其余可见曲目';
    return [list];
  }

  const matchedSongs = new Map();
  function matchingText(value) {
    return clean(value).normalize('NFKC').toLowerCase().replace(/[\s·・]/g, '').replace(/[（]/g, '(').replace(/[）]/g, ')');
  }
  async function matchSong(original, io) {
    if (original.source !== 'qishui') return original;
    return findMatchingSong(original, io, original.matchSources || ['wy', 'kg', 'kw', 'tx']);
  }
  async function findMatchingSong(original, io, preferred = ['wy', 'kg', 'kw', 'tx']) {
    const key = [original.source, original.id, original.name, original.singer, original.durationMs, original.albumName, preferred.join(',')].join(':');
    if (matchedSongs.has(key)) return matchedSongs.get(key);
    const pending = (async () => {
      const deadline = Date.now() + 12000;
      const query = [original.name, original.singer].filter(Boolean).join(' ');
      const artists = matchingText(original.singer).split(/[、,&/]/).filter(Boolean).sort().join('|');
      if (!original.name || !artists) throw new Error('歌曲名称或歌手信息不完整');
      for (const source of preferred) {
        if (Date.now() >= deadline) break;
        try {
          const encoded = encodeURIComponent(query);
          let result, items;
          if (source === 'wy') {
            result = await io.json('https://music.163.com/api/search/get/web?' + new URLSearchParams({ s: query, type: '1', limit: '30', offset: '0' }), { headers: { Referer: 'https://music.163.com/' } });
            items = result.result?.songs || [];
          } else if (source === 'kg') {
            result = await io.json('https://songsearch.kugou.com/song_search_v2?platform=AndroidFilter&iscorrection=1&keyword=' + encoded + '&pagesize=30&PrivilegeFilter=0&page=1');
            items = result.data?.lists || [];
          } else if (source === 'kw') {
            result = await io.json('https://search.kuwo.cn/r.s?client=kt&all=' + encoded + '&pn=0&rn=30&ft=music&encoding=utf8&rformat=json&vermerge=1&mobi=1');
            items = result.abslist || [];
          } else if (source === 'tx') {
            result = await io.json('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=' + encoded + '&format=json&n=30&p=1&new_json=1&g_tk=5381', { headers: { Referer: 'https://y.qq.com/' } });
            items = result.data?.song?.list || [];
          } else continue;
          const candidates = items.map(raw => song(raw, source));
          const exact = candidates.find(candidate => candidate.source === original.source && candidate.id.toLowerCase() === String(original.id).toLowerCase());
          if (exact) return exact;
          const matches = candidates.filter(candidate =>
            matchingText(candidate.name) === matchingText(original.name) &&
            matchingText(candidate.singer).split(/[、,&/]/).filter(Boolean).sort().join('|') === artists &&
            (!original.durationMs || !candidate.durationMs || Math.abs(original.durationMs - candidate.durationMs) <= 3000));
          if (matches.length) return matches.find(candidate => matchingText(candidate.albumName) === matchingText(original.albumName)) || matches[0];
        } catch (_) {}
      }
      throw new Error('暂未找到「' + original.name + '」的同名同歌手版本');
    })();
    matchedSongs.set(key, pending);
    if (matchedSongs.size > 128) matchedSongs.delete(matchedSongs.keys().next().value);
    pending.catch(() => matchedSongs.delete(key));
    return pending;
  }
  async function retryImportRequest(request) {
    for (let attempt = 0; ; attempt++) {
      try { return await request(); }
      catch (error) {
        if (attempt >= 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 250 * Math.pow(2, attempt)));
      }
    }
  }
  /** Fully materialize before saving; failed pages never become a misleading partial import. */
  async function importPlaylist(input, selected, io) {
    if (/^[\[{]/.test(input.trim())) return fromJson(input);
    const transport = io;
    io = { ...transport, json: (url, options, validate) => retryImportRequest(async () => {
      const data = await transport.json(url, options);
      if (validate) validate(data);
      return data;
    }) };
    const target = await resolveLink(parseLink(input, selected), selected, io);
    if (!target.id) throw new Error('分享短链无法解析，请使用网页版完整歌单链接或歌单 ID');
    const id = target.id, source = target.source;
    if (source === 'qishui') return importQishui(id, io);
    if (source === 'kg') {
      if (!/^\d+$/.test(id)) return importKugouCollection(target, io);
      if (io.md5) {
        try { return await importKugouCollection(target, io); } catch (_) {}
      }
      let name = '酷狗歌单', total = 1, fetched = 0;
      const metadata = await io.json('https://mobiles.kugou.com/api/v3/special/info?specialid=' + id + '&version=9108&plat=0').catch(() => null);
      name = metadata?.data?.specialname || name;
      const tracks = [], seen = new Set(), pages = new Set();
      for (let page = 1; fetched < total; page++) {
        const data = await io.json('https://mobiles.kugou.com/api/v3/special/song?' + new URLSearchParams({ specialid: id, page: str(page), pagesize: '100', version: '9108', plat: '0' }));
        if (!Array.isArray(data.data?.info)) throw new Error('酷狗歌单不可访问，请检查是否公开');
        name = data.data.specialname || data.specialname || name;
        total = number(data.data.total || data.data.songcount);
        const fingerprint = data.data.info.map(track => track.hash).join('|');
        if (data.data.info.length && pages.has(fingerprint)) throw new Error('酷狗重复返回同一页，请重试');
        pages.add(fingerprint);
        for (const raw of data.data.info) {
          const track = song(kugouSong(raw), 'kg');
          if (seen.has(track.id)) continue;
          seen.add(track.id); tracks.push(track);
        }
        fetched += data.data.info.length;
        if (!data.data.info.length && fetched < total) throw new Error('酷狗歌单分页中断，请重试');
      }
      const list = playlist(name, tracks, source); list.id = 'lx-import-kg-' + id; return [list];
    }
    if (source === 'wy') {
      const randHex = len => Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      const nmtid = '00O' + randHex(38);
      const nuid = randHex(64);
      const devId = randHex(52).toUpperCase();
      const eapiHeader = {
        osver: 'Microsoft-Windows-10-Professional-build-19045-64bit',
        deviceId: devId,
        os: 'pc',
        appver: '3.1.17.204416',
        versioncode: '140',
        mobilename: '',
        buildver: String(Math.floor(Date.now() / 1000)),
        resolution: '1920x1080',
        __csrf: '',
        channel: 'netease',
        requestId: Date.now() + '_' + String(Math.floor(Math.random() * 1000)).padStart(4, '0'),
        NMTID: nmtid
      };
      const pcCookie = Object.entries(eapiHeader).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('; ') + '; _ntes_nuid=' + nuid;
      const wyHeaders = {
        Referer: 'https://music.163.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Cookie: pcCookie,
        'X-Real-IP': '118.88.88.88',
        'X-Forwarded-For': '118.88.88.88'
      };
      const callEapi = async (apiPath, bodyObj) => {
        if (typeof io.eapiEncrypt !== 'function') throw new Error('eapi unavailable');
        const params = io.eapiEncrypt(apiPath, { ...bodyObj, e_r: false, header: eapiHeader });
        const postOpts = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.17.204416',
            Cookie: pcCookie,
            'X-Real-IP': '118.88.88.88',
            'X-Forwarded-For': '118.88.88.88'
          },
          body: 'params=' + encodeURIComponent(params)
        };
        const sub = apiPath.replace(/^\/api\//, '/eapi/');
        try {
          const d1 = await io.json('https://interfacepc.music.163.com' + sub, postOpts);
          if (d1 && d1.code === 200) return d1;
        } catch (_) {}
        const d2 = await io.json('https://interface.music.163.com' + sub, postOpts);
        if (!d2 || d2.code !== 200) throw new Error((d2 && d2.message) || 'eapi failed');
        return d2;
      };
      const forward = async (path, params) => {
        const data = await io.json('https://music.163.com/api/linux/forward', {
          method: 'POST',
          headers: {
            Referer: 'https://music.163.com/',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
            Cookie: 'MUSIC_U=; NMTID=' + nmtid + '; _ntes_nuid=' + nuid + '; os=linux; appver=1.2.1.0428; channel=netease',
            'X-Real-IP': '118.88.88.88',
            'X-Forwarded-For': '118.88.88.88',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'eparams=' + io.linuxEncrypt({ method: 'POST', url: 'https://music.163.com' + path, params })
        });
        if (!data || data.code !== 200) throw new Error((data && data.message) || '网易云歌曲资料暂不可访问');
        return data;
      };
      let payload = null;
      let lastErr = null;
      if (typeof io.eapiEncrypt === 'function') {
        try {
          const d = await callEapi('/api/v6/playlist/detail', { id: String(id), n: 100000, s: 8 });
          if (d && (d.playlist || d.result)) payload = d;
        } catch (e) { lastErr = e; }
      }
      if (!payload && typeof io.linuxEncrypt === 'function') {
        try {
          const d = await forward('/api/v3/playlist/detail', { id, n: 100000, s: 0 });
          if (d && (d.playlist || d.result)) payload = d;
        } catch (e) { lastErr = e; }
      }
      if (!payload) {
        for (const hostUrl of ['https://interface.music.163.com', 'https://music.163.com']) {
          try {
            const d = await io.json(hostUrl + '/api/v6/playlist/detail?id=' + encodeURIComponent(id) + '&n=1000&s=0', { headers: wyHeaders });
            if (d && d.code === 200 && (d.playlist || d.result)) { payload = d; break; }
            if (d && d.message) lastErr = new Error(d.message);
          } catch (e) { lastErr = e; }
        }
      }
      if (!payload && typeof io.page === 'function') {
        try {
          const pg = await io.page('https://music.163.com/discover/toplist?id=' + encodeURIComponent(id));
          const html = str(pg && pg.body);
          const m = html.match(/<textarea[^>]+id=["']song-list-pre-data["'][^>]*>([\s\S]+?)<\/textarea>/i);
          if (m && m[1] && m[1].trim().startsWith('[')) {
            const arr = JSON.parse(clean(m[1]));
            if (Array.isArray(arr) && arr.length) {
              const titleM = html.match(/<title>([^<]+)<\/title>/i);
              const name = titleM ? clean(titleM[1]).replace(/\s*-\s*排行榜.*$|\s*-\s*网易云音乐.*$/g, '').trim() : '网易云榜单';
              payload = { code: 200, playlist: { name: name || '网易云榜单', tracks: arr, trackIds: arr.map(t => ({ id: t.id })) } };
            }
          }
        } catch (_) {}
      }
      const list = payload && (payload.playlist || payload.result);
      if (!list) throw (lastErr || new Error((payload && payload.message) || '歌单不可访问，可能为私密或已删除'));
      const ids = [...new Set((list.trackIds || []).map(track => str(track.id)).filter(Boolean))];
      const byId = new Map((list.tracks || []).map(track => [str(track.id), track]));
      const missing = ids.filter(trackId => !byId.has(trackId));
      let nextBatch = 0;
      async function loadDetails() {
        while (nextBatch < missing.length) {
          const start = nextBatch;
          nextBatch += 100;
          const batch = missing.slice(start, start + 100);
          let songsArr = null;
          if (typeof io.eapiEncrypt === 'function') {
            try {
              const d = await callEapi('/api/v3/song/detail', { c: JSON.stringify(batch.map(trackId => ({ id: trackId }))) });
              if (Array.isArray(d && d.songs)) songsArr = d.songs;
            } catch (_) {}
          }
          if (!songsArr && typeof io.linuxEncrypt === 'function') {
            try {
              const d = await forward('/api/v3/song/detail', {
                c: JSON.stringify(batch.map(trackId => ({ id: trackId }))), ids: JSON.stringify(batch)
              });
              if (Array.isArray(d && d.songs)) songsArr = d.songs;
            } catch (_) {}
          }
          if (!songsArr) {
            const gathered = [];
            for (let sub = 0; sub < batch.length; sub += 80) {
              const part = batch.slice(sub, sub + 80);
              const d = await io.json('https://music.163.com/api/song/detail?ids=' + encodeURIComponent(JSON.stringify(part)) + '&id=' + part[0], { headers: wyHeaders });
              if (!d || d.code !== 200 || !Array.isArray(d.songs)) throw new Error('歌曲详情未完整返回，请稍后重试');
              gathered.push(...d.songs);
            }
            songsArr = gathered;
          }
          for (const track of songsArr) byId.set(str(track.id), track);
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, Math.ceil(missing.length / 100)) }, loadDetails));
      const tracks = ids.length ? ids.map(trackId => byId.get(trackId)).filter(Boolean) : list.tracks || [];
      const result = playlist(list.name, tracks, source);
      result.id = 'lx-import-wy-' + id;
      if (ids.length > result.songs.length) result.warning = (ids.length - result.songs.length) + ' 首歌曲的平台资料暂不可获取，已导入其余曲目';
      return [result];
    }
    if (source === 'tx') {
      let list;
      try {
        const data = await io.json('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=' + id + '&format=json&platform=yqq.json&needNewCode=0', { headers: { Referer: 'https://y.qq.com/' } });
        if (data.code === 0 && Array.isArray(data.cdlist?.[0]?.songlist)) list = data.cdlist[0];
      } catch (_) {}
      let tracks = list?.songlist || [];
      let total = list ? number(list.total_song_num ?? list.songnum) : 1;
      let name = list?.dissname || '';
      if (!list || total > tracks.length) {
        tracks = [];
        const seen = new Set(), pages = new Set();
        let gateway = 'https://u6.y.qq.com/cgi-bin/musicu.fcg';
        let offset = 0;
        while (offset < total) {
          const body = {
            comm: { cv: 4747474, ct: 24, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', platform: 'yqq.json', needNewCode: 1, uin: 0 },
            req_1: { module: 'music.srfDissInfo.aiDissInfo', method: 'uniform_get_Dissinfo', param: {
              disstid: Number(id), userinfo: 1, tag: 1, orderlist: 1, song_begin: offset, song_num: 100, onlysonglist: 0, enc_host_uin: ''
            } }
          };
          const options = {
            method: 'POST', headers: { Origin: 'https://y.qq.com', Referer: 'https://y.qq.com/', 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          };
          const validate = data => {
            const result = data.req_1?.data;
            if (data.code !== 0 || data.req_1?.code !== 0 || !Array.isArray(result?.songlist)) throw new Error('QQ 未完整返回歌单，请重试');
            const reported = result.total_song_num == null ? total : number(result.total_song_num);
            if (!result.songlist.length && offset < reported) throw new Error('QQ 歌单分页中断，请重试');
            const fingerprint = result.songlist.map(track => str(track.mid || track.songmid || track.id)).join('|');
            if (result.songlist.length && pages.has(fingerprint)) throw new Error('QQ 重复返回同一页，请重试');
          };
          let page;
          try { page = await io.json(gateway, options, validate); }
          catch (error) {
            if (!gateway.includes('u6.y.qq.com')) throw error;
            gateway = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
            page = await io.json(gateway, options, validate);
          }
          const result = page.req_1.data;
          if (result.total_song_num != null) total = number(result.total_song_num);
          name = result.dirinfo?.title || name;
          pages.add(result.songlist.map(track => str(track.mid || track.songmid || track.id)).join('|'));
          for (const track of result.songlist) {
            const key = str(track.mid || track.songmid || track.id);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            tracks.push(track);
          }
          // The provider's offset counts raw entries, including repeated songs.
          offset += result.songlist.length;
        }
      }
      const result = playlist(name, tracks, source);
      result.id = 'lx-import-tx-' + id;
      if (total > result.songs.length) result.warning = (total - result.songs.length) + ' 条重复或无平台标识的曲目已合并，已导入全部返回的歌曲';
      return [result];
    }
    if (source === 'kw') {
      let name = '', total = 1, fetched = 0;
      const items = [], seen = new Set(), pages = new Set();
      for (let page = 0; fetched < total; page++) {
        const data = await io.json('https://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pid=' + id + '&pn=' + page + '&rn=100&encode=utf8&keyset=pl2012&identity=kuwo&pcmp4=1&vipver=MUSIC_9.0.5.0_W1&newver=1');
        if (data.result !== 'ok' || !Array.isArray(data.musiclist)) throw new Error('酷我歌单不可访问');
        name = data.title; total = number(data.total);
        if (!data.musiclist.length && fetched < total) throw new Error('酷我歌单未完整返回，未保存');
        const fresh=data.musiclist.filter(track=>{const key=String(track.id||track.musicrid||track.MUSICRID||JSON.stringify(track));if(seen.has(key))return false;seen.add(key);return true;});
        const fingerprint = data.musiclist.map(track => str(track.id || track.musicrid || track.MUSICRID)).join('|');
        if (data.musiclist.length && pages.has(fingerprint)) throw new Error('酷我重复返回同一页，请重试');
        pages.add(fingerprint);
        items.push(...fresh); fetched += data.musiclist.length;
      }
      const result = playlist(name, items, source); result.id = 'lx-import-kw-' + id; return [result];
    }
    throw new Error('该平台尚未提供歌单链接导入，请选择歌单备份文件');
  }
  function coreTitle(value) {
    return matchingText(value)
      .replace(/\((?:live|现场|伴奏|inst\.?|instrumental|remix|dj[^)]*|国语|粤语|原版|正式版|电影[^)]*|电视剧[^)]*|动画[^)]*|游戏[^)]*)\)/gi, '')
      .replace(/-(?:live|现场版?|伴奏)$/gi, '')
      .replace(/[^\p{L}\p{N}]/gu, '');
  }
  function artistTokens(value) {
    return matchingText(value)
      .split(/[、,&/;，feat\.ft\.]+/)
      .map(part => part.replace(/^[a-z.]+(?=[\u4e00-\u9fff])/i, '').replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(Boolean);
  }
  function candidateScore(original, candidate) {
    const origExact = matchingText(original.name);
    const candExact = matchingText(candidate.name);
    const origCore = coreTitle(original.name);
    const candCore = coreTitle(candidate.name);
    if (!candCore || !origCore) return -1;
    let score = 0;
    if (candExact === origExact) score += 60;
    else if (candCore === origCore) score += 45;
    else if (candCore.includes(origCore) || origCore.includes(candCore)) score += 24;
    else return -1;
    const origLive = /live|现场/i.test(original.name || '');
    const candLive = /live|现场/i.test(candidate.name || '');
    if (origLive !== candLive) score -= 14;
    if (/伴奏|inst|karaoke|卡拉ok/i.test(candidate.name || '') && !/伴奏|inst/i.test(original.name || '')) score -= 35;
    const origArtists = artistTokens(original.singer);
    const candArtists = artistTokens(candidate.singer);
    if (origArtists.length && candArtists.length) {
      const overlap = origArtists.some(a => candArtists.some(b => a === b || (a.length >= 2 && b.includes(a)) || (b.length >= 2 && a.includes(b))));
      if (overlap) score += 35;
      else score -= 22;
    }
    if (original.durationMs > 0 && candidate.durationMs > 0) {
      const diff = Math.abs(original.durationMs - candidate.durationMs);
      if (diff <= 3000) score += 15;
      else if (diff <= 10000) score += 8;
      else if (diff > 25000) score -= 15;
    }
    if (candidate.coverUrl) score += 5;
    return score;
  }
  async function searchSourceSongs(source, query, io, limit = 15) {
    const encoded = encodeURIComponent(query);
    if (source === 'wy') {
      const result = await io.json('https://music.163.com/api/cloudsearch/pc?' + new URLSearchParams({ s: query, type: '1', limit: String(limit), offset: '0' }), { headers: { Referer: 'https://music.163.com/' } })
        .catch(() => io.json('https://music.163.com/api/search/get/web?' + new URLSearchParams({ s: query, type: '1', limit: String(limit), offset: '0' }), { headers: { Referer: 'https://music.163.com/' } }));
      return (result.result?.songs || []).map(raw => song(raw, 'wy'));
    }
    if (source === 'tx') {
      const result = await io.json('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=' + encoded + '&format=json&n=' + limit + '&p=1&new_json=1&g_tk=5381', { headers: { Referer: 'https://y.qq.com/' } });
      return (result.data?.song?.list || []).map(raw => song(raw, 'tx'));
    }
    if (source === 'kg') {
      const result = await io.json('https://songsearch.kugou.com/song_search_v2?platform=AndroidFilter&iscorrection=1&keyword=' + encoded + '&pagesize=' + limit + '&PrivilegeFilter=0&page=1');
      return (result.data?.lists || []).map(raw => song(raw, 'kg'));
    }
    if (source === 'kw') {
      const result = await io.json('https://search.kuwo.cn/r.s?client=kt&all=' + encoded + '&pn=0&rn=' + limit + '&ft=music&encoding=utf8&rformat=json&vermerge=1&mobi=1');
      return (result.abslist || []).map(raw => song(raw, 'kw'));
    }
    return [];
  }
  async function searchPlatformCandidates(original, io, preferred = ['wy', 'tx', 'kg', 'kw'], limitPerSource = 8) {
    const cleanSinger = str(original.singer).replace(/未知歌手|本地文件/g, '').trim();
    const query = [original.name, cleanSinger.split(/[、,&/;，]/)[0] || ''].filter(Boolean).join(' ').trim();
    if (!query) return [];
    const settled = await Promise.all(preferred.map(source => searchSourceSongs(source, query, io, 16).catch(() => [])));
    const scored = [];
    const seen = new Set();
    for (let i = 0; i < settled.length; i++) {
      let count = 0;
      const list = settled[i]
        .map(cand => ({ cand, score: candidateScore(original, cand) }))
        .filter(entry => entry.score >= 20)
        .sort((a, b) => b.score - a.score);
      for (const entry of list) {
        const key = entry.cand.source + ':' + entry.cand.id;
        if (seen.has(key)) continue;
        seen.add(key);
        scored.push(entry);
        if (++count >= limitPerSource) break;
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map(entry => entry.cand);
  }
  const api = { normalizeSong: song, fromJson, parseLink, importPlaylist, matchSong, findMatchingSong, searchPlatformCandidates, coreTitle, artistTokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LxPlaylists = api;
})(typeof window !== 'undefined' ? window : globalThis);
