/* Public artwork and lyrics for the identified recording. Playback remains with the user's source. */
(function (root) {
  'use strict';
  const cache = new Map();
  const decode = text => String(text || '').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const cover = value => decode(value).replace('{size}', '400').replace(/^\/\//, 'https://').replace(/^http:/, 'https:');
  const hasLyrics = value => /\[\d{1,3}:\d{2}|\[\d+,\d+\]/.test(value || '');
  function lyricText(value) {
    const text = decode(value);
    if (hasLyrics(text) || !text) return text;
    try {
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(text), character => character.charCodeAt(0)));
      if (hasLyrics(decoded)) return decode(decoded);
    } catch (_) {}
    return text;
  }
  async function platformAssets(song, io, matching) {
    const id = encodeURIComponent(song.id);
    const assets = { coverUrl: cover(song.coverUrl), lyric: '', tlyric: '', romalrc: '' };
    if (song.source === 'wy') {
      await Promise.allSettled([
        io.json('https://music.163.com/api/song/detail?ids=' + encodeURIComponent(JSON.stringify([song.id])), { headers: { Referer: 'https://music.163.com/' } }).then(data => { assets.coverUrl = cover(data.songs?.[0]?.al?.picUrl || data.songs?.[0]?.album?.picUrl || assets.coverUrl); }),
        io.json('https://music.163.com/api/song/lyric?id=' + id + '&lv=-1&kv=-1&tv=-1&yv=-1', { headers: { Referer: 'https://music.163.com/' } }).then(data => { assets.lyric = data.yrc?.lyric || data.lrc?.lyric || ''; assets.tlyric = data.ytlrc?.lyric || data.tlyric?.lyric || ''; assets.romalrc = data.yromalrc?.lyric || data.romalrc?.lyric || ''; })
      ]);
    } else if (song.source === 'kw') {
      const data = await io.json('https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=' + id, { headers: { Referer: 'https://m.kuwo.cn/' } });
      assets.coverUrl = cover(data.data?.songinfo?.pic || data.data?.songinfo?.albumpic || assets.coverUrl);
      assets.lyric = (data.data?.lrclist || []).map(line => {
        const ms = Math.max(0, Math.round(Number(line.time) * 1000));
        return '[' + Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0') + ']' + line.lineLyric;
      }).join('\n');
    } else if (song.source === 'tx') {
      const detailId = /^\d+$/.test(song.id) ? { song_id: Number(song.id) } : { song_mid: song.id };
      await Promise.allSettled([
        io.json('https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(JSON.stringify({ req_0: { module: 'music.pf_song_detail_svr', method: 'get_song_detail_yqq', param: { ...detailId, song_type: 0 } } })), { headers: { Referer: 'https://y.qq.com/' } }).then(data => {
          const album = data.req_0?.data?.track_info?.album?.mid;
          if (album) assets.coverUrl = 'https://y.gtimg.cn/music/photo_new/T002R500x500M000' + album + '.jpg';
        }),
        io.json('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?' + (/^\d+$/.test(song.id) ? 'songid=' : 'songmid=') + id + '&format=json&nobase64=1', { headers: { Referer: 'https://y.qq.com/' } }).then(data => { assets.lyric = lyricText(data.lyric); assets.tlyric = lyricText(data.trans); })
      ]);
    } else if (song.source === 'kg') {
      await Promise.allSettled([
        (async () => {
          const data = await io.json('https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=' + encodeURIComponent(song.name + ' ' + song.singer) + '&duration=' + (song.durationMs || 0) + '&hash=' + encodeURIComponent(song.hash || song.id));
          const candidate = data.candidates?.find(item => item.id && item.accesskey);
          if (candidate) {
            const lyric = await io.json('https://lyrics.kugou.com/download?ver=1&client=pc&id=' + encodeURIComponent(candidate.id) + '&accesskey=' + encodeURIComponent(candidate.accesskey) + '&fmt=lrc&charset=utf8');
            assets.lyric = lyricText(lyric.content);
          }
        })(),
        !assets.coverUrl && matching.findMatchingSong(song, io, ['kg']).then(candidate => { assets.coverUrl = cover(candidate.coverUrl); })
      ]);
    }
    return assets;
  }
  async function get(song, io, matching) {
    if (song.source === 'local') return { coverUrl: song.coverUrl || '', lyric: '', tlyric: '', romalrc: '' };
    const key = [song.source, song.id, song.coverUrl || '', song.name, song.singer].join('|');
    const previous = cache.get(key);
    if (previous && previous.expires > Date.now()) return previous.promise;
    const pending = (async () => {
      let assets;
      try { assets = await platformAssets(song, io, matching); } catch (_) { assets = { coverUrl: cover(song.coverUrl), lyric: '', tlyric: '', romalrc: '' }; }
      if (!assets.coverUrl || !hasLyrics(assets.lyric)) {
        try {
          const candidate = await matching.findMatchingSong(song, io, ['wy', 'kg', 'kw', 'tx'].filter(source => source !== song.source));
          const fallback = await platformAssets(candidate, io, matching);
          if (!assets.coverUrl) assets.coverUrl = fallback.coverUrl;
          if (!hasLyrics(assets.lyric) && hasLyrics(fallback.lyric)) Object.assign(assets, { lyric: fallback.lyric, tlyric: fallback.tlyric, romalrc: fallback.romalrc });
        } catch (_) {}
      }
      // Empty responses retry shortly so a transient provider failure is recoverable.
      cache.set(key, { promise: Promise.resolve(assets), expires: Date.now() + (assets.coverUrl && hasLyrics(assets.lyric) ? 3600000 : 15000) });
      return assets;
    })();
    cache.set(key, { promise: pending, expires: Date.now() + 30000 });
    if (cache.size > 96) cache.delete(cache.keys().next().value);
    return pending;
  }
  const api = { get, hasLyrics };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LxSongAssets = api;
})(typeof window !== 'undefined' ? window : globalThis);
