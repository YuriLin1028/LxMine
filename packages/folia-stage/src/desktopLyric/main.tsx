import { createRoot } from 'react-dom/client';
import DesktopLyricWindow from './DesktopLyricWindow';
import './lyricWindow.css';

// src/desktopLyric/main.tsx
// 独立桌面歌词小窗的入口，只挂载歌词条组件。

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(<DesktopLyricWindow />);
}
