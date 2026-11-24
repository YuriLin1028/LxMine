import type { SongResult, UnifiedSong } from '../types';
import { normalizeLxSong } from './onlineMusic/lxProvider';
import { readCacheEntry, putCacheEntry } from './repositories/cacheRepository';

// src/services/lxLibrary.ts — portable online playlists, separate from machine-local file IDs.
export type LxSource = 'kw' | 'kg' | 'wy' | 'tx';
export interface LxSong {
    id: string; source: LxSource; name: string; singer: string; albumName: string; albumId: string;
    durationMs: number; qualitys: string[]; coverUrl: string; hash?: string; hashes?: Record<string, string>;
}
export interface LxPlaylist {
    id: string; kind: 'lx'; name: string; songs: LxSong[]; songIds: string[];
    createdAt: number; updatedAt: number; isFavorite?: boolean;
}
const KEY = 'lxlia_online_playlists';
export const lxSongKey = (song: LxSong): string => `${song.source}:${song.id}`;
export const newLxPlaylist = (name: string, isFavorite = false): LxPlaylist => ({
    id: `lx-${crypto.randomUUID()}`, kind: 'lx', name, songs: [], songIds: [], createdAt: Date.now(), updatedAt: Date.now(), isFavorite,
});
export const getLxPlaylists = async (): Promise<LxPlaylist[]> => await readCacheEntry<LxPlaylist[]>(KEY) ?? [];
export const saveLxPlaylists = async (lists: LxPlaylist[]): Promise<void> => {
    await putCacheEntry(KEY, lists);
    window.dispatchEvent(new Event('lxlia-library-changed'));
};
export const lxPlaybackSong = (song: LxSong): UnifiedSong => normalizeLxSong(song, song.source);
export const toPortableLxSong = (song: SongResult): LxSong | null => {
    const ref = song.sourceRef;
    if (ref?.kind !== 'online' || !['lx', 'lx-kg', 'lx-wy', 'lx-tx'].includes(ref.providerId)) return null;
    const source: LxSource = ref.providerId === 'lx' ? 'kw' : ref.providerId.slice(3) as LxSource;
    const data = ref.providerData ?? {};
    let hashes: Record<string, string> = {};
    try { hashes = JSON.parse(String(data.hashes ?? '{}')); } catch { /* Missing optional hashes. */ }
    return { id: ref.mediaId, source, name: song.name, singer: song.artists.map(a => a.name).join('、'),
        albumName: song.album.name, albumId: String(song.album.id), durationMs: song.durationMs,
        coverUrl: song.album.coverUrl ?? '', qualitys: ['128k', '320k'], hash: source === 'kg' ? String(data.hash ?? ref.mediaId) : undefined, hashes };
};
export const addLxSong = (list: LxPlaylist, song: LxSong): LxPlaylist => {
    const songs = [...list.songs.filter(item => lxSongKey(item) !== lxSongKey(song)), song];
    return { ...list, songs, songIds: songs.map(lxSongKey), updatedAt: Date.now() };
};
export const importLxPlaylists = async (input: string, source: LxSource): Promise<LxPlaylist[]> => {
    const bridge = window.electron?.lx;
    if (!bridge?.importPlaylist) throw new Error('歌单导入需要桌面版');
    const imported = await bridge.importPlaylist(input, source);
    const existing = await getLxPlaylists();
    const incomingIds = new Set(imported.map(list => list.id));
    const lists = [...existing.filter(list => !incomingIds.has(list.id)), ...imported];
    await saveLxPlaylists(lists);
    return lists;
};
