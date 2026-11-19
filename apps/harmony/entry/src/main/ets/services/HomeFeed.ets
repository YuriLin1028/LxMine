import http from '@ohos.net.http';
import { Song } from '../model/Song';
import { searchLx } from './SearchApi';
import { LxHost } from './LxRuntime';
import { MusicPlaylist } from './MusicLibrary';

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
  /** 首页第一行随机推荐榜单（每日与双击刷新轮换，保证全部带封面）。 */
  bannerCharts?: FeedPlaylist[];
  similar: Song[];
  forYou?: Song[];
  personalized?: boolean;
  topArtists?: string[];
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

function httpsUrl(url: string | undefined): string {
  if (!url) return '';
  return url.replace('{size}', '400').replace(/^\/\//, 'https://').replace(/^http:/, 'https:');
}

export async function hydrateSongCovers(host: LxHost, songs: Song[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const missing: Song[] = [];
  const seen = new Set<string>();
  for (const s of songs) {
    if (!s || s.coverUrl || s.source === 'local') continue;
    const k = `${s.source}:${s.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    missing.push(s);
    if (missing.length >= 32) break;
  }
  if (!missing.length) return result;
  try {
    const raw = await host.catalogue('song-covers', JSON.stringify({ songs: missing }));
    const parsed = JSON.parse(raw) as Record<string, string>;
    const keys = Object.keys(parsed);
    for (const k of keys) {
      const val = httpsUrl(parsed[k]);
      if (val) result.set(k, val);
    }
  } catch (_) {}
  return result;
}

export function applyCoversToSongs(songs: Song[], covers: Map<string, string>): Song[] {
  if (!covers.size) return songs;
  let changed = false;
  const next = songs.map((s: Song): Song => {
    if (s.coverUrl) return s;
    const found = covers.get(`${s.source}:${s.id}`) ?? '';
    if (!found) return s;
    changed = true;
    const copy = JSON.parse(JSON.stringify(s)) as Song;
    copy.coverUrl = found;
    return copy;
  });
  return changed ? next : songs;
}

export async function loadMergedHome(host: LxHost, algoSeed: number = 0): Promise<HomeFeed> {
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
  const sanitizeList = (list: FeedPlaylist[]): FeedPlaylist[] => list.map((p: FeedPlaylist): FeedPlaylist => {
    p.cover = httpsUrl(p.cover);
    return p;
  });
  const playlistKey = (item: FeedPlaylist): string => `${item.source ?? ''}:${item.id}`;
  const songKey = (song: Song): string => `${song.source}:${song.id}`;
  const recommend = sanitizeList(mergeRoundRobin(ok.map((part: PlatformLite) => part.recommend ?? []), playlistKey));
  const hot = sanitizeList(mergeRoundRobin(ok.map((part: PlatformLite) => part.hot ?? []), playlistKey));
  // 榜单大融合：同概念（飙升/新歌/热歌/原创）的榜单合并成一个多来源榜单；
  // 融合后的榜单本身没有角标，只有里面的歌曲封面带角标。
  const charts: FeedPlaylist[] = [];
  const concepts = new Map<string, FeedPlaylist>();
  for (const part of ok) {
    for (const chart of part.charts ?? []) {
      chart.cover = httpsUrl(chart.cover);
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
  let newSongs = mergeRoundRobin(ok.map((part: PlatformLite) => part.newSongs ?? []), songKey).map((s: Song): Song => {
    s.coverUrl = httpsUrl(s.coverUrl);
    return s;
  });
  const newCovers = await hydrateSongCovers(host, newSongs);
  newSongs = applyCoversToSongs(newSongs, newCovers);
  // 跨平台新歌按规范化歌名+主歌手去重，避免同一首热歌在四平台重复出现。
  const seenCanonicalNew = new Set<string>();
  const dedupedNew: Song[] = [];
  for (const s of newSongs) {
    const ck = canonicalSongKey(s);
    if (seenCanonicalNew.has(ck)) continue;
    seenCanonicalNew.add(ck);
    dedupedNew.push(s);
  }
  newSongs = dedupedNew;

  // 兜底补齐所有榜单封面：优先取融合子榜封面，其次取歌单/新歌真实封面，杜绝榜单无封面。
  const songCoverPool: string[] = newSongs.map((s: Song) => s.coverUrl).filter((u: string) => u.length > 0);
  const playlistCoverPool: string[] = recommend.concat(hot).map((p: FeedPlaylist) => p.cover).filter((u: string) => u.length > 0);
  const allChartFallbackCovers: string[] = playlistCoverPool.concat(songCoverPool);
  const usedChartCovers = new Set<string>(charts.map((c: FeedPlaylist) => c.cover).filter((u: string) => u.length > 0));
  let chartCoverIdx = 0;
  for (const chart of charts) {
    if (!chart.cover && chart.parts?.length) {
      const partCover = chart.parts.find((p: FeedPlaylist) => p.cover.length > 0)?.cover ?? '';
      if (partCover) chart.cover = partCover;
    }
    if (!chart.cover && allChartFallbackCovers.length > 0) {
      let picked = allChartFallbackCovers.find((u: string) => !usedChartCovers.has(u)) ?? '';
      if (!picked) {
        picked = allChartFallbackCovers[chartCoverIdx % allChartFallbackCovers.length];
        chartCoverIdx += 1;
      }
      chart.cover = picked;
      usedChartCovers.add(picked);
    }
  }

  const coverPool: FeedPlaylist[] = recommend.concat(hot).concat(charts).filter((p: FeedPlaylist) => p.cover.length > 0);
  // 分类：各平台的歌单分类标签融合，并从推荐/热门歌单匹配真实封面，杜绝空封面板块卡片。
  const categoryItems: FeedPlaylist[] = [];
  const categorySeen = new Set<string>();
  let coverCursor = 0;
  for (const part of ok) {
    for (const tag of part.categories ?? []) {
      const name = typeof tag.name === 'string' ? tag.name : '';
      if (!name || categorySeen.has(name)) continue;
      categorySeen.add(name);
      const matched = coverPool.find((p: FeedPlaylist) => p.name.includes(name));
      const fallbackCover = coverPool.length > 0 ? coverPool[(coverCursor++) % coverPool.length].cover : '';
      categoryItems.push({ id: `category-${name}`, name, cover: matched ? matched.cover : fallbackCover, count: 0, playCount: 0, request: { source: part.source ?? 'wy', type: 'hot', category: name } });
    }
  }
  const sections: FeedSection[] = [
    { id: 'playlists', title: '推荐歌单', kind: 'playlist', items: recommend },
    { id: 'charts', title: '排行榜', kind: 'playlist', items: charts },
    { id: 'hot', title: '热门歌单', kind: 'playlist', items: hot },
    { id: 'category', title: '歌单分类', kind: 'playlist', items: categoryItems },
  ];
  const dayNumber = Math.floor(Date.now() / 86400000) + algoSeed * 7919;
  const bannerCharts = pickRandomBannerCharts(charts, dayNumber + algoSeed * 1301, 5);
  // 基础每日三十首尽量避开新歌速递前 20 首，减少板块重复。
  const tailPool = newSongs.length > 24 ? newSongs.slice(18).concat(newSongs.slice(0, 18)) : newSongs;
  const dailySongs = dailyShuffle(tailPool, dayNumber);
  const firstDailyCover = dailySongs.find((s: Song) => s.coverUrl.length > 0)?.coverUrl ?? recommend[0]?.cover ?? '';
  const daily: FeedPlaylist = { id: 'daily-30', name: '每日三十首', cover: firstDailyCover, count: dailySongs.length, playCount: 0 };
  return { source: 'all', sections, playlists: recommend, newSongs, charts, bannerCharts, similar: [], daily, dailySongs };
}

interface HabitArtistStat {
  score: number;
  updatedAt: number;
}
const habitArtistStats: Map<string, HabitArtistStat> = new Map();
const habitPlatformStats: Map<string, number> = new Map();
const habitSkippedSongs: Map<string, number> = new Map();

export function canonicalSongKey(song: Song): string {
  const cleanTitle = (song.name ?? '')
    .toLowerCase()
    .replace(/[\(\（\[\【][^\)\）\]\】]*[\)\）\]\】]/g, '')
    .replace(/[\s\-_·.,，。!?！？'"]+/g, '')
    .trim();
  const cleanSinger = (song.singer ?? '')
    .toLowerCase()
    .split(/[\/、,&;，]+/)[0]
    .replace(/[\s\-_·.,，。'"]+/g, '')
    .trim();
  return `${cleanTitle || song.id}|${cleanSinger}`;
}

export function recordListenHabit(song: Song, listenedMs: number, durationMs: number, completed: boolean): void {
  if (!song || !song.name) return;
  const now = Date.now();
  const ratio = durationMs > 0 ? listenedMs / durationMs : 0;
  const isComplete = completed || ratio >= 0.65 || listenedMs >= 90000;
  const isEarlySkip = !isComplete && listenedMs >= 1500 && listenedMs < 20000 && durationMs > 45000 && ratio < 0.22;
  const delta = isComplete ? 3.6 : (isEarlySkip ? -1.8 : (listenedMs >= 30000 ? 1.2 : 0));
  if (delta !== 0) {
    const parts = (song.singer ?? '').split(/[\/、,&;，]+/);
    for (const raw of parts) {
      const name = raw.trim();
      if (!name || name.length > 32 || name === '未知歌手' || name === '本地文件' || name === '群星') continue;
      const prev = habitArtistStats.get(name);
      const decay = prev ? Math.exp(-Math.max(0, now - prev.updatedAt) / (21 * 86400000)) : 1;
      habitArtistStats.set(name, { score: (prev ? prev.score * decay : 0) + delta, updatedAt: now });
    }
  }
  if (isComplete && song.source && song.source !== 'local') {
    habitPlatformStats.set(song.source, (habitPlatformStats.get(song.source) ?? 0) + 1);
  }
  if (isEarlySkip) {
    habitSkippedSongs.set(canonicalSongKey(song), now);
  }
}

function pickRandomBannerCharts(charts: FeedPlaylist[], seed: number, limit: number): FeedPlaylist[] {
  if (charts.length <= limit) return charts.slice();
  const copy = charts.slice();
  let state = (seed ^ 0x5bd1e995) >>> 0;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
  }
  return copy.slice(0, limit);
}

function timeOfDayMoodQuery(hour: number, seed: number): string {
  const buckets: string[][] = hour >= 5 && hour < 10
    ? [['清晨', '轻快'], ['民谣', '治愈']]
    : hour >= 10 && hour < 18
      ? [['华语流行', '节奏'], ['轻音乐', '独立']]
      : hour >= 18 && hour < 22
        ? [['热门', '粤语'], ['摇滚', 'R&B']]
        : [['深夜', '舒缓'], ['爵士', '治愈']];
  const pair = buckets[Math.abs(seed) % buckets.length];
  return pair[Math.abs(hour + seed) % pair.length];
}

export async function enrichPersonalizedHome(
  feed: HomeFeed,
  recentSongs: Song[],
  playlists: MusicPlaylist[],
  host?: LxHost,
  algoSeed: number = 0,
  searchHistory: string[] = [],
): Promise<HomeFeed> {
  const now = Date.now();
  const scores = new Map<string, number>();
  const recentBlocked = new Set<string>();
  const platformAffinity = new Map<string, number>();
  const addArtistScore = (singer: string, weight: number): void => {
    const parts = singer.split(/[\/、,&;，]+/);
    for (const raw of parts) {
      const name = raw.trim();
      if (!name || name.length > 32 || name === '未知歌手' || name === '本地文件' || name === '群星' || name === 'Various Artists') continue;
      scores.set(name, (scores.get(name) ?? 0) + weight);
    }
  };
  // 1. 实时听歌习惯画像（完播加权 + 切歌负反馈 + 21 天时间衰减）
  habitArtistStats.forEach((stat: HabitArtistStat, artist: string) => {
    const decay = Math.exp(-Math.max(0, now - stat.updatedAt) / (21 * 86400000));
    scores.set(artist, (scores.get(artist) ?? 0) + stat.score * decay);
  });
  habitPlatformStats.forEach((count: number, src: string) => {
    platformAffinity.set(src, (platformAffinity.get(src) ?? 0) + count * 1.5);
  });
  // 2. 最近播放（前 6 首短期避让，其余按近因衰减加权）
  for (let i = 0; i < Math.min(recentSongs.length, 50); i += 1) {
    const song = recentSongs[i];
    if (i < 6) recentBlocked.add(canonicalSongKey(song));
    addArtistScore(song.singer, Math.max(0.7, 2.8 - i * 0.045));
    if (song.source && song.source !== 'local') {
      platformAffinity.set(song.source, (platformAffinity.get(song.source) ?? 0) + 1);
    }
  }
  // 3. 收藏与自建歌单
  for (const list of playlists) {
    const weight = list.isFavorite ? 4.0 : 1.4;
    for (const song of (list.songs ?? []).slice(0, 100)) {
      addArtistScore(song.singer, weight);
      if (song.source && song.source !== 'local') {
        platformAffinity.set(song.source, (platformAffinity.get(song.source) ?? 0) + (list.isFavorite ? 1.5 : 0.5));
      }
    }
  }
  // 4. 最近搜索关键词偏好
  const cleanSearches = searchHistory
    .map((q: string) => q.trim())
    .filter((q: string) => q.length >= 2 && q.length <= 24)
    .slice(0, 6);
  for (const q of cleanSearches) {
    scores.set(q, (scores.get(q) ?? 0) + 1.8);
  }
  // 48 小时内频繁秒切的歌曲避让
  habitSkippedSongs.forEach((ts: number, key: string) => {
    if (now - ts < 48 * 3600000) recentBlocked.add(key);
  });

  const preferredPlatforms: Array<'wy' | 'tx' | 'kg' | 'kw'> = (['wy', 'tx', 'kg', 'kw'] as Array<'wy' | 'tx' | 'kg' | 'kw'>)
    .sort((a: string, b: string) => (platformAffinity.get(b) ?? 0) - (platformAffinity.get(a) ?? 0));
  const daySeed = Math.floor(now / 86400000) + algoSeed * 7919;
  const bannerCharts = pickRandomBannerCharts(feed.charts, daySeed + algoSeed * 1301, 5);
  const allRanked: string[] = Array.from(scores.keys())
    .filter((k: string) => (scores.get(k) ?? 0) > 0.2)
    .sort((a: string, b: string) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0))
    .slice(0, 12);

  if (!allRanked.length) {
    // 无听歌历史时：用时段氛围召回 + 严格跨板块去重，保证猜你喜欢/每日三十首/新歌速递互不重复。
    const moodWord = timeOfDayMoodQuery(new Date().getHours(), algoSeed);
    let moodSongs: Song[] = await searchLx('wy', moodWord, 1, 20).then((r): Song[] => r.items).catch((): Song[] => []);
    if (host && moodSongs.length) {
      const mc = await hydrateSongCovers(host, moodSongs);
      moodSongs = applyCoversToSongs(moodSongs, mc);
    }
    const forYou = moodSongs.slice(0, 16);
    const usedForYou = new Set<string>(forYou.map(canonicalSongKey));
    const freshPool = feed.newSongs.filter((s: Song) => !usedForYou.has(canonicalSongKey(s)));
    const dailyBase = freshPool.length > 26 ? freshPool.slice(18).concat(moodSongs.slice(16)) : freshPool.concat(moodSongs.slice(16));
    const dailySongs = dailyShuffle(dailyBase, daySeed);
    const usedDaily = new Set<string>(dailySongs.map(canonicalSongKey));
    const reorderedNew = feed.newSongs.filter((s: Song) => !usedDaily.has(canonicalSongKey(s)) && !usedForYou.has(canonicalSongKey(s)))
      .concat(feed.newSongs.filter((s: Song) => usedDaily.has(canonicalSongKey(s)) || usedForYou.has(canonicalSongKey(s))));
    const dailyCover = dailySongs.find((s: Song) => s.coverUrl.length > 0)?.coverUrl ?? feed.daily?.cover ?? '';
    const daily: FeedPlaylist = { id: 'daily-30', name: '每日三十首', cover: dailyCover, count: dailySongs.length, playCount: 0 };
    return {
      source: feed.source, sections: feed.sections, playlists: feed.playlists, newSongs: reorderedNew,
      charts: feed.charts, bannerCharts, similar: feed.similar, forYou, personalized: false, topArtists: [], daily, dailySongs,
    };
  }

  // 选取 5 个核心兴趣词 + 1 个时段氛围词，跨用户偏好平台多路召回。
  const ranked: string[] = [];
  const startIdx = algoSeed > 0 && allRanked.length > 4 ? (algoSeed % allRanked.length) : 0;
  for (let k = 0; k < Math.min(5, allRanked.length); k += 1) {
    ranked.push(allRanked[(startIdx + k) % allRanked.length]);
  }
  const moodQuery = timeOfDayMoodQuery(new Date().getHours(), algoSeed);
  const queries: string[] = ranked.concat([moodQuery]);
  const searchPage = algoSeed > 0 ? ((algoSeed % 2) + 1) : 1;
  const fetchedLists = await Promise.all(queries.map((q: string, idx: number): Promise<Song[]> => {
    const src = preferredPlatforms[idx % Math.min(3, preferredPlatforms.length)];
    return searchLx(src, q, searchPage, 14)
      .then((res): Song[] => res.items.length ? res.items : [])
      .catch((): Song[] => []);
  }));
  let rawHabitPool = mergeRoundRobin(fetchedLists, canonicalSongKey)
    .filter((song: Song) => !recentBlocked.has(canonicalSongKey(song)));
  if (!rawHabitPool.length && searchPage > 1) {
    const retryLists = await Promise.all(ranked.slice(0, 3).map((artist: string): Promise<Song[]> =>
      searchLx('wy', artist, 1, 12).then((res): Song[] => res.items).catch((): Song[] => [])
    ));
    rawHabitPool = mergeRoundRobin(retryLists, canonicalSongKey);
  }
  if (!rawHabitPool.length) return feed;
  if (algoSeed > 0) {
    rawHabitPool = dailyShuffle(rawHabitPool, algoSeed * 4099 + 13);
  }
  // 歌手多样性约束（MMR）：同一主歌手在单个板块最多出现 2 首。
  const diversify = (list: Song[], limit: number, exclude: Set<string>): Song[] => {
    const out: Song[] = [];
    const artistCount = new Map<string, number>();
    for (const s of list) {
      const ck = canonicalSongKey(s);
      if (exclude.has(ck)) continue;
      const primaryArtist = (s.singer ?? '').split(/[\/、,&;，]+/)[0].trim().toLowerCase();
      const cnt = artistCount.get(primaryArtist) ?? 0;
      if (primaryArtist && cnt >= 2) continue;
      exclude.add(ck);
      if (primaryArtist) artistCount.set(primaryArtist, cnt + 1);
      out.push(s);
      if (out.length >= limit) break;
    }
    return out;
  };

  // 严格三板块互斥：猜你喜欢(16) -> 每日三十首(30) -> 新歌速递(前置无重复曲目)
  const usedGlobal = new Set<string>();
  let forYou = diversify(rawHabitPool, 16, usedGlobal);
  const dailyPersonal = diversify(rawHabitPool, 18, usedGlobal);
  // 每日三十首的平台探索配额优先从新歌尾段取，避开新歌速递前排 20 首。
  const newTailFirst = feed.newSongs.length > 22 ? feed.newSongs.slice(20).concat(feed.newSongs.slice(0, 20)) : feed.newSongs;
  const dailyFresh = diversify(newTailFirst, 30 - dailyPersonal.length, usedGlobal);
  let dailySongs = dailyShuffle(dailyPersonal.concat(dailyFresh), daySeed);

  if (host) {
    const covers = await hydrateSongCovers(host, forYou.concat(dailySongs));
    forYou = applyCoversToSongs(forYou, covers);
    dailySongs = applyCoversToSongs(dailySongs, covers);
  }
  // 新歌速递把未在猜你喜欢/每日三十首出现的新歌排在最前，确保三个板块几乎零重叠。
  const nonOverlappingNew = feed.newSongs.filter((s: Song) => !usedGlobal.has(canonicalSongKey(s)));
  const overlappingNew = feed.newSongs.filter((s: Song) => usedGlobal.has(canonicalSongKey(s)));
  const reorderedNewSongs = nonOverlappingNew.concat(overlappingNew);

  const dailyCover = dailySongs.find((s: Song) => s.coverUrl.length > 0)?.coverUrl ?? feed.daily?.cover ?? '';
  const daily: FeedPlaylist = {
    id: 'daily-30',
    name: '每日三十首',
    cover: dailyCover,
    count: dailySongs.length,
    playCount: 0,
  };
  return {
    source: feed.source,
    sections: feed.sections,
    playlists: feed.playlists,
    newSongs: reorderedNewSongs,
    charts: feed.charts,
    bannerCharts,
    similar: feed.similar,
    forYou,
    personalized: true,
    topArtists: ranked.slice(0, 4),
    daily,
    dailySongs,
  };
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
