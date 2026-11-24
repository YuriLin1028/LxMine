import { uiMaterial, curves } from '@kit.ArkUI';
import { TEXT, ACCENT, ON_ACCENT } from './Theme';
import { MATERIAL_PRESS_SCALE, EXQUISITE_PRESS_SCALE, musicMaterial, MaterialSurface, HdsExquisiteCapsule } from './MaterialControls';

// 华为音乐样式的首页快捷胶囊：点击滚动到对应板块，白色常驻为当前所在板块。
// 普通图标由深浅色资源切换描边，选中态使用浅色底和深色图标。
// 沉浸光感 + 拖拽形变依赖 MaterialSurface 宿主的 systemMaterial，必须保留：
// 材质层会向上伸 ~16vp，胶囊内容在标题区内下移 16vp（Index 侧宿主上移 16vp 补偿），
// 否则材质层被标题区上边界切成直线（历史教训，见 docs/MOBILE_PC_PARITY.md）。
interface ChipItem { label: string; anchor: string; icon: Resource; iconOn: Resource; }

const CHIPS: ChipItem[] = [
  { label: '新歌', anchor: 'newSongs', icon: $r('app.media.chip_music'), iconOn: $r('app.media.chip_music_on') },
  { label: '歌单', anchor: 'playlists', icon: $r('app.media.chip_library'), iconOn: $r('app.media.chip_library_on') },
  { label: '排行榜', anchor: 'charts', icon: $r('app.media.chip_queue'), iconOn: $r('app.media.chip_queue_on') },
  { label: '热门', anchor: 'hot', icon: $r('app.media.chip_play'), iconOn: $r('app.media.chip_play_on') },
  { label: '分类', anchor: 'category', icon: $r('app.media.chip_more'), iconOn: $r('app.media.chip_more_on') },
];

@Component
export struct HomeChips {
  @Prop active: string = 'banner';
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
  @State private barWidth: number = 0;
  @State private pressed: string = '';
  onChip: (anchor: string) => void = () => {};
  // 窄窗（平板小窗）放不下"图标+文字"时只留图标：5 枚胶囊 + 4 个 10vp 间距，
  // 每枚可用宽 <74vp 时文字必然溢出（排行榜 3 字 + 图标 + 内边距 ≈ 71vp）。
  private labelsHidden(): boolean { return this.barWidth > 0 && this.barWidth < 370; }
  private chipWidth(): number { return this.barWidth > 60 ? Math.floor((this.barWidth - 40) / 5) : 0; }
  build() {
    Column() {
      MaterialSurface({ surfaceHeight: 40 }) {
        Row({ space: 10 }) {
          ForEach(CHIPS, (chip: ChipItem) => {
            Stack({ alignContent: Alignment.Center }) {
              if (this.boostImmersive && chip.anchor !== this.active && this.chipWidth() > 24) {
                HdsExquisiteCapsule({ pillWidth: this.chipWidth(), pillHeight: 40 })
              }
              Button({ type: ButtonType.Capsule }) {
                Row({ space: 5 }) {
                  Image(chip.anchor === this.active ? chip.iconOn : chip.icon).width(16).height(16)
                    .fillColor(chip.anchor === this.active ? ON_ACCENT : TEXT)
                  if (!this.labelsHidden()) {
                    Text(chip.label).fontSize(14).maxLines(1).fontColor(chip.anchor === this.active ? ON_ACCENT : TEXT)
                  }
                }.justifyContent(FlexAlign.Center)
              }.width('100%').height(40).padding({ left: 4, right: 4 }).stateEffect(false)
                .fontColor(chip.anchor === this.active ? ON_ACCENT : TEXT)
                .backgroundColor(chip.anchor === this.active ? ACCENT : Color.Transparent)
                .systemMaterial((chip.anchor === this.active || this.boostImmersive) ? uiMaterial.Material.empty : musicMaterial())
                .onTouch((event: TouchEvent) => {
                  if (event.type === TouchType.Down) this.pressed = chip.anchor;
                  if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.pressed = '';
                })
                .onClick(() => this.onChip(chip.anchor))
            }
              .layoutWeight(1).height(40).clip(false)
              .scale({
                x: this.pressed === chip.anchor ? (this.boostImmersive ? EXQUISITE_PRESS_SCALE : MATERIAL_PRESS_SCALE) : 1,
                y: this.pressed === chip.anchor ? (this.boostImmersive ? EXQUISITE_PRESS_SCALE : MATERIAL_PRESS_SCALE) : 1
              })
              .animation(this.boostImmersive ? { curve: curves.springMotion(0.30, 0.72) } : { duration: 150, curve: Curve.EaseOut })
          }, (chip: ChipItem) => chip.anchor)
        }.width('100%').margin({ top: 16 })
      }
    }.width('100%').hitTestBehavior(HitTestMode.None)
      .onAreaChange((oldArea: Area, area: Area) => { this.barWidth = Number(area.width); })
  }
}
