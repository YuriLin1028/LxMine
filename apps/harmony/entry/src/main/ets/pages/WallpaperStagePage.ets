import { Song } from '../model/Song';
import { LyricLine } from '../services/LyricParser';
import { MineRadioStage } from '../components/MineRadioStage';
import { WallpaperStageState } from '../services/HarmonyPcWindowService';

const EMPTY_SONG: Song = {
  source: 'kw',
  id: 'wallpaper-idle',
  name: 'LxMine',
  singer: '等待播放',
  albumName: '',
  albumId: '',
  durationMs: 0,
  qualitys: [],
  coverUrl: ''
};

@Entry
@Component
struct WallpaperStagePage {
  @StorageProp('lxmine_pc_wallpaper_state_json') @Watch('applyStateJson') stateJson: string = '';
  @StorageProp('lxmine_pc_wallpaper_pos') positionMs: number = 0;
  @StorageProp('lxmine_pc_wallpaper_playing') playing: boolean = false;
  @State private song: Song = EMPTY_SONG;
  @State private audioUrl: string = '';
  @State private mode: string = 'mine-7';
  @State private lines: LyricLine[] = [];
  @State private translationLines: LyricLine[] = [];
  @State private lyricColorMode: string = 'cover-gradient';
  @State private lyricPrimary: string = '#7DD3FC';
  @State private lyricSecondary: string = '#A5B4FC';
  @State private light: boolean = false;
  @State private bgImage: string = '';
  @State private bgOpacity: number = 0.78;
  @State private wallpaperBgOpacity: number = 0.42;
  @State private wallpaperOverallOpacity: number = 0.95;
  @State private duration: number = 0;
  @State private lyricOffset: number = 0;
  @State private lyricScale: number = 1.0;
  @State private lyricLineSpacing: number = 1.2;
  @State private lyricMaxLines: number = 0;
  @State private resetCameraOnSong: boolean = true;
  @State private hovered: boolean = false;

  aboutToAppear(): void {
    this.applyStateJson();
  }

  private applyStateJson(): void {
    if (!this.stateJson) return;
    try {
      const parsed = JSON.parse(this.stateJson) as WallpaperStageState;
      if (parsed.song) this.song = parsed.song;
      if (typeof parsed.audioUrl === 'string') this.audioUrl = parsed.audioUrl;
      if (typeof parsed.mode === 'string' && parsed.mode) this.mode = parsed.mode;
      if (Array.isArray(parsed.lines)) this.lines = parsed.lines;
      if (Array.isArray(parsed.translationLines)) this.translationLines = parsed.translationLines;
      if (typeof parsed.lyricColorMode === 'string') this.lyricColorMode = parsed.lyricColorMode;
      if (typeof parsed.lyricPrimary === 'string') this.lyricPrimary = parsed.lyricPrimary;
      if (typeof parsed.lyricSecondary === 'string') this.lyricSecondary = parsed.lyricSecondary;
      this.light = parsed.light === true;
      if (typeof parsed.bgImage === 'string') this.bgImage = parsed.bgImage;
      if (typeof parsed.bgOpacity === 'number' && Number.isFinite(parsed.bgOpacity)) this.bgOpacity = parsed.bgOpacity;
      if (typeof parsed.wallpaperBgOpacity === 'number' && Number.isFinite(parsed.wallpaperBgOpacity)) {
        this.wallpaperBgOpacity = Math.max(0, Math.min(1, parsed.wallpaperBgOpacity));
      }
      if (typeof parsed.wallpaperOverallOpacity === 'number' && Number.isFinite(parsed.wallpaperOverallOpacity)) {
        this.wallpaperOverallOpacity = Math.max(0.25, Math.min(1, parsed.wallpaperOverallOpacity));
      }
      if (typeof parsed.duration === 'number' && Number.isFinite(parsed.duration)) this.duration = parsed.duration;
      if (typeof parsed.lyricOffset === 'number' && Number.isFinite(parsed.lyricOffset)) this.lyricOffset = parsed.lyricOffset;
      if (typeof parsed.lyricScale === 'number' && Number.isFinite(parsed.lyricScale)) this.lyricScale = parsed.lyricScale;
      if (typeof parsed.lyricLineSpacing === 'number' && Number.isFinite(parsed.lyricLineSpacing)) this.lyricLineSpacing = parsed.lyricLineSpacing;
      if (typeof parsed.lyricMaxLines === 'number' && Number.isFinite(parsed.lyricMaxLines)) this.lyricMaxLines = parsed.lyricMaxLines;
      this.resetCameraOnSong = parsed.resetCameraOnSong !== false;
    } catch (_) {}
  }

  private exitWallpaper(): void {
    AppStorage.setOrCreate('lxmine_pc_lyric_cmd', `wallpaper_exit:${Date.now()}`);
  }

  build() {
    Stack({ alignContent: Alignment.BottomEnd }) {
      Column() {
        MineRadioStage({
          song: this.song,
          audioUrl: this.audioUrl,
          lines: this.lines,
          translationLines: this.translationLines,
          lyricColorMode: this.lyricColorMode,
          lyricPrimary: this.lyricPrimary,
          lyricSecondary: this.lyricSecondary,
          light: this.light,
          bgImage: this.bgImage,
          bgOpacity: this.bgOpacity,
          wallpaperHost: true,
          wallpaperBgOpacity: this.wallpaperBgOpacity,
          wallpaperOverallOpacity: this.wallpaperOverallOpacity,
          mode: this.mode,
          duration: this.duration,
          lyricOffset: this.lyricOffset,
          lyricScale: this.lyricScale,
          lyricLineSpacing: this.lyricLineSpacing,
          lyricMaxLines: this.lyricMaxLines,
          resetCameraOnSong: this.resetCameraOnSong,
          positionMs: this.positionMs,
          playing: this.playing,
          visible: true,
          detail: true,
          interactive: false,
          wide: true
        })
      }
      .width('100%')
      .height('100%')

      if (this.hovered) {
        Button('退出壁纸模式 (Esc)')
          .height(36)
          .padding({ left: 16, right: 16 })
          .margin({ right: 24, bottom: 24 })
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor('#FFFFFF')
          .backgroundColor('#B810141C')
          .border({ width: 1, color: '#38FFFFFF' })
          .borderRadius(18)
          .onClick(() => this.exitWallpaper())
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Transparent)
    .onHover((isHover: boolean) => { this.hovered = isHover; })
    .onKeyEvent((event: KeyEvent) => {
      if (event.type === KeyType.Down && event.keyCode === 2070) {
        this.exitWallpaper();
      }
    })
  }
}
