import { uiMaterial } from '@kit.ArkUI';
import { Song } from '../model/Song';
import { MaterialSelect, MaterialToggle, musicButtonPress, musicMenuMaterial } from './MaterialControls';
import { SmoothSlider } from './SmoothSlider';
import { TEXT, MUTED, ACCENT, ON_ACCENT } from './Theme';
import {
  AUDIO_FX_BAND_LABELS,
  AUDIO_FX_PRESETS,
  AudioFxConfig,
  AudioFxPreset,
  audioFxSummary,
  defaultAudioFxConfig,
  effectiveAudioFxBands
} from '../services/AudioFxPresets';

interface MoreRowOpts {
  icon: Resource;
  title: string;
  subtitle?: string;
  trailing?: string;
  accent?: boolean;
  tint?: boolean;
  chevron?: boolean;
  action: () => void;
}

interface SleepPresetOption {
  id: string;
  label: string;
  minutes: number;
}

interface ReverbOption {
  id: string;
  label: string;
}

const SLEEP_PRESETS: SleepPresetOption[] = [
  { id: 'off', label: '关闭', minutes: 0 },
  { id: 'song', label: '本首播完', minutes: -1 },
  { id: '10', label: '10 分钟', minutes: 10 },
  { id: '30', label: '30 分钟', minutes: 30 },
  { id: '45', label: '45 分钟', minutes: 45 },
  { id: '60', label: '60 分钟', minutes: 60 },
  { id: '90', label: '90 分钟', minutes: 90 }
];

const REVERB_OPTIONS: ReverbOption[] = [
  { id: 'none', label: '无混响' },
  { id: 'small', label: '室内混响' },
  { id: 'hall', label: '音乐厅' }
];

@Component
export struct PlayerMoreSheet {
  @Prop song: Song;
  @Prop liked: boolean = false;
  @Prop quality: string = '128k';
  @Prop audioFx: AudioFxConfig = defaultAudioFxConfig();
  @Prop autoMixEnabled: boolean = false;
  @Prop autoMixPreview: string = '';
  @Prop playPauseFadeEnabled: boolean = true;
  @Prop inUserLibrary: boolean = false;
  @Prop sleepMode: string = 'off';
  @Prop sleepRemainingText: string = '';
  @Prop isHarmonyPc: boolean = false;
  @Prop volume: number = 1.0;
  @Prop desktopLyrics: boolean = false;
  @Prop desktopLyricsLocked: boolean = false;
  @Prop mobileDesktopLyricsSupported: boolean = false;
  @Prop wallpaperMode: boolean = false;

  onAddToPlaylist: () => void = () => {};
  onSwitchPlatform: () => void = () => {};
  onComments: () => void = () => {};
  onLike: () => void = () => {};
  onDownload: () => void = () => {};
  onSelectQuality: (value: string) => void = () => {};
  onOpenAudioFx: () => void = () => {};
  onViewArtist: () => void = () => {};
  onViewAlbum: () => void = () => {};
  onToggleAutoMix: (enabled: boolean) => void = () => {};
  onTogglePlayPauseFade: (enabled: boolean) => void = () => {};
  onDislike: () => void = () => {};
  onSimilarSongs: () => void = () => {};
  onOpenSleepTimer: () => void = () => {};
  onVolume: (value: number) => void = () => {};
  onToggleDesktopLyrics: () => void = () => {};
  onToggleDesktopLyricsLocked: () => void = () => {};
  onToggleWallpaperMode: () => void = () => {};

  private showAutoMixTip(): void {
    try {
      this.getUIContext().showAlertDialog({
        title: '混韵天成',
        message: '开启后，系统将自动分析前后两首歌曲的节奏、尾奏与前奏区间，在歌曲结尾提前预载下一首并以平滑过渡曲线无缝衔接，避免切歌生硬中断。',
        systemMaterial: musicMenuMaterial(),
        confirm: { value: '知道了', action: () => {} }
      });
    } catch (_) {}
  }

  private qualityLabel(): string {
    if (this.quality === 'flac') return '无损 FLAC';
    if (this.quality === '320k') return '高品质 320k';
    return '标准 128k';
  }

  private sleepTrailing(): string {
    if (this.sleepMode === 'off') return '未开启';
    if (this.sleepMode === 'song') return '播完本首关闭';
    return this.sleepRemainingText || '已开启';
  }

  private artistDisplay(): string {
    const raw = (this.song.singer || '').trim();
    return raw && raw !== '未知歌手' ? raw : '未知艺人';
  }

  private albumDisplay(): string {
    const raw = (this.song.albumName || '').trim();
    return raw ? raw : (this.song.name || '当前单曲');
  }

  @Builder private itemRow($$: MoreRowOpts) {
    Row({ space: 14 }) {
      Image($$.icon)
        .width(20)
        .height(20)
        .fillColor($$.tint === false ? undefined : ($$.accent ? ACCENT : TEXT))
      Column({ space: 3 }) {
        Text($$.title)
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor($$.accent ? ACCENT : TEXT)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        if ($$.subtitle) {
          Text($$.subtitle)
            .fontSize(11)
            .fontColor(MUTED)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
      }.alignItems(HorizontalAlign.Start).layoutWeight(1)
      if ($$.trailing) {
        Text($$.trailing)
          .fontSize(12)
          .fontColor($$.accent ? ACCENT : MUTED)
          .maxLines(1)
      }
      if ($$.chevron) {
        Text('›')
          .fontSize(18)
          .fontColor(MUTED)
      }
    }
    .width('100%')
    .padding({ left: 14, right: 14, top: 13, bottom: 13 })
    .borderRadius(14)
    .backgroundColor(Color.Transparent)
    .onClick($$.action)
  }

  build() {
    Column({ space: 4 }) {
      // 歌曲摘要头
      Row({ space: 12 }) {
        Stack() {
          Column().width('100%').height('100%').backgroundColor('#1E2430')
          if (this.song.coverUrl) {
            Image(this.song.coverUrl).width('100%').height('100%').objectFit(ImageFit.Cover)
          } else {
            Image($r('app.media.ic_music')).width(22).height(22).fillColor(MUTED)
          }
        }.width(46).height(46).borderRadius(10).clip(true)
        Column({ space: 4 }) {
          Text(this.song.name || '未选择歌曲')
            .fontSize(15)
            .fontWeight(FontWeight.Medium)
            .fontColor(TEXT)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(`${this.artistDisplay()}${this.song.albumName ? ' · ' + this.song.albumName : ''}`)
            .fontSize(12)
            .fontColor(MUTED)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
      }
      .width('100%')
      .padding({ left: 10, right: 10, top: 4, bottom: 10 })

      Column({ space: 2 }) {
        // 1. 添加至歌单
        this.itemRow({
          icon: $r('app.media.ic_plus'),
          title: '添加至歌单',
          action: () => this.onAddToPlaylist()
        })

        // 1b. 独立入口：切换歌曲平台
        if (this.song.source !== 'local') {
          this.itemRow({
            icon: $r('app.media.ic_switch_platform'),
            title: '切换歌曲平台',
            subtitle: '搜索并切换到其他平台的同名高音质版本',
            action: () => this.onSwitchPlatform()
          })
        }

        // 2. 评论
        this.itemRow({
          icon: $r('app.media.ic_comment_official'),
          title: '评论',
          action: () => this.onComments()
        })

        // 3. 收藏
        this.itemRow({
          icon: this.liked ? $r('app.media.ic_heart_fill') : $r('app.media.ic_heart'),
          title: this.liked ? '已收藏' : '收藏',
          accent: this.liked,
          tint: !this.liked,
          action: () => this.onLike()
        })

        // 4. 下载歌曲
        this.itemRow({
          icon: $r('app.media.ic_download'),
          title: '下载歌曲',
          subtitle: this.song.source === 'local' ? '当前已是本地音频' : `按当前音质（${this.qualityLabel()}）下载保存`,
          action: () => this.onDownload()
        })

        // 5. 音质（与设置页一致的原生选择框弹窗）
        Row({ space: 14 }) {
          Image($r('app.media.ic_music'))
            .width(20)
            .height(20)
            .fillColor(TEXT)
          Column({ space: 3 }) {
            Text('音质')
              .fontSize(15)
              .fontWeight(FontWeight.Medium)
              .fontColor(TEXT)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          MaterialSelect({
            labels: ['标准 128k', '高品质 320k', '无损 FLAC'],
            values: ['128k', '320k', 'flac'],
            value: this.quality,
            label: '音质',
            onChange: (val: string) => this.onSelectQuality(val)
          })
        }
        .width('100%')
        .padding({ left: 14, right: 12, top: 9, bottom: 9 })
        .borderRadius(14)
        .backgroundColor(Color.Transparent)

        // 6. 音效（原生独立窗口）
        this.itemRow({
          icon: $r('app.media.ic_sparkle'),
          title: '音效',
          subtitle: '16 种风格预设 · 5 段均衡器 · 空间环绕与混响',
          trailing: audioFxSummary(this.audioFx),
          accent: this.audioFx.preset !== 'off' || this.audioFx.spatial || this.audioFx.reverb !== 'none',
          chevron: true,
          action: () => this.onOpenAudioFx()
        })

        // 7. 查看艺人：xxx
        this.itemRow({
          icon: $r('app.media.ic_search'),
          title: `查看艺人：${this.artistDisplay()}`,
          action: () => this.onViewArtist()
        })

        // 8. 查看专辑：xxx
        this.itemRow({
          icon: $r('app.media.ic_library'),
          title: `查看专辑：${this.albumDisplay()}`,
          action: () => this.onViewAlbum()
        })

        // 9. 混韵天成（直控开关）
        Row({ space: 14 }) {
          Image($r('app.media.ic_style_wand'))
            .width(20)
            .height(20)
            .fillColor(this.autoMixEnabled ? ACCENT : TEXT)
          Column({ space: 3 }) {
            Row({ space: 6 }) {
              Text('混韵天成')
                .fontSize(15)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.autoMixEnabled ? ACCENT : TEXT)
                .maxLines(1)
              Button('!')
                .width(19).height(19).padding(0).fontSize(11).fontWeight(FontWeight.Bold)
                .fontColor(ACCENT).backgroundColor('#2264D2FF').borderRadius(10)
                .accessibilityText('混韵天成说明')
                .onClick(() => this.showAutoMixTip())
            }
            Text(this.autoMixEnabled
              ? (this.autoMixPreview || '根据前后首节奏与尾奏/前奏自动平滑衔接')
              : '自动分析队列相邻歌曲的节奏与尾奏/前奏，平滑衔接下一首')
              .fontSize(11)
              .fontColor(this.autoMixEnabled && this.autoMixPreview ? ACCENT : MUTED)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          MaterialToggle({
            value: this.autoMixEnabled,
            label: '混韵天成',
            onChange: (value: boolean) => this.onToggleAutoMix(value)
          })
        }
        .width('100%')
        .padding({ left: 14, right: 14, top: 13, bottom: 13 })
        .borderRadius(14)
        .backgroundColor(Color.Transparent)
        .onClick(() => this.onToggleAutoMix(!this.autoMixEnabled))

        // 9.5 播放/暂停淡入淡出
        Row({ space: 14 }) {
          Image($r('app.media.ic_volume'))
            .width(20)
            .height(20)
            .fillColor(this.playPauseFadeEnabled ? ACCENT : TEXT)
          Column({ space: 3 }) {
            Text('播放/暂停淡入淡出')
              .fontSize(15)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.playPauseFadeEnabled ? ACCENT : TEXT)
              .maxLines(1)
            Text('开始播放时渐强、暂停时渐弱，避免声音戛然而止')
              .fontSize(11)
              .fontColor(MUTED)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          MaterialToggle({
            value: this.playPauseFadeEnabled,
            label: '播放/暂停淡入淡出',
            onChange: (value: boolean) => this.onTogglePlayPauseFade(value)
          })
        }
        .width('100%')
        .padding({ left: 14, right: 14, top: 13, bottom: 13 })
        .borderRadius(14)
        .backgroundColor(Color.Transparent)
        .onClick(() => this.onTogglePlayPauseFade(!this.playPauseFadeEnabled))

        // 10. 不感兴趣（在自己曲库中不显示）
        if (!this.inUserLibrary) {
          this.itemRow({
            icon: $r('app.media.ic_close'),
            title: '不感兴趣',
            subtitle: '减少相似推荐并立即切至下一首',
            action: () => this.onDislike()
          })
        }

        // 11. 相似歌曲
        this.itemRow({
          icon: $r('app.media.ic_sparkle'),
          title: '相似歌曲',
          subtitle: '发现与当前曲目同风格的好歌',
          action: () => this.onSimilarSongs()
        })

        // 12. 定时关闭（原生独立窗口）
        this.itemRow({
          icon: $r('app.media.ic_repeat'),
          title: '定时关闭',
          trailing: this.sleepTrailing(),
          accent: this.sleepMode !== 'off',
          chevron: true,
          action: () => this.onOpenSleepTimer()
        })
      }
      .width('100%')
      .backgroundColor($r('app.color.card_surface'))
      .borderRadius(18)
      .padding({ top: 4, bottom: 4 })

      // 鸿蒙 PC 快捷控制区（音量调节 + 桌面歌词 / 壁纸模式，与 Windows 端 1:1 对齐）
      if (this.isHarmonyPc) {
        Column({ space: 10 }) {
          Row({ space: 10 }) {
            Image($r('app.media.ic_volume')).width(18).height(18).fillColor(this.volume > 0 ? ACCENT : MUTED)
            Text('音量').fontSize(13).fontWeight(FontWeight.Medium).fontColor(TEXT)
            SmoothSlider({
              value: Math.round(this.volume * 100),
              min: 0,
              max: 100,
              step: 1,
              selectedColor: ACCENT,
              trackColor: '#30FFFFFF',
              thumbColor: '#FFFFFF',
              label: '音量',
              onLiveChange: (val: number) => this.onVolume(Math.max(0, Math.min(1, val / 100))),
              onCommit: (val: number) => this.onVolume(Math.max(0, Math.min(1, val / 100)))
            }).layoutWeight(1)
            Text(`${Math.round(this.volume * 100)}%`).fontSize(12).fontColor(ACCENT).width(36).textAlign(TextAlign.End)
            Button({ type: ButtonType.Circle }) {
              Image($r('app.media.refresh')).width(13).height(13).fillColor(Math.abs(this.volume - 1) > 0.005 ? ACCENT : MUTED)
            }
              .width(26).height(26).padding(0).backgroundColor('#14FFFFFF')
              .opacity(Math.abs(this.volume - 1) > 0.005 ? 1 : 0.55)
              .accessibilityText('重置音量')
              .onClick(() => this.onVolume(1.0))
          }.width('100%').padding({ left: 14, right: 12, top: 10 })

          Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
            Button(this.desktopLyrics ? '桌面歌词：开' : '桌面歌词：关')
              .attributeModifier(musicButtonPress)
              .height(34).padding({ left: 14, right: 14 }).margin({ right: 8, bottom: 8 })
              .fontSize(13).fontWeight(FontWeight.Medium)
              .fontColor(this.desktopLyrics ? '#081018' : TEXT)
              .backgroundColor(this.desktopLyrics ? ACCENT : '#1AFFFFFF')
              .borderRadius(17)
              .onClick(() => this.onToggleDesktopLyrics())
            Button(this.desktopLyricsLocked ? '已锁定桌面歌词' : '锁定桌面歌词')
              .attributeModifier(musicButtonPress)
              .height(34).padding({ left: 14, right: 14 }).margin({ right: 8, bottom: 8 })
              .fontSize(13).fontWeight(FontWeight.Medium)
              .fontColor(this.desktopLyricsLocked ? '#081018' : TEXT)
              .backgroundColor(this.desktopLyricsLocked ? ACCENT : '#1AFFFFFF')
              .borderRadius(17)
              .onClick(() => this.onToggleDesktopLyricsLocked())
            Button(this.wallpaperMode ? '壁纸模式：开' : '壁纸模式：关')
              .attributeModifier(musicButtonPress)
              .height(34).padding({ left: 14, right: 14 }).margin({ right: 8, bottom: 8 })
              .fontSize(13).fontWeight(FontWeight.Medium)
              .fontColor(this.wallpaperMode ? '#081018' : TEXT)
              .backgroundColor(this.wallpaperMode ? ACCENT : '#1AFFFFFF')
              .borderRadius(17)
              .onClick(() => this.onToggleWallpaperMode())
          }
          .width('100%')
          .padding({ left: 12, right: 4, bottom: 4 })
        }
        .width('100%')
        .margin({ top: 8 })
        .backgroundColor($r('app.color.card_surface'))
        .borderRadius(18)
      } else if (this.mobileDesktopLyricsSupported) {
        Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
          Button(this.desktopLyrics ? '桌面歌词：开' : '桌面歌词：关')
            .attributeModifier(musicButtonPress)
            .height(34).padding({ left: 14, right: 14 }).margin({ right: 8, bottom: 4 })
            .fontSize(13).fontWeight(FontWeight.Medium)
            .fontColor(this.desktopLyrics ? ON_ACCENT : TEXT)
            .backgroundColor(this.desktopLyrics ? ACCENT : $r('app.color.card_surface'))
            .borderRadius(17)
            .onClick(() => this.onToggleDesktopLyrics())
          if (this.desktopLyrics) {
            Button(this.desktopLyricsLocked ? '已锁定桌面歌词' : '锁定桌面歌词')
              .attributeModifier(musicButtonPress)
              .height(34).padding({ left: 14, right: 14 }).margin({ right: 8, bottom: 4 })
              .fontSize(13).fontWeight(FontWeight.Medium)
              .fontColor(this.desktopLyricsLocked ? ON_ACCENT : TEXT)
              .backgroundColor(this.desktopLyricsLocked ? ACCENT : $r('app.color.card_surface'))
              .borderRadius(17)
              .onClick(() => this.onToggleDesktopLyricsLocked())
          }
        }
        .width('100%')
        .margin({ top: 8 })
        .padding({ left: 12, right: 4, top: 10, bottom: 6 })
        .backgroundColor($r('app.color.card_surface'))
        .borderRadius(18)
      }
    }
    .width('100%')
    .padding({ bottom: 18 })
  }
}

/** 音效独立原生窗口 */
@Component
export struct PlayerAudioFxSheet {
  @Prop audioFx: AudioFxConfig = defaultAudioFxConfig();
  @Prop spatialSystemActive: boolean = false;
  onSelectAudioFx: (value: AudioFxConfig) => void = () => {};
  onDone: () => void = () => {};

  private selectPreset(preset: AudioFxPreset): void {
    const next: AudioFxConfig = {
      preset: preset.id,
      customBands: preset.id === 'custom' ? this.audioFx.customBands.slice() : preset.bands.slice(),
      spatial: preset.spatial,
      reverb: preset.reverb,
      spatialMode: this.audioFx.spatialMode ?? 'system'
    };
    this.onSelectAudioFx(next);
  }

  private updateCustomBand(index: number, db: number): void {
    const nextBands = effectiveAudioFxBands(this.audioFx).slice();
    nextBands[index] = Math.max(-12, Math.min(12, Math.round(db)));
    this.onSelectAudioFx({
      preset: 'custom',
      customBands: nextBands,
      spatial: this.audioFx.spatial,
      reverb: this.audioFx.reverb,
      spatialMode: this.audioFx.spatialMode ?? 'system'
    });
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Scroll() {
        Column({ space: 14 }) {
          Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
            ForEach(AUDIO_FX_PRESETS, (preset: AudioFxPreset) => {
              Text(preset.label)
                .fontSize(12)
                .fontWeight(this.audioFx.preset === preset.id ? FontWeight.Medium : FontWeight.Normal)
                .fontColor(this.audioFx.preset === preset.id ? '#081018' : TEXT)
                .padding({ left: 12, right: 12, top: 7, bottom: 7 })
                .margin({ right: 8, bottom: 8 })
                .borderRadius(15)
                .backgroundColor(this.audioFx.preset === preset.id ? ACCENT : '#18FFFFFF')
                .onClick(() => this.selectPreset(preset))
            }, (preset: AudioFxPreset) => preset.id)
          }.width('100%')

          Column({ space: 14 }) {
            Row({ space: 10 }) {
              Column({ space: 2 }) {
                Text('空间音频（Spatial Audio）').fontSize(14).fontWeight(FontWeight.Medium).fontColor(TEXT)
                Text(this.spatialSystemActive
                  ? '已检测到系统空间音频设备并启用头部追踪/沉浸渲染'
                  : '适配 FreeBuds 等支持空间音频的耳机与外放设备')
                  .fontSize(11).fontColor(this.spatialSystemActive ? ACCENT : MUTED)
              }.alignItems(HorizontalAlign.Start).layoutWeight(1)
              MaterialToggle({
                value: this.audioFx.spatialMode !== 'off',
                label: '空间音频',
                onChange: (value: boolean) => this.onSelectAudioFx({
                  preset: this.audioFx.preset,
                  customBands: this.audioFx.customBands.slice(),
                  spatial: this.audioFx.spatial,
                  reverb: this.audioFx.reverb,
                  spatialMode: value ? 'system' : 'off'
                })
              })
            }.width('100%')

            Row({ space: 10 }) {
              Column({ space: 2 }) {
                Text('3D 空间环绕').fontSize(14).fontWeight(FontWeight.Medium).fontColor(TEXT)
                Text('拓宽声场宽度，增强包裹感').fontSize(11).fontColor(MUTED)
              }.alignItems(HorizontalAlign.Start).layoutWeight(1)
              MaterialToggle({
                value: this.audioFx.spatial,
                label: '3D 空间环绕',
                onChange: (value: boolean) => this.onSelectAudioFx({
                  preset: this.audioFx.preset,
                  customBands: this.audioFx.customBands.slice(),
                  spatial: value,
                  reverb: this.audioFx.reverb,
                  spatialMode: this.audioFx.spatialMode ?? 'system'
                })
              })
            }.width('100%')

            Row({ space: 8 }) {
              Text('空间混响').fontSize(14).fontColor(TEXT).layoutWeight(1)
              ForEach(REVERB_OPTIONS, (opt: ReverbOption) => {
                Text(opt.label)
                  .fontSize(12)
                  .fontColor(this.audioFx.reverb === opt.id ? '#081018' : TEXT)
                  .padding({ left: 10, right: 10, top: 6, bottom: 6 })
                  .borderRadius(12)
                  .backgroundColor(this.audioFx.reverb === opt.id ? ACCENT : '#18FFFFFF')
                  .onClick(() => this.onSelectAudioFx({
                    preset: this.audioFx.preset,
                    customBands: this.audioFx.customBands.slice(),
                    spatial: this.audioFx.spatial,
                    reverb: opt.id,
                    spatialMode: this.audioFx.spatialMode ?? 'system'
                  }))
              }, (opt: ReverbOption) => opt.id)
            }.width('100%')
          }
          .width('100%')
          .padding(16)
          .borderRadius(16)
          .backgroundColor($r('app.color.card_surface'))

          Column({ space: 6 }) {
            Row() {
              Text('5 段均衡器（-12dB ~ +12dB）').fontSize(12).fontColor(MUTED).layoutWeight(1)
              if (this.audioFx.preset === 'custom') {
                Text('已自定义').fontSize(11).fontColor(ACCENT)
              }
            }.width('100%')
            ForEach(AUDIO_FX_BAND_LABELS, (label: string, idx: number) => {
              Row({ space: 6 }) {
                Text(label).fontSize(11).fontColor(MUTED).width(42)
                Slider({
                  value: effectiveAudioFxBands(this.audioFx)[idx] ?? 0,
                  min: -12,
                  max: 12,
                  step: 1
                })
                  .layoutWeight(1)
                  .selectedColor(ACCENT)
                  .trackColor('#30FFFFFF')
                  .blockColor('#FFFFFF')
                  .onChange((val: number, mode: SliderChangeMode) => {
                    if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) {
                      this.updateCustomBand(idx, val);
                    }
                  })
                Text(`${(effectiveAudioFxBands(this.audioFx)[idx] ?? 0) > 0 ? '+' : ''}${effectiveAudioFxBands(this.audioFx)[idx] ?? 0}dB`)
                  .fontSize(11).fontColor(TEXT).width(36).textAlign(TextAlign.End)
                Button({ type: ButtonType.Circle }) {
                  Image($r('app.media.refresh')).width(13).height(13)
                    .fillColor((effectiveAudioFxBands(this.audioFx)[idx] ?? 0) !== 0 ? ACCENT : MUTED)
                }
                  .width(26).height(26).padding(0).backgroundColor('#14FFFFFF')
                  .opacity((effectiveAudioFxBands(this.audioFx)[idx] ?? 0) !== 0 ? 1 : 0.55)
                  .accessibilityText(`重置 ${label}`)
                  .onClick(() => this.updateCustomBand(idx, 0))
              }.width('100%')
            }, (label: string) => label)
          }
          .width('100%')
          .padding(16)
          .borderRadius(16)
          .backgroundColor($r('app.color.card_surface'))

          Text('鸿蒙端同步启用系统音频引擎（Histen / 空间音频）与动态响度增益。')
            .fontSize(11).fontColor(MUTED).width('100%')
        }.width('100%').padding({ left: 24, right: 24, top: 72, bottom: 28 })
      }
        .width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
        .linearGradientBlur(24, { fractionStops: [[1.0, 0.0], [0.84, 0.06], [0.24, 0.12], [0.0, 0.17]], direction: GradientDirection.Bottom })

      Row({ space: 8 }) {
        Column({ space: 2 }) {
          Text('音效').fontSize(24).fontWeight(FontWeight.Bold).fontColor(TEXT)
          Text(audioFxSummary(this.audioFx)).fontSize(12).fontColor(ACCENT)
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        Button('完成').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL)
          .backgroundColor(Color.Transparent).systemMaterial(uiMaterial.Material.empty).focusable(false).fontColor(ACCENT)
          .onClick(() => this.onDone())
      }.width('100%').padding({ left: 24, right: 24, top: 20, bottom: 10 }).hitTestBehavior(HitTestMode.Default)
    }.width('100%').height('100%')
  }
}

/** 定时关闭独立原生窗口 */
@Component
export struct PlayerSleepTimerSheet {
  @Prop sleepMode: string = 'off';
  @Prop sleepRemainingText: string = '';
  @Prop sleepFinishSong: boolean = true;
  @State private customMinutesDraft: string = '';
  onSetSleepTimer: (mode: string, minutes: number) => void = () => {};
  onToggleSleepFinishSong: (enabled: boolean) => void = () => {};
  onDone: () => void = () => {};

  private statusText(): string {
    if (this.sleepMode === 'off') return '当前未开启定时关闭';
    if (this.sleepMode === 'song') return '将在本首歌曲播放完成后自动暂停';
    return `倒计时剩余：${this.sleepRemainingText || '已开启'}`;
  }

  build() {
    Column({ space: 14 }) {
      Row({ space: 8 }) {
        Column({ space: 2 }) {
          Text('定时关闭').fontSize(24).fontWeight(FontWeight.Bold).fontColor(TEXT)
          Text(this.statusText()).fontSize(12).fontColor(this.sleepMode !== 'off' ? ACCENT : MUTED)
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        Button('完成').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL)
          .backgroundColor(Color.Transparent).systemMaterial(uiMaterial.Material.empty).focusable(false).fontColor(ACCENT)
          .onClick(() => this.onDone())
      }.width('100%')

      Column({ space: 14 }) {
        Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
          ForEach(SLEEP_PRESETS, (preset: SleepPresetOption) => {
            Text(preset.label)
              .fontSize(13)
              .fontWeight(this.sleepMode === preset.id ? FontWeight.Medium : FontWeight.Normal)
              .fontColor(this.sleepMode === preset.id ? '#081018' : TEXT)
              .padding({ left: 13, right: 13, top: 8, bottom: 8 })
              .margin({ right: 8, bottom: 8 })
              .borderRadius(16)
              .backgroundColor(this.sleepMode === preset.id ? ACCENT : '#18FFFFFF')
              .onClick(() => this.onSetSleepTimer(preset.id, preset.minutes))
          }, (preset: SleepPresetOption) => preset.id)
        }.width('100%')

        Row({ space: 8 }) {
          TextInput({ text: this.customMinutesDraft, placeholder: '自定义分钟（1–480）' })
            .type(InputType.Number)
            .layoutWeight(1)
            .height(40)
            .fontSize(13)
            .fontColor(TEXT)
            .placeholderColor(MUTED)
            .backgroundColor('#16FFFFFF')
            .borderRadius(12)
            .onChange((value: string) => { this.customMinutesDraft = value; })
          Button('设定')
            .attributeModifier(musicButtonPress)
            .height(40)
            .padding({ left: 18, right: 18 })
            .fontSize(13)
            .fontColor('#081018')
            .backgroundColor(ACCENT)
            .borderRadius(20)
            .onClick(() => {
              const mins = Math.round(Number(this.customMinutesDraft.trim()));
              if (Number.isFinite(mins) && mins >= 1 && mins <= 480) {
                this.onSetSleepTimer('custom', mins);
                this.customMinutesDraft = '';
              }
            })
        }.width('100%')

        Row({ space: 12 }) {
          Column({ space: 2 }) {
            Text('倒计时结束后播完整首').fontSize(14).fontColor(TEXT)
            Text('开启后等待当前歌曲自然播放完毕再暂停').fontSize(11).fontColor(MUTED)
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          MaterialToggle({
            value: this.sleepFinishSong,
            label: '倒计时结束后播完整首',
            onChange: (value: boolean) => this.onToggleSleepFinishSong(value)
          })
        }.width('100%')
      }
      .width('100%')
      .padding(16)
      .borderRadius(16)
      .backgroundColor($r('app.color.card_surface'))
    }
    .width('100%')
    .padding({ left: 24, right: 24, top: 20, bottom: 28 })
  }
}
