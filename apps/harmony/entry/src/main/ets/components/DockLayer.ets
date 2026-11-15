import { curves, uiMaterial } from '@kit.ArkUI';
import { Song } from '../model/Song';
import { GripSide } from '../services/GripService';
import { MaterialIcon, musicSurfaceMaterial } from './MaterialControls';
import { TEXT, MUTED, ACCENT, formatTime } from './Theme';

// One persistent dock for every scene. The playback capsule and the nav pill are
// never recreated between portrait, landscape, search, secondary pages or detail;
// only their geometry changes, so the material and the motion stay continuous.
@Component
export struct DockLayer {
  @Prop song: Song | null = null;
  @Prop tab: string = '发现';
  @Prop gripSide: GripSide = 'center';
  @Prop playing: boolean = false;
  @Prop busy: boolean = false;
  @Prop availableWidth: number = 400;
  @Prop landscape: boolean = false;
  @Prop searchOpen: boolean = false;
  @Prop secondary: boolean = false;
  @Prop detail: boolean = false;
  @Prop compact: boolean = false;
  @Prop mode: string = '列表循环';
  @Prop positionMs: number = 0;
  @Prop duration: number = 0;
  @Prop colorFirst: string = '#FFFFFF';
  @Prop colorLast: string = '#B8B8B8';
  @Prop liked: boolean = false;
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
  @State private coverAngle: number = 0;
  @State private playbackPressed: boolean = false;
  @State private navPressed: boolean = false;
  @State private scrubbing: boolean = false;
  @State private seekValue: number = 0;
  private seekSong: string = '';
  private spinTimer: number = -1;
  private navDragging: boolean = false;
  private navTap: boolean = true;
  private navStartX: number = 0;
  private navStartY: number = 0;
  private navLastX: number = 0;
  aboutToAppear(): void {
    this.spinTimer = setInterval(() => {
      if (this.playing) this.getUIContext().animateTo({ duration: 100, curve: Curve.Linear }, () => { this.coverAngle += 1.5; });
    }, 100);
  }
  aboutToDisappear(): void { clearInterval(this.spinTimer); }
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
  @Builder private moreMenu() {
    Menu() {
      MenuItem({ content: '播放顺序 · ' + this.mode }).onClick(() => this.onMode())
      MenuItem({ content: '下载歌曲' }).enabled(!!this.song).onClick(() => this.onDownload())
      MenuItem({ content: '播放队列' }).onClick(() => this.onQueue())
    }
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
  @Builder private nowPlaying() {
    Row({ space: 3 }) {
      Stack() {
        Stack() {
          SymbolGlyph($r('sys.symbol.music_note_list')).fontSize(18).fontColor([TEXT])
          if (this.song?.coverUrl) { Image(this.song.coverUrl).width('100%').height('100%').objectFit(ImageFit.Cover).rotate({ angle: this.coverAngle }) }
        }.width(this.coverSize() - 8).height(this.coverSize() - 8).borderRadius(this.capsule() ? 24 : 20).clip(true)
        Progress({ value: Math.min(this.positionMs, this.duration), total: Math.max(1, this.duration), type: ProgressType.Ring })
          .width(this.coverSize()).height(this.coverSize()).color(new LinearGradient([{ color: '#F4D28A', offset: 0 }, { color: this.colorLast, offset: 1 }]))
          .backgroundColor('#55FFFFFF').style({ strokeWidth: 3, enableSmoothEffect: true }).hitTestBehavior(HitTestMode.None)
      }.width(this.coverSize()).height(this.coverSize()).id('dock-cover').onClick(() => this.onPlayer()).accessibilityText('打开歌曲详情')
      Column({ space: 2 }) {
        Text(this.song?.name ?? '尚未播放').fontSize(13).fontColor(TEXT).fontWeight(FontWeight.Medium).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
        Text(this.busy ? '正在准备…' : this.song?.singer ?? '选择歌曲，开始聆听').fontSize(10).fontColor(MUTED).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
      }.layoutWeight(1).alignItems(HorizontalAlign.Start).onClick(() => this.onPlayer())
      if (this.capsule()) {
        MaterialIcon({ icon: $r('app.media.ic_previous'), label: '上一首', diameter: 28, grouped: true, disabled: !this.song || this.busy, action: () => this.onNext(-1) }).id('dock-previous')
        MaterialIcon({ icon: this.playing ? $r('app.media.ic_pause') : $r('app.media.ic_play'), label: this.playing ? '暂停' : '播放', diameter: 34, grouped: true, disabled: this.busy || !this.song, action: () => this.onToggle() }).id('dock-play-toggle')
        MaterialIcon({ icon: $r('app.media.ic_next'), label: '下一首', diameter: 28, grouped: true, disabled: !this.song || this.busy, action: () => this.onNext(1) }).id('dock-next')
        MaterialIcon({ icon: $r('app.media.ic_heart'), label: this.liked ? '取消喜欢' : '喜欢', diameter: 28, grouped: true, selected: this.liked, disabled: !this.song, action: () => this.onLike() }).id('dock-like')
        MaterialIcon({ icon: this.mode === '随机播放' ? $r('app.media.ic_shuffle') : $r('app.media.ic_repeat'), label: '播放顺序：' + this.mode, diameter: 28, grouped: true, action: () => this.onMode() })
        MaterialIcon({ icon: $r('app.media.ic_download'), label: '下载歌曲', diameter: 28, grouped: true, disabled: !this.song, action: () => this.onDownload() })
        MaterialIcon({ icon: $r('app.media.ic_queue'), label: '播放队列', diameter: 30, grouped: true, action: () => this.onQueue() }).id('dock-queue')
      } else {
        MaterialIcon({ icon: $r('app.media.ic_heart'), label: this.liked ? '取消喜欢' : '喜欢', diameter: 26, grouped: true, selected: this.liked, disabled: !this.song, action: () => this.onLike() }).id('dock-like')
        MaterialIcon({ icon: $r('app.media.ic_previous'), label: '上一首', diameter: 28, grouped: true, disabled: !this.song || this.busy, action: () => this.onNext(-1) }).id('dock-previous')
        MaterialIcon({ icon: this.playing ? $r('app.media.ic_pause') : $r('app.media.ic_play'), label: this.playing ? '暂停' : '播放', diameter: 34, grouped: true, disabled: this.busy || !this.song, action: () => this.onToggle() }).id('dock-play-toggle')
        MaterialIcon({ icon: $r('app.media.ic_next'), label: '下一首', diameter: 28, grouped: true, disabled: !this.song || this.busy, action: () => this.onNext(1) }).id('dock-next')
        if (this.wideControls()) {
          MaterialIcon({ icon: this.mode === '随机播放' ? $r('app.media.ic_shuffle') : $r('app.media.ic_repeat'), label: '播放顺序：' + this.mode, diameter: 30, grouped: true, action: () => this.onMode() })
          MaterialIcon({ icon: $r('app.media.ic_download'), label: '下载歌曲', diameter: 30, grouped: true, disabled: !this.song, action: () => this.onDownload() })
          MaterialIcon({ icon: $r('app.media.ic_queue'), label: '播放队列', diameter: 30, grouped: true, action: () => this.onQueue() }).id('dock-queue')
        } else {
          Button({ type: ButtonType.Circle }) {
            SymbolGlyph($r('sys.symbol.ellipsis_circle')).fontSize(20).fontColor([TEXT])
          }.width(28).height(34).padding(0).backgroundColor(Color.Transparent).stateEffect(false).buttonStyle(ButtonStyleMode.TEXTUAL)
            .systemMaterial(uiMaterial.Material.empty).accessibilityText('更多播放操作').bindMenu(this.moreMenu()).id('dock-more')
        }
      }
    }.width(this.barWidth()).height(this.barHeight()).padding({ left: 6, right: 6 }).borderRadius(28)
      .backgroundColor(Color.Transparent).systemMaterial(musicSurfaceMaterial()).clip(false).id('dock-playback')
      .position({ x: 16, y: 16 })
      .scale({ x: this.playbackPressed ? 0.99 : 1, y: this.playbackPressed ? 0.99 : 1 })
      .animation({ curve: curves.springMotion(0.46, 0.82) })
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) this.playbackPressed = true;
        else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.playbackPressed = false;
      })
  }
  @Builder private navButton(target: string, label: string, icon: Resource, index: number) {
    Button({ type: ButtonType.Normal }) {
      if (this.collapsed()) {
        Stack({ alignContent: Alignment.Center }) {
          SymbolGlyph(this.tab === '发现' ? $r('sys.symbol.house') : this.tab === '资料库' ? $r('sys.symbol.square_grid_2x2') : $r('sys.symbol.gearshape'))
            .fontSize(24).fontColor([ACCENT])
        }.width(56).height(56)
      } else {
        Column({ space: 2 }) {
          SymbolGlyph(icon).fontSize(20).fontColor([this.tab === target ? ACCENT : TEXT])
          Text(label).fontSize(8).fontColor(this.tab === target ? ACCENT : MUTED)
        }
      }
    }.width(this.collapsed() ? 56 : 40).height(this.collapsed() ? 56 : 46).padding(0)
      .borderRadius(this.collapsed() ? 28 : 14).stateEffect(false).backgroundColor(Color.Transparent).buttonStyle(ButtonStyleMode.TEXTUAL)
      .systemMaterial(uiMaterial.Material.empty).id('dock-nav-' + target).accessibilityText(index === 0 && this.collapsed() ? '展开导航' : label)
      .position({ x: this.collapsed() ? 0 : this.navWidth() * ((index + 0.5) / 3) - 20, y: this.collapsed() ? 0 : 7 })
      .scale({ x: index > 0 && this.collapsed() ? 0 : 1, y: index > 0 && this.collapsed() ? 0 : 1 })
      // 一栏时当前页那个圆球要能直接点开；其余两个已缩到 0，直接屏蔽。
      .hitTestBehavior(this.collapsed() ? (index === 0 ? HitTestMode.Default : HitTestMode.BLOCK_DESCENDANTS) : HitTestMode.None)
      .onClick(() => { if (this.navDragging) return; if (index === 0 && this.collapsed()) this.onExpand(); else this.onTab(target); })
      .animation({ curve: curves.springMotion(0.46, 0.82) })
  }
  @Builder private navigation() {
    Stack({ alignContent: Alignment.TopStart }) {
    Stack({ alignContent: Alignment.TopStart }) {
      this.navButton('发现', '首页', $r('sys.symbol.house'), 0)
      this.navButton('资料库', '歌单库', $r('sys.symbol.square_grid_2x2'), 1)
      this.navButton('设置', '设置', $r('sys.symbol.gearshape'), 2)
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
          if (this.collapsed()) { this.onExpand(); return; }
          const tabs: string[] = ['发现', '资料库', '设置'];
          const index = Math.max(0, Math.min(2, Math.floor(this.navLastX / (this.navWidth() / 3))));
          if (tabs[index] !== this.tab) this.onTab(tabs[index]);
        }
        return;
      }
      if (!event.touches.length || event.type !== TouchType.Move || this.collapsed()) return;
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
      const index = Math.max(0, Math.min(2, Math.floor(x / (this.navWidth() / 3))));
      if (tabs[index] !== this.tab) this.onTab(tabs[index]);
    }).width(this.collapsed() ? 56 : this.navWidth()).height(56).clip(false).borderRadius(28)
      .backgroundColor(Color.Transparent).systemMaterial(musicSurfaceMaterial())
      .scale({ x: this.navPressed ? 0.99 : 1, y: this.navPressed ? 0.99 : 1 })
      .animation({ curve: curves.springMotion(0.46, 0.82) })
    }.width(this.collapsed() ? 56 : this.navWidth()).height(56).position({ x: 16, y: 16 })
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      this.timeline()
      Navigation() { Column() {} }
        .title({ builder: this.nowPlaying, height: 96 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
        .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
        .width(this.barWidth() + 32).height(96).backgroundColor(Color.Transparent).clip(false).hitTestBehavior(HitTestMode.Transparent)
        .position({ x: this.barX() - 16, y: this.barY() - 16 })
        .animation({ curve: curves.springMotion(0.46, 0.82) })
      Navigation() { Column() {} }
        .title({ builder: this.navigation, height: 96 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
        .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
        .width(this.collapsed() ? 88 : this.navWidth() + 32).height(96).backgroundColor(Color.Transparent).clip(false)
        .position({ x: this.navX() - 16, y: this.navY() - 16 })
        .opacity(this.navVisible() ? 1 : 0)
        .scale({ x: this.navVisible() ? 1 : 0.9, y: this.navVisible() ? 1 : 0.9 })
        .hitTestBehavior(this.navVisible() ? HitTestMode.Default : HitTestMode.Transparent)
        .animation({ curve: curves.springMotion(0.46, 0.82) })
    }.width('100%').height(this.rootHeight()).clip(false)
      .animation({ curve: curves.springMotion(0.46, 0.82) })
  }
}
