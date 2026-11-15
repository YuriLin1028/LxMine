import { Song } from '../model/Song';

// 应用接续的发送侧桥接：EntryAbility.onContinue() 与页面生命周期不同源。
// 页面只保存歌曲/队列的对象引用与当前进度（不每秒 JSON.stringify 整条队列），
// onContinue 真正被系统调用时才序列化，避免大队列在播放/滚动期间每帧抢 UI 线程。
interface LatestPlayback {
  song: Song;
  queue: Song[];
  positionMs: number;
  playing: boolean;
}
let latest: LatestPlayback | null = null;

export function setLatestPlaybackState(song: Song, queue: Song[], positionMs: number, playing: boolean): void {
  latest = { song, queue, positionMs, playing };
}

export function latestPlaybackSnapshot(): string {
  return latest ? JSON.stringify(latest) : '';
}
