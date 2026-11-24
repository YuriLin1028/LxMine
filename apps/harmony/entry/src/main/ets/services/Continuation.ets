import { Song } from '../model/Song';

// 应用接续的发送侧桥接：EntryAbility.onContinue() 与页面生命周期不同源。
// 鸿蒙分布式接续 wantParam 单次 IPC 载荷上限约 100KB：必须裁剪单曲冗余字段并限制队列窗口（当前曲前后共 40 首），
// 避免大歌单序列化超限导致点击 Dock 接续图标后提示「接续失败」。
interface CompactPlayback {
  song: Song;
  queue: Song[];
  positionMs: number;
  playing: boolean;
}

interface LatestPlayback {
  song: Song;
  queue: Song[];
  positionMs: number;
  playing: boolean;
}

let latest: LatestPlayback | null = null;

function compactSong(song: Song): Song {
  const out: Song = {
    source: song.source || 'wy',
    id: String(song.id || ''),
    name: String(song.name || '').slice(0, 120),
    singer: String(song.singer || '').slice(0, 100),
    albumName: String(song.albumName || '').slice(0, 100),
    albumId: String(song.albumId || '').slice(0, 64),
    durationMs: Number.isFinite(song.durationMs) ? Math.max(0, Math.round(song.durationMs)) : 0,
    qualitys: Array.isArray(song.qualitys) ? song.qualitys.slice(0, 4) : ['128k', '320k', 'flac'],
    coverUrl: /^https?:\/\//i.test(song.coverUrl || '') ? String(song.coverUrl).slice(0, 260) : '',
  };
  if (song.hash) out.hash = String(song.hash).slice(0, 80);
  if (song.strMediaMid) out.strMediaMid = String(song.strMediaMid).slice(0, 80);
  if (song.songId) out.songId = String(song.songId).slice(0, 64);
  return out;
}

export function buildCompactContinuationJson(song: Song, queue: Song[], positionMs: number, playing: boolean): string {
  const safeSong = compactSong(song);
  const srcQueue = Array.isArray(queue) && queue.length ? queue : [song];
  const curIdx = Math.max(0, srcQueue.findIndex((item: Song) => item && item.id === song.id && item.source === song.source));
  const half = 20;
  let start = Math.max(0, curIdx - half);
  let end = Math.min(srcQueue.length, start + 40);
  if (end - start < 40) start = Math.max(0, end - 40);
  let trimmedQueue: Song[] = srcQueue.slice(start, end).map((item: Song) => compactSong(item));
  if (!trimmedQueue.some((item: Song) => item.id === safeSong.id && item.source === safeSong.source)) {
    trimmedQueue.unshift(safeSong);
  }
  const makeJson = (q: Song[]): string => JSON.stringify({
    song: safeSong,
    queue: q,
    positionMs: Math.max(0, Math.round(Number(positionMs) || 0)),
    playing: playing === true,
  } as CompactPlayback);
  let json = makeJson(trimmedQueue);
  // 严格控制在 40KB 以内，远低于鸿蒙 wantParam 100KB 上限
  if (json.length > 40000) {
    trimmedQueue = trimmedQueue.slice(0, 12);
    if (!trimmedQueue.some((item: Song) => item.id === safeSong.id && item.source === safeSong.source)) {
      trimmedQueue = [safeSong].concat(trimmedQueue.slice(0, 11));
    }
    json = makeJson(trimmedQueue);
  }
  if (json.length > 40000) {
    json = makeJson([safeSong]);
  }
  return json;
}

export function compactSavedPlaybackJson(raw: string): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as LatestPlayback;
    if (!parsed || !parsed.song || !parsed.song.id) return '';
    return buildCompactContinuationJson(parsed.song, parsed.queue ?? [parsed.song], parsed.positionMs ?? 0, parsed.playing === true);
  } catch (_) {
    return '';
  }
}

export function setLatestPlaybackState(song: Song, queue: Song[], positionMs: number, playing: boolean): void {
  latest = { song, queue, positionMs, playing };
}

export function latestPlaybackSnapshot(): string {
  return latest ? buildCompactContinuationJson(latest.song, latest.queue, latest.positionMs, latest.playing) : '';
}
