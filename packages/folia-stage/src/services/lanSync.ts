import type { LanSyncDevice, LanSyncPending, LanSyncResult, LanSyncStatus } from '../types/lanSync';
import { getLxPlaylists } from './lxLibrary';
import { appDatabase } from './appDatabase';
import { putCacheEntry, readCacheEntry } from './repositories/cacheRepository';

// src/services/lanSync.ts
// 局域网一键同步的渲染层封装：设备发现、发送、接收确认。
// 数据组装在渲染层（歌单），设置与音源由主进程负责。

const bridge = () => (
    typeof window !== 'undefined' ? window.electron?.lanSync ?? null : null
);

export const isLanSyncAvailable = (): boolean => Boolean(bridge());

export const getLanSyncStatus = async (): Promise<LanSyncStatus | null> => (
    bridge()?.status() ?? null
);

export const listLanSyncDevices = async (): Promise<LanSyncDevice[]> => (
    bridge()?.devices() ?? []
);

export const listLanSyncPending = async (): Promise<LanSyncPending[]> => (
    bridge()?.pending() ?? []
);

export const sendLanSync = async (deviceId: string, playlists: unknown[] = []): Promise<LanSyncResult> => {
    const api = bridge();
    if (!api) throw new Error('局域网同步仅在桌面版可用');
    return api.send(deviceId, { playlists: [...playlists, ...await getLxPlaylists()] });
};

export const respondLanSync = async (pendingId: string, accepted: boolean): Promise<{ ok: boolean }> => {
    const api = bridge();
    if (!api) return { ok: false };
    if (!accepted) return api.respond(pendingId, false);
    const pending = (await api.pending()).find(item => item.pendingId === pendingId);
    if (!pending) throw new Error('同步请求已过期');
    const lists = pending.playlists as Array<{ id: string; name: string; kind?: string; songs?: unknown[]; songIds?: string[] }>;
    if (!Array.isArray(lists) || lists.some(list => !list || typeof list.id !== 'string' || typeof list.name !== 'string' || (list.kind === 'lx' && !Array.isArray(list.songs)))) throw new Error('歌单格式无效');
    const oldLocal = await readCacheEntry('local_playlists') ?? [];
    const oldOnline = await readCacheEntry('lxlia_online_playlists') ?? [];
    const write = async (local: unknown, online: unknown) => appDatabase.transaction('rw', appDatabase.api_cache, appDatabase.user_cache, async () => {
        await putCacheEntry('local_playlists', local);
        await putCacheEntry('lxlia_online_playlists', online);
    });
    // IndexedDB 持久化完成以后才允许主进程向发送方回执成功。
    await write(lists.filter(list => list.kind !== 'lx'), lists.filter(list => list.kind === 'lx'));
    try {
        const result = await api.respond(pendingId, true);
        if (!result.ok) throw new Error('同步请求已过期或应用失败');
        window.dispatchEvent(new Event('lxlia-library-changed'));
        return result;
    } catch (error) {
        await write(oldLocal, oldOnline);
        throw error;
    }
};

export const onLanSyncDeviceListChanged = (callback: (devices: LanSyncDevice[]) => void): (() => void) => (
    bridge()?.onDevicesChanged(callback) ?? (() => {})
);

export const onLanSyncIncoming = (callback: (pending: LanSyncPending) => void): (() => void) => (
    bridge()?.onIncoming(callback) ?? (() => {})
);
