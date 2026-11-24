import { useEffect } from 'react';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { lyricCurrentTime } from '../../stores/motionSignals';

// src/components/app/DesktopLyricPublisher.tsx
// 主窗口把当前歌词行推给独立的桌面歌词小窗。按 250ms 采样，行变化时才发送。

const DesktopLyricPublisher: React.FC = () => {
    useEffect(() => {
        if (typeof window === 'undefined' || !window.electron?.sendDesktopLyricState) return undefined;
        let lastPayload = '';
        const timer = window.setInterval(() => {
            const playback = usePlaybackStore.getState();
            const lyrics = playback.lyrics;
            const lines = lyrics?.lines ?? [];
            const time = lyricCurrentTime.get();
            let index = -1;
            for (let i = 0; i < lines.length; i += 1) {
                if (lines[i].startTime <= time) index = i;
                else break;
            }
            const current = index >= 0 ? lines[index].fullText : playback.currentSong?.name ?? '';
            const next = index + 1 < lines.length ? lines[index + 1].fullText : playback.currentSong?.artists.map(a => a.name).join('、') ?? '';
            const payload = `${current}\u0000${next}`;
            if (payload === lastPayload) return;
            lastPayload = payload;
            window.electron?.sendDesktopLyricState?.({ current, next });
        }, 250);
        return () => window.clearInterval(timer);
    }, []);

    return null;
};

export default DesktopLyricPublisher;
