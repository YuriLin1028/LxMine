import { Song } from '../model/Song';
import { LyricLine } from '../services/LyricParser';
import { MaterialIcon, musicMaterial } from './MaterialControls';
import { GripSide } from '../services/GripService';
import { MINE_RADIO_MODES, MineRadioMode } from '../model/MineRadioModes';
import { TEXT, MUTED, formatTime } from './Theme';
import { AVCastPicker, AVCastPickerStyle, AVCastPickerColorMode } from '@kit.AVSessionKit';
import { SymbolGlyphModifier } from '@kit.ArkUI';
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
  @Prop quality: string = '128k';
  @Prop lyricOffset: number = 0;
  @Prop statusInset: number = 28;
  @Prop bottomInset: number = 16;
  @Prop gripSide: GripSide = 'center';
  @Prop stageVisible: boolean = false;
  @Prop landscape: boolean = false;
  @StorageLink('lxliaForeground') private foreground: boolean = true;
  @State private scrubbing: boolean = false;
  @State private seekValue: number = 0;
  @State private pressed: boolean = false;
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
  onQuality: (value: string) => void = () => {};
  onCast: () => void = () => {};
  onShare: () => void = () => {};
  onComments: () => void = () => {};
  onImmersive: () => void = () => {};
  private qualityMenu():MenuElement[]{return [
    { value: '标准 128k', action: () => this.onQuality('128k') },
    { value: '高品质 320k', action: () => this.onQuality('320k') },
    { value: '无损 flac', action: () => this.onQuality('flac') },
  ] as MenuElement[];}
  private styleMenu():MenuElement[]{return MINE_RADIO_MODES.map((mode:MineRadioMode)=>{
    return { value: mode.label, action: () => this.onSelectStyle(mode.id) } as MenuElement;
  });}
  @LocalBuilder private header() {
    // 顶排圆球铁律（docs/MOBILE_PC_PARITY.md 开发规范）：
    // ① 可见图标必须放进承载 systemMaterial 的组件内，拖拽形变时 logo 才跟球一起动
    //    （透明控件+静态覆盖层的结构会导致 logo 不跟手，投播球连形变都没有）；
    // ② 标题内容下移 16vp 给材质层留上伸空间（宿主已在 Index 侧补偿），否则球顶被
    //    标题区上边界切成直线。
    Row({ space: 8 }) {
      MaterialIcon({ icon: $r('app.media.ic_back'), label: '返回', diameter: 38, action: () => this.onClose() }).id('player-close')
      Blank()
      Button({ type: ButtonType.Circle }) {
        Text('SQ').fontSize(11).fontWeight(FontWeight.Medium).fontColor(TEXT).letterSpacing(0.4)
      }.width(38).height(38).padding(0).backgroundColor(Color.Transparent).stateEffect(false).systemMaterial(musicMaterial())
        .bindMenu(this.qualityMenu()).accessibilityText('选择音质').id('player-quality')
      Stack() {
        Button({ type: ButtonType.Circle }) {
          Image($r('sys.media.ohos_ic_public_cast_stream')).width(20).height(20).fillColor(TEXT)
        }.width(38).height(38).padding(0).backgroundColor(Color.Transparent).stateEffect(false).systemMaterial(musicMaterial())
        // AVCastPicker 透明覆盖拉起系统投播；Transparent 让触点同时落到下层球体，形变才跟手。
        AVCastPicker({ normalColor: TEXT, activeColor: '#F4D28A', pickerStyle: AVCastPickerStyle.STYLE_PANEL, colorMode: AVCastPickerColorMode.AUTO, sessionType: 'audio' })
          .width(38).height(38).opacity(0.01).hitTestBehavior(HitTestMode.Transparent)
      }.width(38).height(38).id('player-cast')
      MaterialIcon({ icon: $r('app.media.ic_share_official'), label: '分享歌曲', diameter: 38, raw: true, action: () => this.onShare() }).id('player-share')
      Button({ type: ButtonType.Circle }) {
        Image($r('app.media.ic_comment_official')).width(20).height(20).fillColor(TEXT)
      }.width(38).height(38).padding(0).backgroundColor(Color.Transparent).systemMaterial(musicMaterial())
        .accessibilityText('查看评论').onClick(() => this.onComments()).id('player-comments')
      Button({ type: ButtonType.Circle }) {
        Image($r('app.media.ic_style_wand')).width(20).height(20).fillColor(TEXT)
      }.width(38).height(38).padding(0).backgroundColor(Color.Transparent).stateEffect(false).systemMaterial(musicMaterial())
        .bindMenu(this.styleMenu()).accessibilityText('选择动效').id('player-style')
      // 沉浸模式入口：只在横屏详情页出现；进入后连本按钮一起隐藏，退出只能双指上滑。
      if (this.landscape) {
        MaterialIcon({ icon: $r('app.media.fullscreen'), label: '沉浸模式', diameter: 38, raw: true, action: () => this.onImmersive() }).id('player-immersive')
      }
    }.width('100%').padding({ left: this.wide ? 32 : 20, right: this.wide ? 32 : 20 }).margin({ top: 16 })
  }
  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      if (!this.lines.length) { Text(this.busy ? '正在准备音乐…' : '暂无歌词').fontSize(18).fontColor(TEXT).opacity(0.7).align(Alignment.Center).hitTestBehavior(HitTestMode.None) }
      Navigation() { Column() {} }
        .title({ builder: this.header, height: 96 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE }).titleMode(NavigationTitleMode.Mini)
        .hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack).width('100%').height(96).clip(false)
        // 视觉球顶必须与二级页一致（statusInset + 6）：宿主上移 16vp 供材质上伸，
        // 再由 header 的 margin top 16 补偿；禁止再用 max(24,statusInset)+6 把整排压下。
        .backgroundColor(Color.Transparent).position({ top: this.statusInset - 10, left: 0 })

    }.width('100%').height('100%').backgroundColor(Color.Transparent).hitTestBehavior(HitTestMode.Transparent).expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
