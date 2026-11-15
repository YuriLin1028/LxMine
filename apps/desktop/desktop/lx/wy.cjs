'use strict';

// LX 内置源（网易云）搜索：使用公开的 web 搜索接口，只做搜索。
// 播放地址仍由用户的自定义源提供。

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** 把网易云搜索结果拍平成统一结构。 */
function mapNeteaseItems(songs) {
  const items = [];
  for (const song of Array.isArray(songs) ? songs : []) {
    if (!song || song.id === undefined) continue;
    const artists = Array.isArray(song.artists) ? song.artists.map(artist => artist?.name).filter(Boolean) : [];
    const album = song.album ?? {};
    items.push({
      id: String(song.id),
      name: decodeEntities(song.name),
      singer: artists.join('、'),
      albumName: decodeEntities(album.name || ''),
      albumId: String(album.id ?? ''),
      durationMs: Number(song.duration) || 0,
      qualitys: ['128k', '320k'],
      source: 'wy',
      coverUrl: typeof album.picUrl === 'string' ? album.picUrl : '',
    });
  }
  return items;
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Netease search timeout')), timeoutMs);
  let payload;
  try {
    const response = await fetchImpl('https://music.163.com/api/search/get/web', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 LxMine/0.1',
        Referer: 'https://music.163.com/',
      },
      body: params.toString(),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Netease search failed: HTTP ${response.status}`);
    payload = await response.json();
  } finally {
    clearTimeout(timer);
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
