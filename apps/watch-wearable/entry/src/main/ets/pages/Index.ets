import { BusinessError } from '@kit.BasicServicesKit';
import { wearEngine } from '@kit.WearEngine';
import { CONTROL_SURFACE, WatchControlSurface } from '../components/WatchControlSurface';

interface DemoTrack {
  title: string;
  artist: string;
  duration: number;
}

const TRACKS: DemoTrack[] = [
  { title: '夜行电台', artist: 'LxMine 演示曲目', duration: 188 },
  { title: '海风来信', artist: 'LxMine 演示曲目', duration: 212 },
  { title: '雨后的街道', artist: 'LxMine 演示曲目', duration: 176 },
];

const BACKGROUND = '#151619';
const PRIMARY_TEXT = '#F4F4F4';
const SECONDARY_TEXT = '#9D9FA3';
const ACCENT = '#F4D28A';

@Entry
@Component
struct Index {
  @State private round: boolean = true;
  @State private demo: boolean = false;
  @State private trackIndex: number = 0;
  @State private elapsed: number = 0;
  @State private playing: boolean = false;
  @State private checking: boolean = false;
  @State private connectionHint: string = '在运动健康中配对手表';
  @State private immersive: boolean = false;
  private controlSurface: WatchControlSurface = new WatchControlSurface();
  private timer: number = -1;

  aboutToAppear(): void {
    this.round = this.getUIContext().getMediaQuery().matchMediaSync('(round-screen: true)').matches;
    this.immersive = this.controlSurface.initialize();
    console.info(`LxMine Watch: immersive material supported=${this.immersive}`);
  }

  onPageHide(): void {
    this.stopDemoClock();
  }

  aboutToDisappear(): void {
    this.stopDemoClock();
  }

  private async checkPhone(): Promise<void> {
    if (this.checking) {
      return;
    }
    const context = this.getUIContext().getHostContext();
    if (!context || !canIUse('SystemCapability.Health.WearEngine')) {
      this.connectionHint = '当前设备未开放穿戴服务';
      return;
    }
    this.checking = true;
    try {
      const client = wearEngine.getDeviceClient(context);
      const devices = await client.getConnectedDevices();
      this.connectionHint = devices.length ? '已配对，等待手机端联调' : '未发现已连接的手机';
    } catch (error) {
      const code = (error as BusinessError).code;
      console.warn(`LxMine Watch: peer query failed (${code})`);
      this.connectionHint = code === 1008500004 ? '穿戴服务待开通' : '连接检查失败，请重试';
    } finally {
      this.checking = false;
    }
  }

  private toggleDemo(): void {
    this.stopDemoClock();
    this.trackIndex = 0;
    this.elapsed = 0;
    this.demo = !this.demo;
  }

  private moveTrack(direction: number): void {
    this.trackIndex = (this.trackIndex + direction + TRACKS.length) % TRACKS.length;
    this.elapsed = 0;
  }

  private toggleDemoPlayback(): void {
    if (this.playing) {
      this.stopDemoClock();
      return;
    }
    this.playing = true;
    this.timer = setInterval(() => {
      if (this.elapsed + 1 >= TRACKS[this.trackIndex].duration) {
        this.moveTrack(1);
      } else {
        this.elapsed++;
      }
    }, 1000);
  }

  private stopDemoClock(): void {
    if (this.timer !== -1) {
      clearInterval(this.timer);
      this.timer = -1;
    }
    this.playing = false;
  }

  private formatTime(seconds: number): string {
    const remainder = seconds % 60;
    return `${Math.floor(seconds / 60)}:${remainder < 10 ? '0' : ''}${remainder}`;
  }

  @Builder
  private SkipButton(icon: Resource, label: string, direction: number) {
    Button({ type: ButtonType.Circle }) {
      SymbolGlyph(icon)
        .fontSize(20)
        .fontColor([PRIMARY_TEXT])
    }
      .layoutWeight(1)
      .height(44)
      .padding(0)
      .buttonStyle(ButtonStyleMode.TEXTUAL)
      .backgroundColor(Color.Transparent)
      .stateEffect(!this.immersive)
      .accessibilityText(label)
      .onClick(() => this.moveTrack(direction))
  }

  @Builder
  private ControlRow() {
    Row({ space: 5 }) {
      this.SkipButton($r('sys.symbol.backward_end_fill'), '上一首', -1)
      Button({ type: ButtonType.Circle }) {
        if (this.playing) {
          SymbolGlyph($r('sys.symbol.pause_fill')).fontSize(23).fontColor([ACCENT])
        } else {
          SymbolGlyph($r('sys.symbol.play_fill')).fontSize(23).fontColor([ACCENT])
        }
      }
      .layoutWeight(1.2)
      .height(44)
      .padding(0)
      .buttonStyle(ButtonStyleMode.TEXTUAL)
      .backgroundColor(Color.Transparent)
      .stateEffect(!this.immersive)
      .accessibilityText(this.playing ? '暂停' : '播放')
      .onClick(() => this.toggleDemoPlayback())
      this.SkipButton($r('sys.symbol.forward_end_fill'), '下一首', 1)
    }
    .width('100%')
    .height(46)
    .padding({ left: 3, right: 3 })
    .borderRadius(23)
    .attributeModifier(this.controlSurface)
    .clip(false)
  }

  @Builder
  private PlaybackControls() {
    if (this.immersive) {
      // ArkUI activates immersive material for ordinary controls in the Navigation title area.
      Navigation() {}
        .title({ builder: this.ControlRow, height: 46 }, {
          barStyle: BarStyle.STACK,
          backgroundColor: Color.Transparent,
          backgroundBlurStyle: BlurStyle.NONE,
        })
        .titleMode(NavigationTitleMode.Mini)
        .hideBackButton(true)
        .hideToolBar(true)
        .mode(NavigationMode.Stack)
        .width('100%')
        .height(46)
        .backgroundColor(Color.Transparent)
        .clip(false)
    } else {
      this.ControlRow()
    }
  }

  @Builder
  private IdleView() {
    Column({ space: 8 }) {
      Image($r('app.media.app_icon'))
        .width(40)
        .height(40)
        .borderRadius(20)
        .clip(true)
        .accessibilityText('LxMine')
      Text('等待手机')
        .fontSize(23)
        .fontWeight(FontWeight.Bold)
        .fontColor(PRIMARY_TEXT)
      Text(this.connectionHint)
        .fontSize(12)
        .fontColor(SECONDARY_TEXT)
        .textAlign(TextAlign.Center)
        .maxLines(2)
      Row({ space: 6 }) {
        Button(this.checking ? '检查中' : '检查连接')
          .layoutWeight(1.25)
          .height(42)
          .padding(0)
          .fontSize(12)
          .fontColor(PRIMARY_TEXT)
          .backgroundColor(CONTROL_SURFACE)
          .enabled(!this.checking)
          .onClick(() => { void this.checkPhone(); })
        Button('演示')
          .layoutWeight(1)
          .height(42)
          .padding(0)
          .fontSize(14)
          .fontColor(ACCENT)
          .backgroundColor(CONTROL_SURFACE)
          .onClick(() => this.toggleDemo())
      }
      .width('100%')
    }
    .width(this.round ? '76%' : '90%')
  }

  @Builder
  private DemoView() {
    Column({ space: 7 }) {
      Text('演示 · 无音频')
        .fontSize(11)
        .fontColor(ACCENT)
      Text(TRACKS[this.trackIndex].title)
        .fontSize(21)
        .fontWeight(FontWeight.Bold)
        .fontColor(PRIMARY_TEXT)
        .textAlign(TextAlign.Center)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .width('100%')
      Text(TRACKS[this.trackIndex].artist)
        .fontSize(11)
        .fontColor(SECONDARY_TEXT)
        .maxLines(1)
      Progress({ value: this.elapsed, total: TRACKS[this.trackIndex].duration, type: ProgressType.Linear })
        .color(ACCENT)
        .backgroundColor(CONTROL_SURFACE)
        .width('84%')
      Text(`${this.formatTime(this.elapsed)} / ${this.formatTime(TRACKS[this.trackIndex].duration)}`)
        .fontSize(11)
        .fontColor(SECONDARY_TEXT)
      this.PlaybackControls()
      Button('退出演示')
        .height(30)
        .padding({ left: 10, right: 10 })
        .fontSize(11)
        .fontColor(SECONDARY_TEXT)
        .backgroundColor(Color.Transparent)
        .onClick(() => this.toggleDemo())
    }
    .width(this.round ? '78%' : '90%')
  }

  build() {
    Column() {
      if (this.demo) {
        this.DemoView()
      } else {
        this.IdleView()
      }
    }
    .justifyContent(FlexAlign.Center)
    .width('100%')
    .height('100%')
    .backgroundColor(BACKGROUND)
  }
}
