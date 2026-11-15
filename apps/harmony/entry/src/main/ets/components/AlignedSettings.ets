import { SymbolGlyphModifier } from '@kit.ArkUI';
import { SyncSourcePayload } from '../services/LanSyncClient';
import { LanDevice } from '../services/LanDiscovery';
import { LyricPreferences } from '../services/LyricPreferences';
import { MINE_RADIO_MODES, MineRadioMode } from '../model/MineRadioModes';
import { musicMaterial } from './MaterialControls';
import { TEXT, MUTED, ACCENT } from './Theme';
interface SettingsCopy { title: string; detail: string; }
interface SettingsLink { title: string; detail: string; action: () => void; label?: string; }
interface SettingsToggle { title: string; detail: string; value: boolean; action: (value: boolean) => void; }
interface SettingsSelect { title: string; detail: string; labels: string[]; values: string[]; current: string; action: (value: string) => void; }
@Component
export struct AlignedSettings {
  @Prop panel: string = 'main';
  @Prop sources: SyncSourcePayload[] = [];
  @Prop activeId: string = '';
  @Prop quality: string = '128k';
  @Prop mode: string = '列表循环';
  @Prop styleName: string = 'mine-7';
  @Prop startupAnimation: boolean = true;
  @Prop resumeOnStartup: boolean = false;
  @Prop gripEnabled: boolean = false;
  @Prop carDetail: string = '';
  @Prop completedDownloads: number = 0;
  @Prop devices: LanDevice[] = [];
  @Prop lanSsid: string = '';
  @Prop message: string = '';
  @Prop lyrics: LyricPreferences = { colorMode: 'cover-gradient', primary: '#F4D28A', secondary: '#8FB2A6', showTranslation: true, showRomaji: false };
  @Prop lyricOffset: number = 0;
  @Prop previewPrimary: string = '#F4D28A';
  @Prop previewSecondary: string = '#8FB2A6';
  @Prop previewText: string = '音乐在这里，与你相遇';
  @Prop contentTop: number = 82;
  @State private primaryDraft: string = '';
  @State private secondaryDraft: string = '';
  @State private offsetDraft: string = '0';
  scroller: Scroller = new Scroller();
  onScroll: (value: number) => void = () => {};
  onOpenSources: () => void = () => {};
  onPanel: (value: string) => void = () => {};
  onDownloads: () => void = () => {};
  onSend: (device: LanDevice) => void = () => {};
  onQuality: (value: string) => void = () => {};
  onMode: (value: string) => void = () => {};
  onStyle: (value: string) => void = () => {};
  onResume: (value: boolean) => void = () => {};
  onStartup: (value: boolean) => void = () => {};
  onGrip: (value: boolean) => void = () => {};
  onColorMode: (value: string) => void = () => {};
  onPrimary: (value: string) => void = () => {};
  onSecondary: (value: string) => void = () => {};
  onTranslation: (value: boolean) => void = () => {};
  onRomaji: (value: boolean) => void = () => {};
  onOffset: (value: number) => void = () => {};
  aboutToAppear(): void { this.primaryDraft = this.lyrics.primary; this.secondaryDraft = this.lyrics.secondary; this.offsetDraft = `${this.lyricOffset}`; }
  @Builder private title(value: string) { Text(value).fontSize(14).fontWeight(FontWeight.Medium).fontColor(MUTED).width('100%').padding({ top: 24, bottom: 10, left: 4 }) }
  @Builder private copy($$: SettingsCopy) {
    Column({ space: 5 }) { Text($$.title).fontSize(16).fontColor(TEXT).maxLines(2).width('100%'); if ($$.detail) { Text($$.detail).fontSize(12).fontColor(MUTED).maxLines(3).width('100%') } }.alignItems(HorizontalAlign.Start).layoutWeight(1)
  }
  @Builder private link($$: SettingsLink) {
    Row({ space: 12 }) { this.copy({ title: $$.title, detail: $$.detail }); Text($$.label ?? '›').fontSize(14).fontColor(MUTED).maxLines(1) }.width('100%').padding(18).onClick($$.action)
  }
  @Builder private toggle($$: SettingsToggle) {
    Row({ space: 12 }) { this.copy({ title: $$.title, detail: $$.detail }); Toggle({ type: ToggleType.Switch, isOn: $$.value }).backgroundColor(Color.Transparent).systemMaterial(musicMaterial()).onChange($$.action) }.width('100%').padding(18)
  }
  @Builder private select($$: SettingsSelect) {
    Row({ space: 10 }) {
      this.copy({ title: $$.title, detail: $$.detail })
      Select($$.labels.map((value: string): SelectOption => { return { value }; }))
        .selected(Math.max(0, $$.values.indexOf($$.current))).value($$.labels[Math.max(0, $$.values.indexOf($$.current))])
        .width(148).height(40).font({ size: 13 }).arrowModifier(new SymbolGlyphModifier().fontSize(0)).showDefaultSelectedIcon(false)
        .backgroundColor(Color.Transparent).systemMaterial(musicMaterial()).onSelect((index: number) => $$.action($$.values[index]))
    }.width('100%').padding({ left: 18, right: 12, top: 12, bottom: 12 })
  }
  @Builder private main() {
    this.title('音乐源')
    Column() {
      this.link({ title: this.sources.find((source: SyncSourcePayload) => source.id === this.activeId)?.name ?? this.sources[0]?.name ?? '未添加音源', detail: `${this.sources.length} 个音源 · 当前使用`, action: this.onOpenSources })
    }.width('100%').backgroundColor('#0BFFFFFF').borderRadius(20)
    this.title('播放')
    Column({ space: 1 }) {
      this.select({ title: '音质', detail: '播放和下载优先使用该档位', labels: ['标准 128k', '高品质 320k', '无损 flac'], values: ['128k', '320k', 'flac'], current: this.quality, action: this.onQuality })
      this.select({ title: '播放顺序', detail: '列表循环 / 单曲 / 随机 / 顺序', labels: ['列表循环', '单曲循环', '随机播放', '顺序播放'], values: ['列表循环', '单曲循环', '随机播放', '顺序播放'], current: this.mode, action: this.onMode })
      this.select({ title: 'MineRadio 动效', detail: '与 PC 使用同一套视觉引擎', labels: MINE_RADIO_MODES.map((mode: MineRadioMode) => mode.label), values: MINE_RADIO_MODES.map((mode: MineRadioMode) => mode.id), current: this.styleName, action: this.onStyle })
    }.width('100%').backgroundColor('#0BFFFFFF').borderRadius(20)
    this.title('歌词')
    Column() {
      this.link({ title: '歌词设置', detail: '详情页颜色、翻译／罗马音与时间偏移', action: () => this.onPanel('lyrics') })
    }.width('100%').backgroundColor('#0BFFFFFF').borderRadius(20)
    this.title('系统与互联')
    Column({ space: 1 }) {
      this.toggle({ title: '启动时继续播放上次内容', detail: '默认关闭，保留歌曲和进度，打开软件保持暂停', value: this.resumeOnStartup, action: this.onResume })
      this.toggle({ title: '启动动画', detail: '关闭后直接进入首页', value: this.startupAnimation, action: this.onStartup })
      this.link({ title: '局域网同步', detail: '手机、平板与电脑之间双向同步歌单、音源和设置', action: () => this.onPanel('sync'), label: '管理' })
      this.link({ title: '下载管理', detail: `${this.completedDownloads} 首已完成`, action: this.onDownloads, label: '查看' })
      this.link({ title: 'HiCar', detail: this.carDetail, action: () => this.onPanel('car'), label: '详情' })
      this.toggle({ title: '智感握姿', detail: '合并播控时，导航圆钮随握持换边', value: this.gripEnabled, action: this.onGrip })
    }.width('100%').backgroundColor('#0BFFFFFF').borderRadius(20)
    this.title('关于')
    Column() {
      this.link({ title: 'LxMine', detail: 'LX 音源 · MineRadio 视觉 · 手机和平板同源界面', action: () => {}, label: '1.0.0' })
    }.width('100%').backgroundColor('#0BFFFFFF').borderRadius(20)
  }
  @Builder private lyricPanel() {
    Column({ space: 14 }) {
      Text(this.previewText).fontSize(22).fontWeight(FontWeight.Medium).fontColor(this.previewPrimary).maxLines(2).textAlign(TextAlign.Center)
      Row().width('70%').height(4).borderRadius(2).linearGradient({ angle: 90, colors: [[this.previewPrimary, 0], [this.previewSecondary, 1]] })
    }.width('100%').padding(24).backgroundColor('#0BFFFFFF').borderRadius(20)
    this.title('播放详情页歌词')
    Column({ space: 1 }) {
      this.select({ title: '颜色来源', detail: '封面取色或自定义；纯色／渐变', labels: ['封面取色 · 纯色', '封面取色 · 渐变', '自定义 · 纯色', '自定义 · 渐变'], values: ['cover-solid', 'cover-gradient', 'custom-solid', 'custom-gradient'], current: this.lyrics.colorMode, action: this.onColorMode })
      if (this.lyrics.colorMode.startsWith('custom')) {
        Row({ space: 12 }) {
          this.copy({ title: '主色', detail: '#RRGGBB' })
          Row().width(24).height(24).borderRadius(12).backgroundColor(this.lyrics.primary)
          TextInput({ text: this.primaryDraft, placeholder: '#F4D28A' }).width(116).height(40).fontColor(TEXT).backgroundColor(Color.Transparent).onChange((value: string) => { this.primaryDraft = value; if (/^#[0-9a-f]{6}$/i.test(value)) this.onPrimary(value); })
        }.padding(18).width('100%')
        if (this.lyrics.colorMode.endsWith('gradient')) {
          Row({ space: 12 }) {
            this.copy({ title: '辅色', detail: '#RRGGBB' })
            Row().width(24).height(24).borderRadius(12).backgroundColor(this.lyrics.secondary)
            TextInput({ text: this.secondaryDraft, placeholder: '#8FB2A6' }).width(116).height(40).fontColor(TEXT).backgroundColor(Color.Transparent).onChange((value: string) => { this.secondaryDraft = value; if (/^#[0-9a-f]{6}$/i.test(value)) this.onSecondary(value); })
          }.padding(18).width('100%')
        }
      }
      this.toggle({ title: '显示翻译 / 音译', detail: '在主歌词下方显示音源提供的翻译或音译', value: this.lyrics.showTranslation, action: this.onTranslation })
      this.toggle({ title: '显示罗马音', detail: '日文等歌词显示罗马音（数据源提供时）', value: this.lyrics.showRomaji, action: this.onRomaji })
    }.width('100%').backgroundColor('#0BFFFFFF').borderRadius(20)
    this.title('时间')
    Column({ space: 12 }) {
      Row({ space: 8 }) {
        this.copy({ title: '时间偏移', detail: '正值提前显示，负值延后显示' })
        TextInput({ text: this.offsetDraft, placeholder: '0' }).width(74).height(40).fontColor(TEXT).backgroundColor(Color.Transparent).onChange((value: string) => { this.offsetDraft = value; if (value.trim() && Number.isFinite(Number(value))) this.onOffset(Math.max(-10000, Math.min(10000, Math.round(Number(value))))); })
        Text('ms').fontSize(12).fontColor(MUTED)
        Button('重置').fontColor(ACCENT).backgroundColor(Color.Transparent).buttonStyle(ButtonStyleMode.TEXTUAL).onClick(() => { this.offsetDraft = '0'; this.onOffset(0); })
      }.width('100%')
      Slider({ value: this.lyricOffset, min: -10000, max: 10000, step: 100 }).selectedColor(ACCENT).trackColor('#38FFFFFF').blockColor(TEXT).onChange((value: number, mode: SliderChangeMode) => { if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) { this.offsetDraft = `${value}`; this.onOffset(value); } })
    }.width('100%').padding(18).backgroundColor('#0BFFFFFF').borderRadius(20)
  }
  @Builder private syncPanel() {
    this.title('局域网同步')
    Text(this.lanSsid ? `本机 Wi‑Fi：${this.lanSsid}` : '设备需连接同一局域网').fontSize(13).fontColor(MUTED).width('100%')
    Text('发送后由对方确认接收，支持任意设备之间双向同步。').fontSize(13).fontColor(MUTED).width('100%').padding({ top: 8, bottom: 12 })
    Column({ space: 1 }) {
      if (!this.devices.length) { Row({ space: 12 }) { LoadingProgress().width(22).height(22); Text('正在寻找附近的 LxMine…').fontSize(14).fontColor(MUTED) }.width('100%').padding(18) }
      ForEach(this.devices, (device: LanDevice) => { this.link({ title: device.name, detail: `${device.platform === 'harmony' ? 'HarmonyOS' : 'Windows'}${device.ssid ? ' · ' + device.ssid : ''}`, action: () => this.onSend(device), label: '发送' }) }, (device: LanDevice) => device.id)
    }.width('100%').backgroundColor('#0BFFFFFF').borderRadius(20)
    if (this.message) { Text(this.message).fontSize(13).fontColor(ACCENT).width('100%').padding({ top: 12 }) }
  }
  build() {
    Scroll(this.scroller) {
      Column({ space: 2 }) {
        if (this.panel === 'lyrics') { this.lyricPanel() }
        else if (this.panel === 'sync') { this.syncPanel() }
        else if (this.panel === 'car') { this.title('HiCar'); Text(this.carDetail).fontSize(16).fontColor(TEXT); Text('连接检测与车机应用入口分别接入。普通版不会因检测到连接而自动进入车机应用列表。HiCar 兼容版请在车机应用尝鲜区添加“咪咕音乐”，打开后仍为 LxMine；兼容版不能与官方咪咕音乐共存。').fontSize(13).fontColor(MUTED).padding({ top: 16 }) }
        else { this.main() }
      }.width('100%').alignItems(HorizontalAlign.Start).padding({ top: this.contentTop + 12, bottom: 180 })
    }.width('100%').height('100%').scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring)
      .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.scroller.currentOffset().yOffset); })
  }
}
