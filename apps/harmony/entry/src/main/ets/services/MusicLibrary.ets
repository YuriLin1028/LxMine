import { Song } from '../model/Song';

// 可跨端携带完整歌曲身份的 LX 歌单；支持自定义歌单封面（歌曲封面 URL 或本地图片 data/file URI）。
export interface MusicPlaylist {
  id: string;
  name: string;
  kind?: string;
  songs?: Song[];
  songIds?: string[];
  pcTracks?: Object[];
  customCover?: string;
  createdAt: number;
  updatedAt: number;
  isFavorite?: boolean;
  warning?: string;
  preserveQueue?: boolean;
}

export function songKey(song: Song): string { return `${song.source ?? 'kw'}:${song.id}`; }

export function createPlaylist(name: string, favorite: boolean = false): MusicPlaylist {
  return { id: `lx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, kind: 'lx', songs: [], songIds: [], customCover: '', createdAt: Date.now(), updatedAt: Date.now(), isFavorite: favorite };
}

export function playlistWithSong(playlist: MusicPlaylist, song: Song, remove: boolean = false): MusicPlaylist {
  const songs = (playlist.songs ?? []).filter((item: Song) => songKey(item) !== songKey(song));
  if (!remove) songs.unshift(song);
  return { id: playlist.id, name: playlist.name, kind: 'lx', songs, pcTracks: playlist.pcTracks, customCover: playlist.customCover ?? '', songIds: songs.map(songKey), createdAt: playlist.createdAt, updatedAt: Date.now(), isFavorite: playlist.isFavorite, warning: playlist.warning };
}

export function playlistWithoutSongs(playlist: MusicPlaylist, removeKeys: Set<string>): MusicPlaylist {
  const songs = (playlist.songs ?? []).filter((item: Song) => !removeKeys.has(songKey(item)));
  return { id: playlist.id, name: playlist.name, kind: playlist.kind ?? 'lx', songs, pcTracks: playlist.pcTracks, customCover: playlist.customCover ?? '', songIds: songs.map(songKey), createdAt: playlist.createdAt, updatedAt: Date.now(), isFavorite: playlist.isFavorite, warning: playlist.warning };
}

export function playlistRenamed(playlist: MusicPlaylist, nextName: string): MusicPlaylist {
  const clean = nextName.trim() || playlist.name;
  const songs = (playlist.songs ?? []).slice();
  return { id: playlist.id, name: clean, kind: playlist.kind ?? 'lx', songs, pcTracks: playlist.pcTracks, customCover: playlist.customCover ?? '', songIds: songs.map(songKey), createdAt: playlist.createdAt, updatedAt: Date.now(), isFavorite: playlist.isFavorite, warning: playlist.warning };
}

export function playlistCoverUpdated(playlist: MusicPlaylist, cover: string): MusicPlaylist {
  const songs = (playlist.songs ?? []).slice();
  return { id: playlist.id, name: playlist.name, kind: playlist.kind ?? 'lx', songs, pcTracks: playlist.pcTracks, customCover: (cover || '').trim(), songIds: songs.map(songKey), createdAt: playlist.createdAt, updatedAt: Date.now(), isFavorite: playlist.isFavorite, warning: playlist.warning };
}

export function playlistReordered(playlist: MusicPlaylist, orderedKeys: string[]): MusicPlaylist {
  const current = (playlist.songs ?? []).slice();
  const rank = new Map<string, number>();
  for (let i = 0; i < orderedKeys.length; i += 1) rank.set(orderedKeys[i], i);
  current.sort((a: Song, b: Song): number => {
    const ra = rank.has(songKey(a)) ? rank.get(songKey(a))! : 999999;
    const rb = rank.has(songKey(b)) ? rank.get(songKey(b))! : 999999;
    return ra - rb;
  });
  return { id: playlist.id, name: playlist.name, kind: playlist.kind ?? 'lx', songs: current, pcTracks: playlist.pcTracks, customCover: playlist.customCover ?? '', songIds: current.map(songKey), createdAt: playlist.createdAt, updatedAt: Date.now(), isFavorite: playlist.isFavorite, warning: playlist.warning };
}

export function playlistSongReplaced(playlist: MusicPlaylist, targetKey: string, replacement: Song): MusicPlaylist {
  const nextKey = songKey(replacement);
  const replaced: Song[] = [];
  const seen = new Set<string>();
  for (const item of (playlist.songs ?? [])) {
    const current = songKey(item) === targetKey ? replacement : item;
    const key = songKey(current);
    if (seen.has(key)) continue;
    seen.add(key);
    replaced.push(current);
  }
  if (!seen.has(nextKey) && !(playlist.songs ?? []).some((item: Song) => songKey(item) === targetKey)) {
    replaced.push(replacement);
  }
  return { id: playlist.id, name: playlist.name, kind: playlist.kind ?? 'lx', songs: replaced, pcTracks: playlist.pcTracks, customCover: playlist.customCover ?? '', songIds: replaced.map(songKey), createdAt: playlist.createdAt, updatedAt: Date.now(), isFavorite: playlist.isFavorite, warning: playlist.warning };
}

export function playlistCoversPatched(playlist: MusicPlaylist, covers: Map<string, string>): MusicPlaylist {
  let changed = false;
  const songs = (playlist.songs ?? []).map((item: Song): Song => {
    if (item.coverUrl) return item;
    const found = covers.get(songKey(item)) ?? '';
    if (!found) return item;
    changed = true;
    const copy = JSON.parse(JSON.stringify(item)) as Song;
    copy.coverUrl = found;
    return copy;
  });
  if (!changed) return playlist;
  return { id: playlist.id, name: playlist.name, kind: playlist.kind ?? 'lx', songs, pcTracks: playlist.pcTracks, customCover: playlist.customCover ?? '', songIds: playlist.songIds ?? songs.map(songKey), createdAt: playlist.createdAt, updatedAt: playlist.updatedAt, isFavorite: playlist.isFavorite, warning: playlist.warning };
}

export function mergeSyncPlaylists(current: MusicPlaylist[], incoming: MusicPlaylist[]): MusicPlaylist[] {
  const merged: MusicPlaylist[] = current.slice();
  for (const rawItem of incoming) {
    const itemIsFav = Boolean(rawItem.isFavorite) || rawItem.name === '我喜欢的' || rawItem.name === '我的收藏';
    const favDisplayName = !rawItem.name || rawItem.name === '我喜欢的' ? '我的收藏' : rawItem.name;
    const item: MusicPlaylist = itemIsFav ? {
      id: rawItem.id, name: favDisplayName, kind: rawItem.kind ?? 'lx',
      songs: rawItem.songs ?? [], pcTracks: rawItem.pcTracks, customCover: rawItem.customCover ?? '',
      songIds: (rawItem.songs ?? []).map(songKey), createdAt: rawItem.createdAt, updatedAt: rawItem.updatedAt,
      isFavorite: true, warning: rawItem.warning
    } : rawItem;
    const idx = merged.findIndex((existing: MusicPlaylist) => {
      const existingIsFav = Boolean(existing.isFavorite) || existing.name === '我喜欢的' || existing.name === '我的收藏';
      return (itemIsFav && existingIsFav) || existing.id === item.id;
    });
    if (idx < 0) {
      if (merged.length < 100) merged.push(item);
      continue;
    }
    const existing = merged[idx];
    if (itemIsFav) {
      const incomingSongs = item.songs ?? [];
      const existingSongs = existing.songs ?? [];
      if (!incomingSongs.length && existingSongs.length) continue;
      const primary = (item.updatedAt || 0) >= (existing.updatedAt || 0) ? incomingSongs : existingSongs;
      const secondary = primary === incomingSongs ? existingSongs : incomingSongs;
      const seen = new Set<string>();
      const combined: Song[] = [];
      for (const s of primary) {
        const k = songKey(s);
        if (!seen.has(k)) { seen.add(k); combined.push(s); }
      }
      for (const s of secondary) {
        const k = songKey(s);
        if (!seen.has(k)) { seen.add(k); combined.push(s); }
      }
      const resolvedFavName = item.name && item.name !== '我喜欢的' ? item.name : (existing.name && existing.name !== '我喜欢的' ? existing.name : '我的收藏');
      merged[idx] = {
        id: existing.id,
        name: resolvedFavName,
        kind: 'lx',
        songs: combined,
        pcTracks: item.pcTracks ?? existing.pcTracks,
        customCover: item.customCover || existing.customCover || '',
        songIds: combined.map(songKey),
        createdAt: existing.createdAt,
        updatedAt: Math.max(existing.updatedAt || 0, item.updatedAt || 0),
        isFavorite: true,
        warning: item.warning,
      };
      continue;
    }
    if ((item.updatedAt || 0) > (existing.updatedAt || 0)) {
      merged[idx] = { id: existing.id, name: item.name, kind: item.kind ?? 'lx', songs: item.songs ?? [], pcTracks: item.pcTracks, customCover: item.customCover || existing.customCover || '', songIds: (item.songs ?? []).map(songKey), createdAt: existing.createdAt, updatedAt: item.updatedAt, isFavorite: existing.isFavorite || item.isFavorite, warning: item.warning };
    }
  }
  return merged;
}

/** 验证同步/持久化数据并保留 PC 的本地歌单，不丢失无法在移动端解析的文件引用。 */
export function parsePlaylists(json: string): MusicPlaylist[] {
  const data = JSON.parse(json) as MusicPlaylist[];
  if (!Array.isArray(data)) throw new Error('歌单格式错误');
  for (const playlist of data) {
    if (!playlist || typeof playlist.id !== 'string' || typeof playlist.name !== 'string') throw new Error('歌单缺少名称或标识');
    if (playlist.name === '我喜欢的' || playlist.name === '我的收藏') {
      playlist.isFavorite = true;
      if (playlist.name === '我喜欢的') playlist.name = '我的收藏';
    } else if (playlist.isFavorite && !playlist.name.trim()) {
      playlist.name = '我的收藏';
    }
    if (playlist.songs !== undefined) {
      if (!Array.isArray(playlist.songs)) throw new Error('歌曲列表格式错误');
      for (const song of playlist.songs) {
        if (!song || typeof song.id !== 'string' || typeof song.name !== 'string' || !['kw', 'kg', 'wy', 'tx', 'mg', 'qishui', 'local'].includes(song.source ?? 'kw')) throw new Error('歌曲身份错误');
      }
    }
  }
  return data;
}
