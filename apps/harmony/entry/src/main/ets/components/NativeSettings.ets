import { ON_ACCENT } from './Theme';
import { musicButtonPress } from './MaterialControls';
import { SyncSourcePayload } from '../services/LanSyncClient';
import { PRODUCT_NAME } from 'BuildProfile';
import { LanDevice } from '../services/LanDiscovery';
import { MaterialSurface, MaterialToggle, musicMaterial } from './MaterialControls';
import { TEXT, MUTED, ACCENT, devicePlatformName } from './Theme';
import { curves } from '@kit.ArkUI';
import { MINE_RADIO_MODES, MineRadioMode } from '../model/MineRadioModes';
@Component
export struct NativeSettings {
  @Prop sources: SyncSourcePayload[] = [];
  @Prop activeId: string = '';
  @Prop devices: LanDevice[] = [];
  @Prop deviceName: string = '';
  @Prop lanSsid: string = '';
  @Prop carAvailable: boolean = false;
  @Prop carConnected: boolean = false;
  @Prop carDetail: string = '正在检测 HiCar…';
  @Prop quality: string = '128k';
  @Prop styleName: string = 'mine-0';
  @Prop mode: string = '列表循环';
  @Prop @Watch('offsetChanged') lyricOffset: number = 0;
  @State private offsetText: string = '';
  @Prop message: string = '';
  @Prop gripEnabled: boolean = false;
  @Prop resumeOnStartup: boolean = false;
  @Prop startupAnimation: boolean = true;
  @Prop sourcesOnly: boolean = false;
  @Prop sourcesReveal: number = 1;
  @Prop contentTop: number = 82;
  scroller: Scroller = new Scroller();
  onImportFile: () => void = () => {};
  onImportText: () => void = () => {};
  onActivate: (source: SyncSourcePayload) => void = () => {};
  onRemove: (source: SyncSourcePayload) => void = () => {};
  onSend: (device: LanDevice) => void = () => {};
  onQuality: (value: string) => void = () => {};
  onStyle: (value: string) => void = () => {};
  onMode: (value: string) => void = () => {};
  onGrip: (value: boolean) => void = () => {};
  onResumeOnStartup: (value: boolean) => void = () => {};
  onStartupAnimation: (value: boolean) => void = () => {};
  onOpenSources: () => void = () => {};
  onOffset: (value: number) => void = () => {};
  private readonly qualities: string[] = ['128k', '320k', 'flac'];
  private readonly modes: string[] = ['列表循环', '单曲循环', '随机播放', '顺序播放'];
  aboutToAppear(): void { this.offsetText = `${this.lyricOffset}`; }
  private offsetChanged(): void { this.offsetText = `${this.lyricOffset}`; }
  @Builder private section(title: string) {
    Text(title).fontSize(14).fontWeight(FontWeight.Medium).fontColor(MUTED).width('100%').padding({ top: 24, bottom: 10, left: 4 })
  }
  @Builder private sourceMenu(source: SyncSourcePayload) {
    Menu() {
      MenuItem({ content: '启用此音源' }).onClick(() => this.onActivate(source))
      MenuItem({ content: '移除音源' }).onClick(() => this.onRemove(source))
    }
  }
  @Builder private selectRow(title: string, items: string[], values: string[], selected: string, action: (value: string) => void) {
    Row({ space: 12 }) {
      Text(title).fontSize(16).fontColor(TEXT).layoutWeight(1)
      Select(items.map((value: string) => { return { value } as SelectOption; }))
        .selected(Math.max(0, values.indexOf(selected))).value(items[Math.max(0, values.indexOf(selected))])
        .font({ size: 14 }).backgroundColor(Color.Transparent).systemMaterial(musicMaterial()).onSelect((index: number) => action(values[index]))
    }.width('100%').height(62).padding({ left: 16, right: 12 }).backgroundColor($r('app.color.card_surface'))
  }
  private activeSourceName(): string {
    const active = this.sources.find((source: SyncSourcePayload) => source.id === this.activeId) ?? this.sources[0];
    return active?.name ?? '未添加音源';
  }
  @Builder private sourceSummary() {
    Row({ space: 12 }) {
      Column({ space: 5 }) {
        Text(this.activeSourceName()).fontSize(16).fontColor(TEXT).maxLines(1)
        Text(`${this.sources.length} 个音源 · 当前使用`).fontSize(12).fontColor(MUTED)
      }.alignItems(HorizontalAlign.Start).layoutWeight(1).onClick(() => this.onOpenSources())
      SymbolGlyph($r('sys.symbol.chevron_right')).fontSize(18).fontColor([MUTED]).onClick(() => this.onOpenSources())
    }.width('100%').padding(18).borderRadius(20).backgroundColor($r('app.color.card_surface')).onClick(() => this.onOpenSources())
  }
  @Builder private sourcesContent() {
    MaterialSurface({ surfaceHeight: 58 }) {
      Row({ space: 12 }) {
        Button('批量导入音源').attributeModifier(musicButtonPress).height(44).layoutWeight(1).stateEffect(false).clip(false).fontColor(TEXT)
          .backgroundColor(Color.Transparent).systemMaterial(musicMaterial()).id('source-import-file').onClick(() => this.onImportFile())
        Button('粘贴脚本').attributeModifier(musicButtonPress).height(44).layoutWeight(1).stateEffect(false).clip(false).fontColor(TEXT)
          .backgroundColor(Color.Transparent).systemMaterial(musicMaterial()).id('source-import-text').onClick(() => this.onImportText())
      }.width('100%').padding({ top: 16, bottom: 16, left: 12, right: 12 }).clip(false)
    }
    Column() {
      ForEach(this.sources, (source: SyncSourcePayload) => {
        Row({ space: 12 }) {
          Radio({ value: source.id ?? source.name, group: 'lx-source' }).checked(this.activeId === source.id).radioStyle({ checkedBackgroundColor: ACCENT, uncheckedBorderColor: MUTED, indicatorColor: ON_ACCENT })
            .onChange((selected: boolean) => { if (selected) this.onActivate(source); })
          Column({ space: 5 }) {
            Text(source.name).fontSize(16).fontColor(TEXT).maxLines(1)
            Text(this.activeId === source.id ? '当前使用' : source.version || '自定义音源').fontSize(12).fontColor(MUTED)
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          Image($r('app.media.ic_more')).width(22).height(22).fillColor(TEXT).padding(0)
            .bindMenu(this.sourceMenu(source)).accessibilityText('音源操作')
        }.width('100%').padding(16).onClick(() => this.onActivate(source)).bindContextMenu(this.sourceMenu(source), ResponseType.LongPress)
      }, (source: SyncSourcePayload) => source.id ?? source.name)
    }.width('100%').borderRadius(20).backgroundColor($r('app.color.card_surface')).clip(true)
    Text('播放使用你启用的音源，公共搜索无需登录。').fontSize(12).fontColor(MUTED).width('100%').padding({ top: 10, left: 4 })
  }
  onScroll: (offset: number) => void = () => {};
  build() {
    Scroll(this.scroller) {
      Column({ space: 2 }) {
        if (this.sourcesOnly) {
          Column() { this.sourcesContent() }.width('100%').transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ x: 42 })).animation({ curve: curves.springMotion(0.5, 0.9) }))
        } else {
          this.section('音乐源')
          this.sourceSummary()
          this.section('播放')
        Column({ space: 1 }) {
          this.selectRow('音质', ['标准', '高品质', '无损'], this.qualities, this.quality, this.onQuality)
          this.selectRow('播放顺序', this.modes, this.modes, this.mode, this.onMode)
          this.selectRow('MineRadio 动效', MINE_RADIO_MODES.map((mode: MineRadioMode) => mode.label), MINE_RADIO_MODES.map((mode: MineRadioMode) => mode.id), this.styleName, this.onStyle)
        }.borderRadius(20).width('100%').clip(true)
        if (PRODUCT_NAME.toString() !== 'store') {
          this.section('车机')
          Row({ space: 16 }) {
            Column({ space: 6 }) {
              Text('HiCar').fontSize(16).fontColor(TEXT)
              Text(this.carDetail).fontSize(12).fontColor(this.carConnected ? ACCENT : MUTED)
            }.alignItems(HorizontalAlign.Start).layoutWeight(1)
            Text(this.carConnected ? '已连接' : (this.carAvailable ? '可连接' : '不支持'))
              .fontSize(12).fontColor(this.carConnected ? ACCENT : MUTED)
          }.width('100%').padding(18).borderRadius(20).backgroundColor($r('app.color.card_surface'))
          Text('连接 HiCar 后，车机通过系统媒体会话读取歌曲、歌词并控制播放/暂停/切歌。').fontSize(12).fontColor(MUTED).width('100%').padding({ top: 10, left: 4 })
        }
        this.section('单手操作')
        Row({ space: 16 }) {
          Column({ space: 6 }) {
            Text('智感握姿').fontSize(16).fontColor(TEXT)
            Text('合并播控时，导航圆钮随握持换边').fontSize(12).fontColor(MUTED)
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          MaterialToggle({ value: this.gripEnabled, label: '智感握姿', onChange: (value: boolean) => this.onGrip(value) })
        }.width('100%').padding(18).borderRadius(20).backgroundColor($r('app.color.card_surface'))
        Text('使用华为系统握持感知；双手或平放时保持常规布局。').fontSize(12).fontColor(MUTED).width('100%').padding({ top: 10, left: 4 })
        this.section('启动')
        Row({ space: 16 }) {
          Column({ space: 6 }) {
            Text('启动动画').fontSize(16).fontColor(TEXT)
            Text('关闭后直接进入首页，不再播放开场动画').fontSize(12).fontColor(MUTED)
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          MaterialToggle({ value: this.startupAnimation, label: '启动动画', onChange: (value: boolean) => this.onStartupAnimation(value) })
        }.width('100%').padding(18).borderRadius(20).backgroundColor($r('app.color.card_surface'))
        Row({ space: 16 }) {
          Column({ space: 6 }) {
            Text('启动时继续播放上次内容').fontSize(16).fontColor(TEXT)
            Text('默认关闭，打开软件保留歌曲和进度，保持暂停').fontSize(12).fontColor(MUTED)
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          MaterialToggle({ value: this.resumeOnStartup, label: '启动时继续播放上次内容', onChange: (value: boolean) => this.onResumeOnStartup(value) })
        }.width('100%').padding(18).borderRadius(20).backgroundColor($r('app.color.card_surface'))
        this.section('歌词同步')
        Column({ space: 10 }) {
          Row({ space: 8 }) {
            Text('时间偏移').fontSize(16).fontColor(TEXT)
            Blank()
            TextInput({ text: this.offsetText, placeholder: '0' }).type(InputType.Normal).width(92).height(36).fontSize(14).fontColor(TEXT).textAlign(TextAlign.End)
              .backgroundColor('#10FFFFFF').borderRadius(10)
              .onChange((value: string) => {
                this.offsetText = value;
                const parsed = Number(value);
                if (Number.isFinite(parsed)) this.onOffset(Math.max(-10000, Math.min(10000, Math.round(parsed))));
              })
            Text('ms').fontSize(12).fontColor(MUTED)
            Button('重置').attributeModifier(musicButtonPress).fontSize(12).fontColor(ACCENT).height(32).borderRadius(16).backgroundColor('#10FFFFFF').onClick(() => { this.offsetText = '0'; this.onOffset(0); })
          }.width('100%')
          Slider({ value: this.lyricOffset, min: -5000, max: 5000, step: 100 }).selectedColor(ACCENT).blockColor(TEXT).trackColor('#38FFFFFF').backgroundColor(Color.Transparent)
            .onChange((value: number, mode: SliderChangeMode) => { if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) this.onOffset(value); })
        }.padding(18).width('100%').borderRadius(20).backgroundColor($r('app.color.card_surface'))
        this.section('局域网同步')
        Text(this.lanSsid ? `本机 Wi‑Fi：${this.lanSsid}。两台设备需连接同一 Wi‑Fi 名称。` : '同一 Wi-Fi 下发现设备，经对方确认后覆盖设置、歌单与音源。').fontSize(13).fontColor(MUTED).width('100%').padding({ bottom: 12, left: 4 })
        Column() {
          if (!this.devices.length) {
            Row({ space: 12 }) { LoadingProgress().width(22).height(22); Text('正在寻找附近的 LxMine…').fontSize(14).fontColor(MUTED) }.width('100%').padding(20)
          }
          ForEach(this.devices, (device: LanDevice) => {
            Row() {
              Column({ space: 5 }) {
                Text(device.name).fontSize(16).fontColor(TEXT)
                Text(devicePlatformName(device.platform)).fontSize(12).fontColor(MUTED)
                if (device.ssid) { Text('Wi‑Fi：' + device.ssid).fontSize(11).fontColor(MUTED) }
              }.alignItems(HorizontalAlign.Start).layoutWeight(1)
              Text('发送').fontSize(14).fontColor(ACCENT)
            }.width('100%').padding(20).onClick(() => this.onSend(device))
          }, (device: LanDevice) => device.id)
        }.width('100%').borderRadius(20).backgroundColor($r('app.color.card_surface'))
        if (this.message) { Text(this.message).fontSize(13).fontColor(ACCENT).width('100%').padding({ top: 12 }) }
        Text('LxMine · 1.1.0\n融合 LX Music 与 MineRadio').fontSize(12).fontColor(MUTED).lineHeight(22).width('100%').padding({ top: 32, bottom: 28, left: 4 })
        }
      }.width('100%').alignItems(HorizontalAlign.Start).padding({ top: this.contentTop, bottom: 180 })
    }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring)
      .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.scroller.currentOffset().yOffset); })
  }
}
