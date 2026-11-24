import { curves, uiMaterial } from '@kit.ArkUI';
import { Song } from '../model/Song';
import { GripSide } from '../services/GripService';
import { MaterialIcon, musicSurfaceMaterial, MATERIAL_PRESS_SCALE, EXQUISITE_PRESS_SCALE, HdsExquisiteCapsule, HdsExquisiteCircle } from './MaterialControls';
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
  onMore: () => void = () => {};
  onTab: (tab: string) => void = () => {};
  onExpand: () => void = () => {};
}
function adaptProgressHex(raw: string, onDark: boolean): string {
  const clean = (raw || '').trim();
  let rgbHex = '';
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(clean);
  const m8 = /^#[0-9a-fA-F]{2}([0-9a-fA-F]{6})$/.exec(clean);
  if (m6) rgbHex = m6[1];
  else if (m8) rgbHex = m8[1];
  if (!rgbHex) return onDark ? '#7DD3FC' : '#2563EB';
  const r = parseInt(rgbHex.slice(0, 2), 16) / 255;
  const g = parseInt(rgbHex.slice(2, 4), 16) / 255;
  const b = parseInt(rgbHex.slice(4, 6), 16) / 255;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (maxC + minC) / 2;
  if (maxC !== minC) {
    const d = maxC - minC;
    s = l > 0.5 ? d / (2 - maxC - minC) : d / (maxC + minC);
    if (maxC === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (maxC === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  // Strictly preserve song cover hue & saturation; adapt ONLY luminance for readability.
  if (onDark) {
    if (l < 0.58) l = 0.58 + (l / 0.58) * 0.12;
    else if (l > 0.88) l = 0.88;
  } else {
    if (l > 0.46) l = 0.30 + ((1 - l) / 0.54) * 0.16;
    else if (l < 0.22) l = 0.22;
  }
  const hue2rgb = (p: number, q: number, tIn: number): number => {
    let t = tIn;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let ro = l;
  let go = l;
  let bo = l;
  if (s > 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    ro = hue2rgb(p, q, h + 1 / 3);
    go = hue2rgb(p, q, h);
    bo = hue2rgb(p, q, h - 1 / 3);
  }
  const hex2 = (v: number): string => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${hex2(ro)}${hex2(go)}${hex2(bo)}`;
}

// 进度与时间轴状态独立观察模型：播放进度更新只刷新进度环与时间轴两个叶节点，避免触发 Index / DockLayer 整树重绘。
@Observed
export class PlaybackClockModel {
  positionMs: number = 0;
  duration: number = 0;
  colorFirst: string = '#FFFFFF';
  colorLast: string = '#B8B8B8';
  stageDark: boolean = true;
}
@Component
struct DockCoverRing {
  @ObjectLink progress: PlaybackClockModel;
  @Prop coverSize: number = 32;
  build() {
    Progress({ value: Math.min(this.progress.positionMs, this.progress.duration), total: Math.max(1, this.progress.duration), type: ProgressType.Ring })
      .width(this.coverSize).height(this.coverSize)
      .color(new LinearGradient([{ color: '#64D2FF', offset: 0 }, { color: this.progress.colorLast, offset: 1 }]))
      .backgroundColor('#55FFFFFF').style({ strokeWidth: 3, enableSmoothEffect: true }).hitTestBehavior(HitTestMode.None)
  }
}
@Component
struct DockTimelineBar {
  @ObjectLink clock: PlaybackClockModel;
  @Prop songKeyStr: string = '';
  @Prop hasSong: boolean = false;
  @Prop busy: boolean = false;
  @Prop barWidth: number = 320;
  onSeek: (time: number) => void = () => {};
  @State private scrubbing: boolean = false;
  @State private seekValue: number = 0;
  @State private seekHoldUntil: number = 0;
  @State private trackWidth: number = 220;
  private seekSong: string = '';
  private lastCommittedSeekAt: number = 0;
  private displayPositionMs(): number {
    if (this.scrubbing) return this.seekValue;
    if (this.seekHoldUntil > 0 && Date.now() < this.seekHoldUntil) {
      if (Math.abs(this.clock.positionMs - this.seekValue) > 2500) return this.seekValue;
      this.seekHoldUntil = 0;
    }
    return this.clock.positionMs;
  }
  private progressRatio(): number {
    const dur = Math.max(1, this.clock.duration);
    const pos = Math.max(0, Math.min(this.displayPositionMs(), dur));
    return this.clock.duration > 0 ? Math.max(0, Math.min(1, pos / dur)) : 0;
  }
  private thumbSize(): number {
    return this.scrubbing ? 14 : 12;
  }
  private thumbOffsetX(): number {
    const size = this.thumbSize();
    const w = Math.max(size, this.trackWidth);
    const center = w * this.progressRatio();
    return Math.max(0, Math.min(w - size, center - size / 2));
  }
  private msFromTouchX(localX: number): number {
    const w = Math.max(1, this.trackWidth);
    const ratio = Math.max(0, Math.min(1, localX / w));
    return Math.round(ratio * Math.max(1, this.clock.duration));
  }
  private handleTrackTouch(event: TouchEvent): void {
    if (!this.hasSong || this.clock.duration <= 0 || this.busy) return;
    event.stopPropagation();
    const touch = (event.changedTouches && event.changedTouches.length > 0 ? event.changedTouches[0] : null)
      ?? (event.touches && event.touches.length > 0 ? event.touches[0] : null);
    if (!touch) return;
    const targetMs = this.msFromTouchX(touch.x);
    if (event.type === TouchType.Down) {
      this.scrubbing = true;
      this.seekSong = this.songKeyStr;
      this.seekValue = targetMs;
    } else if (event.type === TouchType.Move) {
      if (!this.scrubbing) {
        this.scrubbing = true;
        this.seekSong = this.songKeyStr;
      }
      this.seekValue = targetMs;
    } else if (event.type === TouchType.Up) {
      const now = Date.now();
      const shouldCommit = this.scrubbing && this.seekSong === this.songKeyStr;
      this.seekValue = targetMs;
      this.scrubbing = false;
      if (shouldCommit) {
        this.lastCommittedSeekAt = now;
        this.seekHoldUntil = now + 900;
        this.onSeek(targetMs);
      }
    } else if (event.type === TouchType.Cancel) {
      this.scrubbing = false;
    }
  }
  build() {
    Row({ space: 10 }) {
      Text(formatTime(this.displayPositionMs()))
        .fontSize(11).fontWeight(FontWeight.Medium)
        .fontColor(this.clock.stageDark ? '#F4F6FA' : '#141923')
        .textShadow({ radius: this.clock.stageDark ? 4 : 3, color: this.clock.stageDark ? '#D9000000' : '#E0FFFFFF', offsetX: 0, offsetY: 1 })
        .width(38).textAlign(TextAlign.Center)
      // 完全对齐 PC 端进度条规格：4vp 胶囊轨道 + 保留原色相自适应亮度渐变 + 双对比外描边/投影 + 12vp 护边滑块
      Stack({ alignContent: Alignment.Start }) {
        Row()
          .width('100%')
          .height(4)
          .borderRadius(999)
          .backgroundColor(this.clock.stageDark ? '#57FFFFFF' : '#420F172A')
          .border({ width: 0.75, color: this.clock.stageDark ? '#75000000' : '#A6FFFFFF' })
          .shadow({
            radius: this.clock.stageDark ? 4 : 3,
            color: this.clock.stageDark ? '#94000000' : '#29000000',
            offsetX: 0,
            offsetY: 1
          })
          .hitTestBehavior(HitTestMode.None)
        if (this.progressRatio() > 0.001) {
          Row()
            .width(`${(this.progressRatio() * 100).toFixed(3)}%`)
            .height(4)
            .borderRadius(999)
            .linearGradient({
              angle: 90,
              colors: [
                [adaptProgressHex(this.clock.colorFirst, this.clock.stageDark), 0],
                [adaptProgressHex(this.clock.colorLast, this.clock.stageDark), 1]
              ]
            })
            .hitTestBehavior(HitTestMode.None)
        }
        if (this.hasSong && this.clock.duration > 0) {
          Row()
            .width(this.thumbSize())
            .height(this.thumbSize())
            .borderRadius(999)
            .backgroundColor(adaptProgressHex(this.clock.colorLast, this.clock.stageDark))
            .border({ width: 1.5, color: this.clock.stageDark ? '#7A000000' : '#DBFFFFFF' })
            .shadow({
              radius: this.clock.stageDark ? 6 : 5,
              color: this.clock.stageDark ? '#99000000' : '#590F172A',
              offsetX: 0,
              offsetY: 1
            })
            .position({ x: this.thumbOffsetX(), y: (34 - this.thumbSize()) / 2 })
            .hitTestBehavior(HitTestMode.None)
        }
      }
      .layoutWeight(1)
      .height(34)
      .clip(false)
      .accessibilityText('播放进度')
      .onAreaChange((_oldVal: Area, newVal: Area) => {
        const w = Number(newVal.width);
        if (w > 0) this.trackWidth = w;
      })
      .onTouch((event: TouchEvent) => this.handleTrackTouch(event))
      Text(formatTime(this.clock.duration))
        .fontSize(11).fontWeight(FontWeight.Medium)
        .fontColor(this.clock.stageDark ? '#F4F6FA' : '#141923')
        .textShadow({ radius: this.clock.stageDark ? 4 : 3, color: this.clock.stageDark ? '#D9000000' : '#E0FFFFFF', offsetX: 0, offsetY: 1 })
        .width(38).textAlign(TextAlign.Center)
    }.width(this.barWidth).height(34)
  }
}
@Component
struct DockPlaybackContent {
  @Consume('dockVisual') model: DockVisualModel;
  @Consume('dockClock') clock: PlaybackClockModel;
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
  @State private playbackPressed: boolean = false;
  private modeIcon(): Resource {
    if (this.model.mode === '随机播放') return $r('app.media.ic_shuffle');
    if (this.model.mode === '单曲循环') return $r('app.media.ic_repeat_one');
    if (this.model.mode === '顺序播放') return $r('app.media.ic_order_seq');
    return $r('app.media.ic_repeat');
  }
  private sideButtonSize(): number {
    if (this.model.playbackWidth < 305) return 24;
    if (this.model.playbackWidth < 460) return 26;
    return 30;
  }
  private playButtonSize(): number {
    if (this.model.playbackWidth < 305) return 28;
    if (this.model.playbackWidth < 460) return 32;
    return 36;
  }
  private controlGap(): number {
    if (this.model.playbackWidth < 305) return 0;
    if (this.model.playbackWidth < 460) return 1;
    return 3;
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      if (this.boostImmersive) {
        HdsExquisiteCapsule({ pillWidth: this.model.playbackWidth, pillHeight: this.model.playbackHeight })
      }
      Row({ space: this.model.playbackWidth < 305 ? 2 : 4 }) {
        Stack() {
          Stack() {
            Image($r('app.media.ic_music')).width(16).height(16).fillColor(TEXT)
            if (this.model.song?.coverUrl) { Image(this.model.song.coverUrl).sourceSize({ width: 96, height: 96 }).autoResize(true).width('100%').height('100%').objectFit(ImageFit.Cover) }
          }.width(this.model.coverSize - 8).height(this.model.coverSize - 8).borderRadius(this.model.capsule ? 24 : 20).clip(true)
          DockCoverRing({ progress: this.clock, coverSize: this.model.coverSize })
        }.width(this.model.coverSize).height(this.model.coverSize).id('dock-cover').onClick(() => this.model.onPlayer()).accessibilityText('打开歌曲详情')
        Column({ space: 2 }) {
          Text(this.model.song?.name ?? '尚未播放').fontSize(13).fontColor(TEXT).fontWeight(FontWeight.Medium).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
          Text(this.model.busy ? '正在准备…' : this.model.song?.singer ?? '选择歌曲，开始聆听').fontSize(10).fontColor(MUTED).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
        }.layoutWeight(1).alignItems(HorizontalAlign.Start).onClick(() => this.model.onPlayer())
        // 统一播控按键：不区分横竖屏与屏幕宽度，固定顺序为 播放顺序 / 上一首 / 暂停播放 / 下一首 / 播放队列 / 更多。
        Row({ space: this.controlGap() }) {
          MaterialIcon({ icon: this.modeIcon(), label: '播放顺序：' + this.model.mode, diameter: this.sideButtonSize(), grouped: true, action: () => this.model.onMode() }).id('dock-mode')
          MaterialIcon({ icon: $r('app.media.ic_previous'), label: '上一首', diameter: this.sideButtonSize(), grouped: true, disabled: !this.model.song || this.model.busy, action: () => this.model.onNext(-1) }).id('dock-previous')
          MaterialIcon({ icon: this.model.playing ? $r('app.media.ic_pause') : $r('app.media.ic_play'), label: this.model.playing ? '暂停' : '播放', diameter: this.playButtonSize(), grouped: true, disabled: this.model.busy || !this.model.song, action: () => this.model.onToggle() }).id('dock-play-toggle')
          MaterialIcon({ icon: $r('app.media.ic_next'), label: '下一首', diameter: this.sideButtonSize(), grouped: true, disabled: !this.model.song || this.model.busy, action: () => this.model.onNext(1) }).id('dock-next')
          MaterialIcon({ icon: $r('app.media.ic_queue'), label: '播放队列', diameter: this.sideButtonSize(), grouped: true, action: () => this.model.onQueue() }).id('dock-queue')
          MaterialIcon({ icon: $r('app.media.ic_more'), label: '更多播放操作', diameter: this.sideButtonSize(), grouped: true, action: () => this.model.onMore() }).id('dock-more')
        }
      }.width(this.model.playbackWidth).height(this.model.playbackHeight).padding({ left: this.model.playbackWidth < 305 ? 4 : 6, right: this.model.playbackWidth < 305 ? 4 : 6 }).borderRadius(28)
        .backgroundColor(Color.Transparent).systemMaterial(this.boostImmersive ? uiMaterial.Material.empty : musicSurfaceMaterial()).clip(false).id('dock-playback')
        .onClick(() => {})
        .onTouch((event: TouchEvent) => {
          if (event.type === TouchType.Down) this.playbackPressed = true;
          else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.playbackPressed = false;
        })
    }
    .width(this.model.playbackWidth).height(this.model.playbackHeight).clip(false)
    .position({ x: 16, y: 16 })
    .scale({
      x: this.playbackPressed ? (this.boostImmersive ? EXQUISITE_PRESS_SCALE : MATERIAL_PRESS_SCALE) : 1,
      y: this.playbackPressed ? (this.boostImmersive ? EXQUISITE_PRESS_SCALE : MATERIAL_PRESS_SCALE) : 1
    })
    .animation({ curve: this.boostImmersive ? curves.springMotion(0.32, 0.76) : curves.springMotion(0.46, 0.82) })
  }
}
@Component
struct DockNavigationContent {
  @Consume('dockVisual') model: DockVisualModel;
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
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
  private currentTabIcon(): Resource {
    if (this.model.tab === '资料库') return $r('app.media.ic_library');
    if (this.model.tab === '设置') return $r('app.media.ic_settings');
    return $r('app.media.ic_home');
  }
  build() {
    if (this.boostImmersive && this.model.collapsed) {
      Stack({ alignContent: Alignment.Center }) {
        HdsExquisiteCircle({
          diameter: 56,
          icon: this.currentTabIcon(),
          selected: true,
          label: '展开导航',
          action: () => this.model.onExpand()
        })
      }.width(56).height(56).position({ x: 16, y: 16 }).clip(false)
        .animation({ curve: curves.springMotion(0.36, 0.78) })
    } else {
      Stack({ alignContent: Alignment.TopStart }) {
        if (this.boostImmersive) {
          HdsExquisiteCapsule({ pillWidth: this.model.navWidth, pillHeight: 56 })
        }
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
          .backgroundColor(Color.Transparent).systemMaterial(this.boostImmersive ? uiMaterial.Material.empty : musicSurfaceMaterial())
      }.width(this.model.collapsed ? 56 : this.model.navWidth).height(56).position({ x: 16, y: 16 }).clip(false)
        .scale({
          x: this.navPressed ? (this.boostImmersive ? EXQUISITE_PRESS_SCALE : MATERIAL_PRESS_SCALE) : 1,
          y: this.navPressed ? (this.boostImmersive ? EXQUISITE_PRESS_SCALE : MATERIAL_PRESS_SCALE) : 1
        })
        .animation({ curve: this.boostImmersive ? curves.springMotion(0.32, 0.76) : curves.springMotion(0.46, 0.82) })
    }
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
  @ObjectLink clock: PlaybackClockModel;
  @Prop @Watch('inputsChanged') liked: boolean = false;
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
  onTab: (tab: string) => void = () => {};
  onPlayer: () => void = () => {};
  onToggle: () => void = () => {};
  onNext: (step: number) => void = () => {};
  onQueue: () => void = () => {};
  onMode: () => void = () => {};
  onMore: () => void = () => {};
  onExpand: () => void = () => {};
  onSeek: (time: number) => void = () => {};
  @Provide('dockVisual') private model: DockVisualModel = new DockVisualModel();
  @Provide('dockClock') private sharedClock: PlaybackClockModel = new PlaybackClockModel();
  @State private viewportSnap: boolean = false;
  private prevAvailableWidth: number = -1;
  private prevLandscape: boolean = false;
  private viewportSnapTimer: number = -1;
  aboutToAppear(): void {
    this.sharedClock = this.clock;
    this.prevAvailableWidth = this.availableWidth;
    this.prevLandscape = this.landscape;
    this.model.onPlayer = () => this.onPlayer();
    this.model.onToggle = () => this.onToggle();
    this.model.onNext = (step: number) => this.onNext(step);
    this.model.onQueue = () => this.onQueue();
    this.model.onMode = () => this.onMode();
    this.model.onMore = () => this.onMore();
    this.model.onTab = (tab: string) => this.onTab(tab);
    this.model.onExpand = () => this.onExpand();
    this.inputsChanged();
  }
  aboutToDisappear(): void {
    if (this.viewportSnapTimer !== -1) {
      clearTimeout(this.viewportSnapTimer);
      this.viewportSnapTimer = -1;
    }
  }
  private inputsChanged(): void {
    const resized = this.prevAvailableWidth > 0 && (Math.abs(this.availableWidth - this.prevAvailableWidth) >= 2 || this.landscape !== this.prevLandscape);
    this.prevAvailableWidth = this.availableWidth;
    this.prevLandscape = this.landscape;
    if (resized) {
      this.viewportSnap = true;
      if (this.viewportSnapTimer !== -1) clearTimeout(this.viewportSnapTimer);
      this.viewportSnapTimer = setTimeout(() => {
        this.viewportSnapTimer = -1;
        this.viewportSnap = false;
      }, 120);
    }
    this.sharedClock = this.clock;
    this.model.song = this.song; this.model.tab = this.tab;
    this.model.playing = this.playing; this.model.busy = this.busy;
    this.model.mode = this.mode; this.model.liked = this.liked;
    this.model.playbackWidth = this.barWidth(); this.model.playbackHeight = this.barHeight();
    this.model.coverSize = this.coverSize(); this.model.capsule = this.capsule();
    this.model.wideControls = this.wideControls(); this.model.collapsed = this.collapsed(); this.model.navWidth = this.navWidth();
  }
  private dockAnim(): AnimateParam {
    if (this.viewportSnap) return { duration: 0 };
    return { curve: this.boostImmersive ? curves.springMotion(0.36, 0.76) : curves.springMotion(0.46, 0.82) };
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
  @Builder private timeline() {
    if (this.detail) {
      DockTimelineBar({
        clock: this.clock,
        songKeyStr: this.song ? `${this.song.source}:${this.song.id}` : '',
        hasSong: !!this.song,
        busy: this.busy,
        barWidth: this.barWidth(),
        onSeek: (time: number) => this.onSeek(time)
      })
        .position({ x: this.barX(), y: 0 })
        .zIndex(5)
        .opacity(this.detail ? 1 : 0).hitTestBehavior(this.detail ? HitTestMode.Default : HitTestMode.Transparent)
        .animation(this.dockAnim())
    }
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      DockPlaybackHost()
        .width(this.barWidth() + 32).height(96).backgroundColor(Color.Transparent).clip(false).hitTestBehavior(HitTestMode.Default)
        .responseRegion({ x: 16, y: 16, width: this.barWidth(), height: this.barHeight() })
        .position({ x: this.barX() - 16, y: this.barY() - 16 })
        .animation(this.dockAnim())
      DockNavigationHost()
        .width(this.collapsed() ? 88 : this.navWidth() + 32).height(96).backgroundColor(Color.Transparent).clip(false)
        .position({ x: this.navX() - 16, y: this.navY() - 16 })
        .visibility(this.navVisible() ? Visibility.Visible : Visibility.None)
        .opacity(this.navVisible() ? 1 : 0)
        .scale({ x: this.navVisible() ? 1 : 0.9, y: this.navVisible() ? 1 : 0.9 })
        // Transparent still lets hidden descendants consume the one native
        // material interaction event. Keep the fade, but exclude the entire
        // hidden navigation subtree so the visible playback capsule gets light.
        .hitTestBehavior(this.navVisible() ? HitTestMode.Default : HitTestMode.BLOCK_DESCENDANTS)
        .animation(this.dockAnim())
      this.timeline()
    }.width('100%').height(this.rootHeight()).clip(false)
      .animation(this.dockAnim())
  }
}
