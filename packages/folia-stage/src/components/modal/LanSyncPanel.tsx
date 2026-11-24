import React, { useCallback, useEffect, useState } from 'react';
import {
    getLanSyncStatus,
    listLanSyncDevices,
    listLanSyncPending,
    onLanSyncDeviceListChanged,
    onLanSyncIncoming,
    respondLanSync,
    sendLanSync,
} from '../../services/lanSync';
import type { LanSyncDevice, LanSyncPending, LanSyncStatus } from '../../types/lanSync';
import { getLocalPlaylists } from '../../services/localPlaylistService';

// src/components/modal/LanSyncPanel.tsx
// 局域网一键同步面板：发现同网段设备，把设置 / 歌单 / 音源打包推给对方，
// 对方确认后整体覆盖。设置页内嵌使用，也可以放进弹窗。

const platformLabel = (platform: string): string => {
    if (platform === 'win32') return 'Windows';
    if (platform === 'darwin') return 'macOS';
    if (platform === 'linux') return 'Linux';
    if (platform === 'harmony') return '鸿蒙';
    return platform;
};

interface LanSyncPanelProps {
    onClose?: () => void;
}

const LanSyncPanel: React.FC<LanSyncPanelProps> = ({ onClose }) => {
    const [status, setStatus] = useState<LanSyncStatus | null>(null);
    const [devices, setDevices] = useState<LanSyncDevice[]>([]);
    const [pending, setPending] = useState<LanSyncPending[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState('');

    const refresh = useCallback(async () => {
        setStatus(await getLanSyncStatus());
        setDevices(await listLanSyncDevices());
        setPending(await listLanSyncPending());
    }, []);

    useEffect(() => {
        void refresh();
        const offDevices = onLanSyncDeviceListChanged(setDevices);
        const offIncoming = onLanSyncIncoming(item => setPending(prev => (
            prev.some(existing => existing.pendingId === item.pendingId) ? prev : [...prev, item]
        )));
        return () => {
            offDevices();
            offIncoming();
        };
    }, [refresh]);

    const handleSend = async (device: LanSyncDevice) => {
        setBusy(device.id);
        setMessage('');
        try {
            const playlists = await getLocalPlaylists();
            const result = await sendLanSync(device.id, playlists);
            setMessage(result.accepted
                ? `已同步到「${device.name}」`
                : `「${device.name}」拒绝或未确认${result.message ? `：${result.message}` : ''}`);
        } catch (error) {
            setMessage(`发送失败：${(error as Error).message}`);
        } finally {
            setBusy(null);
        }
    };

    const handleRespond = async (item: LanSyncPending, accepted: boolean) => {
        setBusy(item.pendingId);
        try {
            await respondLanSync(item.pendingId, accepted);
            setPending(prev => prev.filter(existing => existing.pendingId !== item.pendingId));
            setMessage(accepted
                ? `已接收来自「${item.peer.name}」的同步，设置、歌单与音源已覆盖`
                : `已拒绝「${item.peer.name}」的同步`);
        } catch (error) {
            setMessage(`处理失败：${(error as Error).message}`);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="space-y-3 text-left">
            <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                    同一 Wi-Fi 下自动发现设备，把设置、歌单、音源一键发给对方；对方确认后覆盖。
                </p>
                {onClose && (
                    <button type="button" className="rounded-lg px-2 py-1 text-sm opacity-60 hover:opacity-100" onClick={onClose}>
                        关闭
                    </button>
                )}
            </div>

            <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3 text-xs opacity-70" style={{ color: 'var(--text-secondary)' }}>
                本机：{status?.deviceName ?? '—'} · {status ? platformLabel(status.platform) : '—'}
                {' · '}
                {status?.discovery ? `发现服务已启动${status.port ? `（端口 ${status.port}）` : ''}` : '发现服务未启动'}
            </div>

            {pending.length > 0 && (
                <div className="space-y-2">
                    <div className="text-xs font-medium text-amber-300">收到同步请求</div>
                    {pending.map(item => (
                        <div key={item.pendingId} className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
                            <div className="text-sm">
                                「{item.peer.name}」想同步：设置 {item.summary.settings} 项、歌单 {item.summary.playlists} 个、音源 {item.summary.sources} 个
                            </div>
                            <div className="mt-2 flex gap-2">
                                <button
                                    type="button"
                                    className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50"
                                    disabled={busy === item.pendingId}
                                    onClick={() => void handleRespond(item, true)}
                                >
                                    接收并覆盖
                                </button>
                                <button
                                    type="button"
                                    className="rounded-lg bg-white/10 px-3 py-1.5 text-xs disabled:opacity-50"
                                    style={{ color: 'var(--text-primary)' }}
                                    disabled={busy === item.pendingId}
                                    onClick={() => void handleRespond(item, false)}
                                >
                                    拒绝
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between">
                <div className="text-xs opacity-50" style={{ color: 'var(--text-secondary)' }}>附近设备（{devices.length}）</div>
                <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-xs opacity-60 hover:opacity-100"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={() => void refresh()}
                >
                    刷新
                </button>
            </div>

            <div className="space-y-2">
                {devices.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs opacity-50" style={{ color: 'var(--text-secondary)' }}>
                        还没有发现设备。确保两台设备在同一个局域网，并且都打开了 Lxlia。
                    </div>
                )}
                {devices.map(device => (
                    <div key={device.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3">
                        <div>
                            <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{device.name}</div>
                            <div className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                                {platformLabel(device.platform)} · {device.address}
                            </div>
                        </div>
                        <button
                            type="button"
                            className="rounded-lg bg-[#7C9082] px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50"
                            disabled={busy === device.id}
                            onClick={() => void handleSend(device)}
                        >
                            {busy === device.id ? '发送中…' : '发送'}
                        </button>
                    </div>
                ))}
            </div>

            {message && <div className="rounded-lg bg-white/5 px-3 py-2 text-xs opacity-80">{message}</div>}
        </div>
    );
};

export default LanSyncPanel;
