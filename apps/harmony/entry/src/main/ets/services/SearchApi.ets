import http from '@ohos.net.http';
import { Song } from '../model/Song';
import { searchKuwo } from './KuwoApi';

// 鸿蒙端 LX 内置源搜索：酷我 / 酷狗 / 网易云 / QQ。
// 只做搜索，播放地址仍然只由用户添加的自定义源提供。

export type LxSearchSource = 'all' | 'kw' | 'kg' | 'wy' | 'tx';

export interface LxSearchResult {
  items: Song[];
  total: number;
  warning?: string;
  hasMore?: boolean;
}

interface KgItem {
  Audioid?: number;
  FileHash?: string;
  SongName?: string;
  SingerName?: string;
  AlbumName?: string;
  AlbumID?: string;
  Duration?: string;
  HQFileHash?: string;
  SQFileHash?: string;
  Image?: string;
  Grp?: KgItem[];
}

interface KgData {
  lists?: KgItem[];
  total?: number;
}

interface KgResponse {
  error_code?: number;
  data?: KgData;
}

interface WyArtist {
  name?: string;
}

interface WyAlbum {
  id?: number;
  name?: string;
  picUrl?: string;
}

interface WySong {
  id?: number;
  name?: string;
  artists?: WyArtist[];
  album?: WyAlbum;
  duration?: number;
}

interface WyResult {
  songs?: WySong[];
  songCount?: number;
}

interface WyResponse {
  result?: WyResult;
}

interface TxSinger {
  name?: string;
}

interface TxAlbum {
  name?: string;
  mid?: string;
}

interface TxSong {
  mid?: string;
  name?: string;
  interval?: number;
  singer?: TxSinger[];
  album?: TxAlbum;
}

interface TxSongList {
  list?: TxSong[];
  totalnum?: number;
}

interface TxData {
  song?: TxSongList;
}

interface TxResponse {
  code?: number;
  data?: TxData;
}

interface HttpHeaders {
  'content-type'?: string;
  'User-Agent'?: string;
  Referer?: string;
}

function buildKugouQualitys(entry: KgItem): string[] {
  const qualitys: string[] = ['128k'];
  if (entry.HQFileHash) qualitys.push('320k');
  if (entry.SQFileHash) qualitys.push('flac');
  return qualitys;
}

function normalizeCoverUrl(value: string | undefined): string {
  if (!value) return '';
  const secure = value.replace(/^http:/, 'https:');
  return secure.includes('?') ? secure : `${secure}?param=300y300`;
}

function decodeName(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function formatSinger(value: string | undefined): string {
  return decodeName(value).replace(/&/g, '、');
}

async function requestText(
  url: string,
  method: http.RequestMethod,
  body: string,
  headers: HttpHeaders
): Promise<string> {
  const client = http.createHttp();
  try {
    const response = await client.request(url, {
      method,
      header: headers,
      extraData: body.length > 0 ? body : undefined,
      connectTimeout: 15000,
      readTimeout: 15000,
    });
    if (response.responseCode !== 200) {
      throw new Error(`HTTP ${response.responseCode}`);
    }
    return response.result as string;
  } finally {
    client.destroy();
  }
}

/** 酷狗：song_search_v2，拍平 Grp 子项并按 Audioid+FileHash 去重。 */
async function searchKugou(keyword: string, page: number, limit: number): Promise<LxSearchResult> {
  const url = `https://songsearch.kugou.com/song_search_v2?platform=AndroidFilter&iscorrection=1&keyword=${encodeURIComponent(keyword)}&hifiquality=0&pagesize=${limit}&PrivilegeFilter=0&page=${page}`;
  const headers: HttpHeaders = { 'User-Agent': 'Mozilla/5.0 LxMine/0.1' };
  const text = await requestText(url, http.RequestMethod.GET, '', headers);
  const payload = JSON.parse(text) as KgResponse;
  if (payload.error_code !== 0) throw new Error('酷狗搜索失败');

  const items: Song[] = [];
  const seen: Set<string> = new Set<string>();
  const push = (entry: KgItem): void => {
    if (!entry.FileHash) return;
    const key = `${entry.Audioid ?? 0}${entry.FileHash}`;
    if (seen.has(key)) return;
    seen.add(key);
    const duration = parseInt(entry.Duration ?? '0');
    const image = entry.Image
      ? entry.Image.replace('{size}', '400').replace(/^http:/, 'https:')
      : '';
    items.push({
      source: 'kg',
      hash: entry.FileHash,
      hashes: { '128k': entry.FileHash, '320k': entry.HQFileHash ?? '', 'flac': entry.SQFileHash ?? '' },
      id: entry.FileHash,
      name: decodeName(entry.SongName),
      singer: formatSinger(entry.SingerName),
      albumName: decodeName(entry.AlbumName),
      albumId: entry.AlbumID ?? '',
      durationMs: Number.isFinite(duration) ? duration * 1000 : 0,
      qualitys: buildKugouQualitys(entry),
      coverUrl: image,
    });
  };
  for (const raw of payload.data?.lists ?? []) {
    push(raw);
    for (const child of raw.Grp ?? []) push(child);
  }
  const total = payload.data?.total;
  return { items, total: typeof total === 'number' ? total : items.length };
}

/** 网易云：公开 web 搜索接口（POST 表单）。 */
async function searchNetease(keyword: string, page: number, limit: number): Promise<LxSearchResult> {
  const body = `s=${encodeURIComponent(keyword)}&type=1&offset=${(page - 1) * limit}&limit=${limit}&total=true`;
  const headers: HttpHeaders = {
    'content-type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 LxMine/0.1',
    Referer: 'https://music.163.com/',
  };
  const text = await requestText('https://music.163.com/api/search/get/web', http.RequestMethod.POST, body, headers);
  const payload = JSON.parse(text) as WyResponse;
  const items: Song[] = [];
  for (const song of payload.result?.songs ?? []) {
    if (song.id === undefined) continue;
    const singers: string[] = [];
    for (const artist of song.artists ?? []) {
      if (artist.name) singers.push(artist.name);
    }
    items.push({
      source: 'wy',
      id: String(song.id),
      name: decodeName(song.name),
      singer: singers.join('、'),
      albumName: decodeName(song.album?.name),
      albumId: song.album && song.album.id !== undefined ? String(song.album.id) : '',
      durationMs: song.duration ?? 0,
      qualitys: ['128k', '320k'],
      coverUrl: normalizeCoverUrl(song.album?.picUrl),
    });
  }
  const total = payload.result?.songCount;
  return { items, total: typeof total === 'number' ? total : items.length };
}

/** QQ 音乐：client_search_cp（new_json）。 */
async function searchQQ(keyword: string, page: number, limit: number): Promise<LxSearchResult> {
  const params = [
    `w=${encodeURIComponent(keyword)}`,
    'format=json',
    `n=${limit}`,
    `p=${page}`,
    'new_json=1',
    'cr=1',
    't=0',
    'aggr=1',
    'lossless=0',
    'flag_qc=0',
    'g_tk=5381',
  ].join('&');
  const headers: HttpHeaders = {
    'User-Agent': 'Mozilla/5.0 LxMine/0.1',
    Referer: 'https://y.qq.com/',
  };
  const text = await requestText(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?${params}`, http.RequestMethod.GET, '', headers);
  const payload = JSON.parse(text) as TxResponse;
  if (payload.code !== 0) throw new Error('QQ 搜索失败');
  const items: Song[] = [];
  for (const song of payload.data?.song?.list ?? []) {
    if (!song.mid) continue;
    const singers: string[] = [];
    for (const artist of song.singer ?? []) {
      if (artist.name) singers.push(artist.name);
    }
    const albumMid = song.album?.mid ?? '';
    items.push({
      source: 'tx',
      id: song.mid,
      name: decodeName(song.name),
      singer: singers.join('、'),
      albumName: decodeName(song.album?.name),
      albumId: albumMid,
      durationMs: (song.interval ?? 0) * 1000,
      qualitys: ['128k', '320k'],
      coverUrl: albumMid.length > 0 ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : '',
    });
  }
  const total = payload.data?.song?.totalnum;
  return { items, total: typeof total === 'number' ? total : items.length };
}

/** 统一入口：按平台分发。 */
export async function searchLx(
  source: LxSearchSource,
  keyword: string,
  page: number = 1,
  limit: number = 30
): Promise<LxSearchResult> {
  const query = keyword.trim();
  if (!query) return { items: [], total: 0 };
  if (source === 'all') {
    const sources: LxSearchSource[] = ['kw', 'kg', 'wy', 'tx'];
    const pages = await Promise.allSettled(sources.map((platform: LxSearchSource) => searchLx(platform, query, page, limit)));
    const items: Song[] = []; let total = 0; let failed = 0;
    const fulfilled: LxSearchResult[] = [];
    for (const result of pages) {
      if (result.status === 'fulfilled') { fulfilled.push(result.value); total += result.value.total; } else failed++;
    }
    if (!fulfilled.length) throw new Error('检索平台暂时不可用，请稍后重试');
    const length = Math.max(...fulfilled.map((result:LxSearchResult)=>result.items.length));
    for (let index = 0; index < length; index++) for (const result of fulfilled) if (result.items[index]) items.push(result.items[index]);
    return { items, total, warning: failed ? `${failed} 个检索平台暂时不可用，已显示其余结果` : '' };
  }
  switch (source) {
    case 'kg':
      return searchKugou(query, page, limit);
    case 'wy':
      return searchNetease(query, page, limit);
    case 'tx':
      return searchQQ(query, page, limit);
    default:
      return searchKuwo(query, page, limit);
  }
}

/** One search action automatically enumerates every accessible provider page. */
export async function searchAllLx(
  source: LxSearchSource,
  keyword: string,
  onProgress: (items: Song[], total: number) => void = () => {},
  cancelled: () => boolean = () => false
): Promise<LxSearchResult> {
  const sources: LxSearchSource[] = source === 'all' ? ['kw', 'kg', 'wy', 'tx'] : [source];
  const items: Song[] = [];
  const totals: number[] = sources.map(() => 0);
  const pending = await Promise.allSettled(sources.map(async (platform: LxSearchSource, index: number) => {
    const seen: Set<string> = new Set<string>();
    let page = 1, warning = '';
    for (;;) {
      if (cancelled()) break;
      let result: LxSearchResult;
      try {
        result = await searchLx(platform, keyword, page, 50);
      } catch (error) {
        if (!seen.size) throw new Error((error as Error).message);
        warning = '网络中断，已保留获取的结果，请重新搜索重试';
        break;
      }
      if (cancelled()) break;
      totals[index] = Math.max(totals[index], result.total);
      let added = 0;
      for (const item of result.items) {
        const key = `${item.source}:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(item);
        added++;
      }
      onProgress(items.slice(), totals.reduce((sum: number, value: number) => sum + value, 0));
      if (!result.items.length || !added) {
        if (page * 50 < totals[index]) warning = '平台已停止返回新结果，已显示全部可获取结果';
        break;
      }
      if (result.hasMore === false) break;
      if (totals[index] > result.items.length && page * 50 >= totals[index]) break;
      if (totals[index] <= result.items.length && result.items.length < 50) break;
      page++;
    }
    return warning;
  }));
  const warnings: string[] = [];
  let failed = 0;
  for (const result of pending) {
    if (result.status === 'rejected') failed++;
    else if (result.value) warnings.push(result.value);
  }
  if (failed === sources.length) throw new Error('检索平台暂时不可用，请稍后重试');
  if (failed) warnings.push(`${failed} 个平台暂时不可用`);
  return { items, total: totals.reduce((sum: number, value: number) => sum + value, 0), warning: warnings.join('；') };
}
