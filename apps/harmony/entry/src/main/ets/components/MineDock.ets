import { musicButtonPress } from './MaterialControls';
import { GripSide } from '../services/GripService';
import { Song } from '../model/Song';
import { MaterialIcon, MaterialSurface, musicMaterial, musicSurfaceMaterial, MATERIAL_PRESS_SCALE } from './MaterialControls';
import { curves, uiMaterial } from '@kit.ArkUI';
import { TEXT, MUTED, ACCENT, formatTime } from './Theme';

@Observed
class DockModel {
  song: Song | null = null;
  tab: string = '发现';
  gripSide: GripSide = 'center';
  expanded: boolean = false;
  reveal: number = 0;
  compact: boolean = false;
  playing: boolean = false;
  busy: boolean = false;
  availableWidth: number = 400;
  mode: string = '列表循环';
  positionMs: number = 0;
  duration: number = 0;
  colorFirst: string = '#FFFFFF';
  colorLast: string = '#B8B8B8';
  liked: boolean = false;
  onDownload: () => void = () => {};
  onMode: () => void = () => {};
  onLike: () => void = () => {};
  onTab: (tab: string) => void = () => {};
  onExpand: () => void = () => {};
  onPlayer: () => void = () => {};
  onToggle: () => void = () => {};
  onNext: (step: number) => void = () => {};
  onQueue: () => void = () => {};
  collapsed(): boolean { return this.compact && !this.expanded; }
  playbackWidth(): number { return this.collapsed() ? this.width() - 66 : this.width(); }
  playbackHeight(): number { return this.expanded ? 54 : this.collapsed() ? 54 : 44; }
  playbackX(): number { return this.collapsed() && this.gripSide !== 'right' ? 66 : 0; }
  navigationX(): number { return this.collapsed() && this.gripSide === 'right' ? this.width() - 56 : 0; }
  coverSize(): number { return this.playbackHeight() === 44 ? 32 : 38; }
  width(): number { return Math.max(260, Math.min(this.availableWidth - 48, 700)); }
}
@Component
struct DockPlayback {
  @ObjectLink model: DockModel;
  @StorageLink('lxliaForeground') private foreground: boolean = true;
  @State private coverAngle: number = 0;
  @State private pressed: boolean = false;
  private spinTimer: number = -1;
  aboutToAppear(): void {
    this.spinTimer = setInterval(() => {
      if (this.model.playing && this.foreground) this.getUIContext().animateTo({ duration: 100, curve: Curve.Linear }, () => { this.coverAngle += 1.5; });
    }, 100);
  }
  aboutToDisappear(): void { clearInterval(this.spinTimer); }
  @Builder private options() {
    Menu() {
      MenuItem({ content: '播放顺序 · ' + this.model.mode }).onClick(() => this.model.onMode())
      MenuItem({ content: '下载歌曲' }).enabled(!!this.model.song).onClick(() => this.model.onDownload())
      MenuItem({ content: '播放队列' }).onClick(() => this.model.onQueue())
    }
  }
  build() {
    Row({ space: 3 }) {
      Stack() {
        Stack() {
          SymbolGlyph($r('sys.symbol.music_note_list')).fontSize(18).fontColor([TEXT])
          if (this.model.song?.coverUrl) { Image(this.model.song.coverUrl).width('100%').height('100%').objectFit(ImageFit.Cover).rotate({ angle: this.coverAngle }) }
        }.width(this.model.coverSize() - 8).height(this.model.coverSize() - 8).borderRadius(20).clip(true)
          .animation({ curve: curves.springMotion(0.44, 0.83) })
        Progress({ value: Math.min(this.model.positionMs, this.model.duration), total: Math.max(1, this.model.duration), type: ProgressType.Ring })
          .width(this.model.coverSize()).height(this.model.coverSize()).color(new LinearGradient([{ color: '#F4D28A', offset: 0 }, { color: this.model.colorLast, offset: 1 }]))
          .opacity(1 - this.model.reveal).backgroundColor('#55FFFFFF').style({ strokeWidth: 3, enableSmoothEffect: true }).hitTestBehavior(HitTestMode.None)
          .animation({ curve: curves.springMotion(0.44, 0.83) })
      }.width(this.model.coverSize()).height(this.model.coverSize()).id('dock-cover').onClick(() => this.model.onPlayer()).accessibilityText('打开歌曲详情')
        .animation({ curve: curves.springMotion(0.44, 0.83) })
      Column({ space: 2 }) {
        Text(this.model.song?.name ?? '尚未播放').fontSize(13).fontColor(TEXT).fontWeight(FontWeight.Medium).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
        Text(this.model.busy ? '正在准备…' : this.model.song?.singer ?? '选择歌曲，开始聆听').fontSize(10).fontColor(MUTED).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
      }.layoutWeight(1).alignItems(HorizontalAlign.Start).onClick(() => this.model.onPlayer())
      MaterialIcon({ icon: $r('app.media.ic_heart'), label: this.model.liked ? '取消喜欢' : '喜欢', diameter: 26, grouped: true, selected: this.model.liked, disabled: !this.model.song, action: () => this.model.onLike() }).id('dock-like')
      MaterialIcon({ icon: $r('app.media.ic_previous'), label: '上一首', diameter: 28, grouped: true, disabled: !this.model.song || this.model.busy, action: () => this.model.onNext(-1) }).id('dock-previous')
      MaterialIcon({ icon: this.model.playing ? $r('app.media.ic_pause') : $r('app.media.ic_play'), label: this.model.playing ? '暂停' : '播放', diameter: 34, grouped: true, disabled: this.model.busy || !this.model.song, action: () => this.model.onToggle() }).id('dock-play-toggle')
      MaterialIcon({ icon: $r('app.media.ic_next'), label: '下一首', diameter: 28, grouped: true, disabled: !this.model.song || this.model.busy, action: () => this.model.onNext(1) }).id('dock-next')
      if (this.model.availableWidth >= 620) {
        MaterialIcon({ icon: this.model.mode === '随机播放' ? $r('app.media.ic_shuffle') : $r('app.media.ic_repeat'), label: '播放顺序：' + this.model.mode, diameter: 30, grouped: true, action: () => this.model.onMode() })
        MaterialIcon({ icon: $r('app.media.ic_download'), label: '下载歌曲', diameter: 30, grouped: true, disabled: !this.model.song, action: () => this.model.onDownload() })
        MaterialIcon({ icon: $r('app.media.ic_queue'), label: '播放队列', diameter: 30, grouped: true, action: () => this.model.onQueue() })
      } else {
        Button({ type: ButtonType.Circle }) { SymbolGlyph($r('sys.symbol.ellipsis_circle')).fontSize(20).fontColor([TEXT]) }.attributeModifier(musicButtonPress)
          .width(28).height(34).padding(0).backgroundColor(Color.Transparent).stateEffect(false).buttonStyle(ButtonStyleMode.TEXTUAL)
          .systemMaterial(uiMaterial.Material.empty).accessibilityText('更多播放操作').bindMenu(this.options()).id('dock-more')
      }
    }.width(this.model.playbackWidth()).height(this.model.playbackHeight()).padding({ left: 6, right: 6 }).borderRadius(28).backgroundColor(Color.Transparent).systemMaterial(musicSurfaceMaterial()).clip(false).id('dock-playback')
      .scale({ x: this.pressed ? MATERIAL_PRESS_SCALE : 1, y: this.pressed ? MATERIAL_PRESS_SCALE : 1 })
      .animation({ curve: curves.springMotion(0.36, 0.9) })
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) this.pressed = true;
        else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.pressed = false;
      })
      .position({ x: 16 + this.model.playbackX(), y: 16 }).animation({ curve: curves.springMotion(0.44, 0.83) })
  }
}
@Component
struct DockNavigation {
  @ObjectLink model: DockModel;
  @State private navPressed: boolean = false;
  private dragging: boolean = false;
  private startX: number = 0;
  private startY: number = 0;
  @Builder private tabButton(tab: string, label: string, icon: Resource, index: number) {
    Button({ type: ButtonType.Normal }) {
      if (this.model.collapsed()) {
        Stack({ alignContent: Alignment.Center }) {
          SymbolGlyph(this.model.tab === '发现' ? $r('sys.symbol.house') : this.model.tab === '资料库' ? $r('sys.symbol.square_grid_2x2') : $r('sys.symbol.gearshape'))
            .fontSize(24).fontColor([ACCENT])
        }.width(56).height(56)
      } else {
        Column({ space: 2 }) {
          SymbolGlyph(icon).fontSize(20).fontColor([this.model.tab === tab ? ACCENT : TEXT])
          Text(label).fontSize(8).fontColor(this.model.tab === tab ? ACCENT : MUTED)
        }
      }
    }.attributeModifier(musicButtonPress).width(this.model.collapsed() ? 56 : 40).height(this.model.collapsed() ? 56 : 46).padding(0).borderRadius(this.model.collapsed() ? 28 : 14).stateEffect(false).backgroundColor(Color.Transparent).buttonStyle(ButtonStyleMode.TEXTUAL)
      .systemMaterial(uiMaterial.Material.empty).id('dock-nav-' + tab).accessibilityText(index === 0 && this.model.collapsed() ? '展开导航' : label)
      .position({ x: this.model.collapsed() ? 0 : this.model.width() * ((index + 0.5) / 3) - 20, y: this.model.collapsed() ? 0 : 7 })
      .scale({ x: index > 0 && this.model.collapsed() ? 0 : 1, y: index > 0 && this.model.collapsed() ? 0 : 1 })
      .hitTestBehavior(index > 0 && this.model.collapsed() ? HitTestMode.BLOCK_DESCENDANTS : HitTestMode.Default)
      .animation({ curve: curves.springMotion(0.44, 0.83) })
      .onClick(() => { if (this.dragging) return; if (index === 0 && this.model.collapsed()) this.model.onExpand(); else this.model.onTab(tab); })
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
    Stack({ alignContent: Alignment.TopStart }) {
      this.tabButton('发现', '首页', $r('sys.symbol.house'), 0)
      this.tabButton('资料库', '歌单库', $r('sys.symbol.square_grid_2x2'), 1)
      this.tabButton('设置', '设置', $r('sys.symbol.gearshape'), 2)
    }.onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) this.navPressed = true;
      else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.navPressed = false;
      if (this.model.collapsed() || !event.touches.length || (event.type !== TouchType.Down && event.type !== TouchType.Move)) return;
      const x = event.touches[0].x, y = event.touches[0].y;
      if (event.type === TouchType.Down) { this.startX = x; this.startY = y; this.dragging = false; return; }
      if (!this.dragging) {
        const dx = x - this.startX, dy = y - this.startY;
        // A vertical scroll that starts over the dock must not select a tab.
        if (Math.abs(dx) <= 10 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
        this.dragging = true;
      }
      const tabs: string[] = ['发现', '资料库', '设置'];
      const index = Math.max(0, Math.min(2, Math.floor(x / (this.model.width() / 3))));
      if (tabs[index] !== this.model.tab) this.model.onTab(tabs[index]);
    }).width(this.model.collapsed() ? 56 : this.model.width()).height(56).clip(false).borderRadius(28).backgroundColor(Color.Transparent).systemMaterial(musicSurfaceMaterial())
      .scale({ x: this.navPressed ? MATERIAL_PRESS_SCALE : 1, y: this.navPressed ? MATERIAL_PRESS_SCALE : 1 })
      .animation({ curve: curves.springMotion(0.36, 0.9) })
      .position({ x: 16 + this.model.navigationX(), y: 16 }).animation({ curve: curves.springMotion(0.44, 0.83) })
    }.width('100%').height(96).clip(false).hitTestBehavior(HitTestMode.Transparent)
  }
}
// Keep the Navigation title configuration independent of animation inputs. Only the
// leaf content observes the model; changing geometry must not recreate title nodes.
@Component
struct DockPlaybackSurface {
  @ObjectLink model: DockModel;
  @LocalBuilder private content() { DockPlayback({ model: this.model }) }
  build() {
    Navigation() { Column() {} }.title({ builder: this.content, height: 96 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
      .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
      .width('100%').height(96).backgroundColor(Color.Transparent).clip(false).hitTestBehavior(HitTestMode.Transparent)
  }
}
@Component
struct DockNavigationSurface {
  @ObjectLink model: DockModel;
  @LocalBuilder private content() { DockNavigation({ model: this.model }) }
  build() {
    Navigation() { Column() {} }.title({ builder: this.content, height: 96 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
      .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
      .width('100%').height(96).backgroundColor(Color.Transparent).clip(false)
  }
}
@Component
export struct MineDock {
  @Prop @Watch('inputsChanged') song: Song | null = null;
  @Prop @Watch('inputsChanged') gripSide: GripSide = 'center';
  @Prop @Watch('inputsChanged') tab: string = '发现';
  @Prop @Watch('inputsChanged') expanded: boolean = false;
  @Prop @Watch('inputsChanged') reveal: number = 0;
  @Prop @Watch('inputsChanged') compact: boolean = false;
  @Prop @Watch('inputsChanged') playing: boolean = false;
  @Prop @Watch('inputsChanged') busy: boolean = false;
  @Prop @Watch('inputsChanged') availableWidth: number = 400;
  @Prop @Watch('inputsChanged') mode: string = '列表循环';
  @Prop @Watch('inputsChanged') positionMs: number = 0;
  @Prop @Watch('inputsChanged') duration: number = 0;
  @Prop @Watch('inputsChanged') colorFirst: string = '#FFFFFF';
  @Prop @Watch('inputsChanged') colorLast: string = '#B8B8B8';
  @Prop @Watch('inputsChanged') liked: boolean = false;
  onDownload: () => void = () => {};
  onMode: () => void = () => {};
  onLike: () => void = () => {};
  onTab: (tab: string) => void = () => {};
  onExpand: () => void = () => {};
  onPlayer: () => void = () => {};
  onToggle: () => void = () => {};
  onNext: (step: number) => void = () => {};
  onQueue: () => void = () => {};
  onSeek: (time: number) => void = () => {};
  @State private model: DockModel = new DockModel();
  @State private scrubbing: boolean = false;
  @State private seekValue: number = 0;
  private seekSong: string = '';
  aboutToAppear(): void {
    this.model.onDownload = () => this.onDownload();
    this.model.onMode = () => this.onMode();
    this.model.onLike = () => this.onLike();
    this.model.onTab = (tab: string) => this.onTab(tab);
    this.model.onExpand = () => this.onExpand();
    this.model.onPlayer = () => this.onPlayer();
    this.model.onToggle = () => this.onToggle();
    this.model.onNext = (step: number) => this.onNext(step);
    this.model.onQueue = () => this.onQueue();
    this.inputsChanged();
  }
  private inputsChanged(): void {
    if (this.model.song !== this.song) { this.scrubbing = false; this.seekSong = ''; }
    const geometryChanged = this.model.expanded !== this.expanded || this.model.compact !== this.compact || this.model.availableWidth !== this.availableWidth;
    const apply = (): void => {
      this.model.song = this.song;
      this.model.tab = this.tab; this.model.gripSide = this.gripSide;
      this.model.expanded = this.expanded;
      this.model.reveal = this.reveal;
      this.model.compact = this.compact;
      this.model.playing = this.playing;
      this.model.busy = this.busy;
      this.model.availableWidth = this.availableWidth;
      this.model.mode = this.mode;
      this.model.positionMs = this.positionMs;
      this.model.duration = this.duration;
      this.model.colorFirst = this.colorFirst;
      this.model.colorLast = this.colorLast;
      this.model.liked = this.liked;
    };
    // ArkUI does not interpolate width/height changes that arrive through @ObjectLink.
    // Apply the dock geometry inside an explicit spring scope so both bars move together.
    if (geometryChanged) {
      try { this.getUIContext().animateTo({ curve: curves.springMotion(0.44, 0.83) }, apply); }
      catch (_) { apply(); }
    } else {
      apply();
    }
  }
  private dockWidth(): number { return Math.max(260, Math.min(this.availableWidth - 48, 700)); }
  private collapsed(): boolean { return this.compact && !this.expanded; }
  private playbackWidth(): number { return this.collapsed() ? this.dockWidth() - 66 : this.expanded ? this.dockWidth() : this.dockWidth() * 0.92; }
  @LocalBuilder private timeline() {
    Row({ space: 8 }) {
      Text(formatTime(this.scrubbing ? this.seekValue : this.positionMs)).fontSize(10).fontColor(TEXT).width(34)
      Slider({ value: this.scrubbing ? this.seekValue : this.positionMs, min: 0, max: Math.max(1, this.duration), style: SliderStyle.OutSet })
        .layoutWeight(1).height(30).trackThickness(3).blockSize({ width: this.scrubbing ? 11 : 7, height: this.scrubbing ? 11 : 7 })
        .selectedColor(new LinearGradient([{ color: this.colorFirst, offset: 0 }, { color: this.colorLast, offset: 1 }]))
        .blockColor(this.colorLast).trackColor('#38FFFFFF').enabled(!!this.song && this.duration > 0 && !this.busy).accessibilityText('播放进度')
        .onChange((value: number, mode: SliderChangeMode) => {
          this.seekValue = value;
          if (mode === SliderChangeMode.Begin) { this.scrubbing = true; this.seekSong = this.song ? this.song.source + ':' + this.song.id : ''; }
          if (mode === SliderChangeMode.Click || (mode === SliderChangeMode.End && this.scrubbing && !!this.song && this.seekSong === this.song.source + ':' + this.song.id)) this.onSeek(value);
          if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) this.scrubbing = false;
        }).onTouch((event: TouchEvent) => { if (event.type === TouchType.Cancel) this.scrubbing = false; })
      Text(formatTime(this.duration)).fontSize(10).fontColor(TEXT).width(34).textAlign(TextAlign.End)
    }.width(this.dockWidth()).height(34).opacity(this.reveal).accessibilityLevel(this.expanded ? 'auto' : 'no-hide-descendants')
      .hitTestBehavior(this.expanded ? HitTestMode.Default : HitTestMode.BLOCK_DESCENDANTS)
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      this.timeline()
      DockPlaybackSurface({ model: this.model })
        .width(this.dockWidth() + 32).height(96)
        .responseRegion({ x: 16 + this.model.playbackX(), y: 16, width: this.model.playbackWidth(), height: this.model.playbackHeight() })
        .position({ x: -16, y: 34 * this.reveal - 16 })
        .geometryTransition('lxmine-playback')
        .animation({ curve: curves.springMotion(0.44, 0.83) })
      DockNavigationSurface({ model: this.model })
        .width(this.dockWidth() + 32).height(96)
        .responseRegion({ x: 16 + this.model.navigationX(), y: 16, width: this.collapsed() ? 56 : this.dockWidth(), height: 56 })
        .position({ x: -16, y: (this.collapsed() ? 0 : 48) + 34 * this.reveal - 16 })
        .geometryTransition('lxmine-nav')
        .opacity(1 - this.reveal).hitTestBehavior(this.expanded ? HitTestMode.BLOCK_DESCENDANTS : HitTestMode.Transparent)
        .animation({ curve: curves.springMotion(0.44, 0.83) })
    }.clip(false).width(this.dockWidth()).height(this.expanded ? 92 : this.collapsed() ? 56 : 110)
      .animation({ curve: curves.springMotion(0.44, 0.83) })
  }
}
