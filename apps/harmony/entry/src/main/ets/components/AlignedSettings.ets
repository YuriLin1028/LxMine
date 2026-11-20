import { musicButtonPress } from './MaterialControls';
import { PRODUCT_NAME, VERSION_NAME } from 'BuildProfile';
import { SyncSourcePayload } from '../services/LanSyncClient';
import { LanDevice } from '../services/LanDiscovery';
import { LyricPreferences } from '../services/LyricPreferences';
import { MINE_RADIO_MODES, MineRadioMode } from '../model/MineRadioModes';
import { MaterialSelect, MaterialToggle } from './MaterialControls';
import { TEXT, MUTED, ACCENT, devicePlatformName } from './Theme';
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
  @Prop stageBgOpacity: number = 0.78;
  @Prop stageBgCustom: boolean = false;
  @Prop appearance: string = 'system';
  @Prop startupAnimation: boolean = true;
  @Prop resumeOnStartup: boolean = false;
  @Prop gripEnabled: boolean = false;
  @Prop allowLandscapeLocked: boolean = true;
  @Prop mixWithOthers: boolean = false;
  @Prop refreshAlgoDoubleTap: boolean = true;
  @Prop lanAutoSync: boolean = false;
  @Prop lanLocalAddress: string = '';
  @Prop carDetail: string = '';
  @Prop completedDownloads: number = 0;
  @Prop devices: LanDevice[] = [];
  @Prop lanSsid: string = '';
  @Prop message: string = '';
  @Prop lyrics: LyricPreferences = { colorMode: 'cover-gradient', primary: '#7DD3FC', secondary: '#A5B4FC', showTranslation: true, showRomaji: false, scale: 1 };
  @Prop lyricOffset: number = 0;
  @Prop previewPrimary: string = '#7DD3FC';
  @Prop previewSecondary: string = '#A5B4FC';
  @Prop previewText: string = '音乐在这里，与你相遇';
  @Prop contentTop: number = 82;
  @Prop updateChecking: boolean = false;
  @Prop isHarmonyPc: boolean = false;
  @Prop desktopLyrics: boolean = false;
  @Prop desktopLyricsLocked: boolean = false;
  @Prop wallpaperMode: boolean = false;
  @State private primaryDraft: string = '';
  @State private secondaryDraft: string = '';
  @State private offsetDraft: string = '0';
  @State private directTargetDraft: string = '';
  scroller: Scroller = new Scroller();
  onScroll: (value: number) => void = () => {};
  onOpenSources: () => void = () => {};
  onPanel: (value: string) => void = () => {};
  onDownloads: () => void = () => {};
  onSend: (device: LanDevice) => void = () => {};
  onSendDirect: (target: string) => void = () => {};
  onLanAutoSync: (value: boolean) => void = () => {};
  onQuality: (value: string) => void = () => {};
  onMode: (value: string) => void = () => {};
  onStyle: (value: string) => void = () => {};
  onStageBgOpacity: (value: number) => void = () => {};
  onPickStageBgImage: () => void = () => {};
  onClearStageBgImage: () => void = () => {};
  onAppearance: (value: string) => void = () => {};
  onResume: (value: boolean) => void = () => {};
  onStartup: (value: boolean) => void = () => {};
  onGrip: (value: boolean) => void = () => {};
  onAllowLandscapeLocked: (value: boolean) => void = () => {};
  onMixWithOthers: (value: boolean) => void = () => {};
  onRefreshAlgoDoubleTap: (value: boolean) => void = () => {};
  onColorMode: (value: string) => void = () => {};
  onPrimary: (value: string) => void = () => {};
  onSecondary: (value: string) => void = () => {};
  onTranslation: (value: boolean) => void = () => {};
  onRomaji: (value: boolean) => void = () => {};
  onScale: (value: number) => void = () => {};
  onOffset: (value: number) => void = () => {};
  onCheckUpdate: () => void = () => {};
  onDesktopLyrics: (value: boolean) => void = () => {};
  onDesktopLyricsLocked: (value: boolean) => void = () => {};
  onWallpaperMode: (value: boolean) => void = () => {};
  aboutToAppear(): void { this.primaryDraft = this.lyrics.primary; this.secondaryDraft = this.lyrics.secondary; this.offsetDraft = `${this.lyricOffset}`; }
  @Builder private title(value: string) { Text(value).fontSize(14).fontWeight(FontWeight.Medium).fontColor(MUTED).width('100%').padding({ top: 24, bottom: 10, left: 4 }) }
  @Builder private copy($$: SettingsCopy) {
    Column({ space: 5 }) { Text($$.title).fontSize(16).fontColor(TEXT).maxLines(2).width('100%'); if ($$.detail) { Text($$.detail).fontSize(12).fontColor(MUTED).maxLines(3).width('100%') } }.alignItems(HorizontalAlign.Start).layoutWeight(1)
  }
  @Builder private link($$: SettingsLink) {
    Row({ space: 12 }) { this.copy({ title: $$.title, detail: $$.detail }); Text($$.label ?? '›').fontSize(14).fontColor(MUTED).maxLines(1) }.width('100%').padding(18).onClick($$.action)
  }
  @Builder private toggle($$: SettingsToggle) {
    Row({ space: 12 }) { this.copy({ title: $$.title, detail: $$.detail }); MaterialToggle({ value: $$.value, label: $$.title, onChange: $$.action }) }.width('100%').padding(18)
  }
  @Builder private select($$: SettingsSelect) {
    Row({ space: 10 }) {
      this.copy({ title: $$.title, detail: $$.detail })
      MaterialSelect({ labels: $$.labels, values: $$.values, value: $$.current, label: $$.title, onChange: $$.action })
    }.width('100%').padding({ left: 18, right: 12, top: 12, bottom: 12 })
  }
  @Builder private main() {
    this.title('音乐源')
    Column() {
      this.link({ title: this.sources.find((source: SyncSourcePayload) => source.id === this.activeId)?.name ?? this.sources[0]?.name ?? '未添加音源', detail: `${this.sources.length} 个音源 · 当前使用`, action: this.onOpenSources })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
    this.title('播放')
    Column({ space: 1 }) {
      this.select({ title: '音质', detail: '播放和下载优先使用该档位', labels: ['标准 128k', '高品质 320k', '无损 flac'], values: ['128k', '320k', 'flac'], current: this.quality, action: this.onQuality })
      this.select({ title: '播放顺序', detail: '列表循环 / 单曲 / 随机 / 顺序', labels: ['列表循环', '单曲循环', '随机播放', '顺序播放'], values: ['列表循环', '单曲循环', '随机播放', '顺序播放'], current: this.mode, action: this.onMode })
      this.select({ title: 'MineRadio 动效', detail: '仅播放页生效，关闭后保留模糊封面与纯文字歌词', labels: MINE_RADIO_MODES.map((mode: MineRadioMode) => mode.label), values: MINE_RADIO_MODES.map((mode: MineRadioMode) => mode.id), current: this.styleName, action: this.onStyle })
      Column({ space: 8 }) {
        Row({ space: 10 }) {
          this.copy({ title: '播放页背景透明度', detail: '实时调节封面或自定义背景图的透明程度，所有动效模式生效' })
          Text(`${Math.round(this.stageBgOpacity * 100)}%`).fontSize(13).fontWeight(FontWeight.Medium).fontColor(ACCENT)
          if (Math.abs(this.stageBgOpacity - 0.78) > 0.005) {
            Button('恢复默认').height(28).fontSize(11).fontColor(TEXT).backgroundColor('#1E808898').borderRadius(14)
              .padding({ left: 10, right: 10 }).onClick(() => this.onStageBgOpacity(0.78))
          }
        }.width('100%')
        Slider({ value: Math.round(this.stageBgOpacity * 100), min: 0, max: 100, step: 1 })
          .width('100%').selectedColor(ACCENT).blockColor('#FFFFFF')
          .onChange((value: number) => this.onStageBgOpacity(Math.max(0, Math.min(1, value / 100))))
      }.width('100%').padding({ left: 18, right: 18, top: 14, bottom: 10 })
      Row({ space: 10 }) {
        this.copy({ title: '播放页自定义背景图', detail: this.stageBgCustom ? '已启用自定义背景图（所有播放页模式生效）' : '默认跟随当前歌曲专辑封面' })
        Row({ space: 8 }) {
          Button('选择图片').height(32).fontSize(12).fontColor('#081018').backgroundColor(ACCENT).borderRadius(16)
            .padding({ left: 12, right: 12 }).onClick(() => this.onPickStageBgImage())
          if (this.stageBgCustom) {
            Button('恢复默认').height(32).fontSize(12).fontColor(TEXT).backgroundColor('#1E808898').borderRadius(16)
              .padding({ left: 12, right: 12 }).onClick(() => this.onClearStageBgImage())
          }
        }
      }.width('100%').padding({ left: 18, right: 14, top: 14, bottom: 14 })
      this.toggle({ title: '旋转锁定时允许播放页横屏', detail: '开启后即使系统开启竖屏锁定，横置手机仍可进入沉浸横屏；关闭则跟随系统方向锁定', value: this.allowLandscapeLocked, action: this.onAllowLandscapeLocked })
      this.toggle({ title: '允许与其他应用同时播放', detail: '开启后与其他视频、游戏或导航等应用混音播放，互不打断', value: this.mixWithOthers, action: this.onMixWithOthers })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
    this.title('歌词')
    Column() {
      this.link({ title: '歌词设置', detail: '详情页字号、颜色、翻译／音译与时间偏移', action: () => this.onPanel('lyrics') })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
    if (this.isHarmonyPc) {
      this.title('桌面体验（鸿蒙 PC）')
      Column({ space: 1 }) {
        this.toggle({ title: '桌面歌词', detail: '在桌面悬浮置顶显示实时歌词与翻译，拖动可调整位置', value: this.desktopLyrics, action: this.onDesktopLyrics })
        this.toggle({ title: '锁定桌面歌词（鼠标穿透）', detail: '开启后桌面歌词不拦截点击，可在设置页随时解锁', value: this.desktopLyricsLocked, action: this.onDesktopLyricsLocked })
        this.toggle({ title: '沉浸壁纸模式', detail: '全屏无边框沉浸展示 MineRadio 3D 动效与歌词舞台', value: this.wallpaperMode, action: this.onWallpaperMode })
      }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
    }
    this.title('系统与互联')
    Column({ space: 1 }) {
      this.select({ title: '外观', detail: '全局配色，播放页背景随之调整', labels: ['深色', '浅色', '跟随系统'], values: ['dark', 'light', 'system'], current: this.appearance, action: this.onAppearance })
      this.toggle({ title: '启动时继续播放上次内容', detail: '默认关闭，保留歌曲和进度，打开软件保持暂停', value: this.resumeOnStartup, action: this.onResume })
      this.toggle({ title: '双击刷新同步重算推荐', detail: '双击首页左上角标题刷新时，同时重洗猜你喜欢与每日三十首推荐算法', value: this.refreshAlgoDoubleTap, action: this.onRefreshAlgoDoubleTap })
      this.toggle({ title: '同局域网自动同步歌单', detail: '发现同网络开启自动同步的手机/电脑时，歌单与喜欢变动自动合并同步', value: this.lanAutoSync, action: this.onLanAutoSync })
      this.link({ title: '局域网同步', detail: '手机、平板与电脑之间双向同步歌单、音源和设置', action: () => this.onPanel('sync'), label: '管理' })
      this.link({ title: '下载管理', detail: `${this.completedDownloads} 首已完成`, action: this.onDownloads, label: '查看' })
      if (PRODUCT_NAME.toString() !== 'store') {
        this.link({ title: 'HiCar', detail: this.carDetail, action: () => this.onPanel('car'), label: '详情' })
      }
      this.toggle({ title: '智感握姿', detail: '合并播控时，导航圆钮随握持换边', value: this.gripEnabled, action: this.onGrip })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
    this.title('关于')
    Column({ space: 1 }) {
      this.link({ title: 'LxMine', detail: 'LX 音源 · MineRadio 视觉 · 手机和平板同源界面', action: () => {}, label: VERSION_NAME })
      this.link({
        title: '检查更新',
        detail: PRODUCT_NAME.toString() === 'store'
          ? '检测 GitHub 最新版本并跳转华为应用市场邀请测试更新'
          : '自动通过国内加速镜像获取 GitHub 最新版 HAP 并保存到指定位置',
        action: this.onCheckUpdate,
        label: this.updateChecking ? '检测中…' : '检查'
      })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
  }
  @Builder private lyricPanel() {
    Column({ space: 14 }) {
      Text(this.previewText).fontSize(Math.round(22 * (this.lyrics.scale ?? 1))).fontWeight(FontWeight.Medium).fontColor(this.previewPrimary).maxLines(2).textAlign(TextAlign.Center)
      Row().width('70%').height(4).borderRadius(2).linearGradient({ angle: 90, colors: [[this.previewPrimary, 0], [this.previewSecondary, 1]] })
    }.width('100%').padding(24).backgroundColor('#151619').borderRadius(20)
    this.title('播放详情页歌词')
    Column({ space: 1 }) {
      this.select({ title: '颜色来源', detail: '封面取色或自定义；纯色／渐变', labels: ['封面取色 · 纯色', '封面取色 · 渐变', '自定义 · 纯色', '自定义 · 渐变'], values: ['cover-solid', 'cover-gradient', 'custom-solid', 'custom-gradient'], current: this.lyrics.colorMode, action: this.onColorMode })
      if (this.lyrics.colorMode.startsWith('custom')) {
        Row({ space: 12 }) {
          this.copy({ title: '主色', detail: '#RRGGBB' })
          Row().width(24).height(24).borderRadius(12).backgroundColor(this.lyrics.primary)
          TextInput({ text: this.primaryDraft, placeholder: '#7DD3FC' }).width(116).height(40).fontColor(TEXT).backgroundColor(Color.Transparent).onChange((value: string) => { this.primaryDraft = value; if (/^#[0-9a-f]{6}$/i.test(value)) this.onPrimary(value); })
        }.padding(18).width('100%')
        if (this.lyrics.colorMode.endsWith('gradient')) {
          Row({ space: 12 }) {
            this.copy({ title: '辅色', detail: '#RRGGBB' })
            Row().width(24).height(24).borderRadius(12).backgroundColor(this.lyrics.secondary)
            TextInput({ text: this.secondaryDraft, placeholder: '#A5B4FC' }).width(116).height(40).fontColor(TEXT).backgroundColor(Color.Transparent).onChange((value: string) => { this.secondaryDraft = value; if (/^#[0-9a-f]{6}$/i.test(value)) this.onSecondary(value); })
          }.padding(18).width('100%')
        }
      }
      Column({ space: 8 }) {
        Row() {
          this.copy({ title: '歌词字体大小', detail: '调节播放详情页歌词显示字号（75%–140%）' })
          Text(`${Math.round((this.lyrics.scale ?? 1) * 100)}%`).fontSize(13).fontColor(MUTED)
        }.width('100%')
        Slider({ value: Math.round((this.lyrics.scale ?? 1) * 100), min: 75, max: 140, step: 5 })
          .selectedColor(ACCENT).trackColor('#38FFFFFF').blockColor(TEXT)
          .onChange((value: number) => { this.onScale(Math.max(0.75, Math.min(1.4, value / 100))); })
      }.width('100%').padding(18)
      this.toggle({ title: '显示翻译', detail: '在主歌词下方显示中文等翻译歌词', value: this.lyrics.showTranslation, action: this.onTranslation })
      this.toggle({ title: '显示音译 / 罗马音', detail: '日韩等外语歌词显示音译或罗马音（数据源提供时）', value: this.lyrics.showRomaji, action: this.onRomaji })
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
    this.title('时间')
    Column({ space: 12 }) {
      Row({ space: 8 }) {
        this.copy({ title: '时间偏移', detail: '正值提前显示，负值延后显示' })
        TextInput({ text: this.offsetDraft, placeholder: '0' }).width(74).height(40).fontColor(TEXT).backgroundColor(Color.Transparent).onChange((value: string) => { this.offsetDraft = value; if (value.trim() && Number.isFinite(Number(value))) this.onOffset(Math.max(-10000, Math.min(10000, Math.round(Number(value))))); })
        Text('ms').fontSize(12).fontColor(MUTED)
        Button('重置').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontColor(ACCENT).backgroundColor(Color.Transparent).onClick(() => { this.offsetDraft = '0'; this.onOffset(0); })
      }.width('100%')
      Slider({ value: this.lyricOffset, min: -10000, max: 10000, step: 100 }).selectedColor(ACCENT).trackColor('#38FFFFFF').blockColor(TEXT).onChange((value: number, mode: SliderChangeMode) => { if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) { this.offsetDraft = `${value}`; this.onOffset(value); } })
    }.width('100%').padding(18).backgroundColor($r('app.color.card_surface')).borderRadius(20)
  }
  @Builder private syncPanel() {
    this.title('局域网同步')
    Text(this.lanSsid ? `本机 Wi‑Fi：${this.lanSsid}${this.lanLocalAddress ? ' · ' + this.lanLocalAddress : ''}` : `设备需连接同一局域网${this.lanLocalAddress ? '（本机 ' + this.lanLocalAddress + '）' : ''}`).fontSize(13).fontColor(MUTED).width('100%')
    Text('发送后由对方确认接收（包含「我喜欢的」与全部歌单）。若路由器开启广播隔离，可输入对端 IP:端口直连。').fontSize(13).fontColor(MUTED).width('100%').padding({ top: 8, bottom: 12 })
    Column({ space: 1 }) {
      this.toggle({ title: '同局域网自动同步歌单', detail: '双方均开启时，歌单和喜欢变动自动合并同步', value: this.lanAutoSync, action: this.onLanAutoSync })
      if (!this.devices.length) { Row({ space: 12 }) { LoadingProgress().width(22).height(22); Text('正在寻找附近的 LxMine…').fontSize(14).fontColor(MUTED) }.width('100%').padding(18) }
      ForEach(this.devices, (device: LanDevice) => { this.link({ title: device.name, detail: `${devicePlatformName(device.platform)} · ${device.address}:${device.port}${device.ssid ? ' · ' + device.ssid : ''}`, action: () => this.onSend(device), label: '发送' }) }, (device: LanDevice) => device.id)
      Row({ space: 8 }) {
        TextInput({ text: this.directTargetDraft, placeholder: '输入对端 IP:端口（如 192.168.1.10:51234）' })
          .layoutWeight(1).height(40).fontSize(13).fontColor(TEXT).placeholderColor(MUTED)
          .backgroundColor('#14FFFFFF').borderRadius(12)
          .onChange((value: string) => { this.directTargetDraft = value; })
        Button('直连发送').attributeModifier(musicButtonPress).height(38).padding({ left: 14, right: 14 })
          .fontSize(13).fontColor(ACCENT).backgroundColor('#2464D2FF').borderRadius(19)
          .enabled(!!this.directTargetDraft.trim())
          .onClick(() => this.onSendDirect(this.directTargetDraft.trim()))
      }.width('100%').padding(14)
    }.width('100%').backgroundColor($r('app.color.card_surface')).borderRadius(20)
    if (this.message) { Text(this.message).fontSize(13).fontColor(ACCENT).width('100%').padding({ top: 12 }) }
  }
  build() {
    Scroll(this.scroller) {
      Column({ space: 2 }) {
        if (this.panel === 'lyrics') { this.lyricPanel() }
        else if (this.panel === 'sync') { this.syncPanel() }
        else if (this.panel === 'car' && PRODUCT_NAME.toString() !== 'store') { this.title('HiCar'); Text(this.carDetail).fontSize(16).fontColor(TEXT); Text('连接检测与车机应用入口分别接入。普通版不会因检测到连接而自动进入车机应用列表。HiCar 兼容版请在车机应用尝鲜区添加“咪咕音乐”，打开后仍为 LxMine；兼容版不能与官方咪咕音乐共存。').fontSize(13).fontColor(MUTED).padding({ top: 16 }) }
        else { this.main() }
      }.width('100%').alignItems(HorizontalAlign.Start).padding({ top: this.contentTop + 12, bottom: 180 })
    }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring)
      .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.scroller.currentOffset().yOffset); })
  }
}
