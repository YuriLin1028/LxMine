'use strict';

// LX 内置源（网易云）搜索：优先使用 cloudsearch/pc 直接获取高清专辑封面 al.picUrl，失败回退 search/get/web。
// 播放地址仍由用户的自定义源提供。

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeCoverUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  return raw.replace(/^\/\//, 'https://').replace(/^http:/i, 'https:');
}

/** 把网易云搜索结果（兼容 cloudsearch/pc 与 search/get/web）拍平成统一结构。 */
function mapNeteaseItems(songs) {
  const items = [];
  for (const song of Array.isArray(songs) ? songs : []) {
    if (!song || song.id === undefined) continue;
    const rawArtists = Array.isArray(song.ar) ? song.ar : (Array.isArray(song.artists) ? song.artists : []);
    const artists = rawArtists.map(artist => artist?.name).filter(Boolean);
    const album = song.al || song.album || {};
    const qualitys = ['128k', '320k'];
    if (song.sq || song.hr) qualitys.push('flac');
    items.push({
      id: String(song.id),
      name: decodeEntities(song.name),
      singer: artists.join('、'),
      albumName: decodeEntities(album.name || ''),
      albumId: String(album.id ?? ''),
      durationMs: Number(song.dt ?? song.duration) || 0,
      qualitys,
      source: 'wy',
      coverUrl: normalizeCoverUrl(album.picUrl || song.picUrl || ''),
    });
  }
  return items;
}

async function postNeteaseSearch(url, params, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Netease search timeout')), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LxMine/1.1',
        Referer: 'https://music.163.com/',
      },
      body: params.toString(),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Netease search failed: HTTP ${response.status}`);
    const text = await response.text();
    const trimmed = text.trim().replace(/^[a-zA-Z0-9_$]+\(([\s\S]*)\)\s*;?$/, '$1');
    return JSON.parse(trimmed);
  } finally {
    clearTimeout(timer);
  }
}

async function searchNetease(options) {
  const { query, page = 1, limit = 30, fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = options;
  const params = new URLSearchParams({
    s: query,
    type: '1',
    offset: String((page - 1) * limit),
    limit: String(limit),
    total: 'true',
  });

  let payload = null;
  try {
    payload = await postNeteaseSearch('https://music.163.com/api/cloudsearch/pc', params, fetchImpl, timeoutMs);
    if (!Array.isArray(payload?.result?.songs)) payload = null;
  } catch (_) {
    payload = null;
  }
  if (!payload) {
    payload = await postNeteaseSearch('https://music.163.com/api/search/get/web', params, fetchImpl, timeoutMs);
  }

  const songs = payload?.result?.songs ?? [];
  const items = mapNeteaseItems(songs);
  const total = Number(payload?.result?.songCount);
  return {
    items,
    total: Number.isFinite(total) ? total : items.length,
    page,
    limit,
    source: 'wy',
  };
}

module.exports = {
  searchNetease,
  mapNeteaseItems,
};
