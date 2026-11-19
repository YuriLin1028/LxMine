'use strict';

// LX 内置源（酷我）的搜索实现，移植自 lx-music-desktop 的 kw/musicSearch.js。
// 只做搜索；播放地址一律来自用户添加的自定义源。

const JSON5 = require('json5');

const DECODE_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeName(value) {
  return String(value ?? '').replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, token => DECODE_MAP[token] ?? token);
}

function formatSinger(value) {
  return decodeName(value).replace(/&/g, '、');
}

function parseQualitys(minfo) {
  const qualitys = [];
  if (typeof minfo !== 'string') return qualitys;
  const levels = minfo.split(';');
  for (const level of levels) {
    const match = /level:(\w+),bitrate:(\d+),format:(\w+),size:([\w.]+)/.exec(level);
    if (!match) continue;
    switch (match[2]) {
      case '4000':
        qualitys.push('flac24bit');
        break;
      case '2000':
        qualitys.push('flac');
        break;
      case '320':
        qualitys.push('320k');
        break;
      case '128':
        qualitys.push('128k');
        break;
      default:
        break;
    }
  }
  return qualitys.length ? qualitys : ['128k', '320k'];
}

function extractKuwoCover(raw) {
  const shortAlbum = typeof raw?.web_albumpic_short === 'string' ? raw.web_albumpic_short.trim() : '';
  if (shortAlbum) {
    return `https://img1.kuwo.cn/star/albumcover/${shortAlbum.replace(/^120\//, '500/')}`;
  }
  const direct = String(raw?.albumpic || raw?.pic || raw?.hts_MVPIC || '').trim();
  if (direct) {
    return decodeName(direct).replace(/^\/\//, 'https://').replace(/^http:/i, 'https:');
  }
  const shortArtist = typeof raw?.web_artistpic_short === 'string' ? raw.web_artistpic_short.trim() : '';
  if (shortArtist) {
    return `https://img1.kuwo.cn/star/starheads/${shortArtist.replace(/^120\//, '500/')}`;
  }
  return '';
}

function parseKuwoPayload(text) {
  const trimmed = String(text || '').trim().replace(/^[a-zA-Z0-9_$]+\(([\s\S]*)\)\s*;?$/, '$1');
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return JSON5.parse(trimmed);
  }
}

/** 搜索酷我音乐。返回归一化后的条目，mediaId 即 LX 的 songmid。 */
async function searchKuwo(options) {
  const {
    query,
    page = 1,
    limit = 30,
    fetchImpl = globalThis.fetch,
    timeoutMs = 15_000,
  } = options;

  const params = new URLSearchParams({
    client: 'kt',
    all: query,
    pn: String(Math.max(0, page - 1)),
    rn: String(limit),
    uid: '794762570',
    ver: 'kwplayer_ar_9.2.2.1',
    vipver: '1',
    show_copyright_off: '1',
    newver: '1',
    ft: 'music',
    cluster: '0',
    strategy: '2012',
    encoding: 'utf8',
    rformat: 'json',
    vermerge: '1',
    mobi: '1',
    issubtitle: '1',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Kuwo search timeout')), timeoutMs);
  let payload;
  try {
    const response = await fetchImpl(`https://search.kuwo.cn/r.s?${params.toString()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LxMine/1.1',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Kuwo search failed: HTTP ${response.status}`);
    payload = parseKuwoPayload(await response.text());
  } finally {
    clearTimeout(timer);
  }

  const list = Array.isArray(payload?.abslist) ? payload.abslist : [];
  const items = [];
  for (const raw of list) {
    if (!raw || !raw.MUSICRID) continue;
    const rid = String(raw.MUSICRID).replace('MUSIC_', '');
    if (!rid) continue;
    const durationSeconds = Number.parseInt(raw.DURATION, 10);
    items.push({
      id: rid,
      name: decodeName(raw.SONGNAME || raw.NAME || ''),
      singer: formatSinger(raw.ARTIST),
      albumName: decodeName(raw.ALBUM || ''),
      albumId: decodeName(raw.ALBUMID || ''),
      durationMs: Number.isFinite(durationSeconds) ? durationSeconds * 1000 : 0,
      qualitys: parseQualitys(raw.N_MINFO),
      source: 'kw',
      coverUrl: extractKuwoCover(raw),
    });
  }

  const total = Number.parseInt(payload?.TOTAL, 10);
  return {
    items,
    total: Number.isFinite(total) ? total : items.length,
    page,
    limit,
    source: 'kw',
  };
}

module.exports = {
  searchKuwo,
  decodeName,
  formatSinger,
  parseQualitys,
};
