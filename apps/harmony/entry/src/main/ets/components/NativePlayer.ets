import { musicButtonPress } from './MaterialControls';
import { Song } from '../model/Song';
import { LyricLine } from '../services/LyricParser';
import { MaterialIcon, musicMaterial, musicMenuMaterial, HdsExquisiteCircle } from './MaterialControls';
import { GripSide } from '../services/GripService';
import { MINE_RADIO_MODES, MineRadioMode } from '../model/MineRadioModes';
import { SMART_STAGE_MODE_ID, SMART_STAGE_MODE_TIP } from '../services/SmartStageSelector';
import { TEXT, MUTED, ACCENT, formatTime } from './Theme';
import { AVCastPicker, AVCastPickerStyle, AVCastPickerColorMode } from '@kit.AVSessionKit';
@Component
export struct NativePlayer {
  @Prop @Watch('songChanged') song: Song;
  @Prop colorFirst: string = '#FFFFFF';
  @Prop colorLast: string = '#B8B8B8';
  @Prop audioUrl: string = '';
  @Prop playing: boolean = false;
  @Prop busy: boolean = false;
  @Prop wide: boolean = false;
  @Prop availableWidth: number = 400;
  @Prop positionMs: number = 0;
  @Prop duration: number = 0;
  @Prop lines: LyricLine[] = [];
  @Prop styleName: string = 'mine-0';
  @Prop resolvedStyleLabel: string = '';
  @Prop quality: string = '128k';
  @Prop lyricOffset: number = 0;
  @Prop statusInset: number = 28;
  @Prop bottomInset: number = 16;
  @Prop leftInset: number = 0;
  @Prop rightInset: number = 0;
  @Prop gripSide: GripSide = 'center';
  @Prop stageVisible: boolean = false;
  @Prop landscape: boolean = false;
  @Prop earMonitorActive: boolean = false;
  @StorageLink('lxliaForeground') private foreground: boolean = true;
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
  @State private scrubbing: boolean = false;
  @State private seekValue: number = 0;
  @State private pressed: boolean = false;
  @State private styleMenuOpen: boolean = false;
  private seekSong: string = '';
  private songChanged(): void { this.scrubbing = false; this.seekValue = 0; this.seekSong = ''; }
  private seekChanged(value: number, mode: SliderChangeMode): void {
    const key = `${this.song.source}:${this.song.id}`;
    if (mode === SliderChangeMode.Begin) { this.seekSong = key; this.scrubbing = true; }
    this.seekValue = value;
    if (mode === SliderChangeMode.Click || (mode === SliderChangeMode.End && this.scrubbing && this.seekSong === key)) this.onSeek(value);
    if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) this.scrubbing = false;
  }
  onClose: () => void = () => {};
  onToggle: () => void = () => {};
  onSeek: (time: number) => void = () => {};
  onSelectStyle: (value: string) => void = () => {};
  onCast: () => void = () => {};
  onShare: () => void = () => {};
  onEarMonitor: () => void = () => {};
  onImmersive: () => void = () => {};
  onSmartStageTip: () => void = () => {
    try {
      this.getUIContext().showAlertDialog({
        title: '随声绘色',
        message: SMART_STAGE_MODE_TIP,
        systemMaterial: musicMenuMaterial(),
        confirm: { value: '知道了', action: () => {} }
      });
    } catch (_) {}
  };
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
                  this.onSmartStageTip();
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
            this.onSelectStyle(mode.id);
          })
        }, (mode: MineRadioMode) => mode.id)
      }.padding(6)
    }.constraintSize({ maxHeight: 360 }).scrollBar(BarState.Off)
  }
  @LocalBuilder private header() {
    // 顶排圆球铁律（docs/MOBILE_PC_PARITY.md 开发规范）：
    // ① 可见图标必须放进承载 systemMaterial 的组件内，拖拽形变时 logo 才跟球一起动
    //    （透明控件+静态覆盖层的结构会导致 logo 不跟手，投播球连形变都没有）；
    // ② 标题内容下移 16vp 给材质层留上伸空间（宿主已在 Index 侧补偿），否则球顶被
    //    标题区上边界切成直线。
    Row({ space: 8 }) {
      MaterialIcon({ icon: $r('app.media.ic_back'), label: '返回', diameter: 38, action: () => this.onClose() }).id('player-close')
      Blank()
      Stack() {
        if (this.boostImmersive) {
          HdsExquisiteCircle({
            diameter: 38,
            icon: $r('sys.media.ohos_ic_public_cast_stream'),
            label: '投播'
          })
        } else {
          Button({ type: ButtonType.Circle }) {
            Image($r('sys.media.ohos_ic_public_cast_stream')).width(20).height(20).fillColor(TEXT)
          }.attributeModifier(musicButtonPress).width(38).height(38).padding(0).backgroundColor(Color.Transparent).stateEffect(false)
            .buttonStyle(ButtonStyleMode.NORMAL).systemMaterial(musicMaterial())
        }
        // AVCastPicker 透明覆盖拉起系统投播；Transparent 让触点同时落到下层球体，形变才跟手。
        AVCastPicker({ normalColor: '#F4F4F4', activeColor: '#64D2FF', pickerStyle: AVCastPickerStyle.STYLE_PANEL, colorMode: AVCastPickerColorMode.AUTO, sessionType: 'audio' })
          .width(38).height(38).opacity(0.01).hitTestBehavior(HitTestMode.Transparent)
      }.width(38).height(38).clip(false).id('player-cast')
      Stack() {
        if (this.boostImmersive) {
          HdsExquisiteCircle({
            diameter: 38,
            symbolRes: $r('sys.symbol.share'),
            label: '分享歌曲',
            action: () => this.onShare()
          })
        } else {
          Button({ type: ButtonType.Circle }) {
            SymbolGlyph($r('sys.symbol.share')).fontSize(20).fontColor([TEXT])
          }.attributeModifier(musicButtonPress).width(38).height(38).padding(0).backgroundColor(Color.Transparent).stateEffect(false)
            .buttonStyle(ButtonStyleMode.NORMAL).systemMaterial(musicMaterial())
            .accessibilityText('分享歌曲').onClick(() => this.onShare())
        }
      }.width(38).height(38).clip(false).id('player-share')
      MaterialIcon({ icon: $r('app.media.mic'), label: '耳返监听', diameter: 38, selected: this.earMonitorActive, action: () => this.onEarMonitor() }).id('player-ear-monitor')
      Stack() {
        if (this.boostImmersive) {
          HdsExquisiteCircle({
            diameter: 38,
            icon: $r('app.media.ic_style_wand'),
            tint: false,
            label: '选择动效',
            action: () => { this.styleMenuOpen = !this.styleMenuOpen; }
          })
        } else {
          Button({ type: ButtonType.Circle }) {
            Image($r('app.media.ic_style_wand')).width(20).height(20)
          }.attributeModifier(musicButtonPress).width(38).height(38).padding(0).backgroundColor(Color.Transparent).stateEffect(false)
            .buttonStyle(ButtonStyleMode.NORMAL).systemMaterial(musicMaterial())
            .onClick(() => { this.styleMenuOpen = !this.styleMenuOpen; })
            .accessibilityText('选择动效')
        }
      }.width(38).height(38).clip(false).id('player-style')
        .bindMenu(this.styleMenuOpen, this.styleMenuPanel, {
          onDisappear: () => { this.styleMenuOpen = false; },
          systemMaterial: musicMenuMaterial()
        })
      // 沉浸模式入口：横屏与竖屏统一显示；进入后连本按钮一起隐藏，双指上滑或返回键退出。
      MaterialIcon({ icon: $r('app.media.fullscreen'), label: '沉浸模式', diameter: 38, raw: true, action: () => this.onImmersive() }).id('player-immersive')
    }.width('100%').padding({
      left: Math.max(this.wide ? 32 : 20, this.leftInset + 12),
      right: Math.max(this.wide ? 32 : 20, this.rightInset + 12)
    }).margin({ top: 16 })
      .hitTestBehavior(HitTestMode.Default).onClick(() => {})
  }
  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      if (!this.lines.length) { Text(this.busy ? '正在准备音乐…' : '暂无歌词').fontSize(18).fontColor(TEXT).opacity(0.7).align(Alignment.Center).hitTestBehavior(HitTestMode.None) }
      Column()
        .width('100%').height(this.statusInset + 88)
        .linearGradient({
          direction: GradientDirection.Bottom,
          colors: [['#6E080A0E', 0.0], ['#24080A0E', 0.56], ['#00080A0E', 1.0]]
        })
        .position({ top: 0, left: 0 })
        .hitTestBehavior(HitTestMode.None)
      if (this.boostImmersive) {
        Column() {
          this.header()
        }.width('100%').height(96).clip(false).backgroundColor(Color.Transparent)
          .position({ top: this.statusInset - 10, left: 0 })
      } else {
        Navigation() { Column() {} }
          .title({ builder: this.header, height: 96 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE }).titleMode(NavigationTitleMode.Mini)
          .hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack).width('100%').height(96).clip(false)
          // 视觉球顶必须与二级页一致（statusInset + 6）；子按钮正常响应点击，空白顶栏由 header Row 吞掉点击防止穿透歌词。
          .backgroundColor(Color.Transparent).position({ top: this.statusInset - 10, left: 0 })
      }

    }.width('100%').height('100%').backgroundColor(Color.Transparent).hitTestBehavior(HitTestMode.None).expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
