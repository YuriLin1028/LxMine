import { curves, uiMaterial } from '@kit.ArkUI';
import { Song } from '../model/Song';
import { GripSide } from '../services/GripService';
import { MaterialIcon, musicSurfaceMaterial, MATERIAL_PRESS_SCALE } from './MaterialControls';
import { TEXT, MUTED, ACCENT, formatTime } from './Theme';

// Title hosts read no changing geometry or playback state. Their leaf content
// consumes this shared model without rebinding the Navigation title, preserving
// the same native material nodes throughout every scene change.
@Observed
class DockVisualModel {
  song: Song | null = null;
  tab: string = '发现';
  playing: boolean = false;
  busy: boolean = false;
  mode: string = '列表循环';
  positionMs: number = 0;
  duration: number = 0;
  colorLast: string = '#B8B8B8';
  liked: boolean = false;
  coverAngle: number = 0;
  playbackWidth: number = 320;
  playbackHeight: number = 44;
  coverSize: number = 32;
  capsule: boolean = false;
  wideControls: boolean = false;
  collapsed: boolean = false;
  navWidth: number = 320;
  onPlayer: () => void = () => {};
  onToggle: () => void = () => {};
  onNext: (step: number) => void = () => {};
  onQueue: () => void = () => {};
  onMode: () => void = () => {};
  onDownload: () => void = () => {};
  onLike: () => void = () => {};
  onTab: (tab: string) => void = () => {};
  onExpand: () => void = () => {};
}
@Component
struct DockPlaybackContent {
  @Consume('dockVisual') model: DockVisualModel;
  @State private playbackPressed: boolean = false;
  private modeIcon(): Resource {
    if (this.model.mode === '随机播放') return $r('app.media.ic_shuffle');
    if (this.model.mode === '单曲循环') return $r('app.media.ic_repeat_one');
    if (this.model.mode === '顺序播放') return $r('app.media.ic_order_seq');
    return $r('app.media.ic_repeat');
  }
  private modeIconRaw(): boolean {
    return this.model.mode === '单曲循环' || this.model.mode === '顺序播放';
  }
  @Builder private moreMenu() {
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
          Image($r('app.media.ic_music')).width(18).height(18).fillColor(TEXT)
          if (this.model.song?.coverUrl) { Image(this.model.song.coverUrl).width('100%').height('100%').objectFit(ImageFit.Cover) }
        }.width(this.model.coverSize - 8).height(this.model.coverSize - 8).borderRadius(this.model.capsule ? 24 : 20).clip(true)
        Progress({ value: Math.min(this.model.positionMs, this.model.duration), total: Math.max(1, this.model.duration), type: ProgressType.Ring })
          .width(this.model.coverSize).height(this.model.coverSize).color(new LinearGradient([{ color: '#64D2FF', offset: 0 }, { color: this.model.colorLast, offset: 1 }]))
          .backgroundColor('#55FFFFFF').style({ strokeWidth: 3, enableSmoothEffect: true }).hitTestBehavior(HitTestMode.None)
      }.width(this.model.coverSize).height(this.model.coverSize).id('dock-cover').onClick(() => this.model.onPlayer()).accessibilityText('打开歌曲详情')
      Column({ space: 2 }) {
        Text(this.model.song?.name ?? '尚未播放').fontSize(13).fontColor(TEXT).fontWeight(FontWeight.Medium).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
        Text(this.model.busy ? '正在准备…' : this.model.song?.singer ?? '选择歌曲，开始聆听').fontSize(10).fontColor(MUTED).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
      }.layoutWeight(1).alignItems(HorizontalAlign.Start).onClick(() => this.model.onPlayer())
      if (this.model.capsule) {
        MaterialIcon({ icon: $r('app.media.ic_previous'), label: '上一首', diameter: 28, grouped: true, disabled: !this.model.song || this.model.busy, action: () => this.model.onNext(-1) }).id('dock-previous')
        MaterialIcon({ icon: this.model.playing ? $r('app.media.ic_pause') : $r('app.media.ic_play'), label: this.model.playing ? '暂停' : '播放', diameter: 34, grouped: true, disabled: this.model.busy || !this.model.song, action: () => this.model.onToggle() }).id('dock-play-toggle')
        MaterialIcon({ icon: $r('app.media.ic_next'), label: '下一首', diameter: 28, grouped: true, disabled: !this.model.song || this.model.busy, action: () => this.model.onNext(1) }).id('dock-next')
        MaterialIcon({ icon: this.model.liked ? $r('app.media.ic_heart_fill') : $r('app.media.ic_heart'), tint: !this.model.liked, label: this.model.liked ? '取消喜欢' : '喜欢', diameter: 28, grouped: true, selected: this.model.liked, disabled: !this.model.song, action: () => this.model.onLike() }).id('dock-like')
        MaterialIcon({ icon: this.modeIcon(), label: '播放顺序：' + this.model.mode, diameter: 28, grouped: true, action: () => this.model.onMode() })
        MaterialIcon({ icon: $r('app.media.ic_download'), label: '下载歌曲', diameter: 28, grouped: true, disabled: !this.model.song, action: () => this.model.onDownload() })
        MaterialIcon({ icon: $r('app.media.ic_queue'), label: '播放队列', diameter: 30, grouped: true, action: () => this.model.onQueue() }).id('dock-queue')
      } else {
        MaterialIcon({ icon: this.model.liked ? $r('app.media.ic_heart_fill') : $r('app.media.ic_heart'), tint: !this.model.liked, label: this.model.liked ? '取消喜欢' : '喜欢', diameter: 26, grouped: true, selected: this.model.liked, disabled: !this.model.song, action: () => this.model.onLike() }).id('dock-like')
        MaterialIcon({ icon: $r('app.media.ic_previous'), label: '上一首', diameter: 28, grouped: true, disabled: !this.model.song || this.model.busy, action: () => this.model.onNext(-1) }).id('dock-previous')
        MaterialIcon({ icon: this.model.playing ? $r('app.media.ic_pause') : $r('app.media.ic_play'), label: this.model.playing ? '暂停' : '播放', diameter: 34, grouped: true, disabled: this.model.busy || !this.model.song, action: () => this.model.onToggle() }).id('dock-play-toggle')
        MaterialIcon({ icon: $r('app.media.ic_next'), label: '下一首', diameter: 28, grouped: true, disabled: !this.model.song || this.model.busy, action: () => this.model.onNext(1) }).id('dock-next')
        if (this.model.wideControls) {
          MaterialIcon({ icon: this.modeIcon(), label: '播放顺序：' + this.model.mode, diameter: 30, grouped: true, action: () => this.model.onMode() })
          MaterialIcon({ icon: $r('app.media.ic_download'), label: '下载歌曲', diameter: 30, grouped: true, disabled: !this.model.song, action: () => this.model.onDownload() })
          MaterialIcon({ icon: $r('app.media.ic_queue'), label: '播放队列', diameter: 30, grouped: true, action: () => this.model.onQueue() }).id('dock-queue')
        } else {
          Button({ type: ButtonType.Circle }) {
            Image($r('app.media.ic_more')).width(20).height(20).fillColor(TEXT)
          }.width(28).height(34).padding(0).stateEffect(false).buttonStyle(ButtonStyleMode.TEXTUAL).backgroundColor(Color.Transparent)
            .systemMaterial(uiMaterial.Material.empty).accessibilityText('更多播放操作').bindMenu(this.moreMenu()).id('dock-more')
        }
      }
    }.width(this.model.playbackWidth).height(this.model.playbackHeight).padding({ left: 6, right: 6 }).borderRadius(28)
      .backgroundColor(Color.Transparent).systemMaterial(musicSurfaceMaterial()).clip(false).id('dock-playback')
      .hitTestBehavior(HitTestMode.Default)
      .position({ x: 16, y: 16 })
      .scale({ x: this.playbackPressed ? MATERIAL_PRESS_SCALE : 1, y: this.playbackPressed ? MATERIAL_PRESS_SCALE : 1 })
      .animation({ curve: curves.springMotion(0.46, 0.82) })
      .onClick(() => {})
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) this.playbackPressed = true;
        else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.playbackPressed = false;
      })
  }
}
@Component
struct DockNavigationContent {
  @Consume('dockVisual') model: DockVisualModel;
  @State private navPressed: boolean = false;
  private navDragging: boolean = false;
  private navTap: boolean = true;
  private navStartX: number = 0;
  private navStartY: number = 0;
  private navLastX: number = 0;
  @Builder private navButton(target: string, label: string, icon: Resource, index: number) {
    Button({ type: ButtonType.Normal }) {
      if (this.model.collapsed) {
        Stack({ alignContent: Alignment.Center }) {
          Image(this.model.tab === '发现' ? $r('app.media.ic_home') : this.model.tab === '资料库' ? $r('app.media.ic_library') : $r('app.media.ic_settings'))
            .width(24).height(24).fillColor(ACCENT)
        }.width(56).height(56)
      } else {
        Column({ space: 2 }) {
          Image(icon).width(20).height(20).fillColor(this.model.tab === target ? ACCENT : TEXT)
          Text(label).fontSize(8).fontColor(this.model.tab === target ? ACCENT : MUTED)
        }
      }
    }.width(this.model.collapsed ? 56 : 40).height(this.model.collapsed ? 56 : 46).padding(0)
      .borderRadius(this.model.collapsed ? 28 : 14).stateEffect(false).buttonStyle(ButtonStyleMode.TEXTUAL).backgroundColor(Color.Transparent)
      .systemMaterial(uiMaterial.Material.empty).id('dock-nav-' + target).accessibilityText(index === 0 && this.model.collapsed ? '展开导航' : label)
      .position({ x: this.model.collapsed ? 0 : this.model.navWidth * ((index + 0.5) / 3) - 20, y: this.model.collapsed ? 0 : 7 })
      .scale({ x: index > 0 && this.model.collapsed ? 0 : 1, y: index > 0 && this.model.collapsed ? 0 : 1 })
      // 一栏时当前页那个圆球要能直接点开；其余两个已缩到 0，直接屏蔽。
      .hitTestBehavior(this.model.collapsed ? (index === 0 ? HitTestMode.Default : HitTestMode.BLOCK_DESCENDANTS) : HitTestMode.None)
      .onClick(() => { if (this.navDragging) return; if (index === 0 && this.model.collapsed) this.model.onExpand(); else this.model.onTab(target); })
      .animation({ curve: curves.springMotion(0.46, 0.82) })
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
    Stack({ alignContent: Alignment.TopStart }) {
      this.navButton('发现', '首页', $r('app.media.ic_home'), 0)
      this.navButton('资料库', '曲库', $r('app.media.ic_library'), 1)
      this.navButton('设置', '设置', $r('app.media.ic_settings'), 2)
    }.onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.navPressed = true; this.navTap = true; this.navDragging = false;
        this.navStartX = event.touches.length ? event.touches[0].x : 0;
        this.navStartY = event.touches.length ? event.touches[0].y : 0;
        this.navLastX = this.navStartX;
        return;
      }
      if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.navPressed = false;
        if (event.type === TouchType.Up && this.navTap && !this.navDragging) {
          if (this.model.collapsed) { this.model.onExpand(); return; }
          const tabs: string[] = ['发现', '资料库', '设置'];
          const index = Math.max(0, Math.min(2, Math.floor(this.navLastX / (this.model.navWidth / 3))));
          if (tabs[index] !== this.model.tab) this.model.onTab(tabs[index]);
        }
        return;
      }
      if (!event.touches.length || event.type !== TouchType.Move || this.model.collapsed) return;
      const x = event.touches[0].x;
      const y = event.touches[0].y;
      this.navLastX = x;
      if (Math.abs(x - this.navStartX) > 8 || Math.abs(y - this.navStartY) > 8) this.navTap = false;
      if (!this.navDragging) {
        const dx = x - this.navStartX, dy = y - this.navStartY;
        if (Math.abs(dx) <= 10 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
        this.navDragging = true;
      }
      const tabs: string[] = ['发现', '资料库', '设置'];
      const index = Math.max(0, Math.min(2, Math.floor(x / (this.model.navWidth / 3))));
      if (tabs[index] !== this.model.tab) this.model.onTab(tabs[index]);
    }).width(this.model.collapsed ? 56 : this.model.navWidth).height(56).clip(false).borderRadius(28)
      .backgroundColor(Color.Transparent).systemMaterial(musicSurfaceMaterial())
      .scale({ x: this.navPressed ? MATERIAL_PRESS_SCALE : 1, y: this.navPressed ? MATERIAL_PRESS_SCALE : 1 })
      .animation({ curve: curves.springMotion(0.46, 0.82) })
    }.width(this.model.collapsed ? 56 : this.model.navWidth).height(56).position({ x: 16, y: 16 })
  }
}
@Component
struct DockPlaybackHost {
  @Builder private content() { DockPlaybackContent() }
  build() {
    Navigation() { Column() {} }
      .title({ builder: this.content, height: 96 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
      .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
      .width('100%').height(96).backgroundColor(Color.Transparent).clip(false)
  }
}
@Component
struct DockNavigationHost {
  @Builder private content() { DockNavigationContent() }
  build() {
    Navigation() { Column() {} }
      .title({ builder: this.content, height: 96 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
      .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
      .width('100%').height(96).backgroundColor(Color.Transparent).clip(false)
  }
}

// One persistent dock for every scene. The playback capsule and the nav pill are
// never recreated between portrait, landscape, search, secondary pages or detail;
// only their geometry changes, so the material and the motion stay continuous.
@Component
export struct DockLayer {
  @Prop @Watch('inputsChanged') song: Song | null = null;
  @Prop @Watch('inputsChanged') tab: string = '发现';
  @Prop @Watch('inputsChanged') gripSide: GripSide = 'center';
  @Prop @Watch('inputsChanged') playing: boolean = false;
  @StorageProp('lxliaForeground') private foreground: boolean = true;
  @Prop @Watch('inputsChanged') busy: boolean = false;
  @Prop @Watch('inputsChanged') availableWidth: number = 400;
  @Prop @Watch('inputsChanged') landscape: boolean = false;
  @Prop @Watch('inputsChanged') searchOpen: boolean = false;
  @Prop @Watch('inputsChanged') secondary: boolean = false;
  @Prop @Watch('inputsChanged') detail: boolean = false;
  @Prop @Watch('inputsChanged') compact: boolean = false;
  @Prop @Watch('inputsChanged') mode: string = '列表循环';
  @Prop @Watch('inputsChanged') positionMs: number = 0;
  @Prop @Watch('inputsChanged') duration: number = 0;
  @Prop @Watch('inputsChanged') colorFirst: string = '#FFFFFF';
  @Prop @Watch('inputsChanged') colorLast: string = '#B8B8B8';
  @Prop @Watch('inputsChanged') liked: boolean = false;
  onTab: (tab: string) => void = () => {};
  onPlayer: () => void = () => {};
  onToggle: () => void = () => {};
  onNext: (step: number) => void = () => {};
  onQueue: () => void = () => {};
  onMode: () => void = () => {};
  onDownload: () => void = () => {};
  onLike: () => void = () => {};
  onExpand: () => void = () => {};
  onSeek: (time: number) => void = () => {};
  @Provide('dockVisual') private model: DockVisualModel = new DockVisualModel();
  @State private scrubbing: boolean = false;
  @State private seekValue: number = 0;
  private seekSong: string = '';
  aboutToAppear(): void {
    this.model.onPlayer = () => this.onPlayer();
    this.model.onToggle = () => this.onToggle();
    this.model.onNext = (step: number) => this.onNext(step);
    this.model.onQueue = () => this.onQueue();
    this.model.onMode = () => this.onMode();
    this.model.onDownload = () => this.onDownload();
    this.model.onLike = () => this.onLike();
    this.model.onTab = (tab: string) => this.onTab(tab);
    this.model.onExpand = () => this.onExpand();
    this.inputsChanged();
  }
  private inputsChanged(): void {
    this.model.song = this.song; this.model.tab = this.tab;
    this.model.playing = this.playing; this.model.busy = this.busy;
    this.model.mode = this.mode; this.model.positionMs = this.positionMs;
    this.model.duration = this.duration; this.model.colorLast = this.colorLast; this.model.liked = this.liked;
    this.model.playbackWidth = this.barWidth(); this.model.playbackHeight = this.barHeight();
    this.model.coverSize = this.coverSize(); this.model.capsule = this.capsule();
    this.model.wideControls = this.wideControls(); this.model.collapsed = this.collapsed(); this.model.navWidth = this.navWidth();
  }
  private centered(): boolean { return this.searchOpen || this.secondary || this.detail; }
  // 左右分体停靠只在放得下时启用：分体需要 16+240（导航）+16+520（播放栏下限）
  // ≈ 792vp，820 留出视觉间隙；窄窗（小窗模式）自动回退堆叠一栏/两栏模式。
  private split(): boolean { return this.landscape && this.availableWidth >= 820; }
  private capsule(): boolean { return this.split() || this.searchOpen || this.secondary; }
  private collapsed(): boolean { return this.compact && !this.detail && !this.centered() && !this.split(); }
  private dockWidth(): number { return Math.max(260, Math.min(this.availableWidth - 48, 700)); }
  private dockLeft(): number { return (this.availableWidth - this.dockWidth()) / 2; }
  private barWidth(): number {
    if (this.searchOpen || this.secondary) return Math.min(760, this.availableWidth - 32);
    if (this.detail) return this.split() ? Math.min(760, this.availableWidth - 32) : this.dockWidth();
    if (this.split()) return Math.max(520, Math.min(620, this.availableWidth * 0.54));
    if (this.collapsed()) return this.dockWidth() - 66;
    return this.dockWidth();
  }
  private barX(): number {
    if (this.searchOpen || this.secondary) return (this.availableWidth - this.barWidth()) / 2;
    if (this.detail) return this.split() ? (this.availableWidth - this.barWidth()) / 2 : this.dockLeft();
    if (this.split()) return this.availableWidth - 16 - this.barWidth();
    if (this.collapsed()) return this.gripSide === 'right' ? this.dockLeft() : this.dockLeft() + 66;
    return this.dockLeft();
  }
  private barHeight(): number {
    if (this.detail) return this.split() || this.searchOpen || this.secondary ? 56 : 54;
    if (this.searchOpen || this.secondary || this.split()) return 56;
    if (this.collapsed()) return 54;
    return 44;
  }
  private barY(): number { return this.detail ? 34 : 0; }
  private coverSize(): number {
    if (this.capsule()) return 42;
    if (!this.detail && !this.collapsed() && this.barHeight() === 44) return 32;
    return 38;
  }
  private navWidth(): number {
    if (this.split() && !this.centered()) return 240;
    return this.dockWidth();
  }
  private navX(): number {
    if (this.split() && !this.centered()) return 16;
    if (this.collapsed()) return this.gripSide === 'right' ? this.dockLeft() + this.dockWidth() - 56 : this.dockLeft();
    return this.dockLeft();
  }
  private navY(): number {
    if (this.split() && !this.centered()) return 0;
    if (this.collapsed()) return 0;
    return 48;
  }
  private rootHeight(): number {
    if (this.detail) return this.split() || this.searchOpen || this.secondary ? 90 : 92;
    if (this.centered()) return 56;
    if (this.split()) return 56;
    if (this.collapsed()) return 56;
    return 110;
  }
  private navVisible(): boolean { return !this.centered(); }
  private wideControls(): boolean { return this.capsule() || this.availableWidth >= 620; }
  private seekChanged(value: number, mode: SliderChangeMode): void {
    const key = this.song ? `${this.song.source}:${this.song.id}` : '';
    this.seekValue = value;
    if (mode === SliderChangeMode.Begin) { this.scrubbing = true; this.seekSong = key; }
    if (mode === SliderChangeMode.Click || (mode === SliderChangeMode.End && this.scrubbing && this.seekSong === key)) this.onSeek(value);
    if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) this.scrubbing = false;
  }
  @Builder private timeline() {
    if (this.detail) {
      Row({ space: 8 }) {
        Text(formatTime(this.scrubbing ? this.seekValue : this.positionMs)).fontSize(10).fontColor(TEXT).width(34)
        Slider({ value: this.scrubbing ? this.seekValue : this.positionMs, min: 0, max: Math.max(1, this.duration), style: SliderStyle.OutSet })
          .layoutWeight(1).height(30).trackThickness(3).blockSize({ width: this.scrubbing ? 11 : 7, height: this.scrubbing ? 11 : 7 })
          .selectedColor(new LinearGradient([{ color: this.colorFirst, offset: 0 }, { color: this.colorLast, offset: 1 }]))
          .blockColor(this.colorLast).trackColor('#38FFFFFF').enabled(!!this.song && this.duration > 0 && !this.busy)
          .accessibilityText('播放进度')
          .onChange((value: number, mode: SliderChangeMode) => this.seekChanged(value, mode))
          .onTouch((event: TouchEvent) => { if (event.type === TouchType.Cancel) this.scrubbing = false; })
        Text(formatTime(this.duration)).fontSize(10).fontColor(TEXT).width(34).textAlign(TextAlign.End)
      }.width(this.barWidth()).height(34).position({ x: this.barX(), y: 0 })
        .opacity(this.detail ? 1 : 0).hitTestBehavior(this.detail ? HitTestMode.Default : HitTestMode.Transparent)
    }
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      this.timeline()
      DockPlaybackHost()
        .width(this.barWidth() + 32).height(96).backgroundColor(Color.Transparent).clip(false).hitTestBehavior(HitTestMode.Default)
        .position({ x: this.barX() - 16, y: this.barY() - 16 })
        .animation({ curve: curves.springMotion(0.46, 0.82) })
      DockNavigationHost()
        .width(this.collapsed() ? 88 : this.navWidth() + 32).height(96).backgroundColor(Color.Transparent).clip(false)
        .position({ x: this.navX() - 16, y: this.navY() - 16 })
        .opacity(this.navVisible() ? 1 : 0)
        .scale({ x: this.navVisible() ? 1 : 0.9, y: this.navVisible() ? 1 : 0.9 })
        // Transparent still lets hidden descendants consume the one native
        // material interaction event. Keep the fade, but exclude the entire
        // hidden navigation subtree so the visible playback capsule gets light.
        .hitTestBehavior(this.navVisible() ? HitTestMode.Default : HitTestMode.BLOCK_DESCENDANTS)
        .animation({ curve: curves.springMotion(0.46, 0.82) })
    }.width('100%').height(this.rootHeight()).clip(false)
      .animation({ curve: curves.springMotion(0.46, 0.82) })
  }
}
