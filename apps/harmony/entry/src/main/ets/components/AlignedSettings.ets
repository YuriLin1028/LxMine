import { curves, uiMaterial } from '@kit.ArkUI';
import { musicButtonPress, musicMaterial, musicMenuMaterial, HdsExquisiteCapsule, MaterialSelect, MaterialToggle } from './MaterialControls';
import { SmoothSlider } from './SmoothSlider';
import { PRODUCT_NAME, VERSION_NAME } from 'BuildProfile';
import { SyncSourcePayload } from '../services/LanSyncClient';
import { LanDevice } from '../services/LanDiscovery';
import { LyricPreferences } from '../services/LyricPreferences';
import { MINE_RADIO_MODES, MineRadioMode } from '../model/MineRadioModes';
import { TEXT, MUTED, ACCENT, devicePlatformName } from './Theme';
import {
  AUDIO_FX_BAND_LABELS,
  AUDIO_FX_PRESETS,
  AudioFxConfig,
  AudioFxPreset,
  audioFxSummary,
  defaultAudioFxConfig,
  effectiveAudioFxBands
} from '../services/AudioFxPresets';
import { SMART_STAGE_MODE_ID, SMART_STAGE_MODE_TIP } from '../services/SmartStageSelector';
import { SHORTCUT_ACTIONS, ShortcutActionDef, defaultShortcutBindings, formatKeyEventCombo } from '../services/KeyboardShortcuts';

interface SettingsCopy { title: string; detail: string; }
interface SettingsLink { title: string; detail: string; action: () => void; label?: string; }
interface SettingsToggle { title: string; detail: string; value: boolean; action: (value: boolean) => void; }
interface SettingsSelect { title: string; detail: string; labels: string[]; values: string[]; current: string; action: (value: string) => void; }
interface LineLimitOption { count: number; label: string; }
interface ReverbChoice { id: string; label: string; }

const REVERB_CHOICES: ReverbChoice[] = [
  { id: 'none', label: '无混响' },
  { id: 'small', label: '室内混响' },
  { id: 'hall', label: '音乐厅' }
];

const LINE_LIMIT_OPTIONS: LineLimitOption[] = [
  { count: 0, label: '铺满屏幕' },
  { count: 1, label: '1 行' },
  { count: 3, label: '3 行' },
  { count: 5, label: '5 行' },
  { count: 7, label: '7 行' },
  { count: 9, label: '9 行' }
];

@Component
export struct AlignedSettings {
  @Prop @Watch('panelChanged') panel: string = 'main';
  @Prop sources: SyncSourcePayload[] = [];
  @Prop activeId: string = '';
  @Prop quality: string = '128k';
  @Prop mode: string = '列表循环';
  @Prop styleName: string = 'mine-7';
  @Prop resolvedStyleLabel: string = '';
  @Prop audioFx: AudioFxConfig = defaultAudioFxConfig();
  @Prop autoMixEnabled: boolean = false;
  @Prop playPauseFadeEnabled: boolean = true;
  @Prop stageResetCameraOnSong: boolean = true;
  @Prop stageBgOpacity: number = 0.78;
  @Prop stageBgCustom: boolean = false;
  @Prop pageBgOpacity: number = 0.35;
  @Prop pageBgCustom: boolean = false;
  @Prop appearance: string = 'system';
  @Prop showBoostImmersive: boolean = false;
  @Prop boostImmersive: boolean = false;
  @Prop materialLevelLabel: string = '';
  @Prop startupAnimation: boolean = true;
  @Prop resumeOnStartup: boolean = false;
  @Prop gripEnabled: boolean = false;
  @Prop gripSupported: boolean = false;
  @Prop allowLandscapeLocked: boolean = true;
  @Prop mixWithOthers: boolean = false;
  @Prop refreshAlgoDoubleTap: boolean = true;
  @Prop lanAutoSync: boolean = false;
  @Prop lanLocalAddress: string = '';
  @Prop carDetail: string = '';
  @Prop completedDownloads: number = 0;
  @Prop dislikedCount: number = 0;
  @Prop devices: LanDevice[] = [];
  @Prop lanSsid: string = '';
  @Prop message: string = '';
  @Prop lyrics: LyricPreferences = { colorMode: 'cover-gradient', primary: '#7DD3FC', secondary: '#A5B4FC', showTranslation: true, showRomaji: false, scale: 1, lineSpacing: 1.2, maxLines: 0 };
  @Prop lyricOffset: number = 0;
  @Prop previewPrimary: string = '#7DD3FC';
  @Prop previewSecondary: string = '#A5B4FC';
  @Prop previewText: string = '音乐在这里，与你相遇';
  @Prop contentTop: number = 82;
  @Prop updateChecking: boolean = false;
  @Prop isHarmonyPc: boolean = false;
  @Prop volume: number = 1.0;
  @Prop desktopLyrics: boolean = false;
  @Prop desktopLyricsLocked: boolean = false;
  @Prop desktopLyricSize: number = 1.0;
  @Prop desktopLyricLines: number = 3;
  @Prop desktopLyricColorMode: string = 'cover-gradient';
  @Prop desktopLyricColor: string = '#7DD3FC';
  @Prop desktopLyricColor2: string = '#A5B4FC';
  @Prop desktopPreviewPrimary: string = '#7DD3FC';
  @Prop desktopPreviewSecondary: string = '#A5B4FC';
  @Prop wallpaperMode: boolean = false;
  @Prop wallpaperBgOpacity: number = 0.42;
  @Prop wallpaperOverallOpacity: number = 0.95;
  @Prop spatialSystemActive: boolean = false;
  @Prop bluetoothCarLyricsEnabled: boolean = false;
  @Prop bluetoothCarLyricsMode: string = 'title';
  @Prop bluetoothAudioConnected: boolean = false;
  @Prop shortcutsEnabled: boolean = true;
  @Prop shortcuts: Record<string, string> = defaultShortcutBindings();
  @State private primaryDraft: string = '';
  @State private secondaryDraft: string = '';
  @State private offsetDraft: string = '0';
  @State private directTargetDraft: string = '';
  @State private recordingShortcutId: string = '';
  @State private shortcutConflictMsg: string = '';
  @State private styleMenuOpen: boolean = false;
  @State private hasPanelTransitioned: boolean = false;
  @StorageProp('lxmineBoostImmersive') private boostImmersiveStorage: boolean = false;
  scroller: Scroller = new Scroller();
  private subScroller: Scroller = new Scroller();
  onScroll: (value: number) => void = () => {};
  onOpenSources: () => void = () => {};
  onPanel: (value: string) => void = () => {};
  onDownloads: () => void = () => {};
  onSend: (device: LanDevice) => void = () => {};
  onSendDirect: (target: string) => void = () => {};
  onLanAutoSync: (value: boolean) => void = () => {};
  onQuality: (value: string) => void = () => {};
  onMode: (value: string) => void = () => {};
  onStyle: (value: string) => void = () => {};
  onAudioFx: (value: AudioFxConfig) => void = () => {};
  onAutoMix: (value: boolean) => void = () => {};
  onPlayPauseFade: (value: boolean) => void = () => {};
  onStageResetCameraOnSong: (value: boolean) => void = () => {};
  onStageBgOpacity: (value: number) => void = () => {};
  onPickStageBgImage: () => void = () => {};
  onClearStageBgImage: () => void = () => {};
  onPageBgOpacity: (value: number) => void = () => {};
  onPickPageBgImage: () => void = () => {};
  onClearPageBgImage: () => void = () => {};
  onAppearance: (value: string) => void = () => {};
  onBoostImmersive: (value: boolean) => void = () => {};
  onBluetoothCarLyrics: (value: boolean) => void = () => {};
  onBluetoothCarLyricsMode: (value: string) => void = () => {};
  onResume: (value: boolean) => void = () => {};
  onStartup: (value: boolean) => void = () => {};
  onGrip: (value: boolean) => void = () => {};
  onAllowLandscapeLocked: (value: boolean) => void = () => {};
  onMixWithOthers: (value: boolean) => void = () => {};
  onRefreshAlgoDoubleTap: (value: boolean) => void = () => {};
  onClearDisliked: () => void = () => {};
  onColorMode: (value: string) => void = () => {};
  onPrimary: (value: string) => void = () => {};
  onSecondary: (value: string) => void = () => {};
  onPickPrimaryColor: () => void = () => {};
  onPickSecondaryColor: () => void = () => {};
  onTranslation: (value: boolean) => void = () => {};
  onRomaji: (value: boolean) => void = () => {};
  onScale: (value: number) => void = () => {};
  onLineSpacing: (value: number) => void = () => {};
  onMaxLines: (value: number) => void = () => {};
  onOffset: (value: number) => void = () => {};
  onCheckUpdate: () => void = () => {};
  onVolume: (value: number) => void = () => {};
  onDesktopLyrics: (value: boolean) => void = () => {};
  onDesktopLyricsLocked: (value: boolean) => void = () => {};
  onDesktopLyricSize: (value: number) => void = () => {};
  onDesktopLyricLines: (value: number) => void = () => {};
  onDesktopLyricColorMode: (value: string) => void = () => {};
  onPickDesktopPrimaryColor: () => void = () => {};
  onPickDesktopSecondaryColor: () => void = () => {};
  onWallpaperMode: (value: boolean) => void = () => {};
  onWallpaperBgOpacity: (value: number) => void = () => {};
  onWallpaperOverallOpacity: (value: number) => void = () => {};
  onShortcutsEnabled: (value: boolean) => void = () => {};
  onShortcutChange: (actionId: string, combo: string) => void = () => {};
  onResetShortcuts: () => void = () => {};

  aboutToAppear(): void {
    this.primaryDraft = this.lyrics.primary;
    this.secondaryDraft = this.lyrics.secondary;
    this.offsetDraft = `${this.lyricOffset}`;
  }

  private panelChanged(): void {
    this.hasPanelTransitioned = true;
    if (this.panel !== 'main') {
      setTimeout(() => { try { this.subScroller.scrollTo({ xOffset: 0, yOffset: 0 }); } catch (_) {} }, 16);
    }
  }

  private showInfoDialog(title: string, message: string): void {
    try {
      this.getUIContext().showAlertDialog({
        title,
        message,
        systemMaterial: musicMenuMaterial(),
        confirm: { value: '知道了', action: () => {} }
      });
    } catch (_) {}
  }

  private showSmartStageTip(): void {
    this.showInfoDialog('随声绘色', SMART_STAGE_MODE_TIP);
  }

  private showBoostImmersiveTip(): void {
    this.showInfoDialog(
      '强化沉浸光感',
      '开启后，界面控件将强制启用最高档（EXQUISITE）满血实时材质与光效渲染，可能会引起部分设备出现卡顿、掉帧与发热，请根据设备实际表现酌情开启。'
    );
  }

  private showAutoMixTip(): void {
    this.showInfoDialog(
      '混韵天成',
      '开启后，系统将自动分析前后两首歌曲的节奏、尾奏与前奏区间，在歌曲结尾提前预载下一首并以平滑过渡曲线无缝衔接，避免切歌生硬中断。'
    );
  }

  private styleLabelOf(id: string): string {
    return MINE_RADIO_MODES.find((m: MineRadioMode) => m.id === id)?.label ?? '默认动效';
  }

  @Builder private infoDotButton(label: string, action: () => void) {
    Button('!')
      .width(20).height(20).padding(0).fontSize(11).fontWeight(FontWeight.Bold)
      .fontColor(ACCENT).backgroundColor('#2264D2FF').borderRadius(10)
      .accessibilityText(label)
      .onClick(() => action())
  }

  @Builder private sliderResetButton(active: boolean, label: string, action: () => void) {
    Button({ type: ButtonType.Circle }) {
      Image($r('app.media.refresh')).width(14).height(14).fillColor(active ? ACCENT : MUTED)
    }
      .width(28).height(28).padding(0).backgroundColor('#14FFFFFF')
      .opacity(active ? 1 : 0.55)
      .accessibilityText(label)
      .onClick(() => action())
  }

  @Builder private styleMenuPanel() {
    Scroll() {
      Column({ space: 2 }) {
        ForEach(MINE_RADIO_MODES, (mode: MineRadioMode) => {
          Row({ space: 8 }) {
            Column({ space: 2 }) {
              Text(mode.label)
                .fontSize(14)
                .fontWeight(this.styleName === mode.id ? FontWeight.Medium : FontWeight.Normal)
                .fontColor(this.styleName === mode.id ? ACCENT : TEXT)
                .maxLines(1)
              if (mode.id === SMART_STAGE_MODE_ID && this.styleName === SMART_STAGE_MODE_ID && this.resolvedStyleLabel) {
                Text(`当前匹配：${this.resolvedStyleLabel}`)
                  .fontSize(11).fontColor(MUTED).maxLines(1)
              }
            }.alignItems(HorizontalAlign.Start).layoutWeight(1)
            if (mode.id === SMART_STAGE_MODE_ID) {
              Button('!')
                .width(22).height(22).padding(0).fontSize(12).fontWeight(FontWeight.Bold)
                .fontColor(ACCENT).backgroundColor('#2264D2FF').borderRadius(11)
                .accessibilityText('随声绘色说明')
                .onClick(() => {
                  this.styleMenuOpen = false;
                  this.showSmartStageTip();
                })
            }
            if (this.styleName === mode.id) {
              Text('✓').fontSize(13).fontWeight(FontWeight.Bold).fontColor(ACCENT)
            }
          }
          .width(220)
          .padding({ left: 14, right: 12, top: 10, bottom: 10 })
          .borderRadius(12)
          .backgroundColor(this.styleName === mode.id ? '#1C64D2FF' : Color.Transparent)
          .onClick(() => {
            this.styleMenuOpen = false;
            this.onStyle(mode.id);
          })
        }, (mode: MineRadioMode) => mode.id)
      }.padding(6)
    }.constraintSize({ maxHeight: 360 }).scrollBar(BarState.Off).fadingEdge(false)
  }

  private qualitySummary(): string {
    if (this.quality === 'flac') return '无损';
    if (this.quality === '320k') return '高品质';
    return '标准';
  }

  private appearanceSummary(): string {
    const themeLabel = this.appearance === 'light' ? '浅色' : (this.appearance === 'dark' ? '深色' : '跟随系统');
    const styleObj = MINE_RADIO_MODES.find((m: MineRadioMode) => m.id === this.styleName);
    const styleLabel = styleObj ? styleObj.label : '默认动效';
    return `${themeLabel} · ${styleLabel}`;
  }

  private lyricSummary(): string {
    const scalePct = Math.round((this.lyrics.scale ?? 1) * 100);
    const spacingPct = Math.round((this.lyrics.lineSpacing ?? 1.2) * 100);
    const limitLabel = (this.lyrics.maxLines ?? 0) > 0 ? `${this.lyrics.maxLines} 行` : '铺满';
    return `字号 ${scalePct}% · 行距 ${spacingPct}% · ${limitLabel}`;
  }

  @Builder private title(value: string) {
    Text(value).fontSize(14).fontWeight(FontWeight.Medium).fontColor(MUTED).width('100%').padding({ top: 22, bottom: 10, left: 4 })
  }
  @Builder private copy($$: SettingsCopy) {
    Column({ space: 5 }) {
      Text($$.title).fontSize(16).fontColor(TEXT).maxLines(2).width('100%')
      if ($$.detail) { Text($$.detail).fontSize(12).fontColor(MUTED).maxLines(3).width('100%') }
    }.alignItems(HorizontalAlign.Start).layoutWeight(1)
  }
  @Builder private link($$: SettingsLink) {
    Row({ space: 12 }) {
      this.copy({ title: $$.title, detail: $$.detail })
      Text($$.label ?? '›').fontSize(14).fontColor(MUTED).maxLines(1)
    }.width('100%').padding(18).borderRadius(16).hoverEffect(HoverEffect.Highlight).onClick($$.action)
  }
  @Builder private toggle($$: SettingsToggle) {
    Row({ space: 12 }) {
      this.copy({ title: $$.title, detail: $$.detail })
      MaterialToggle({ value: $$.value, label: $$.title, onChange: $$.action })
    }.width('100%').padding(18)
  }
  @Builder private select($$: SettingsSelect) {
    Row({ space: 10 }) {
      this.copy({ title: $$.title, detail: $$.detail })
      MaterialSelect({ labels: $$.labels, values: $$.values, value: $$.current, label: $$.title, onChange: $$.action })
    }.width('100%').padding({ left: 18, right: 12, top: 12, bottom: 12 })
  }

  /** 一级设置页：清爽分层入口，详尽选项归入对应二级页面。 */
  @Builder private main() {
    this.title('音乐源')
    Column() {
      this.link({
        title: this.sources.find((source: SyncSourcePayload) => source.id === this.activeId)?.name ?? this.sources[0]?.name ?? '未添加音源',
        detail: `${this.sources.length} 个音源 · 当前使用`,
        action: this.onOpenSources
      })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)

    this.title('个性化与播放')
    Column({ space: 1 }) {
      this.link({
        title: '播放与音效',
        detail: `${this.qualitySummary()} · ${audioFxSummary(this.audioFx)}${this.autoMixEnabled ? ' · 混韵天成' : ''}`,
        action: () => this.onPanel('playback')
      })
      this.link({
        title: '外观与背景',
        detail: this.appearanceSummary(),
        action: () => this.onPanel('appearance')
      })
      this.link({
        title: '歌词设置',
        detail: this.lyricSummary(),
        action: () => this.onPanel('lyrics')
      })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)

    this.title('系统与互联')
    Column({ space: 1 }) {
      this.link({
        title: '下载管理',
        detail: `${this.completedDownloads} 首已完成`,
        action: this.onDownloads,
        label: '查看'
      })
      this.link({
        title: '局域网同步',
        detail: this.lanAutoSync ? '已开启自动同步 · 手机、平板与电脑双向合并' : '手机、平板与电脑之间双向同步歌单、音源与设置',
        action: () => this.onPanel('sync')
      })
      this.link({
        title: '通用与交互',
        detail: this.isHarmonyPc
          ? '启动行为、推荐刷新与桌面歌词'
          : (this.gripSupported ? '启动行为、推荐刷新、智感握姿与不感兴趣管理' : '启动行为、推荐刷新与不感兴趣管理'),
        action: () => this.onPanel('general')
      })
      if (this.isHarmonyPc) {
        this.link({
          title: '快捷键管理',
          detail: this.shortcutsEnabled ? '已启用 PC 键盘快捷键，点击自定义键位' : '快捷键已关闭',
          action: () => this.onPanel('shortcuts')
        })
      }
      if (PRODUCT_NAME.toString() !== 'store') {
        this.link({ title: 'HiCar', detail: this.carDetail, action: () => this.onPanel('car'), label: '详情' })
      }
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)

    this.title('关于')
    Column({ space: 1 }) {
      this.link({ title: 'LxMine', detail: 'LX 音源 · MineRadio 视觉 · 全端统一体验', action: () => {}, label: VERSION_NAME })
      this.link({
        title: '检查更新',
        detail: PRODUCT_NAME.toString() === 'store'
          ? '检测 GitHub 最新版本并跳转华为应用市场邀请测试更新'
          : '自动通过国内加速镜像获取 GitHub 最新版 HAP 并保存到指定位置',
        action: this.onCheckUpdate,
        label: this.updateChecking ? '检测中…' : '检查'
      })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
  }

  /** 二级页：播放与音效 */
  @Builder private playbackPanel() {
    this.title('播放选项')
    Column({ space: 1 }) {
      this.select({ title: '音质', detail: '播放和下载优先使用该档位', labels: ['标准 128k', '高品质 320k', '无损 FLAC'], values: ['128k', '320k', 'flac'], current: this.quality, action: this.onQuality })
      this.select({ title: '播放顺序', detail: '列表循环 / 单曲 / 随机 / 顺序', labels: ['列表循环', '单曲循环', '随机播放', '顺序播放'], values: ['列表循环', '单曲循环', '随机播放', '顺序播放'], current: this.mode, action: this.onMode })
      if (this.isHarmonyPc) {
        Column({ space: 8 }) {
          Row({ space: 10 }) {
            this.copy({ title: '播放音量', detail: '独立调节应用内播放音量，也可使用快捷键 Alt+↑ / ↓ / M 控制' })
            Text(`${Math.round(this.volume * 100)}%`).fontSize(13).fontWeight(FontWeight.Medium).fontColor(ACCENT)
            this.sliderResetButton(Math.abs(this.volume - 1) > 0.005, '重置播放音量', () => this.onVolume(1.0))
          }.width('100%')
          SmoothSlider({
            value: Math.round(this.volume * 100),
            min: 0,
            max: 100,
            step: 1,
            selectedColor: ACCENT,
            trackColor: '#38FFFFFF',
            thumbColor: TEXT,
            label: '播放音量',
            onLiveChange: (value: number) => this.onVolume(Math.max(0, Math.min(1, value / 100))),
            onCommit: (value: number) => this.onVolume(Math.max(0, Math.min(1, value / 100)))
          }).width('100%')
        }.width('100%').padding({ left: 18, right: 18, top: 10, bottom: 14 })
      }
      Row({ space: 12 }) {
        Column({ space: 5 }) {
          Row({ space: 6 }) {
            Text('混韵天成').fontSize(16).fontColor(TEXT)
            this.infoDotButton('混韵天成说明', () => this.showAutoMixTip())
          }
          Text('切歌时提前预载下一首并平滑淡出衔接').fontSize(12).fontColor(MUTED).maxLines(2).width('100%')
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        MaterialToggle({ value: this.autoMixEnabled, label: '混韵天成', onChange: this.onAutoMix })
      }.width('100%').padding(18)
      this.toggle({ title: '播放/暂停淡入淡出', detail: '开始播放时音量渐强、暂停时音量渐弱，避免声音戛然而止', value: this.playPauseFadeEnabled, action: this.onPlayPauseFade })
      this.toggle({ title: '切歌自动归位舞台视角', detail: '开启后每次切歌将 360° 舞台视角平滑回正；关闭则保持上一首的旋转角度', value: this.stageResetCameraOnSong, action: this.onStageResetCameraOnSong })
      if (!this.isHarmonyPc) {
        this.toggle({ title: '旋转锁定时允许播放页横屏', detail: '开启后即使系统开启竖屏锁定，横置手机仍可进入沉浸横屏', value: this.allowLandscapeLocked, action: this.onAllowLandscapeLocked })
      }
      this.toggle({ title: '允许与其他应用同时播放', detail: '开启后与其他视频、游戏或导航等应用混音播放，互不打断', value: this.mixWithOthers, action: this.onMixWithOthers })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)

    this.title('音效与均衡器')
    Column({ space: 12 }) {
      Row() {
        this.copy({ title: '当前音效', detail: '可在播控栏「更多」中随时快速切换' })
        Text(audioFxSummary(this.audioFx)).fontSize(13).fontWeight(FontWeight.Medium).fontColor(ACCENT)
      }.width('100%')
      Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
        ForEach(AUDIO_FX_PRESETS, (preset: AudioFxPreset) => {
          Text(preset.label)
            .fontSize(12)
            .fontWeight(this.audioFx.preset === preset.id ? FontWeight.Medium : FontWeight.Normal)
            .fontColor(this.audioFx.preset === preset.id ? '#081018' : TEXT)
            .padding({ left: 11, right: 11, top: 7, bottom: 7 })
            .margin({ right: 7, bottom: 7 })
            .borderRadius(15)
            .backgroundColor(this.audioFx.preset === preset.id ? ACCENT : '#16FFFFFF')
            .onClick(() => this.onAudioFx({
              preset: preset.id,
              customBands: preset.id === 'custom' ? this.audioFx.customBands.slice() : preset.bands.slice(),
              spatial: preset.spatial,
              reverb: preset.reverb,
              spatialMode: this.audioFx.spatialMode ?? 'system'
            }))
        }, (preset: AudioFxPreset) => preset.id)
      }.width('100%')
      Row({ space: 12 }) {
        this.copy({
          title: '空间音频（Spatial Audio）',
          detail: this.spatialSystemActive
            ? '当前耳机/设备已开启系统空间音频渲染'
            : '自动适配支持空间音频的耳机与多声道外放设备'
        })
        MaterialToggle({
          value: this.audioFx.spatialMode !== 'off',
          label: '空间音频',
          onChange: (value: boolean) => this.onAudioFx({
            preset: this.audioFx.preset,
            customBands: this.audioFx.customBands.slice(),
            spatial: this.audioFx.spatial,
            reverb: this.audioFx.reverb,
            spatialMode: value ? 'system' : 'off'
          })
        })
      }.width('100%')
      Row({ space: 12 }) {
        this.copy({ title: '3D 空间环绕', detail: '拓宽声场宽度，增强沉浸感' })
        MaterialToggle({
          value: this.audioFx.spatial,
          label: '3D 空间环绕',
          onChange: (value: boolean) => this.onAudioFx({
            preset: this.audioFx.preset,
            customBands: this.audioFx.customBands.slice(),
            spatial: value,
            reverb: this.audioFx.reverb,
            spatialMode: this.audioFx.spatialMode ?? 'system'
          })
        })
      }.width('100%')
      Row({ space: 8 }) {
        Text('空间混响').fontSize(15).fontColor(TEXT).layoutWeight(1)
        ForEach(REVERB_CHOICES, (opt: ReverbChoice) => {
          Text(opt.label)
            .fontSize(12)
            .fontColor(this.audioFx.reverb === opt.id ? '#081018' : TEXT)
            .padding({ left: 10, right: 10, top: 6, bottom: 6 })
            .borderRadius(12)
            .backgroundColor(this.audioFx.reverb === opt.id ? ACCENT : '#18FFFFFF')
            .onClick(() => this.onAudioFx({
              preset: this.audioFx.preset,
              customBands: this.audioFx.customBands.slice(),
              spatial: this.audioFx.spatial,
              reverb: opt.id,
              spatialMode: this.audioFx.spatialMode ?? 'system'
            }))
        }, (opt: ReverbChoice) => opt.id)
      }.width('100%')
      ForEach(AUDIO_FX_BAND_LABELS, (label: string, idx: number) => {
        Row({ space: 6 }) {
          Text(label).fontSize(12).fontColor(MUTED).width(44)
          SmoothSlider({
            value: effectiveAudioFxBands(this.audioFx)[idx] ?? 0,
            min: -12,
            max: 12,
            step: 1,
            selectedColor: ACCENT,
            trackColor: '#30FFFFFF',
            thumbColor: '#FFFFFF',
            label: `${label} 增益`,
            onLiveChange: (val: number) => {
              const nextBands = effectiveAudioFxBands(this.audioFx).slice();
              const clamped = Math.max(-12, Math.min(12, Math.round(val)));
              if (nextBands[idx] !== clamped) {
                nextBands[idx] = clamped;
                this.onAudioFx({ preset: 'custom', customBands: nextBands, spatial: this.audioFx.spatial, reverb: this.audioFx.reverb, spatialMode: this.audioFx.spatialMode ?? 'system' });
              }
            },
            onCommit: (val: number) => {
              const nextBands = effectiveAudioFxBands(this.audioFx).slice();
              nextBands[idx] = Math.max(-12, Math.min(12, Math.round(val)));
              this.onAudioFx({ preset: 'custom', customBands: nextBands, spatial: this.audioFx.spatial, reverb: this.audioFx.reverb, spatialMode: this.audioFx.spatialMode ?? 'system' });
            }
          }).layoutWeight(1)
          Text(`${(effectiveAudioFxBands(this.audioFx)[idx] ?? 0) > 0 ? '+' : ''}${effectiveAudioFxBands(this.audioFx)[idx] ?? 0}dB`)
            .fontSize(11).fontColor(TEXT).width(38).textAlign(TextAlign.End)
          this.sliderResetButton((effectiveAudioFxBands(this.audioFx)[idx] ?? 0) !== 0, `重置 ${label}`, () => {
            const nextBands = effectiveAudioFxBands(this.audioFx).slice();
            nextBands[idx] = 0;
            this.onAudioFx({ preset: 'custom', customBands: nextBands, spatial: this.audioFx.spatial, reverb: this.audioFx.reverb, spatialMode: this.audioFx.spatialMode ?? 'system' });
          })
        }.width('100%')
      }, (label: string) => label)
    }.width('100%').padding(18).backgroundColor($r('app.color.card_surface')).borderRadius(20)
  }

  /** 二级页：外观与背景 */
  @Builder private appearancePanel() {
    this.title('主题与动效')
    Column({ space: 1 }) {
      this.select({ title: '外观', detail: '深浅色全局适配，自定义背景蒙层同步自动优化可读性', labels: ['深色', '浅色', '跟随系统'], values: ['dark', 'light', 'system'], current: this.appearance, action: this.onAppearance })
      if (this.showBoostImmersive) {
        Row({ space: 12 }) {
          Column({ space: 5 }) {
            Row({ space: 6 }) {
              Text('强化沉浸光感').fontSize(16).fontColor(TEXT)
              this.infoDotButton('强化沉浸光感说明', () => this.showBoostImmersiveTip())
            }
            Text(`当前设备默认材质为${this.materialLevelLabel || '非最高档'}，开启后控件强制启用满血沉浸光感`)
              .fontSize(12).fontColor(MUTED).maxLines(3).width('100%')
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          MaterialToggle({ value: this.boostImmersive, label: '强化沉浸光感', onChange: this.onBoostImmersive })
        }.width('100%').padding(18)
      }
      Row({ space: 8 }) {
        Column({ space: 4 }) {
          Text('MineRadio 动效').fontSize(16).fontColor(TEXT)
          Text(this.styleName === SMART_STAGE_MODE_ID && this.resolvedStyleLabel
            ? `随声绘色已开启 · 当前匹配：${this.resolvedStyleLabel}`
            : '选择播放页动效；选「随声绘色」由 AI 按每首歌内容与封面自动匹配')
            .fontSize(12).fontColor(MUTED).maxLines(3)
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        Stack({ alignContent: Alignment.Center }) {
          if (this.boostImmersiveStorage) {
            HdsExquisiteCapsule({ pillWidth: 148, pillHeight: 40 })
          }
          Button(this.styleLabelOf(this.styleName))
            .attributeModifier(musicButtonPress)
            .width(148).height(40).fontSize(13).fontColor(TEXT)
            .backgroundColor(Color.Transparent)
            .systemMaterial(this.boostImmersiveStorage ? uiMaterial.Material.empty : musicMaterial())
            .accessibilityText('MineRadio 动效')
            .onClick(() => { this.styleMenuOpen = !this.styleMenuOpen; })
        }
        .width(148).height(40).clip(false)
        .bindMenu(this.styleMenuOpen, this.styleMenuPanel, {
          onDisappear: () => { this.styleMenuOpen = false; },
          systemMaterial: musicMenuMaterial()
        })
      }.width('100%').padding({ left: 18, right: 12, top: 12, bottom: 12 })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)

    this.title('播放页背景')
    Column({ space: 1 }) {
      Row({ space: 10 }) {
        this.copy({ title: '播放页自定义背景图', detail: this.stageBgCustom ? '已启用自定义背景图（所有播放页模式生效）' : '默认跟随当前歌曲专辑封面' })
        Row({ space: 8 }) {
          Button('选择图片').height(32).fontSize(12).fontColor('#081018').backgroundColor(ACCENT).borderRadius(16)
            .padding({ left: 12, right: 12 }).onClick(() => this.onPickStageBgImage())
          if (this.stageBgCustom) {
            Button('恢复默认').height(32).fontSize(12).fontColor(TEXT).backgroundColor('#1E808898').borderRadius(16)
              .padding({ left: 12, right: 12 }).onClick(() => this.onClearStageBgImage())
          }
        }
      }.width('100%').padding({ left: 18, right: 14, top: 14, bottom: 14 })
      Column({ space: 8 }) {
        Row({ space: 10 }) {
          this.copy({ title: '播放页背景透明度', detail: '实时调节封面或自定义背景图的透明程度' })
          Text(`${Math.round(this.stageBgOpacity * 100)}%`).fontSize(13).fontWeight(FontWeight.Medium).fontColor(ACCENT)
          this.sliderResetButton(Math.abs(this.stageBgOpacity - 0.78) > 0.005, '重置播放页背景透明度', () => this.onStageBgOpacity(0.78))
        }.width('100%')
        SmoothSlider({
          value: Math.round(this.stageBgOpacity * 100),
          min: 0,
          max: 100,
          step: 1,
          selectedColor: ACCENT,
          thumbColor: '#FFFFFF',
          label: '播放页背景透明度',
          onLiveChange: (value: number) => this.onStageBgOpacity(Math.max(0, Math.min(1, value / 100))),
          onCommit: (value: number) => this.onStageBgOpacity(Math.max(0, Math.min(1, value / 100)))
        }).width('100%')
      }.width('100%').padding({ left: 18, right: 18, top: 10, bottom: 14 })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)

    this.title('非播放页背景（首页 / 曲库 / 设置）')
    Column({ space: 1 }) {
      Row({ space: 10 }) {
        this.copy({ title: '页面自定义背景图', detail: this.pageBgCustom ? '已启用自定义背景，自动适配深浅色可读蒙层' : '默认使用纯净深浅主题底色' })
        Row({ space: 8 }) {
          Button('选择图片').height(32).fontSize(12).fontColor('#081018').backgroundColor(ACCENT).borderRadius(16)
            .padding({ left: 12, right: 12 }).onClick(() => this.onPickPageBgImage())
          if (this.pageBgCustom) {
            Button('恢复默认').height(32).fontSize(12).fontColor(TEXT).backgroundColor('#1E808898').borderRadius(16)
              .padding({ left: 12, right: 12 }).onClick(() => this.onClearPageBgImage())
          }
        }
      }.width('100%').padding({ left: 18, right: 14, top: 14, bottom: 14 })
      if (this.pageBgCustom) {
        Column({ space: 8 }) {
          Row({ space: 10 }) {
            this.copy({ title: '背景显示强度', detail: '调节非播放页背景图清晰度，深浅模式下自动叠加文字保护蒙层' })
            Text(`${Math.round(this.pageBgOpacity * 100)}%`).fontSize(13).fontWeight(FontWeight.Medium).fontColor(ACCENT)
            this.sliderResetButton(Math.abs(this.pageBgOpacity - 0.35) > 0.005, '重置背景显示强度', () => this.onPageBgOpacity(0.35))
          }.width('100%')
          SmoothSlider({
            value: Math.round(this.pageBgOpacity * 100),
            min: 10,
            max: 85,
            step: 1,
            selectedColor: ACCENT,
            thumbColor: '#FFFFFF',
            label: '背景显示强度',
            onLiveChange: (value: number) => this.onPageBgOpacity(Math.max(0.1, Math.min(0.85, value / 100))),
            onCommit: (value: number) => this.onPageBgOpacity(Math.max(0.1, Math.min(0.85, value / 100)))
          }).width('100%')
        }.width('100%').padding({ left: 18, right: 18, top: 10, bottom: 14 })
      }
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
  }

  /** 二级页：歌词设置 */
  @Builder private lyricPanel() {
    Column({ space: Math.round(10 * (this.lyrics.lineSpacing ?? 1.2)) }) {
      if (this.isHarmonyPc) {
        Text('播放详情页歌词预览').fontSize(11).fontColor(MUTED).width('100%').textAlign(TextAlign.Start)
      }
      Text(this.previewText)
        .fontSize(Math.round(22 * (this.lyrics.scale ?? 1)))
        .fontWeight(FontWeight.Bold)
        .fontColor(this.previewPrimary)
        .maxLines(2)
        .textAlign(TextAlign.Center)
      Text('Music meets you right here')
        .fontSize(Math.round(15 * (this.lyrics.scale ?? 1)))
        .fontWeight(FontWeight.Medium)
        .fontColor(this.previewSecondary)
        .opacity(0.82)
        .maxLines(1)
      Row().width('70%').height(4).borderRadius(2).linearGradient({ angle: 90, colors: [[this.previewPrimary, 0], [this.previewSecondary, 1]] })
      if (this.isHarmonyPc) {
        Divider().color('#1EFFFFFF').margin({ top: 6, bottom: 2 })
        Text('桌面歌词预览（独立配色与字号）').fontSize(11).fontColor(MUTED).width('100%').textAlign(TextAlign.Start)
        Text(this.previewText)
          .fontSize(Math.round(24 * Math.max(0.72, Math.min(1.35, this.desktopLyricSize || 1))))
          .fontWeight(FontWeight.Bold)
          .fontColor(this.desktopPreviewPrimary)
          .maxLines(2)
          .textAlign(TextAlign.Center)
          .textShadow({ radius: 12, color: '#C0000000', offsetX: 0, offsetY: 1 })
        Row().width('52%').height(3).borderRadius(2).linearGradient({ angle: 90, colors: [[this.desktopPreviewPrimary, 0], [this.desktopPreviewSecondary, 1]] })
      }
    }.width('100%').padding(24).backgroundColor('#151619').borderRadius(20)

    this.title('排版与显示')
    Column({ space: 1 }) {
      Column({ space: 8 }) {
        Row({ space: 8 }) {
          this.copy({ title: '歌词字体大小', detail: '调节播放详情页歌词字号（55%–150%）' })
          Text(`${Math.round((this.lyrics.scale ?? 1) * 100)}%`).fontSize(13).fontWeight(FontWeight.Medium).fontColor(ACCENT)
          this.sliderResetButton(Math.abs((this.lyrics.scale ?? 1) - 1) > 0.01, '重置歌词字体大小', () => this.onScale(1))
        }.width('100%')
        SmoothSlider({
          value: Math.round((this.lyrics.scale ?? 1) * 100),
          min: 55,
          max: 150,
          step: 1,
          selectedColor: ACCENT,
          trackColor: '#38FFFFFF',
          thumbColor: TEXT,
          label: '歌词字体大小',
          onLiveChange: (value: number) => this.onScale(Math.max(0.55, Math.min(1.5, value / 100))),
          onCommit: (value: number) => this.onScale(Math.max(0.55, Math.min(1.5, value / 100)))
        }).width('100%')
      }.width('100%').padding(18)

      Column({ space: 8 }) {
        Row({ space: 8 }) {
          this.copy({ title: '歌词行间距', detail: '调节歌词行距，英文与大字号下加大行距更舒展（85%–180%）' })
          Text(`${Math.round((this.lyrics.lineSpacing ?? 1.2) * 100)}%`).fontSize(13).fontWeight(FontWeight.Medium).fontColor(ACCENT)
          this.sliderResetButton(Math.abs((this.lyrics.lineSpacing ?? 1.2) - 1.2) > 0.01, '重置歌词行间距', () => this.onLineSpacing(1.2))
        }.width('100%')
        SmoothSlider({
          value: Math.round((this.lyrics.lineSpacing ?? 1.2) * 100),
          min: 85,
          max: 180,
          step: 1,
          selectedColor: ACCENT,
          trackColor: '#38FFFFFF',
          thumbColor: TEXT,
          label: '歌词行间距',
          onLiveChange: (value: number) => this.onLineSpacing(Math.max(0.85, Math.min(1.8, value / 100))),
          onCommit: (value: number) => this.onLineSpacing(Math.max(0.85, Math.min(1.8, value / 100)))
        }).width('100%')
      }.width('100%').padding(18)

      Column({ space: 10 }) {
        Row({ space: 8 }) {
          this.copy({ title: '同时显示行数', detail: '默认铺满屏幕，也可固定为单行或 3 / 5 / 7 / 9 行聚焦显示' })
        }.width('100%')
        Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
          ForEach(LINE_LIMIT_OPTIONS, (opt: LineLimitOption) => {
            Text(opt.label)
              .fontSize(12)
              .fontWeight((this.lyrics.maxLines ?? 0) === opt.count ? FontWeight.Medium : FontWeight.Normal)
              .fontColor((this.lyrics.maxLines ?? 0) === opt.count ? '#081018' : TEXT)
              .padding({ left: 12, right: 12, top: 7, bottom: 7 })
              .margin({ right: 8, bottom: 6 })
              .borderRadius(15)
              .backgroundColor((this.lyrics.maxLines ?? 0) === opt.count ? ACCENT : '#16FFFFFF')
              .onClick(() => this.onMaxLines(opt.count))
          }, (opt: LineLimitOption) => `${opt.count}`)
        }.width('100%')
      }.width('100%').padding(18)

      this.toggle({ title: '显示翻译', detail: '自动跨平台补齐外语歌曲中文翻译歌词', value: this.lyrics.showTranslation, action: this.onTranslation })
      this.toggle({ title: '显示音译 / 罗马音', detail: '日韩外语歌词显示罗马音（无官源时自动智能转写）', value: this.lyrics.showRomaji, action: this.onRomaji })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)

    this.title('颜色与时间')
    Column({ space: 1 }) {
      this.select({ title: '颜色来源', detail: '封面取色或自定义；纯色／渐变', labels: ['封面取色 · 纯色', '封面取色 · 渐变', '自定义 · 纯色', '自定义 · 渐变'], values: ['cover-solid', 'cover-gradient', 'custom-solid', 'custom-gradient'], current: this.lyrics.colorMode, action: this.onColorMode })
      if (this.lyrics.colorMode.startsWith('custom')) {
        Row({ space: 12 }) {
          this.copy({ title: '主色', detail: '点击打开可视化色盘自由选色' })
          Row({ space: 8 }) {
            Row().width(26).height(26).borderRadius(13).backgroundColor(this.lyrics.primary)
              .border({ width: 1.5, color: '#60FFFFFF' })
            Text((this.lyrics.primary || '#7DD3FC').toUpperCase()).fontSize(13).fontColor(TEXT)
            Text('调色 ›').fontSize(13).fontColor(ACCENT)
          }
          .padding({ left: 10, right: 12, top: 6, bottom: 6 })
          .borderRadius(16)
          .backgroundColor('#16FFFFFF')
          .onClick(() => this.onPickPrimaryColor())
        }.padding(18).width('100%')
        if (this.lyrics.colorMode.endsWith('gradient')) {
          Row({ space: 12 }) {
            this.copy({ title: '辅色', detail: '点击打开可视化色盘自由选色' })
            Row({ space: 8 }) {
              Row().width(26).height(26).borderRadius(13).backgroundColor(this.lyrics.secondary)
                .border({ width: 1.5, color: '#60FFFFFF' })
              Text((this.lyrics.secondary || '#A5B4FC').toUpperCase()).fontSize(13).fontColor(TEXT)
              Text('调色 ›').fontSize(13).fontColor(ACCENT)
            }
            .padding({ left: 10, right: 12, top: 6, bottom: 6 })
            .borderRadius(16)
            .backgroundColor('#16FFFFFF')
            .onClick(() => this.onPickSecondaryColor())
          }.padding(18).width('100%')
        }
      }
      Column({ space: 12 }) {
        Row({ space: 8 }) {
          this.copy({ title: '时间偏移', detail: '正值提前显示，负值延后显示' })
          TextInput({ text: this.offsetDraft, placeholder: '0' }).width(74).height(40).fontColor(TEXT).backgroundColor(Color.Transparent).onChange((value: string) => { this.offsetDraft = value; if (value.trim() && Number.isFinite(Number(value))) this.onOffset(Math.max(-10000, Math.min(10000, Math.round(Number(value))))); })
          Text('ms').fontSize(12).fontColor(MUTED)
          this.sliderResetButton(this.lyricOffset !== 0, '重置歌词时间偏移', () => { this.offsetDraft = '0'; this.onOffset(0); })
        }.width('100%')
        SmoothSlider({
          value: this.lyricOffset,
          min: -10000,
          max: 10000,
          step: 50,
          selectedColor: ACCENT,
          trackColor: '#38FFFFFF',
          thumbColor: TEXT,
          label: '歌词时间偏移',
          onLiveChange: (value: number) => { this.offsetDraft = `${Math.round(value)}`; this.onOffset(Math.round(value)); },
          onCommit: (value: number) => { this.offsetDraft = `${Math.round(value)}`; this.onOffset(Math.round(value)); }
        }).width('100%')
      }.width('100%').padding(18)
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)

    if (this.isHarmonyPc) {
      this.title('桌面歌词（鸿蒙 PC）')
      Column({ space: 1 }) {
        this.toggle({ title: '桌面歌词', detail: '在桌面悬浮置顶显示实时歌词与翻译，支持拖动移动与边缘缩放', value: this.desktopLyrics, action: this.onDesktopLyrics })
        this.toggle({ title: '锁定桌面歌词（鼠标穿透）', detail: '开启后桌面歌词不拦截点击，可在设置页或快捷键随时解锁', value: this.desktopLyricsLocked, action: this.onDesktopLyricsLocked })
        Column({ space: 8 }) {
          Row({ space: 10 }) {
            this.copy({ title: '桌面歌词字号', detail: '独立缩放悬浮桌面歌词文字大小（默认 100%）' })
            Text(`${Math.round(this.desktopLyricSize * 100)}%`).fontSize(13).fontWeight(FontWeight.Medium).fontColor(ACCENT)
            this.sliderResetButton(Math.abs(this.desktopLyricSize - 1.0) > 0.005, '重置桌面歌词字号', () => this.onDesktopLyricSize(1.0))
          }.width('100%')
          SmoothSlider({
            value: Math.round(this.desktopLyricSize * 100),
            min: 72,
            max: 155,
            step: 1,
            selectedColor: ACCENT,
            trackColor: '#38FFFFFF',
            thumbColor: TEXT,
            label: '桌面歌词字号',
            onLiveChange: (value: number) => this.onDesktopLyricSize(Math.max(0.72, Math.min(1.55, value / 100))),
            onCommit: (value: number) => this.onDesktopLyricSize(Math.max(0.72, Math.min(1.55, value / 100)))
          }).width('100%')
        }.width('100%').padding({ left: 18, right: 18, top: 10, bottom: 14 })
        this.select({
          title: '桌面歌词显示行数',
          detail: '设置悬浮桌面歌词同时展示的上下文行数',
          labels: ['1 行（单行聚焦）', '2 行', '3 行（推荐）', '5 行（多行沉浸）'],
          values: ['1', '2', '3', '5'],
          current: String(this.desktopLyricLines || 3),
          action: (v: string) => this.onDesktopLyricLines(Number(v) || 3)
        })
        this.select({
          title: '桌面歌词颜色来源',
          detail: '可独立于播放详情页设置桌面歌词颜色',
          labels: ['封面取色 · 纯色', '封面取色 · 渐变', '自定义 · 纯色', '自定义 · 渐变'],
          values: ['cover-solid', 'cover-gradient', 'custom-solid', 'custom-gradient'],
          current: this.desktopLyricColorMode,
          action: this.onDesktopLyricColorMode
        })
        if (this.desktopLyricColorMode.startsWith('custom')) {
          Row({ space: 12 }) {
            this.copy({ title: '桌面歌词主色', detail: '点击打开可视化色盘自由选色' })
            Row({ space: 8 }) {
              Row().width(26).height(26).borderRadius(13).backgroundColor(this.desktopLyricColor)
                .border({ width: 1.5, color: '#60FFFFFF' })
              Text((this.desktopLyricColor || '#7DD3FC').toUpperCase()).fontSize(13).fontColor(TEXT)
              Text('调色 ›').fontSize(13).fontColor(ACCENT)
            }
            .padding({ left: 10, right: 12, top: 6, bottom: 6 })
            .borderRadius(16)
            .backgroundColor('#16FFFFFF')
            .onClick(() => this.onPickDesktopPrimaryColor())
          }.padding(18).width('100%')
          if (this.desktopLyricColorMode.endsWith('gradient')) {
            Row({ space: 12 }) {
              this.copy({ title: '桌面歌词辅色', detail: '点击打开可视化色盘自由选色' })
              Row({ space: 8 }) {
                Row().width(26).height(26).borderRadius(13).backgroundColor(this.desktopLyricColor2)
                  .border({ width: 1.5, color: '#60FFFFFF' })
                Text((this.desktopLyricColor2 || '#A5B4FC').toUpperCase()).fontSize(13).fontColor(TEXT)
                Text('调色 ›').fontSize(13).fontColor(ACCENT)
              }
              .padding({ left: 10, right: 12, top: 6, bottom: 6 })
              .borderRadius(16)
              .backgroundColor('#16FFFFFF')
              .onClick(() => this.onPickDesktopSecondaryColor())
            }.padding(18).width('100%')
          }
        }
      }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
    }

    this.title('车载与蓝牙歌词')
    Column({ space: 1 }) {
      this.toggle({
        title: '蓝牙车载歌词',
        detail: '连接蓝牙车载音响时通过 AVRCP 协议同步推送实时歌词（是否显示及刷新频率取决于车型车机支持）',
        value: this.bluetoothCarLyricsEnabled,
        action: this.onBluetoothCarLyrics
      })
      if (this.bluetoothCarLyricsEnabled) {
        this.select({
          title: '车机显示方式',
          detail: '默认将歌词写入曲目名（兼容绝大多数车机），也可按车型切换',
          labels: ['歌词替换歌名（推荐）', '歌词替换歌手', '歌词 + 歌名拼接'],
          values: ['title', 'artist', 'combined'],
          current: this.bluetoothCarLyricsMode,
          action: this.onBluetoothCarLyricsMode
        })
        Row() {
          Text(this.bluetoothAudioConnected ? '已检测到蓝牙音频设备，播放歌曲时自动向车机同步歌词' : '未检测到蓝牙音频设备（连接车载蓝牙后将自动生效）')
            .fontSize(12)
            .fontColor(this.bluetoothAudioConnected ? ACCENT : MUTED)
            .width('100%')
        }.width('100%').padding({ left: 18, right: 18, top: 8, bottom: 14 })
      }
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
  }

  /** 二级页：通用与交互 */
  @Builder private generalPanel() {
    this.title('行为与交互')
    Column({ space: 1 }) {
      this.toggle({ title: '启动时继续播放上次内容', detail: '默认关闭，保留歌曲和进度，打开软件保持暂停', value: this.resumeOnStartup, action: this.onResume })
      this.toggle({ title: '双击刷新同步重算推荐', detail: '双击首页左上角标题刷新时，同时重洗猜你喜欢与每日三十首推荐算法', value: this.refreshAlgoDoubleTap, action: this.onRefreshAlgoDoubleTap })
      if (this.gripSupported) {
        this.toggle({ title: '智感握姿', detail: '合并播控时，导航圆钮随握持换边', value: this.gripEnabled, action: this.onGrip })
      }
      this.link({
        title: '清空「不感兴趣」屏蔽列表',
        detail: this.dislikedCount > 0 ? `已屏蔽 ${this.dislikedCount} 首歌曲，点击恢复推荐` : '暂无屏蔽歌曲',
        label: this.dislikedCount > 0 ? '清空' : '无',
        action: () => { if (this.dislikedCount > 0) this.onClearDisliked(); }
      })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)

    if (this.isHarmonyPc) {
      this.title('桌面体验（鸿蒙 PC）')
      Column({ space: 1 }) {
        this.toggle({ title: '桌面歌词', detail: '在桌面悬浮置顶显示实时歌词与翻译，拖动可调整位置与大小', value: this.desktopLyrics, action: this.onDesktopLyrics })
        this.toggle({ title: '锁定桌面歌词（鼠标穿透）', detail: '开启后桌面歌词不拦截点击，可在设置页或快捷键随时解锁', value: this.desktopLyricsLocked, action: this.onDesktopLyricsLocked })
        Row({ space: 12 }) {
          Column({ space: 4 }) {
            Row({ space: 8 }) {
              Text('壁纸模式').fontSize(15).fontWeight(FontWeight.Medium).fontColor(TEXT)
              Text('Beta')
                .fontSize(10).fontWeight(FontWeight.Bold).fontColor(ACCENT)
                .padding({ left: 6, right: 6, top: 2, bottom: 2 })
                .borderRadius(8).backgroundColor('#2464D2FF')
            }
            Text('独立全屏透明舞台展示 MineRadio 3D / Folia 动效与歌词，主窗口可继续自由操作，按 Esc 可随时退出')
              .fontSize(12).fontColor(MUTED).width('100%')
          }.layoutWeight(1).alignItems(HorizontalAlign.Start)
          MaterialToggle({
            value: this.wallpaperMode,
            label: '壁纸模式',
            onChange: (value: boolean) => this.onWallpaperMode(value)
          })
        }.width('100%').padding({ left: 18, right: 18, top: 14, bottom: 14 })
        Column({ space: 8 }) {
          Row({ space: 10 }) {
            this.copy({ title: '壁纸背景不透明度', detail: '0% 为完全透明（直接透出桌面，仅浮现动效与歌词），调高则增加封面雾化底色' })
            Text(`${Math.round(this.wallpaperBgOpacity * 100)}%`).fontSize(13).fontWeight(FontWeight.Medium).fontColor(ACCENT)
            this.sliderResetButton(Math.abs(this.wallpaperBgOpacity - 0.42) > 0.005, '重置壁纸背景不透明度', () => this.onWallpaperBgOpacity(0.42))
          }.width('100%')
          SmoothSlider({
            value: Math.round(this.wallpaperBgOpacity * 100),
            min: 0,
            max: 100,
            step: 1,
            selectedColor: ACCENT,
            trackColor: '#38FFFFFF',
            thumbColor: TEXT,
            label: '壁纸背景不透明度',
            onLiveChange: (value: number) => this.onWallpaperBgOpacity(Math.max(0, Math.min(1, value / 100))),
            onCommit: (value: number) => this.onWallpaperBgOpacity(Math.max(0, Math.min(1, value / 100)))
          }).width('100%')
        }.width('100%').padding({ left: 18, right: 18, top: 10, bottom: 14 })
        Column({ space: 8 }) {
          Row({ space: 10 }) {
            this.copy({ title: '壁纸前景不透明度', detail: '调整桌面壁纸层中 3D 动效与歌词的整体可见度' })
            Text(`${Math.round(this.wallpaperOverallOpacity * 100)}%`).fontSize(13).fontWeight(FontWeight.Medium).fontColor(ACCENT)
            this.sliderResetButton(Math.abs(this.wallpaperOverallOpacity - 0.95) > 0.005, '重置壁纸前景不透明度', () => this.onWallpaperOverallOpacity(0.95))
          }.width('100%')
          SmoothSlider({
            value: Math.round(this.wallpaperOverallOpacity * 100),
            min: 25,
            max: 100,
            step: 1,
            selectedColor: ACCENT,
            trackColor: '#38FFFFFF',
            thumbColor: TEXT,
            label: '壁纸前景不透明度',
            onLiveChange: (value: number) => this.onWallpaperOverallOpacity(Math.max(0.25, Math.min(1, value / 100))),
            onCommit: (value: number) => this.onWallpaperOverallOpacity(Math.max(0.25, Math.min(1, value / 100)))
          }).width('100%')
        }.width('100%').padding({ left: 18, right: 18, top: 10, bottom: 14 })
      }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
    }
  }

  /** 二级页：快捷键管理（鸿蒙 PC） */
  @Builder private shortcutsPanel() {
    this.title('键盘快捷键（鸿蒙 PC）')
    Column({ space: 1 }) {
      this.toggle({
        title: '启用键盘快捷键',
        detail: '关闭后暂停响应窗口内快捷键，输入搜索框时自动避让',
        value: this.shortcutsEnabled,
        action: this.onShortcutsEnabled
      })
      Row({ space: 12 }) {
        this.copy({ title: '自定义按键', detail: '点击右侧按键胶囊后直接按下新的组合键；按 Esc 取消，按 Backspace 清空' })
        Button('恢复默认')
          .attributeModifier(musicButtonPress).height(32).padding({ left: 12, right: 12 })
          .fontSize(12).fontColor(ACCENT).backgroundColor('#2064D2FF').borderRadius(16)
          .onClick(() => {
            this.recordingShortcutId = '';
            this.shortcutConflictMsg = '';
            this.onResetShortcuts();
          })
      }.width('100%').padding(18)
      if (this.shortcutConflictMsg) {
        Text(this.shortcutConflictMsg).fontSize(12).fontColor('#FF8B94').padding({ left: 18, right: 18, bottom: 8 }).width('100%')
      }
      ForEach(SHORTCUT_ACTIONS, (item: ShortcutActionDef) => {
        Row({ space: 8 }) {
          this.copy({ title: item.label, detail: item.detail })
          Button(this.recordingShortcutId === item.id ? '请按键…' : (this.shortcuts[item.id] || '未设置'))
            .attributeModifier(musicButtonPress)
            .height(34)
            .padding({ left: 14, right: 14 })
            .fontSize(12)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.recordingShortcutId === item.id ? '#081018' : TEXT)
            .backgroundColor(this.recordingShortcutId === item.id ? ACCENT : '#1AFFFFFF')
            .borderRadius(17)
            .onClick(() => {
              this.shortcutConflictMsg = '';
              this.recordingShortcutId = this.recordingShortcutId === item.id ? '' : item.id;
            })
            .onKeyEvent((event: KeyEvent) => {
              if (this.recordingShortcutId !== item.id || event.type !== KeyType.Down) return;
              const combo = formatKeyEventCombo(event);
              if (!combo) return;
              if (combo === 'Escape') {
                this.recordingShortcutId = '';
                return;
              }
              if (combo === 'Backspace' || combo === 'Delete') {
                this.shortcutConflictMsg = '';
                this.recordingShortcutId = '';
                this.onShortcutChange(item.id, '');
                return;
              }
              let conflictName = '';
              for (const other of SHORTCUT_ACTIONS) {
                if (other.id !== item.id && this.shortcuts[other.id] === combo) {
                  conflictName = other.label;
                  break;
                }
              }
              if (conflictName) {
                this.shortcutConflictMsg = `键位「${combo}」已被「${conflictName}」占用，请换其他按键`;
                return;
              }
              this.shortcutConflictMsg = '';
              this.recordingShortcutId = '';
              this.onShortcutChange(item.id, combo);
            })
          if (this.shortcuts[item.id] !== item.defaultKey) {
            Button('恢复')
              .height(30).padding({ left: 8, right: 8 }).fontSize(11).fontColor(ACCENT)
              .backgroundColor(Color.Transparent)
              .onClick(() => {
                this.shortcutConflictMsg = '';
                this.recordingShortcutId = '';
                this.onShortcutChange(item.id, item.defaultKey);
              })
          }
          if (this.shortcuts[item.id]) {
            Button('清除')
              .height(30).padding({ left: 8, right: 8 }).fontSize(11).fontColor(MUTED)
              .backgroundColor(Color.Transparent)
              .onClick(() => {
                this.shortcutConflictMsg = '';
                this.recordingShortcutId = '';
                this.onShortcutChange(item.id, '');
              })
          }
        }.width('100%').padding({ left: 18, right: 14, top: 12, bottom: 12 })
      }, (item: ShortcutActionDef) => item.id)
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
  }

  /** 二级页：局域网同步 */
  @Builder private syncPanel() {
    this.title('局域网同步')
    Text(this.lanSsid ? `本机 Wi‑Fi：${this.lanSsid}${this.lanLocalAddress ? ' · ' + this.lanLocalAddress : ''}` : `设备需连接同一局域网${this.lanLocalAddress ? '（本机 ' + this.lanLocalAddress + '）' : ''}`).fontSize(13).fontColor(MUTED).width('100%')
    Text('发送后由对方确认接收（包含「我的收藏」与全部歌单）。若路由器开启广播隔离，可输入对端 IP:端口直连。').fontSize(13).fontColor(MUTED).width('100%').padding({ top: 8, bottom: 12 })
    Column({ space: 1 }) {
      this.toggle({ title: '同局域网自动同步歌单', detail: '双方均开启时，歌单和收藏变动自动合并同步', value: this.lanAutoSync, action: this.onLanAutoSync })
      if (!this.devices.length) { Row({ space: 12 }) { LoadingProgress().width(22).height(22); Text('正在寻找附近的 LxMine…').fontSize(14).fontColor(MUTED) }.width('100%').padding(18) }
      ForEach(this.devices, (device: LanDevice) => { this.link({ title: device.name, detail: `${devicePlatformName(device.platform)} · ${device.address}:${device.port}${device.ssid ? ' · ' + device.ssid : ''}`, action: () => this.onSend(device), label: '发送' }) }, (device: LanDevice) => device.id)
      Row({ space: 8 }) {
        TextInput({ text: this.directTargetDraft, placeholder: '输入对端 IP:端口（如 192.168.1.10:41300）' })
          .layoutWeight(1).height(40).fontSize(13).fontColor(TEXT).placeholderColor(MUTED)
          .backgroundColor('#14FFFFFF').borderRadius(12)
          .onChange((value: string) => { this.directTargetDraft = value; })
        Button('直连发送').attributeModifier(musicButtonPress).height(38).padding({ left: 14, right: 14 })
          .fontSize(13).fontColor(ACCENT).backgroundColor('#2464D2FF').borderRadius(19)
          .enabled(!!this.directTargetDraft.trim())
          .onClick(() => this.onSendDirect(this.directTargetDraft.trim()))
      }.width('100%').padding(14)
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
    if (this.message) { Text(this.message).fontSize(13).fontColor(ACCENT).width('100%').padding({ top: 12 }) }
  }

  private subPanelTransition(): TransitionEffect {
    return TransitionEffect.OPACITY
      .combine(TransitionEffect.translate({ x: 42 }))
      .animation({ curve: curves.springMotion(0.46, 0.84) });
  }

  private mainPanelTransition(): TransitionEffect {
    return this.hasPanelTransitioned
      ? TransitionEffect.OPACITY
        .combine(TransitionEffect.translate({ x: -24 }))
        .animation({ curve: curves.springMotion(0.46, 0.84) })
      : TransitionEffect.IDENTITY;
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      if (this.panel === 'playback') {
        Scroll(this.subScroller) {
          Column({ space: 2 }) { this.playbackPanel() }
            .width('100%').alignItems(HorizontalAlign.Start).padding({ top: this.contentTop + 12, bottom: 180 })
        }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
          .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.subScroller.currentOffset().yOffset); })
          .transition(this.subPanelTransition())
      } else if (this.panel === 'appearance') {
        Scroll(this.subScroller) {
          Column({ space: 2 }) { this.appearancePanel() }
            .width('100%').alignItems(HorizontalAlign.Start).padding({ top: this.contentTop + 12, bottom: 180 })
        }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
          .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.subScroller.currentOffset().yOffset); })
          .transition(this.subPanelTransition())
      } else if (this.panel === 'lyrics') {
        Scroll(this.subScroller) {
          Column({ space: 2 }) { this.lyricPanel() }
            .width('100%').alignItems(HorizontalAlign.Start).padding({ top: this.contentTop + 12, bottom: 180 })
        }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
          .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.subScroller.currentOffset().yOffset); })
          .transition(this.subPanelTransition())
      } else if (this.panel === 'general') {
        Scroll(this.subScroller) {
          Column({ space: 2 }) { this.generalPanel() }
            .width('100%').alignItems(HorizontalAlign.Start).padding({ top: this.contentTop + 12, bottom: 180 })
        }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
          .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.subScroller.currentOffset().yOffset); })
          .transition(this.subPanelTransition())
      } else if (this.panel === 'shortcuts') {
        Scroll(this.subScroller) {
          Column({ space: 2 }) { this.shortcutsPanel() }
            .width('100%').alignItems(HorizontalAlign.Start).padding({ top: this.contentTop + 12, bottom: 180 })
        }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
          .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.subScroller.currentOffset().yOffset); })
          .transition(this.subPanelTransition())
      } else if (this.panel === 'sync') {
        Scroll(this.subScroller) {
          Column({ space: 2 }) { this.syncPanel() }
            .width('100%').alignItems(HorizontalAlign.Start).padding({ top: this.contentTop + 12, bottom: 180 })
        }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
          .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.subScroller.currentOffset().yOffset); })
          .transition(this.subPanelTransition())
      } else if (this.panel === 'car' && PRODUCT_NAME.toString() !== 'store') {
        Scroll(this.subScroller) {
          Column({ space: 2 }) {
            this.title('HiCar')
            Text(this.carDetail).fontSize(16).fontColor(TEXT)
            Text('连接检测与车机应用入口分别接入。普通版不会因检测到连接而自动进入车机应用列表。HiCar 兼容版请在车机应用尝鲜区添加“咪咕音乐”，打开后仍为 LxMine；兼容版不能与官方咪咕音乐共存。').fontSize(13).fontColor(MUTED).padding({ top: 16 })
          }
            .width('100%').alignItems(HorizontalAlign.Start).padding({ top: this.contentTop + 12, bottom: 180 })
        }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
          .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.subScroller.currentOffset().yOffset); })
          .transition(this.subPanelTransition())
      } else {
        Scroll(this.scroller) {
          Column({ space: 2 }) { this.main() }
            .width('100%').alignItems(HorizontalAlign.Start).padding({ top: this.contentTop + 12, bottom: 180 })
        }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
          .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.scroller.currentOffset().yOffset); })
          .transition(this.mainPanelTransition())
      }
    }.width('100%').height('100%')
  }
}
