import { Song } from '../model/Song';
import { songKey } from './MusicLibrary';

// 所有歌曲列表共用的展示顺序：只改变展示，不写回歌单本身。
export function orderSongList(songs: Song[], mode: string, manual: string[], query: string = ''): Song[] {
  const keyword = query.trim().toLowerCase();
  let list: Song[] = keyword.length
    ? songs.filter((song: Song) => `${song.name} ${song.singer} ${song.albumName}`.toLowerCase().includes(keyword))
    : songs.slice();
  if (mode === 'manual' && manual.length) {
    const rank: Map<string, number> = new Map();
    manual.forEach((key: string, index: number) => { rank.set(key, index); });
    list.sort((a: Song, b: Song) => {
      const ra = rank.has(songKey(a)) ? rank.get(songKey(a)) as number : 999999;
      const rb = rank.has(songKey(b)) ? rank.get(songKey(b)) as number : 999999;
      return ra - rb;
    });
  } else if (mode === 'name') {
    list.sort((a: Song, b: Song) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  } else if (mode === 'artist') {
    list.sort((a: Song, b: Song) => a.singer.localeCompare(b.singer, 'zh-Hans-CN') || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  } else if (mode === 'album') {
    list.sort((a: Song, b: Song) => a.albumName.localeCompare(b.albumName, 'zh-Hans-CN') || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }
  return list;
}
