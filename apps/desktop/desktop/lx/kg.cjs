'use strict';

// LX 内置源（酷狗）搜索，移植自 lx-music-desktop 的 kg/musicSearch.js。
// 只做搜索；播放地址由用户的自定义源提供（与 LX 桌面版一致）。

function decodeName(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function formatSinger(value) {
  return decodeName(value).replace(/&/g, '、');
}

/** 把酷狗原始条目（含 Grp 子项）拍平成统一结构，并去重。 */
function mapKugouItems(lists) {
  const items = [];
  const seen = new Set();
  const push = (raw) => {
    if (!raw || !raw.FileHash) return;
    const key = `${raw.Audioid ?? ''}${raw.FileHash}`;
    if (seen.has(key)) return;
    seen.add(key);
    const hashes = {};
    const qualitys = [];
    if (raw.FileHash) {
      hashes['128k'] = raw.FileHash;
      qualitys.push('128k');
    }
    if (raw.HQFileHash) {
      hashes['320k'] = raw.HQFileHash;
      qualitys.push('320k');
    }
    if (raw.SQFileHash) {
      hashes.flac = raw.SQFileHash;
      qualitys.push('flac');
    }
    const duration = Number.parseInt(raw.Duration, 10);
    // 酷狗返回的图片地址带 {size} 占位符，换成 400 后统一走 https。
    const image = typeof raw.Image === 'string'
      ? raw.Image.replace('{size}', '400').replace(/^http:/, 'https:')
      : '';
    items.push({
      id: String(raw.FileHash),
      name: decodeName(raw.SongName),
      singer: formatSinger(raw.SingerName),
      albumName: decodeName(raw.AlbumName || ''),
      albumId: String(raw.AlbumID ?? ''),
      durationMs: Number.isFinite(duration) ? duration * 1000 : 0,
      qualitys,
      source: 'kg',
      hash: String(raw.FileHash),
      hashes,
      coverUrl: image,
    });
  };
  for (const raw of Array.isArray(lists) ? lists : []) {
    push(raw);
    for (const child of Array.isArray(raw?.Grp) ? raw.Grp : []) push(child);
  }
  return items;
}

async function searchKugou(options) {
  const { query, page = 1, limit = 30, fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = options;
  const url = `https://songsearch.kugou.com/song_search_v2?platform=AndroidFilter&iscorrection=1&keyword=${encodeURIComponent(query)}&hifiquality=0&pagesize=${limit}&PrivilegeFilter=0&page=${page}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Kugou search timeout')), timeoutMs);
  let payload;
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 LxMine/0.1' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Kugou search failed: HTTP ${response.status}`);
    payload = await response.json();
  } finally {
    clearTimeout(timer);
  }
  if (!payload || payload.error_code !== 0) throw new Error('Kugou search rejected the request');
  const items = mapKugouItems(payload.data?.lists);
  const total = Number.parseInt(payload.data?.total, 10);
  return {
    items,
    total: Number.isFinite(total) ? total : items.length,
    page,
    limit,
    source: 'kg',
  };
}

module.exports = {
  searchKugou,
  mapKugouItems,
  decodeName,
  formatSinger,
};
