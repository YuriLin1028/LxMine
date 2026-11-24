import { deviceInfo } from '@kit.BasicServicesKit';
import { window, display } from '@kit.ArkUI';
import { Song } from '../model/Song';
import { LyricLine } from './LyricParser';

const LYRIC_WIN_NAME: string = 'lxmine_desktop_lyrics';
const WALLPAPER_WIN_NAME: string = 'lxmine_wallpaper_stage';

export interface DesktopLyricBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesktopLyricDisplayLine {
  text: string;
  active: boolean;
}

export interface DesktopLyricState {
  mainText: string;
  subText: string;
  lines: DesktopLyricDisplayLine[];
  lineCount: number;
  primaryColor: string;
  secondaryColor: string;
  gradient: boolean;
  fontSizeScale: number;
  playing: boolean;
  locked: boolean;
}

export interface WallpaperStageState {
  song: Song;
  audioUrl: string;
  mode: string;
  lines: LyricLine[];
  translationLines: LyricLine[];
  lyricColorMode: string;
  lyricPrimary: string;
  lyricSecondary: string;
  light: boolean;
  bgImage: string;
  bgOpacity: number;
  wallpaperBgOpacity: number;
  wallpaperOverallOpacity: number;
  duration: number;
  lyricOffset: number;
  lyricScale: number;
  lyricLineSpacing: number;
  lyricMaxLines: number;
  resetCameraOnSong: boolean;
}

export function isHarmonyPc(): boolean {
  return deviceInfo.deviceType === '2in1';
}

export class HarmonyPcWindowService {
  private lyricWin: window.Window | null = null;
  private wallpaperWin: window.Window | null = null;
  private wallpaperActive: boolean = false;
  private wallpaperFallbackMain: boolean = false;
  private rectSaveTimer: number = -1;
  private rectListener: ((opts: window.RectChangeOptions) => void) | null = null;
  onLyricBoundsChanged: (bounds: DesktopLyricBounds) => void = () => {};

  syncLyrics(state: DesktopLyricState): void {
    AppStorage.setOrCreate('lxmine_pc_lyric_main', state.mainText || 'LxMine');
    AppStorage.setOrCreate('lxmine_pc_lyric_sub', state.subText || '');
    AppStorage.setOrCreate('lxmine_pc_lyric_lines_json', JSON.stringify(state.lines || []));
    AppStorage.setOrCreate('lxmine_pc_lyric_line_count', Math.max(1, Math.min(5, Math.round(state.lineCount || 3))));
    AppStorage.setOrCreate('lxmine_pc_lyric_color', state.primaryColor || '#7DD3FC');
    AppStorage.setOrCreate('lxmine_pc_lyric_color2', state.secondaryColor || '#A5B4FC');
    AppStorage.setOrCreate('lxmine_pc_lyric_gradient', !!state.gradient);
    AppStorage.setOrCreate('lxmine_pc_lyric_scale', Math.max(0.72, Math.min(1.55, Number(state.fontSizeScale) || 1)));
    AppStorage.setOrCreate('lxmine_pc_lyric_playing', !!state.playing);
    AppStorage.setOrCreate('lxmine_pc_lyric_locked', !!state.locked);
  }

  syncWallpaperState(state: WallpaperStageState): void {
    try {
      AppStorage.setOrCreate('lxmine_pc_wallpaper_state_json', JSON.stringify(state));
    } catch (_) {}
  }

  syncWallpaperClock(positionMs: number, playing: boolean): void {
    AppStorage.setOrCreate('lxmine_pc_wallpaper_pos', Math.max(0, Math.round(positionMs)));
    AppStorage.setOrCreate('lxmine_pc_wallpaper_playing', !!playing);
  }

  async setDesktopLyrics(
    enabled: boolean,
    locked: boolean,
    savedBounds: DesktopLyricBounds | null = null,
    lineCount: number = 3
  ): Promise<void> {
    if (!isHarmonyPc()) return;
    AppStorage.setOrCreate('lxmine_pc_lyric_locked', locked);
    if (!enabled) {
      await this.closeDesktopLyrics();
      return;
    }
    const stage = AppStorage.get<window.WindowStage>('lxmine_window_stage');
    if (!stage) return;
    try {
      if (!this.lyricWin) {
        this.lyricWin = await stage.createSubWindow(LYRIC_WIN_NAME);
        await this.lyricWin.setUIContent('pages/DesktopLyricsPage');
        const disp = display.getDefaultDisplaySync();
        const density = Math.max(1, Number(disp.densityPixels) || 1);
        const minW = Math.round(360 * density);
        const minH = Math.round(112 * density);
        const defaultW = Math.min(Math.round(1040 * density), Math.max(Math.round(600 * density), Math.round(disp.width * 0.52)));
        const defaultH = Math.round((lineCount >= 5 ? 276 : (lineCount >= 3 ? 218 : (lineCount >= 2 ? 186 : 158))) * density);
        const winW = savedBounds && savedBounds.width >= minW
          ? Math.min(disp.width, Math.max(minW, Math.round(savedBounds.width)))
          : defaultW;
        const winH = savedBounds && savedBounds.height >= minH
          ? Math.min(Math.round(disp.height * 0.68), Math.max(minH, Math.round(savedBounds.height)))
          : defaultH;
        const winX = savedBounds && Number.isFinite(savedBounds.x)
          ? Math.max(0, Math.min(Math.max(0, disp.width - winW), Math.round(savedBounds.x)))
          : Math.max(0, Math.round((disp.width - winW) / 2));
        const winY = savedBounds && Number.isFinite(savedBounds.y)
          ? Math.max(0, Math.min(Math.max(0, disp.height - winH), Math.round(savedBounds.y)))
          : Math.max(Math.round(40 * density), disp.height - winH - Math.round(96 * density));
        await this.lyricWin.resize(winW, winH);
        await this.lyricWin.moveWindowTo(winX, winY);
        try { this.lyricWin.setWindowBackgroundColor('#00000000'); } catch (_) {}
        try { this.lyricWin.setWindowDecorVisible(false); } catch (_) {}
        try { await this.lyricWin.setWindowTopmost(true); } catch (_) {}
        try { await this.lyricWin.setResizeByDragEnabled(true); } catch (_) {}
        try {
          await this.lyricWin.setWindowLimits({
            minWidth: minW,
            minHeight: minH,
            maxWidth: Math.max(Math.round(1080 * density), disp.width),
            maxHeight: Math.max(Math.round(360 * density), Math.round(disp.height * 0.68))
          });
        } catch (_) {}
        this.rectListener = (opts: window.RectChangeOptions): void => {
          if (!opts || !opts.rect) return;
          const next: DesktopLyricBounds = {
            x: opts.rect.left,
            y: opts.rect.top,
            width: opts.rect.width,
            height: opts.rect.height
          };
          clearTimeout(this.rectSaveTimer);
          this.rectSaveTimer = setTimeout(() => {
            this.onLyricBoundsChanged(next);
          }, 280);
        };
        try { this.lyricWin.on('windowRectChange', this.rectListener); } catch (_) {}
      }
      try { await this.lyricWin.setWindowTouchable(!locked); } catch (_) {}
      await this.lyricWin.showWindow();
    } catch (error) {
      console.warn(`[HarmonyPc] setDesktopLyrics failed: ${(error as Error).message}`);
    }
  }

  async setDesktopLyricsLocked(locked: boolean): Promise<void> {
    AppStorage.setOrCreate('lxmine_pc_lyric_locked', locked);
    if (this.lyricWin) {
      try { await this.lyricWin.setWindowTouchable(!locked); } catch (_) {}
    }
  }

  async resizeDesktopLyricsForLines(lineCount: number): Promise<void> {
    if (!this.lyricWin) return;
    try {
      const disp = display.getDefaultDisplaySync();
      const density = Math.max(1, Number(disp.densityPixels) || 1);
      const rect = this.lyricWin.getWindowProperties().windowRect;
      const targetH = Math.min(
        Math.round(disp.height * 0.68),
        Math.round((lineCount >= 5 ? 276 : (lineCount >= 3 ? 218 : (lineCount >= 2 ? 186 : 158))) * density)
      );
      const curW = rect && rect.width > 0 ? rect.width : Math.round(760 * density);
      await this.lyricWin.resize(curW, targetH);
    } catch (_) {}
  }

  async closeDesktopLyrics(): Promise<void> {
    clearTimeout(this.rectSaveTimer);
    if (!this.lyricWin) return;
    const win = this.lyricWin;
    const listener = this.rectListener;
    this.lyricWin = null;
    this.rectListener = null;
    try { if (listener) win.off('windowRectChange', listener); } catch (_) {}
    try { await win.destroyWindow(); } catch (_) {}
  }

  /**
   * 开启/关闭鸿蒙 PC 独立壁纸舞台窗口：
   * 返回 true 表示已采用独立全屏透明子窗口（主窗口保持自由可用，与 Windows 壁纸模式一致）；
   * 返回 false 表示子窗口不可用，已回退为主窗口全屏沉浸展示。
   */
  async setWallpaperMode(enabled: boolean): Promise<boolean> {
    if (!isHarmonyPc()) return false;
    this.wallpaperActive = enabled;
    const stage = AppStorage.get<window.WindowStage>('lxmine_window_stage');
    if (!stage) return false;
    if (!enabled) {
      await this.closeWallpaperWindow();
      if (this.wallpaperFallbackMain) {
        this.wallpaperFallbackMain = false;
        try {
          const main = stage.getMainWindowSync();
          try { main.setWindowDecorVisible(true); } catch (_) {}
          try { await main.recover(); } catch (_) {}
        } catch (_) {}
      }
      return true;
    }
    try {
      if (!this.wallpaperWin) {
        this.wallpaperWin = await stage.createSubWindow(WALLPAPER_WIN_NAME);
        await this.wallpaperWin.setUIContent('pages/WallpaperStagePage');
        const disp = display.getDefaultDisplaySync();
        await this.wallpaperWin.resize(disp.width, disp.height);
        await this.wallpaperWin.moveWindowTo(0, 0);
        try { this.wallpaperWin.setWindowBackgroundColor('#00000000'); } catch (_) {}
        try { this.wallpaperWin.setWindowDecorVisible(false); } catch (_) {}
        try { await this.wallpaperWin.setWindowLayoutFullScreen(true); } catch (_) {}
      }
      await this.wallpaperWin.showWindow();
      this.wallpaperFallbackMain = false;
      return true;
    } catch (error) {
      console.warn(`[HarmonyPc] independent wallpaper window failed, fallback to main window: ${(error as Error).message}`);
      await this.closeWallpaperWindow();
      try {
        const main = stage.getMainWindowSync();
        try { main.setWindowDecorVisible(false); } catch (_) {}
        await main.setWindowLayoutFullScreen(true);
        try { await main.maximize(); } catch (_) {}
        this.wallpaperFallbackMain = true;
      } catch (_) {}
      return false;
    }
  }

  private async closeWallpaperWindow(): Promise<void> {
    if (!this.wallpaperWin) return;
    const win = this.wallpaperWin;
    this.wallpaperWin = null;
    try { await win.destroyWindow(); } catch (_) {}
  }

  isWallpaperActive(): boolean {
    return this.wallpaperActive;
  }

  async dispose(): Promise<void> {
    await this.closeDesktopLyrics();
    if (this.wallpaperActive) {
      await this.setWallpaperMode(false);
    } else {
      await this.closeWallpaperWindow();
    }
  }
}
