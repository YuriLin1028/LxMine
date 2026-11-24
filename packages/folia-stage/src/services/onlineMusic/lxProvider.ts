import type {
    AudioQualityPreference,
    OnlineMusicProvider,
    ProviderAudioSource,
    ProviderLyricsResult,
    ProviderPage,
} from '../../types/onlineMusic';
import type { SongResult, UnifiedSong } from '../../types';
import { LyricParserFactory } from '../../utils/lyrics/LyricParserFactory';
import { OnlineProviderError } from '../../types/onlineMusic';

// src/services/onlineMusic/lxProvider.ts
//
// LX 音源 provider：搜索走 LX 内置源（酷我 / 酷狗），播放地址与歌词走用户添加的
// LX 自定义源（electron/lx 的运行时）。每个内置源注册成一个 provider，用户在
// 「切换在线音乐平台」里选择。

type LxSourceId = 'kw' | 'kg' | 'wy' | 'tx';

type LxRawSong = {
    id: string;
    name: string;
    singer: string;
    albumName: string;
    albumId: string;
    durationMs: number;
    qualitys: string[];
    source?: LxSourceId;
    coverUrl?: string;
    hash?: string;
    hashes?: Record<string, string>;
};

type LxSearchResponse = {
    items: LxRawSong[];
    total: number;
    page: number;
    limit: number;
};

const QUALITY_TO_LX: Record<AudioQualityPreference, string> = {
    standard: '128k',
    high: '320k',
    lossless: 'flac',
    hires: 'flac24bit',
};

const lxBridge = () => {
    if (typeof window === 'undefined' || !window.electron?.lx) return null;
    return window.electron.lx;
};

const splitSingers = (singer: string): string[] => (
    singer.split(/、|&/).map(name => name.trim()).filter(Boolean)
);

export const normalizeLxSong = (raw: LxRawSong, source: LxSourceId = 'kw'): UnifiedSong => {
    const artists = splitSingers(raw.singer || '');
    const providerData: Record<string, string> = {
        source,
        name: raw.name || '',
        singer: raw.singer || '',
        albumName: raw.albumName || '',
        albumId: raw.albumId || '',
        interval: String(Math.round((raw.durationMs || 0) / 1000)),
    };
    if (source === 'kg') {
        providerData.hash = raw.hash ?? raw.id;
        providerData.hashes = JSON.stringify(raw.hashes ?? {});
    } else {
        providerData.songmid = raw.id;
    }
    return {
        id: raw.id,
        name: raw.name || '',
        artists: artists.length ? artists.map((name, index) => ({ id: `${raw.id}-${index}`, name })) : [{ id: raw.id, name: '' }],
        album: { id: raw.albumId || '', name: raw.albumName || '', coverUrl: raw.coverUrl || undefined },
        durationMs: raw.durationMs || 0,
        sourceRef: {
            kind: 'online',
            providerId: providerOf(source).id,
            mediaId: raw.id,
            providerData,
        },
    };
};

/** 自定义源请求所需的 LX musicInfo。 */
const toSourceInfo = (song: SongResult, quality: AudioQualityPreference, source: LxSourceId) => {
    const ref = song.sourceRef;
    const data = ref?.kind === 'online' ? ref.providerData ?? {} : {};
    const interval = Number(data.interval ?? Math.round(song.durationMs / 1000));
    const base = {
        source,
        name: String(data.name ?? song.name),
        singer: String(data.singer ?? song.artists.map((artist: { name: string }) => artist.name).join('、')),
        albumName: String(data.albumName ?? song.album.name),
        albumId: String(data.albumId ?? song.album.id),
        interval,
        type: QUALITY_TO_LX[quality] ?? '128k',
    };
    if (source === 'kg') {
        const hash = String(data.hash ?? song.id);
        return { ...base, songmid: hash, hash, _types: parseHashes(data.hashes) };
    }
    return { ...base, songmid: String(data.songmid ?? song.id) };
};

const parseHashes = (value: unknown): Record<string, { hash: string }> => {
    if (typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value) as Record<string, string>;
        const result: Record<string, { hash: string }> = {};
        for (const [quality, hash] of Object.entries(parsed)) result[quality] = { hash };
        return result;
    } catch {
        return {};
    }
};

const providerOf = (source: LxSourceId): { id: string; displayName: string; shortName: string } => {
    switch (source) {
        case 'kg':
            return { id: 'lx-kg', displayName: 'LX 音源 · 酷狗', shortName: 'LX 酷狗' };
        case 'wy':
            return { id: 'lx-wy', displayName: 'LX 音源 · 网易', shortName: 'LX 网易' };
        case 'tx':
            return { id: 'lx-tx', displayName: 'LX 音源 · QQ', shortName: 'LX QQ' };
        default:
            return { id: 'lx', displayName: 'LX 音源 · 酷我', shortName: 'LX 酷我' };
    }
};

const createLxProvider = (source: LxSourceId): OnlineMusicProvider => {
    const meta = providerOf(source);
    return {
        id: meta.id,
        displayName: meta.displayName,
        shortName: meta.shortName,
        capabilities: {
            search: true,
            playback: true,
            lyrics: true,
            auth: false,
            userLibrary: false,
            playlists: false,
            albums: false,
            artists: false,
            recommendations: false,
            mutations: false,
            wordByWordLyrics: false,
        },

        normalizeSong(raw: unknown): UnifiedSong {
            return normalizeLxSong(raw as LxRawSong, source);
        },

        search: {
            async searchSongs(query: string, limit: number, offset: number): Promise<ProviderPage<UnifiedSong>> {
                const bridge = lxBridge();
                if (!bridge) return { items: [], hasMore: false, nextOffset: offset };
                const pageSize = Math.max(1, limit);
                const page = Math.floor(Math.max(0, offset) / pageSize) + 1;
                const response = await bridge.search(query, page, pageSize, source) as LxSearchResponse;
                const items = (response.items ?? []).map(raw => normalizeLxSong(raw, source));
                const nextOffset = offset + items.length;
                const hasMore = Number.isFinite(response.total)
                    ? nextOffset < response.total
                    : items.length >= pageSize;
                return { items, total: response.total, hasMore, nextOffset };
            },
        },

        playback: {
            async getSongDetail(): Promise<UnifiedSong | null> {
                // 内置源只有搜索接口；歌曲详情由搜索时随行的 providerData 携带。
                return null;
            },
            async getAudioSource(song, quality): Promise<ProviderAudioSource | null> {
                const bridge = lxBridge();
                if (!bridge) {
                    throw new OnlineProviderError('unavailable', 'LX 自定义源运行时不可用（需要桌面版）', meta.id,
                        undefined, undefined, undefined, { stage: 'runtime', transient: false });
                }
                let url: string | null = null;
                try {
                    url = await bridge.getMusicUrl(toSourceInfo(song, quality, source));
                } catch (error) {
                    // 「没有启用的自定义源」是本地配置问题，不是网络故障；标成不可重试，界面才能给出正确文案。
                    throw new OnlineProviderError('unavailable', (error as Error).message, meta.id,
                        error, undefined, undefined, { stage: 'runtime', transient: false });
                }
                if (!url) {
                    throw new OnlineProviderError('unavailable', '自定义源没有返回播放地址', meta.id,
                        undefined, undefined, undefined, { stage: 'runtime', transient: false });
                }
                return { url, quality, fetchedAt: Date.now() };
            },
        },

        lyrics: {
            async getLyrics(song): Promise<ProviderLyricsResult> {
                const bridge = lxBridge();
                if (!bridge) return { lyrics: null, isPureMusic: false };
                const result = await bridge.getLyric(toSourceInfo(song, 'standard', source));
                if (!result?.lyric) return { lyrics: null, isPureMusic: false };
                // 自定义源返回的是 LRC 文本（部分源带翻译），走 Folia 的本地方言解析器，
                // 解析成 LyricData 后逐字/逐行动画才能生效。
                const lyrics = await LyricParserFactory.parse({
                    type: 'local',
                    lrcContent: result.lyric,
                    tLrcContent: result.tlyric ?? undefined,
                }, {});
                return { lyrics, isPureMusic: false, mainText: result.lyric };
            },
        },

        getSongPageUrl(song: SongResult): string | null {
            const ref = song.sourceRef;
            if (source === 'kg') {
                const hash = ref?.kind === 'online' ? String(ref.providerData?.hash ?? song.id) : song.id;
                return hash ? `https://www.kugou.com/song/#hash=${encodeURIComponent(hash)}` : null;
            }
            const songmid = ref?.kind === 'online'
                ? String(ref.providerData?.songmid ?? song.id)
                : song.id;
            if (source === 'wy') return `https://music.163.com/song?id=${encodeURIComponent(songmid)}`;
            if (source === 'tx') return `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(songmid)}`;
            return songmid ? `https://www.kuwo.cn/play_detail/${encodeURIComponent(songmid)}` : null;
        },
    };
};

export const lxProvider = createLxProvider('kw');
export const lxKgProvider = createLxProvider('kg');
export const lxWyProvider = createLxProvider('wy');
export const lxTxProvider = createLxProvider('tx');
