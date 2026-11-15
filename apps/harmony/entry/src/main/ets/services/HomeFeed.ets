import http from '@ohos.net.http';
import { Song } from '../model/Song';
import { searchLx } from './SearchApi';
import { LxHost } from './LxRuntime';

export interface FeedPlaylist {
  source?: string;
  kind?: string;
  period?: string;
  id: string;
  name: string;
  cover: string;
  count: number;
  playCount: number;
  /** 大融合榜单的组成部分：多平台同概念榜单合并后，打开时按部分逐个取歌再交错。 */
  parts?: FeedPlaylist[];
  /** 分类入口：点开后按该请求拉取对应平台的分类歌单列表。 */
  request?: FeedRequest;
}

export interface HomeFeed {
  source?:string;
  sections?:FeedSection[];
  playlists: FeedPlaylist[];
  newSongs: Song[];
  charts: FeedPlaylist[];
  similar: Song[];
  /** 每日三十首：四平台新歌按日期种子融合挑选，卡片与歌曲队列一同给出。 */
  daily?: FeedPlaylist;
  dailySongs?: Song[];
}
export interface FeedRequest { source:string; type:string; category:string; }
export interface FeedSection { id:string;title:string;kind:string;items:FeedPlaylist[];error?:string;request?:FeedRequest; }
export interface FeedSongsResult {items:Song[];warning?:string;}
interface FeedPage {items:FeedPlaylist[];total:number;hasMore?:boolean;}
export async function loadPlatformSection(host:LxHost,request:FeedRequest,cancelled:()=>boolean):Promise<FeedPlaylist[]>{
  const all:FeedPlaylist[]=[];const seen:Set<string>=new Set<string>();const limit=request.source==='kg'?20:36;
  for(let page=1;!cancelled()&&page<=4;page++){
    const result=JSON.parse(await host.catalogue('home-section',JSON.stringify({source:request.source,type:request.type,category:request.category,page,limit}))) as FeedPage;
    let added=0;for(const item of result.items){const key=`${item.source}:${item.id}`;if(!seen.has(key)){seen.add(key);all.push(item);added++;}}
    if(!result.items.length||!added||result.hasMore===false)break;
    const total=Number(result.total)||0;
    if(total>0&&page*limit>=total)break;
    if(result.items.length<limit)break;
  }
  return all;
}
export async function loadPlatformHome(host:LxHost,source:string):Promise<HomeFeed>{return JSON.parse(await host.catalogue('home',JSON.stringify({source}))) as HomeFeed;}
export async function platformFeedSongs(host:LxHost,item:FeedPlaylist):Promise<FeedSongsResult>{return JSON.parse(await host.catalogue('feed-tracks',JSON.stringify(item))) as FeedSongsResult;}

// 四平台合并首页：homeLite 只取推荐/热门/榜单/新歌，一首歌的来源用角标标注。
interface PlatformLite { source?: string; recommend: FeedPlaylist[]; hot: FeedPlaylist[]; charts: FeedPlaylist[]; newSongs: Song[]; categories: CategoryTag[]; }
interface CategoryTag { id?: string; name?: string; }

function mergeRoundRobin<T>(lists: T[][], key: (item: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  let added = true;
  for (let round = 0; added; round += 1) {
    added = false;
    for (const list of lists) {
      if (round < list.length) {
        added = round + 1 < list.length ? true : added;
        const item = list[round];
        const k = key(item);
        if (!seen.has(k)) { seen.add(k); out.push(item); }
      }
    }
  }
  return out;
}

function chartConcept(name: string): string | null {
  if (name.includes('飙升') || name.includes('上升')) return '飙升榜';
  if (name.includes('新歌')) return '新歌榜';
  if (name.includes('热歌')) return '热歌榜';
  if (name.includes('原创')) return '原创榜';
  return null;
}

/** 大融合榜单打开时：逐个拉组成部分的曲目再交错合并，多来源的榜单本身没有角标。 */
export async function loadMergedChartSongs(host: LxHost, item: FeedPlaylist): Promise<Song[]> {
  const lists: Song[][] = [];
  // 并行拉取各平台榜单，且每个榜单只取其标称数量，保证卡片上的"共 N 首"与实际一致。
  const caps: number[] = [];
  const allLists: Song[][] = [];
  const settled = await Promise.all((item.parts ?? []).map((part: FeedPlaylist): Promise<Song[]> =>
    platformFeedSongs(host, part)
      .then((result: FeedSongsResult): Song[] => result.items)
      .catch((): Song[] => [])));
  for (let i = 0; i < settled.length; i += 1) {
    const part = (item.parts ?? [])[i];
    const items = settled[i];
    if (!part || !items.length) continue;
    const cap = part.count > 0 ? part.count : items.length;
    caps.push(cap);
    allLists.push(items.slice(0, cap));
  }
  for (const list of allLists) {
    if (list.length) lists.push(list);
  }
  const out: Song[] = [];
  const seen = new Set<string>();
  let added = true;
  for (let round = 0; added; round += 1) {
    added = false;
    for (const list of lists) {
      if (round < list.length) {
        if (round + 1 < list.length) added = true;
        const song = list[round];
        const k = `${song.source}:${song.id}`;
        if (!seen.has(k)) { seen.add(k); out.push(song); }
      }
    }
  }
  return out;
}

// 以日期为种子的确定性洗牌：同一天内顺序稳定，跨天变化，即"每日"推荐。
function dailyShuffle(songs: Song[], dayNumber: number): Song[] {
  let state = (dayNumber ^ 0x9E3779B9) >>> 0;
  const next = (): number => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = songs.slice(0, 60);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  return pool.slice(0, 30);
}

export async function loadMergedHome(host: LxHost): Promise<HomeFeed> {
  const platforms: string[] = ['wy', 'tx', 'kw', 'kg'];
  const reasons: string[] = [];
  const parts = await Promise.all(platforms.map((platform: string): Promise<PlatformLite | null> =>
    host.catalogue('home-lite', JSON.stringify({ source: platform }))
      .then((value: string): PlatformLite => JSON.parse(value) as PlatformLite)
      .catch((error: Error): PlatformLite | null => {
        console.warn(`[HomeFeed] ${platform} homeLite failed: ${error.message}`);
        reasons.push(`${platform}: ${error.message}`);
        return null;
      })));
  const ok = parts.filter((part: PlatformLite | null) => part !== null) as PlatformLite[];
  if (!ok.length) throw new Error(`所有平台的首页都暂不可用 ${reasons.join(' | ')}`);
  const playlistKey = (item: FeedPlaylist): string => `${item.source ?? ''}:${item.id}`;
  const songKey = (song: Song): string => `${song.source}:${song.id}`;
  const recommend = mergeRoundRobin(ok.map((part: PlatformLite) => part.recommend ?? []), playlistKey);
  const hot = mergeRoundRobin(ok.map((part: PlatformLite) => part.hot ?? []), playlistKey);
  // 榜单大融合：同概念（飙升/新歌/热歌/原创）的榜单合并成一个多来源榜单；
  // 融合后的榜单本身没有角标，只有里面的歌曲封面带角标。
  const charts: FeedPlaylist[] = [];
  const concepts = new Map<string, FeedPlaylist>();
  for (const part of ok) {
    for (const chart of part.charts ?? []) {
      const concept = chartConcept(chart.name);
      if (!concept) { charts.push(chart); continue; }
      const mergedItem = concepts.get(concept);
      if (mergedItem) {
        if (!mergedItem.cover && chart.cover) mergedItem.cover = chart.cover;
        mergedItem.count += chart.count;
        mergedItem.playCount += chart.playCount;
        mergedItem.parts!.push(chart);
      } else {
        const entry: FeedPlaylist = { id: `merged-${concept}`, name: concept, cover: chart.cover, count: chart.count, playCount: chart.playCount, parts: [chart] };
        concepts.set(concept, entry);
        charts.push(entry);
      }
    }
  }
  const newSongs = mergeRoundRobin(ok.map((part: PlatformLite) => part.newSongs ?? []), songKey);
  // 分类：各平台的歌单分类标签融合，点开按平台拉取该分类的歌单列表。
  const categoryItems: FeedPlaylist[] = [];
  const categorySeen = new Set<string>();
  for (const part of ok) {
    for (const tag of part.categories ?? []) {
      const name = typeof tag.name === 'string' ? tag.name : '';
      if (!name || categorySeen.has(name)) continue;
      categorySeen.add(name);
      categoryItems.push({ id: `category-${name}`, name, cover: '', count: 0, playCount: 0, request: { source: part.source ?? 'wy', type: 'hot', category: name } });
    }
  }
  const sections: FeedSection[] = [
    { id: 'playlists', title: '推荐歌单', kind: 'playlist', items: recommend },
    { id: 'charts', title: '排行榜', kind: 'playlist', items: charts },
    { id: 'hot', title: '热门歌单', kind: 'playlist', items: hot },
    { id: 'category', title: '歌单分类', kind: 'playlist', items: categoryItems },
  ];
  const dayNumber = Math.floor(Date.now() / 86400000);
  const dailySongs = dailyShuffle(newSongs, dayNumber);
  const daily: FeedPlaylist = { id: 'daily-30', name: '每日三十首', cover: dailySongs[0]?.coverUrl ?? '', count: dailySongs.length, playCount: 0 };
  return { source: 'all', sections, playlists: recommend, newSongs, charts, similar: [], daily, dailySongs };
}

interface WyArtist { name?: string; }
interface WyAlbum { id?: number; name?: string; picUrl?: string; }
interface WyTrack {
  id?: number; name?: string; duration?: number; dt?: number;
  artists?: WyArtist[]; ar?: WyArtist[]; album?: WyAlbum; al?: WyAlbum;
}
interface WyPlaylistItem {
  id?: number; name?: string; picUrl?: string; coverImgUrl?: string;
  playCount?: number; trackCount?: number;
}
interface WyPersonalized { result?: WyPlaylistItem[]; }
interface WyNewsongItem { id?: number; name?: string; song?: WyTrack; }
interface WyNewsong { result?: WyNewsongItem[]; }
interface WyToplist { list?: WyPlaylistItem[]; }
interface WyTrackId { id:number; }
interface WyPlaylistDetail { tracks?: WyTrack[]; trackIds?: WyTrackId[]; }
interface WyDetail { playlist?: WyPlaylistDetail; }
interface WySongDetails { songs?:WyTrack[]; }

interface FeedHeaders {
  'User-Agent': string;
  Referer: string;
}
const HEADERS: FeedHeaders = {
  'User-Agent': 'Mozilla/5.0 LxMine/0.1',
  Referer: 'https://music.163.com/',
};

async function getJson(url: string): Promise<Object> {
  const client = http.createHttp();
  try {
    const response = await client.request(url, { method: http.RequestMethod.GET, header: HEADERS, connectTimeout: 10000, readTimeout: 10000 });
    if (response.responseCode !== 200) throw new Error(`HTTP ${response.responseCode}`);
    return JSON.parse(response.result as string) as Object;
  } finally {
    client.destroy();
  }
}

function mapSong(raw: WyTrack | null | undefined): Song | null {
  if (!raw || !raw.id) return null;
  const artists = raw.artists ?? raw.ar ?? [];
  const album = raw.album ?? raw.al;
  return {
    source: 'wy',
    id: `${raw.id}`,
    name: raw.name ?? '',
    singer: artists.map((artist: WyArtist) => artist.name ?? '').filter((name: string) => !!name).join('、'),
    albumName: album?.name ?? '',
    albumId: album?.id ? `${album.id}` : '',
    durationMs: raw.duration ?? raw.dt ?? 0,
    qualitys: ['128k', '320k', 'flac'],
    coverUrl: album?.picUrl ?? '',
  };
}

function mapPlaylist(raw: WyPlaylistItem): FeedPlaylist | null {
  if (!raw.id || !raw.name) return null;
  return {
    id: `${raw.id}`,
    name: raw.name,
    cover: raw.picUrl ?? raw.coverImgUrl ?? '',
    count: raw.trackCount ?? 0,
    playCount: raw.playCount ?? 0,
  };
}

export async function loadFeedPlaylistSongs(id: string, onUnavailable:(count:number)=>void=()=>{}): Promise<Song[]> {
  const data = await getJson(`https://music.163.com/api/v6/playlist/detail?id=${encodeURIComponent(id)}&n=0`) as WyDetail;
  const ids=data.playlist?.trackIds??[];
  const byId:Map<number,WyTrack>=new Map<number,WyTrack>();
  for(const track of data.playlist?.tracks??[])if(track.id)byId.set(track.id,track);
  for(let offset=0;offset<ids.length;offset+=200){
    const batch=ids.slice(offset,offset+200).filter((track:WyTrackId)=>!byId.has(track.id));
    if(!batch.length)continue;
    const detail=await getJson('https://music.163.com/api/song/detail?ids='+encodeURIComponent(JSON.stringify(batch.map((track:WyTrackId)=>track.id)))) as WySongDetails;
    for(const track of detail.songs??[])if(track.id)byId.set(track.id,track);
  }
  const tracks:WyTrack[]=ids.length?ids.map((track:WyTrackId)=>byId.get(track.id)).filter((track:WyTrack|undefined)=>track!==undefined) as WyTrack[]:Array.from(byId.values());
  const songs: Song[] = [];
  for (const track of tracks) {
    const song = mapSong(track);
    if (song) songs.push(song);
  }
  if(ids.length>songs.length)onUnavailable(ids.length-songs.length);
  return songs;
}

export async function loadHomeFeed(seed: Song | null): Promise<HomeFeed> {
  const settled = await Promise.allSettled([
    getJson('https://music.163.com/api/personalized/playlist?limit=30'),
    getJson('https://music.163.com/api/personalized/newsong?limit=30'),
    getJson('https://music.163.com/api/toplist/detail'),
  ]);
  const personalized = settled[0];
  const newsong = settled[1];
  const toplist = settled[2];
  const playlists: FeedPlaylist[] = [];
  if (personalized.status === 'fulfilled') {
    for (const raw of (personalized.value as WyPersonalized).result ?? []) {
      const item = mapPlaylist(raw);
      if (item) playlists.push(item);
    }
  }
  const newSongs: Song[] = [];
  if (newsong.status === 'fulfilled') {
    for (const raw of (newsong.value as WyNewsong).result ?? []) {
      const track = raw.song;
      if (!track) continue;
      const item = mapSong({
        id: track.id ?? raw.id,
        name: track.name ?? raw.name,
        artists: track.artists,
        ar: track.ar,
        album: track.album,
        al: track.al,
        duration: track.duration,
        dt: track.dt,
      });
      if (item) newSongs.push(item);
    }
  }
  const charts: FeedPlaylist[] = [];
  if (toplist.status === 'fulfilled') {
    for (const raw of (toplist.value as WyToplist).list ?? []) {
      const item = mapPlaylist(raw);
      if (item) charts.push(item);
    }
  }
  let similar: Song[] = [];
  if (seed?.singer) {
    try {
      const result = await searchLx('wy', seed.singer, 1, 30);
      similar = result.items.filter((song: Song) => song.id !== seed.id).slice(0, 30);
    } catch (_) {}
  }
  return { playlists, newSongs, charts, similar };
}
