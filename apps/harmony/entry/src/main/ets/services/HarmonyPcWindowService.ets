import { deviceInfo } from '@kit.BasicServicesKit';
import { window, display } from '@kit.ArkUI';

const LYRIC_WIN_NAME: string = 'lxmine_desktop_lyrics';

export function isHarmonyPc(): boolean {
  return deviceInfo.deviceType === '2in1';
}

export class HarmonyPcWindowService {
  private lyricWin: window.Window | null = null;
  private wallpaperActive: boolean = false;

  syncLyrics(mainText: string, subText: string, accentColor: string, locked: boolean): void {
    AppStorage.setOrCreate('lxmine_pc_lyric_main', mainText || 'LxMine');
    AppStorage.setOrCreate('lxmine_pc_lyric_sub', subText || '');
    AppStorage.setOrCreate('lxmine_pc_lyric_color', accentColor || '#64D2FF');
    AppStorage.setOrCreate('lxmine_pc_lyric_locked', locked);
  }

  async setDesktopLyrics(enabled: boolean, locked: boolean): Promise<void> {
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
        const winW = Math.min(900, Math.max(540, Math.round(disp.width * 0.48)));
        const winH = 152;
        await this.lyricWin.resize(winW, winH);
        await this.lyricWin.moveWindowTo(
          Math.max(0, Math.round((disp.width - winW) / 2)),
          Math.max(40, disp.height - winH - 96)
        );
        try { this.lyricWin.setWindowBackgroundColor('#00000000'); } catch (_) {}
        try { this.lyricWin.setWindowDecorVisible(false); } catch (_) {}
        try { await this.lyricWin.setWindowTopmost(true); } catch (_) {}
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

  async closeDesktopLyrics(): Promise<void> {
    if (!this.lyricWin) return;
    const win = this.lyricWin;
    this.lyricWin = null;
    try { await win.destroyWindow(); } catch (_) {}
  }

  async setWallpaperMode(enabled: boolean): Promise<void> {
    if (!isHarmonyPc()) return;
    this.wallpaperActive = enabled;
    const stage = AppStorage.get<window.WindowStage>('lxmine_window_stage');
    if (!stage) return;
    try {
      const main = stage.getMainWindowSync();
      try { main.setWindowDecorVisible(!enabled); } catch (_) {}
      await main.setWindowLayoutFullScreen(true);
      if (enabled) {
        try { await main.maximize(); } catch (_) {}
      } else {
        try { await main.recover(); } catch (_) {}
      }
    } catch (error) {
      console.warn(`[HarmonyPc] setWallpaperMode failed: ${(error as Error).message}`);
    }
  }

  isWallpaperActive(): boolean {
    return this.wallpaperActive;
  }

  async dispose(): Promise<void> {
    await this.closeDesktopLyrics();
    if (this.wallpaperActive) {
      await this.setWallpaperMode(false);
    }
  }
}
