/* Public artwork and lyrics for the identified recording. Playback remains with the user's source. */
(function (root) {
  'use strict';
  const cache = new Map();
  const coverCache = new Map();
  const decode = text => String(text || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const cover = value => {
    const raw = decode(value).trim().replace('{size}', '400').replace(/^\/\//, 'https://').replace(/^http:/, 'https:');
    return /^https?:\/\//i.test(raw) || /^data:image\//i.test(raw) || /^file:\/\//i.test(raw) ? raw : '';
  };
  const hasLyrics = value => /\[\d{1,3}:\d{2}|\[\d+,\d+\]/.test(value || '');
  const isInstrumentalText = value => /纯音乐[，,\s]*请欣赏|此歌曲为没有填词的纯音乐|纯音乐无歌词|instrumental/i.test(String(value || ''));
  const INSTRUMENTAL_LRC = '[00:00.00]纯音乐，请欣赏';

  function decodeBase64Utf8(raw) {
    const cleaned = String(raw || '').replace(/\s+/g, '');
    if (!cleaned) return '';
    try {
      if (typeof Buffer !== 'undefined') return Buffer.from(cleaned, 'base64').toString('utf8');
    } catch (_) {}
    try {
      return new TextDecoder().decode(Uint8Array.from(atob(cleaned), ch => ch.charCodeAt(0)));
    } catch (_) {}
    return '';
  }

  function lyricText(value) {
    const text = decode(value);
    if (!text) return '';
    if (hasLyrics(text)) return text;
    if (isInstrumentalText(text)) return INSTRUMENTAL_LRC;
    const decoded = decode(decodeBase64Utf8(text));
    if (hasLyrics(decoded)) return decoded;
    if (isInstrumentalText(decoded)) return INSTRUMENTAL_LRC;
    return text;
  }

  function unwrapJsonp(payload) {
    if (typeof payload !== 'string') return payload || {};
    const trimmed = payload.trim().replace(/^[a-zA-Z0-9_$]+\(([\s\S]*)\)\s*;?$/, '$1');
    try { return JSON.parse(trimmed); } catch (_) { return {}; }
  }

  async function safeJson(io, url, options) {
    const raw = await io.json(url, options);
    return unwrapJsonp(raw);
  }

  function cleanKeyword(song) {
    const name = String(song.name || '').replace(/\((?:live|现场|伴奏|remix|dj[^)]*)\)/gi, '').trim();
    const singer = String(song.singer || '').replace(/未知歌手|本地文件/g, '').split(/[、,&/;，]/)[0].trim();
    return [name, singer].filter(Boolean).join(' ').trim();
  }

  async function platformCoverOnly(song, io, matching) {
    const existing = cover(song.coverUrl);
    if (existing) return existing;
    const id = encodeURIComponent(song.id);
    if (song.source === 'wy') {
      try {
        const data = await safeJson(io, 'https://music.163.com/api/song/detail?ids=' + encodeURIComponent(JSON.stringify([song.id])) + '&id=' + id, { headers: { Referer: 'https://music.163.com/' } });
        const found = cover(data.songs?.[0]?.al?.picUrl || data.songs?.[0]?.album?.picUrl);
        if (found) return found;
      } catch (_) {}
    } else if (song.source === 'kw') {
      try {
        const data = await safeJson(io, 'https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=' + id, { headers: { Referer: 'https://m.kuwo.cn/' } });
        const found = cover(data.data?.songinfo?.pic || data.data?.songinfo?.albumpic);
        if (found) return found;
      } catch (_) {}
      if (matching?.findMatchingSong) {
        try {
          const cand = await matching.findMatchingSong(song, io, ['kw']);
          const found = cover(cand?.coverUrl);
          if (found) return found;
        } catch (_) {}
      }
    } else if (song.source === 'tx') {
      try {
        const detailId = /^\d+$/.test(song.id) ? { song_id: Number(song.id) } : { song_mid: song.id };
        const data = await safeJson(io, 'https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(JSON.stringify({ req_0: { module: 'music.pf_song_detail_svr', method: 'get_song_detail_yqq', param: { ...detailId, song_type: 0 } } })), { headers: { Referer: 'https://y.qq.com/' } });
        const album = data.req_0?.data?.track_info?.album?.mid || data.req_0?.data?.track_info?.album?.pmid;
        if (album) return 'https://y.gtimg.cn/music/photo_new/T002R500x500M000' + album + '.jpg';
      } catch (_) {}
    } else if (song.source === 'kg' && matching?.findMatchingSong) {
      try {
        const cand = await matching.findMatchingSong(song, io, ['kg']);
        const found = cover(cand?.coverUrl);
        if (found) return found;
      } catch (_) {}
    }
    return '';
  }

  async function fetchKugouLyricBySearch(song, io, includeHash) {
    const keyword = cleanKeyword(song) || [song.name, song.singer].filter(Boolean).join(' ').trim();
    if (!keyword && !includeHash) return '';
    const hashParam = includeHash ? '&hash=' + encodeURIComponent(song.hash || song.id) : '';
    const data = await safeJson(io, 'https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=' + encodeURIComponent(includeHash ? (song.name + ' ' + song.singer) : keyword) + '&duration=' + (song.durationMs || 0) + hashParam);
    const candidates = Array.isArray(data.candidates) ? data.candidates.filter(item => item && item.id && item.accesskey) : [];
    if (!candidates.length) return '';
    let chosen = candidates[0];
    if (!includeHash && song.name) {
      const target = String(song.name).toLowerCase().replace(/\s+/g, '');
      const better = candidates.find(item => {
        const cSong = decode(item.song || '').toLowerCase().replace(/\s+/g, '');
        return cSong && (cSong === target || cSong.includes(target) || target.includes(cSong));
      });
      if (better) chosen = better;
    }
    const lyric = await safeJson(io, 'https://lyrics.kugou.com/download?ver=1&client=pc&id=' + encodeURIComponent(chosen.id) + '&accesskey=' + encodeURIComponent(chosen.accesskey) + '&fmt=lrc&charset=utf8');
    return lyricText(lyric.content);
  }

  async function platformAssets(song, io, matching) {
    const id = encodeURIComponent(song.id);
    const assets = { coverUrl: cover(song.coverUrl), lyric: '', tlyric: '', romalrc: '', instrumental: false };
    if (song.source === 'wy') {
      await Promise.allSettled([
        !assets.coverUrl ? safeJson(io, 'https://music.163.com/api/song/detail?ids=' + encodeURIComponent(JSON.stringify([song.id])), { headers: { Referer: 'https://music.163.com/' } }).then(data => {
          assets.coverUrl = cover(data.songs?.[0]?.al?.picUrl || data.songs?.[0]?.album?.picUrl || assets.coverUrl);
        }) : Promise.resolve(),
        safeJson(io, 'https://music.163.com/api/song/lyric?id=' + id + '&lv=-1&kv=-1&tv=-1&yv=-1', { headers: { Referer: 'https://music.163.com/' } }).then(data => {
          const rawLyric = data.yrc?.lyric || data.lrc?.lyric || '';
          if (data.nolyric || data.pureMusic || isInstrumentalText(rawLyric)) {
            assets.instrumental = true;
            assets.lyric = hasLyrics(rawLyric) ? rawLyric : INSTRUMENTAL_LRC;
          } else {
            assets.lyric = lyricText(rawLyric);
          }
          assets.tlyric = data.ytlrc?.lyric || data.tlyric?.lyric || '';
          assets.romalrc = data.yromalrc?.lyric || data.romalrc?.lyric || '';
        })
      ]);
    } else if (song.source === 'kw') {
      const data = await safeJson(io, 'https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=' + id, { headers: { Referer: 'https://m.kuwo.cn/' } });
      assets.coverUrl = cover(data.data?.songinfo?.pic || data.data?.songinfo?.albumpic || assets.coverUrl);
      const lrclist = data.data?.lrclist || [];
      assets.lyric = lrclist.map(line => {
        const ms = Math.max(0, Math.round(Number(line.time) * 1000));
        return '[' + Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0') + ']' + decode(line.lineLyric);
      }).join('\n');
      if (isInstrumentalText(assets.lyric)) {
        assets.instrumental = true;
        if (!hasLyrics(assets.lyric)) assets.lyric = INSTRUMENTAL_LRC;
      }
    } else if (song.source === 'tx') {
      const isNum = /^\d+$/.test(song.id);
      const detailId = isNum ? { song_id: Number(song.id) } : { song_mid: song.id };
      await Promise.allSettled([
        !assets.coverUrl ? safeJson(io, 'https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(JSON.stringify({ req_0: { module: 'music.pf_song_detail_svr', method: 'get_song_detail_yqq', param: { ...detailId, song_type: 0 } } })), { headers: { Referer: 'https://y.qq.com/' } }).then(data => {
          const album = data.req_0?.data?.track_info?.album?.mid || data.req_0?.data?.track_info?.album?.pmid;
          if (album) assets.coverUrl = 'https://y.gtimg.cn/music/photo_new/T002R500x500M000' + album + '.jpg';
        }) : Promise.resolve(),
        safeJson(io, 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?' + (isNum ? 'songid=' : 'songmid=') + id + '&format=json&inCharset=utf8&outCharset=utf-8&nobase64=1', { headers: { Referer: 'https://y.qq.com/' } }).then(data => {
          assets.lyric = lyricText(data.lyric);
          assets.tlyric = lyricText(data.trans);
          if (assets.lyric === INSTRUMENTAL_LRC || isInstrumentalText(assets.lyric)) assets.instrumental = true;
        })
      ]);
      if (!hasLyrics(assets.lyric) && !assets.instrumental) {
        try {
          const musicu = await safeJson(io, 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
            req_1: { module: 'music.musichallSong.PlayLyricInfo', method: 'GetPlayLyricInfo', param: isNum ? { songID: Number(song.id), crypt: 0 } : { songMid: song.id, crypt: 0 } }
          })), { headers: { Referer: 'https://y.qq.com/' } });
          const info = musicu.req_1?.data;
          if (info?.lyric) {
            assets.lyric = lyricText(info.lyric);
            assets.tlyric = lyricText(info.trans) || assets.tlyric;
            if (assets.lyric === INSTRUMENTAL_LRC || isInstrumentalText(assets.lyric)) assets.instrumental = true;
          }
        } catch (_) {}
      }
    } else if (song.source === 'kg') {
      await Promise.allSettled([
        (async () => {
          let lrc = await fetchKugouLyricBySearch(song, io, true);
          if (!hasLyrics(lrc) && !isInstrumentalText(lrc) && song.name && /^[0-9a-f]{32}$/i.test(String(song.hash || song.id))) {
            try { lrc = await fetchKugouLyricBySearch(song, io, false); } catch (_) {}
          }
          assets.lyric = lrc;
          if (assets.lyric === INSTRUMENTAL_LRC || isInstrumentalText(assets.lyric)) assets.instrumental = true;
        })(),
        !assets.coverUrl && matching?.findMatchingSong ? matching.findMatchingSong(song, io, ['kg']).then(candidate => {
          assets.coverUrl = cover(candidate.coverUrl);
        }) : Promise.resolve()
      ]);
    }
    return assets;
  }

  function applyFallback(assets, fallback) {
    if (!assets.coverUrl && fallback.coverUrl) assets.coverUrl = cover(fallback.coverUrl);
    if (!hasLyrics(assets.lyric) && !assets.instrumental) {
      if (hasLyrics(fallback.lyric)) {
        assets.lyric = fallback.lyric;
        assets.tlyric = fallback.tlyric || assets.tlyric;
        assets.romalrc = fallback.romalrc || assets.romalrc;
        if (fallback.instrumental) assets.instrumental = true;
      } else if (fallback.instrumental) {
        assets.instrumental = true;
        assets.lyric = INSTRUMENTAL_LRC;
      }
    }
  }

  async function getCover(song, io, matching) {
    if (!song) return '';
    const existing = cover(song.coverUrl);
    if (existing) return existing;
    if (song.source === 'local') return '';
    const key = [song.source, song.id, song.name || '', song.singer || ''].join('|');
    const cached = coverCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.promise;
    const pending = (async () => {
      let url = '';
      try { url = await platformCoverOnly(song, io, matching); } catch (_) {}
      if (!url && matching?.findMatchingSong) {
        for (const src of ['wy', 'tx', 'kg', 'kw'].filter(s => s !== song.source)) {
          try {
            const cand = await matching.findMatchingSong(song, io, [src]);
            url = cover(cand.coverUrl) || await platformCoverOnly(cand, io, matching);
            if (url) break;
          } catch (_) {}
        }
      }
      if (!url && matching?.searchPlatformCandidates) {
        try {
          const candidates = await matching.searchPlatformCandidates(song, io, ['wy', 'tx', 'kg', 'kw'], 3);
          for (const cand of candidates) {
            url = cover(cand.coverUrl) || await platformCoverOnly(cand, io, matching);
            if (url) break;
          }
        } catch (_) {}
      }
      if (!url && song.name) {
        try {
          const kw = cleanKeyword(song) || song.name;
          const res = await safeJson(io, 'https://music.163.com/api/cloudsearch/pc?' + new URLSearchParams({ s: kw, type: '1', limit: '5', offset: '0' }), { headers: { Referer: 'https://music.163.com/' } });
          const pic = res.result?.songs?.find(item => item?.al?.picUrl)?.al?.picUrl;
          if (pic) url = cover(pic);
        } catch (_) {}
      }
      coverCache.set(key, { promise: Promise.resolve(url), expires: Date.now() + (url ? 3600000 : 20000) });
      return url;
    })();
    coverCache.set(key, { promise: pending, expires: Date.now() + 30000 });
    if (coverCache.size > 256) coverCache.delete(coverCache.keys().next().value);
    return pending;
  }

  async function get(song, io, matching) {
    if (song.source === 'local') {
      if (!song.name || song.name === '未知歌曲') return { coverUrl: song.coverUrl || '', lyric: '', tlyric: '', romalrc: '' };
    }
    const key = [song.source, song.id, song.coverUrl || '', song.name, song.singer].join('|');
    const previous = cache.get(key);
    if (previous && previous.expires > Date.now()) return previous.promise;
    const pending = (async () => {
      let assets;
      if (song.source === 'local') {
        assets = { coverUrl: song.coverUrl || '', lyric: '', tlyric: '', romalrc: '', instrumental: false };
      } else {
        try { assets = await platformAssets(song, io, matching); }
        catch (_) { assets = { coverUrl: cover(song.coverUrl), lyric: '', tlyric: '', romalrc: '', instrumental: false }; }
      }
      // Tier 1: Strict recording match across remaining platforms (preserves exact version e.g. Live).
      if ((!assets.coverUrl || (!hasLyrics(assets.lyric) && !assets.instrumental)) && matching?.findMatchingSong) {
        const others = ['wy', 'kg', 'kw', 'tx'].filter(source => source !== song.source);
        for (const src of others) {
          if (assets.coverUrl && (hasLyrics(assets.lyric) || assets.instrumental)) break;
          try {
            const candidate = await matching.findMatchingSong(song, io, [src]);
            const fallback = await platformAssets(candidate, io, matching);
            applyFallback(assets, fallback);
          } catch (_) {}
        }
      }
      // Tier 2: Normalized fuzzy cross-platform match (handles "G.E.M.邓紫棋" vs "邓紫棋", duration padding, etc.).
      if ((!assets.coverUrl || (!hasLyrics(assets.lyric) && !assets.instrumental)) && matching?.searchPlatformCandidates) {
        try {
          const candidates = await matching.searchPlatformCandidates(song, io, ['wy', 'tx', 'kg', 'kw'], 2);
          for (const candidate of candidates.slice(0, 4)) {
            if (assets.coverUrl && (hasLyrics(assets.lyric) || assets.instrumental)) break;
            try {
              const fallback = await platformAssets(candidate, io, matching);
              applyFallback(assets, fallback);
            } catch (_) {}
          }
        } catch (_) {}
      }
      // Tier 3: Direct Kugou keyword lyric search (no hash required) + Netease cloudsearch cover safety net.
      if (!hasLyrics(assets.lyric) && !assets.instrumental && song.name) {
        try {
          const kwLyric = await fetchKugouLyricBySearch(song, io, false);
          if (hasLyrics(kwLyric)) assets.lyric = kwLyric;
          else if (kwLyric === INSTRUMENTAL_LRC) { assets.instrumental = true; assets.lyric = INSTRUMENTAL_LRC; }
        } catch (_) {}
      }
      if (!assets.coverUrl && song.source !== 'local' && song.name) {
        try {
          const kw = cleanKeyword(song) || song.name;
          const res = await safeJson(io, 'https://music.163.com/api/cloudsearch/pc?' + new URLSearchParams({ s: kw, type: '1', limit: '5', offset: '0' }), { headers: { Referer: 'https://music.163.com/' } });
          const pic = res.result?.songs?.find(item => item?.al?.picUrl)?.al?.picUrl;
          if (pic) assets.coverUrl = cover(pic);
        } catch (_) {}
      }
      const out = { coverUrl: assets.coverUrl || '', lyric: assets.lyric || '', tlyric: assets.tlyric || '', romalrc: assets.romalrc || '' };
      cache.set(key, { promise: Promise.resolve(out), expires: Date.now() + (out.coverUrl && hasLyrics(out.lyric) ? 3600000 : 15000) });
      return out;
    })();
    cache.set(key, { promise: pending, expires: Date.now() + 30000 });
    if (cache.size > 160) cache.delete(cache.keys().next().value);
    return pending;
  }

  const api = { get, getCover, hasLyrics, isInstrumentalText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LxSongAssets = api;
})(typeof window !== 'undefined' ? window : globalThis);
