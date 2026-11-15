'use strict';

// LX 内置源（QQ 音乐）搜索：使用公开的 client_search_cp 接口（new_json），只做搜索。
// 播放地址仍由用户的自定义源提供。

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function mapQQItems(list) {
  const items = [];
  for (const song of Array.isArray(list) ? list : []) {
    if (!song) continue;
    const id = song.mid ?? song.songmid;
    if (!id) continue;
    const singers = Array.isArray(song.singer) ? song.singer.map(artist => artist?.name).filter(Boolean) : [];
    const album = song.album ?? {};
    const albumMid = typeof album.mid === 'string' ? album.mid : '';
    items.push({
      id: String(id),
      name: decodeEntities(song.name || song.title || ''),
      singer: singers.join('、'),
      albumName: decodeEntities(album.name || ''),
      albumId: albumMid,
      durationMs: (Number(song.interval) || 0) * 1000,
      qualitys: ['128k', '320k'],
      source: 'tx',
      coverUrl: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : '',
    });
  }
  return items;
}

async function searchQQ(options) {
  const { query, page = 1, limit = 30, fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = options;
  const params = new URLSearchParams({
    w: query,
    format: 'json',
    n: String(limit),
    p: String(page),
    new_json: '1',
    cr: '1',
    t: '0',
    aggr: '1',
    lossless: '0',
    flag_qc: '0',
    g_tk: '5381',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('QQ search timeout')), timeoutMs);
  let json;
  try {
    const response = await fetchImpl(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?${params.toString()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 LxMine/0.1',
        Referer: 'https://y.qq.com/',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`QQ search failed: HTTP ${response.status}`);
    json = await response.json();
  } finally {
    clearTimeout(timer);
  }
  if (!json || json.code !== 0) throw new Error('QQ search rejected the request');
  const items = mapQQItems(json.data?.song?.list);
  const total = Number(json.data?.song?.totalnum);
  return {
    items,
    total: Number.isFinite(total) ? total : items.length,
    page,
    limit,
    source: 'tx',
  };
}

module.exports = {
  searchQQ,
  mapQQItems,
};
