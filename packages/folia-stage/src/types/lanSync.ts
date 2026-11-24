// src/types/lanSync.ts
// 局域网同步的共享类型：与 electron/lansync 的 bundle / IPC 结构保持一致。

export type LanSyncDevice = {
    id: string;
    name: string;
    platform: string;
    address: string;
    port: number;
    lastSeen: number;
};

export type LanSyncBundleSummary = {
    settings: number;
    sources: number;
    playlists: number;
    createdAt: number | null;
};

export type LanSyncPeer = {
    id: string;
    name: string;
    platform: string;
    address?: string;
};

export type LanSyncPending = {
    pendingId: string;
    peer: LanSyncPeer;
    summary: LanSyncBundleSummary;
    playlists: unknown[];
    receivedAt?: number;
};

export type LanSyncStatus = {
    deviceId: string;
    deviceName: string;
    platform: string;
    port: number | null;
    discovery: boolean;
};

export type LanSyncResult = {
    accepted: boolean;
    message?: string;
};
