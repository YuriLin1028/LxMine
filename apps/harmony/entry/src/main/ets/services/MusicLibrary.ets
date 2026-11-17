import { Song } from '../model/Song';

// 可跨端携带完整歌曲身份的 LX 歌单；本地文件路径歌单保留但不伪装成可在线播放。
export interface MusicPlaylist {
  id: string;
  name: string;
  kind?: string;
  songs?: Song[];
  songIds?: string[];
  pcTracks?: Object[];
  createdAt: number;
  updatedAt: number;
  isFavorite?: boolean;
  warning?: string;
}

export function songKey(song: Song): string { return `${song.source ?? 'kw'}:${song.id}`; }

export function createPlaylist(name: string, favorite: boolean = false): MusicPlaylist {
  return { id: `lx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, kind: 'lx', songs: [], songIds: [], createdAt: Date.now(), updatedAt: Date.now(), isFavorite: favorite };
}

export function playlistWithSong(playlist: MusicPlaylist, song: Song, remove: boolean = false): MusicPlaylist {
  const songs = (playlist.songs ?? []).filter((item: Song) => songKey(item) !== songKey(song));
  if (!remove) songs.push(song);
  return { id: playlist.id, name: playlist.name, kind: 'lx', songs, pcTracks: playlist.pcTracks, songIds: songs.map(songKey), createdAt: playlist.createdAt, updatedAt: Date.now(), isFavorite: playlist.isFavorite, warning: playlist.warning };
}

/** 验证同步/持久化数据并保留 PC 的本地歌单，不丢失无法在移动端解析的文件引用。 */
export function parsePlaylists(json: string): MusicPlaylist[] {
  const data = JSON.parse(json) as MusicPlaylist[];
  if (!Array.isArray(data)) throw new Error('歌单格式错误');
  for (const playlist of data) {
    if (!playlist || typeof playlist.id !== 'string' || typeof playlist.name !== 'string') throw new Error('歌单缺少名称或标识');
    if (playlist.songs !== undefined) {
      if (!Array.isArray(playlist.songs)) throw new Error('歌曲列表格式错误');
      for (const song of playlist.songs) {
        if (!song || typeof song.id !== 'string' || typeof song.name !== 'string' || !['kw', 'kg', 'wy', 'tx', 'mg', 'qishui'].includes(song.source ?? 'kw')) throw new Error('歌曲身份错误');
      }
    }
  }
  return data;
}
