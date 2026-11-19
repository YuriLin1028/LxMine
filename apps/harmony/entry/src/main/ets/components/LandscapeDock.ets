import { musicButtonPress } from './MaterialControls';
import { Song } from '../model/Song';
import { MATERIAL_PRESS_SCALE, MaterialIcon, musicSurfaceMaterial } from './MaterialControls';
import { TEXT, MUTED, ACCENT, formatTime } from './Theme';
import { uiMaterial, curves } from '@kit.ArkUI';

// Landscape composition: navigation pill on the left, now-playing capsule on
// the right, matching the tablet layout used by Huawei Music.
@Component
export struct LandscapeDock {
  @Prop @Watch('songChanged') song: Song | null = null;
  @Prop playing: boolean = false;
  @Prop busy: boolean = false;
  @Prop tab: string = '发现';
  @Prop availableWidth: number = 900;
  @Prop detail: boolean = false;
  @Prop playbackOnly: boolean = false;
  @Prop fixedOnly: boolean = false;
  @Prop positionMs: number = 0;
  @Prop duration: number = 0;
  @Prop colorFirst: string = '#FFFFFF';
  @Prop colorLast: string = '#B8B8B8';
  @Prop mode: string = '列表循环';
  @Prop liked: boolean = false;
  onTab: (tab: string) => void = () => {};
  onPlayer: () => void = () => {};
  onToggle: () => void = () => {};
  onNext: (step: number) => void = () => {};
  onQueue: () => void = () => {};
  onMode: () => void = () => {};
  onDownload: () => void = () => {};
  onLike: () => void = () => {};
  onSeek: (time: number) => void = () => {};
  @State private scrubbing: boolean = false;
  @State private seekValue: number = 0;
  @State private navPressed: boolean = false;
  @State private playbackPressed: boolean = false;
  private seekSong: string = '';
  private navDragging: boolean = false;
  private navTap: boolean = true;
  private navStartX: number = 0;
  private navStartY: number = 0;
  private modeIcon(): Resource {
    if (this.mode === '随机播放') return $r('app.media.ic_shuffle');
    if (this.mode === '单曲循环') return $r('app.media.ic_repeat_one');
    if (this.mode === '顺序播放') return $r('app.media.ic_order_seq');
    return $r('app.media.ic_repeat');
  }
  private modeIconRaw(): boolean {
    return this.mode === '单曲循环' || this.mode === '顺序播放';
  }
  private songChanged(): void { this.scrubbing = false; this.seekSong = ''; this.seekValue = 0; }
  private seekChanged(value: number, mode: SliderChangeMode): void {
    const key = this.song ? `${this.song.source}:${this.song.id}` : '';
    this.seekValue = value;
    if (mode === SliderChangeMode.Begin) { this.scrubbing = true; this.seekSong = key; }
    if (mode === SliderChangeMode.Click || (mode === SliderChangeMode.End && this.scrubbing && this.seekSong === key)) this.onSeek(value);
    if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) this.scrubbing = false;
  }
  @LocalBuilder private timeline() {
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
    }.width(this.playbackWidth()).height(34).id('landscape-timeline')
      .position({ x: this.playbackX(), y: 0 })
      .opacity(this.detail ? 1 : 0)
      .hitTestBehavior(this.detail ? HitTestMode.Default : HitTestMode.Block)
  }
  @Builder private navButton(target: string, label: string, icon: Resource) {
    Button({ type: ButtonType.Normal }) {
      Column({ space: 2 }) {
        Image(icon).width(20).height(20).fillColor(this.tab === target ? ACCENT : TEXT)
        Text(label).fontSize(8).fontColor(this.tab === target ? ACCENT : MUTED)
      }
    }.attributeModifier(musicButtonPress).width(76).height(56).padding(0).backgroundColor(Color.Transparent).stateEffect(false).buttonStyle(ButtonStyleMode.TEXTUAL)
      .systemMaterial(uiMaterial.Material.empty).hitTestBehavior(HitTestMode.None)
      .accessibilityText(label).id('landscape-nav-' + target)
  }
  private centered(): boolean { return this.detail || this.playbackOnly || this.fixedOnly; }
  private barHeight(): number { return 56; }
  private coverSize(): number { return 42; }
  private basePlaybackWidth(): number { return Math.max(520, Math.min(620, this.availableWidth * 0.54)); }
  private centerPlaybackWidth(): number { return Math.min(760, this.availableWidth - 32); }
  private playbackWidth(): number { return this.centered() ? this.centerPlaybackWidth() : this.basePlaybackWidth(); }
  private playbackX(): number { return this.centered() ? (this.availableWidth - this.playbackWidth()) / 2 : this.availableWidth - 16 - this.playbackWidth(); }
  @LocalBuilder private navContent() {
    Stack({ alignContent: Alignment.TopStart }) {
    Row({ space: 2 }) {
      this.navButton('发现', '首页', $r('app.media.ic_home'))
      this.navButton('资料库', '曲库', $r('app.media.ic_library'))
      this.navButton('设置', '设置', $r('app.media.ic_settings'))
    }.width('100%').height(56).margin({ top: 16 }).padding({ left: 6, right: 6 }).borderRadius(28)
      .backgroundColor(Color.Transparent).systemMaterial(musicSurfaceMaterial())
      .scale({ x: this.navPressed ? MATERIAL_PRESS_SCALE : 1, y: this.navPressed ? MATERIAL_PRESS_SCALE : 1 })
      .animation({ curve: curves.springMotion(0.36, 0.9) })
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) this.navPressed = true;
        else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.navPressed = false;
        if (!event.touches.length) return;
        const x = event.touches[0].x;
        const y = event.touches[0].y;
        if (event.type === TouchType.Down) { this.navStartX = x; this.navStartY = y; this.navDragging = false; this.navTap = true; return; }
        if (event.type === TouchType.Move) {
          if (Math.abs(x - this.navStartX) > 8 || Math.abs(y - this.navStartY) > 8) this.navTap = false;
          if (!this.navDragging) {
            const dx = x - this.navStartX, dy = y - this.navStartY;
            if (Math.abs(dx) <= 10 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
            this.navDragging = true;
          }
          const tabs: string[] = ['发现', '资料库', '设置'];
          const index = Math.max(0, Math.min(2, Math.floor(x / 80)));
          if (tabs[index] !== this.tab) this.onTab(tabs[index]);
          return;
        }
        if (event.type === TouchType.Up && this.navTap && !this.navDragging) {
          const tabs: string[] = ['发现', '资料库', '设置'];
          const index = Math.max(0, Math.min(2, Math.floor(x / 80)));
          if (tabs[index] !== this.tab) this.onTab(tabs[index]);
        }
      })
    }.width('100%').height(96).padding({ left: 16, right: 16 })
  }
  @LocalBuilder private playbackContent() {
    Stack({ alignContent: Alignment.TopStart }) {
    Row({ space: 4 }) {
      Stack() {
        Stack() {
          Image($r('app.media.ic_music')).width(16).height(16).fillColor(TEXT)
          if (this.song?.coverUrl) { Image(this.song.coverUrl).width('100%').height('100%').objectFit(ImageFit.Cover) }
        }.width(this.coverSize() - 8).height(this.coverSize() - 8).borderRadius(24).clip(true)
        Progress({ value: Math.min(this.positionMs, this.duration), total: Math.max(1, this.duration), type: ProgressType.Ring })
          .width(this.coverSize()).height(this.coverSize()).color(new LinearGradient([{ color: '#64D2FF', offset: 0 }, { color: this.colorLast, offset: 1 }]))
          .backgroundColor('#55FFFFFF').style({ strokeWidth: 3, enableSmoothEffect: true }).hitTestBehavior(HitTestMode.None)
      }.width(this.coverSize()).height(this.coverSize())
        .onClick(() => { if (this.song) this.onPlayer(); })
      Column({ space: 2 }) {
        Text(this.song?.name ?? '尚未播放').fontSize(13).fontColor(TEXT).fontWeight(FontWeight.Medium).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
        Text(this.busy ? '正在准备…' : this.song?.singer ?? '选择歌曲，开始聆听').fontSize(10).fontColor(MUTED).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
      }.layoutWeight(1).alignItems(HorizontalAlign.Start).onClick(() => { if (this.song) this.onPlayer(); })
      MaterialIcon({ icon: $r('app.media.ic_previous'), label: '上一首', diameter: 28, grouped: true, disabled: !this.song || this.busy, action: () => this.onNext(-1) })
      MaterialIcon({ icon: this.playing ? $r('app.media.ic_pause') : $r('app.media.ic_play'), label: this.playing ? '暂停' : '播放', diameter: 34, grouped: true, disabled: this.busy || !this.song, action: () => this.onToggle() }).id('landscape-play-toggle')
      MaterialIcon({ icon: $r('app.media.ic_next'), label: '下一首', diameter: 28, grouped: true, disabled: !this.song || this.busy, action: () => this.onNext(1) })
      MaterialIcon({ icon: this.liked ? $r('app.media.ic_heart_fill') : $r('app.media.ic_heart'), raw: this.liked, tint: !this.liked, label: this.liked ? '取消喜欢' : '喜欢', diameter: 28, grouped: true, selected: this.liked, disabled: !this.song, action: () => this.onLike() }).id('landscape-like')
      MaterialIcon({ icon: this.modeIcon(), raw: this.modeIconRaw(), label: '播放顺序：' + this.mode, diameter: 28, grouped: true, action: () => this.onMode() })
      MaterialIcon({ icon: $r('app.media.ic_download'), label: '下载歌曲', diameter: 28, grouped: true, disabled: !this.song, action: () => this.onDownload() })
      MaterialIcon({ icon: $r('app.media.ic_queue'), label: '播放队列', diameter: 30, grouped: true, action: () => this.onQueue() })
    }.width('100%').height(this.barHeight()).margin({ top: 16 }).padding({ left: 6, right: 6 }).borderRadius(28)
      .backgroundColor(Color.Transparent).systemMaterial(musicSurfaceMaterial()).clip(false)
      .scale({ x: this.playbackPressed ? MATERIAL_PRESS_SCALE : 1, y: this.playbackPressed ? MATERIAL_PRESS_SCALE : 1 })
      .animation({ curve: curves.springMotion(0.36, 0.9) })
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) this.playbackPressed = true;
        else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.playbackPressed = false;
      })
    }.width('100%').height(96).padding({ left: 16, right: 16 })
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      this.timeline()
      Navigation() { Column() {} }
        .title({ builder: this.navContent, height: 96 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
        .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
        .width(272).height(96).backgroundColor(Color.Transparent).clip(false)
        .position({ x: 0, y: -16 }).opacity(this.centered() ? 0 : 1)
        .scale({ x: this.centered() ? 0.72 : 1, y: this.centered() ? 0.72 : 1 })
        .hitTestBehavior(this.centered() ? HitTestMode.Transparent : HitTestMode.Default)
        .geometryTransition('lxmine-nav')
        .animation({ curve: curves.springMotion(0.46, 0.82) })
      Navigation() { Column() {} }
        .title({ builder: this.playbackContent, height: 96 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
        .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
        .width(this.playbackWidth() + 32).height(96).backgroundColor(Color.Transparent).clip(false)
        .position({ x: this.playbackX() - 16, y: (this.detail ? 34 : 0) - 16 })
        .geometryTransition('lxmine-playback')
        .animation({ curve: curves.springMotion(0.46, 0.82) })
    }.width('100%').height(this.detail ? 90 : 56).clip(false).animation({ curve: curves.springMotion(0.46, 0.82) })
  }
}
