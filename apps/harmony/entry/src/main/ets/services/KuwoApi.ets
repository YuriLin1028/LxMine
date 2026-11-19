import http from '@ohos.net.http';
import { KuwoRawItem, KuwoRawResponse, KuwoSearchResult, Song } from '../model/Song';

// 鸿蒙端 LX 内置源搜索（酷我）：移植自 lx-music-desktop 的 kw/musicSearch.js。
// 播放地址仍然只由用户添加的自定义源提供，这里只负责搜索。

function decodeName(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function formatSinger(value: string | undefined): string {
  return decodeName(value).replace(/&/g, '、');
}

function parseQualitys(minfo: string | undefined): string[] {
  if (!minfo) return [];
  const qualitys: string[] = [];
  const parts = minfo.split(';');
  for (const part of parts) {
    const match = /level:(\w+),bitrate:(\d+),format:(\w+),size:([\w.]+)/.exec(part);
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
  return qualitys;
}

export async function searchKuwo(keyword: string, page: number = 1, limit: number = 30): Promise<KuwoSearchResult> {
  const query = keyword.trim();
  if (!query) return { items: [], total: 0 };

  const params = [
    'client=kt',
    `all=${encodeURIComponent(query)}`,
    `pn=${Math.max(0, page - 1)}`,
    `rn=${limit}`,
    'uid=794762570',
    'ver=kwplayer_ar_9.2.2.1',
    'vipver=1',
    'show_copyright_off=1',
    'newver=1',
    'ft=music',
    'cluster=0',
    'strategy=2012',
    'encoding=utf8',
    'rformat=json',
    'vermerge=1',
    'mobi=1',
    'issubtitle=1',
  ].join('&');

  const url = `https://search.kuwo.cn/r.s?${params}`;
  const client = http.createHttp();
  try {
    const response = await client.request(url, {
      method: http.RequestMethod.GET,
      header: { 'User-Agent': 'Mozilla/5.0 LxMine/0.1' },
      connectTimeout: 15000,
      readTimeout: 15000,
    });
    if (response.responseCode !== 200) return { items: [], total: 0 };
    const raw = JSON.parse(response.result as string) as KuwoRawResponse;
    const list: KuwoRawItem[] = raw.abslist ?? [];
    const items: Song[] = [];
    for (const entry of list) {
      if (!entry.MUSICRID) continue;
      const id = entry.MUSICRID.replace('MUSIC_', '');
      if (!id) continue;
      const duration = parseInt(entry.DURATION ?? '0');
      const albumShort = (entry.web_albumpic_short ?? '').replace(/^120\//, '500/');
      const artistShort = (entry.web_artistpic_short ?? '').replace(/^120\//, '500/');
      const rawPic = (entry.albumpic ?? entry.hts_MVPIC ?? '').replace(/^http:/, 'https:');
      const coverUrl = albumShort.length > 0
        ? `https://img1.kuwo.cn/star/albumcover/${albumShort}`
        : rawPic.length > 0
          ? rawPic
          : artistShort.length > 0
            ? `https://img1.kuwo.cn/star/starheads/${artistShort}`
            : '';
      items.push({
        source: 'kw',
        id,
        name: decodeName(entry.SONGNAME),
        singer: formatSinger(entry.ARTIST),
        albumName: decodeName(entry.ALBUM),
        albumId: entry.ALBUMID ?? '',
        durationMs: Number.isFinite(duration) ? duration * 1000 : 0,
        qualitys: parseQualitys(entry.N_MINFO),
        coverUrl,
      });
    }
    const total = parseInt(raw.TOTAL ?? '0');
    return { items, total: Number.isFinite(total) ? total : items.length };
  } finally {
    client.destroy();
  }
}
