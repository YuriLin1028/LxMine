'use strict';
const crypto = require('node:crypto');
const JSON5 = require('json5');
const core = require('../../shared/lx-playlists.cjs');
const assets = require('../../shared/lx-song-assets.cjs');
const { sourceOf } = require('../../shared/lxmine-track.cjs');

// 歌单与曲目元数据 transport：仅访问受支持平台的公开元数据，不涉及账号或播放地址。
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(20000),
    headers: {
      'User-Agent': 'Mozilla/5.0 LxMine/0.1',
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`歌单请求失败：HTTP ${response.status}`);
  return response;
}

async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const response = await request(url, { ...options, signal: options.signal || AbortSignal.timeout(timeoutMs) });
  const raw = await response.text();
  const trimmed = String(raw || '').trim().replace(/^[a-zA-Z0-9_$]+\(([\s\S]*)\)\s*;?$/, '$1');
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    try {
      return JSON5.parse(trimmed);
    } catch {
      return {};
    }
  }
}

function toAssetSong(song = {}) {
  const source = sourceOf(song) || String(song.lxSource || song.source || '').trim();
  const id = String(
    source === 'tx'
      ? (song.mid || song.songmid || song.id || '')
      : source === 'kg'
        ? (song.hash || song.fileHash || song.id || '')
        : (song.id || song.mid || song.hash || '')
  );
  return {
    ...song,
    id,
    source,
    name: String(song.name || song.title || ''),
    singer: String(song.singer || song.artist || ''),
    albumName: String(song.albumName || song.album || ''),
    coverUrl: String(song.coverUrl || song.cover || ''),
    durationMs: Number(song.durationMs || song.dt) || 0,
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), list.length) }, async () => {
    while (cursor < list.length) {
      const index = cursor++;
      results[index] = await worker(list[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function importPlaylist(input, source) {
  return core.importPlaylist(input, source, {
    json: async (url, options, check) => {
      const data = await fetchJson(url, options, 20000);
      if (typeof check === 'function') check(data);
      return data;
    },
    page: async url => {
      const response = await request(url);
      return { url: response.url, body: await response.text() };
    },
    md5: text => crypto.createHash('md5').update(text).digest('hex'),
    linuxEncrypt(payload) {
      const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from('rFgB&h#%2?^eDg:Q'), null);
      return Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]).toString('hex').toUpperCase();
    },
    eapiEncrypt(apiUrl, object) {
      const text = typeof object === 'object' ? JSON.stringify(object) : String(object);
      const message = 'nobody' + apiUrl + 'use' + text + 'md5forencrypt';
      const digest = crypto.createHash('md5').update(message).digest('hex');
      const plain = apiUrl + '-36cd479b6b5-' + text + '-36cd479b6b5-' + digest;
      const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from('e82ckenh8dichen8'), null);
      return Buffer.concat([cipher.update(plain), cipher.final()]).toString('hex').toUpperCase();
    },
  });
}

async function resolveImportedSong(song, matchSources) {
  return core.matchSong(matchSources ? { ...song, matchSources } : song, {
    json: (url, options) => fetchJson(url, options, 10000),
  });
}

async function songAssets(song) {
  return assets.get(toAssetSong(song), {
    json: (url, options) => fetchJson(url, options, 7500),
  }, core);
}

async function songCovers(songs) {
  const io = { json: (url, options) => fetchJson(url, options, 6500) };
  return mapWithConcurrency(songs, 6, async song => {
    if (!song || typeof song !== 'object') return '';
    try {
      return (await assets.getCover(toAssetSong(song), io, core)) || '';
    } catch (_) {
      return '';
    }
  });
}

async function platformCandidates(song, sources) {
  const io = { json: (url, options) => fetchJson(url, options, 8500) };
  const preferred = Array.isArray(sources) && sources.length ? sources : ['wy', 'tx', 'kg', 'kw'];
  const list = await core.searchPlatformCandidates(toAssetSong(song), io, preferred, 8);
  await mapWithConcurrency(list, 6, async cand => {
    if (!cand || cand.coverUrl) return;
    try {
      const found = await assets.getCover(cand, io, core);
      if (found) cand.coverUrl = found;
    } catch (_) {}
  });
  return list;
}

module.exports = {
  importPlaylist,
  resolveImportedSong,
  songAssets,
  songCovers,
  platformCandidates,
};
