import { useEffect, useState } from 'react';

// src/desktopLyric/DesktopLyricWindow.tsx
// 独立桌面歌词小窗：只显示当前行 + 下一行，整窗可拖动，右上角关闭。

interface LyricState {
    current: string;
    next: string;
}

const DesktopLyricWindow: React.FC = () => {
    const [state, setState] = useState<LyricState>({ current: '', next: '' });

    useEffect(() => {
        // index.html 带了主窗口启动画面，小窗里必须立即移除。
        document.getElementById('app-splash')?.remove();
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
        const off = window.electron?.onDesktopLyricState?.(payload => {
            setState({ current: payload.current, next: payload.next });
        });
        void window.electron?.getDesktopLyricState?.().then(payload => {
            if (payload) setState(payload);
        });
        return () => off?.();
    }, []);

    return (
        <div className="desktop-lyric-window">
            <div className="desktop-lyric-drag">
                <div className="desktop-lyric-current">{state.current || 'Lxlia'}</div>
                <div className="desktop-lyric-next">{state.next || '桌面歌词'}</div>
            </div>
            <button
                type="button"
                className="desktop-lyric-close"
                aria-label="关闭桌面歌词"
                onClick={() => void window.electron?.closeDesktopLyricWindow?.()}
            >
                ×
            </button>
        </div>
    );
};

export default DesktopLyricWindow;
