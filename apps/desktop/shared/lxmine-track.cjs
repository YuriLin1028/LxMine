'use strict';

// LxMine's interchange between LX source metadata and MineRadio tracks.
const PROVIDERS = { kw: 'kuwo', kg: 'kugou', tx: 'qq', wy: 'netease', mg: 'migu' };
const SOURCES = Object.fromEntries(Object.entries(PROVIDERS).map(([source, provider]) => [provider, source]));

function sourceOf(song = {}) {
  const value = song.lxSource || song.provider || song.source || '';
  return PROVIDERS[value] ? value : SOURCES[value] || '';
}

function toMineTrack(raw, source = sourceOf(raw)) {
  if (!raw || !PROVIDERS[source] || raw.id == null) throw new Error('歌曲缺少有效的音源标识');
  const provider = PROVIDERS[source];
  const id = String(raw.id);
  return { ...raw, id, provider, source: provider, lxSource: source,
    type: provider === 'qq' ? 'qq' : 'song',
    name: raw.name || raw.title || '未知歌曲',
    artist: raw.singer || raw.artist || '', album: raw.albumName || raw.album || '',
    cover: raw.coverUrl || raw.cover || '', durationMs: Number(raw.durationMs || raw.dt) || 0,
    ...(source === 'tx' ? { mid: raw.mid || id, albumMid: raw.albumId || '' } : {}),
    ...(source === 'kg' ? { hash: raw.hash || id } : {}),
  };
}

function qualityOf(value) {
  return ({ standard: '128k', exhigh: '320k', lossless: 'flac', hires: 'flac24bit', jymaster: 'flac24bit' })[value]
    || (['128k', '320k', 'flac', 'flac24bit'].includes(value) ? value : '128k');
}

function toLxRequest(song, quality) {
  const source = sourceOf(song);
  if (!source) throw new Error('当前歌曲不支持 LX 自定义源');
  const type = qualityOf(quality);
  const musicInfo = { ...song, source, type, songmid: String(song.songmid || song.mid || song.id),
    singer: song.singer || song.artist || '', albumName: song.albumName || song.album || '',
    interval: Math.round(Number(song.durationMs || song.dt || 0) / 1000) };
  if (source === 'kg') {
    const hashes = { '128k': song.hash || song.id, '320k': song.hqHash, flac: song.sqHash, ...(song.hashes || {}) };
    musicInfo._types = { ...(song._types || {}) };
    for (const [key, hash] of Object.entries(hashes)) if (hash) musicInfo._types[key] = { ...(musicInfo._types[key] || {}), hash };
    musicInfo.hash = musicInfo._types[type]?.hash || musicInfo.hash || song.id;
    musicInfo.songmid = musicInfo.hash;
  }
  return { source, type, musicInfo };
}

module.exports = { sourceOf, toMineTrack, qualityOf, toLxRequest };
