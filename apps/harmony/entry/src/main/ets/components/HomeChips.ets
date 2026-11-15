import { uiMaterial } from '@kit.ArkUI';
import { TEXT } from './Theme';
import { musicMaterial, MaterialSurface } from './MaterialControls';

// 华为音乐样式的首页快捷胶囊：点击滚动到对应板块，白色常驻为当前所在板块。
// 图标与 PC 端 svgIcon 同几何（chip_*.svg 双色烘焙：普通 #F4F4F4 / 激活 #08090B，
// Image 的 fillColor 无法给描边上色，所以不走染色）。
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
  @State private barWidth: number = 0;
  onChip: (anchor: string) => void = () => {};
  // 窄窗（平板小窗）放不下"图标+文字"时只留图标：5 枚胶囊 + 4 个 10vp 间距，
  // 每枚可用宽 <74vp 时文字必然溢出（排行榜 3 字 + 图标 + 内边距 ≈ 71vp）。
  private labelsHidden(): boolean { return this.barWidth > 0 && this.barWidth < 370; }
  build() {
    Column() {
      MaterialSurface({ surfaceHeight: 40 }) {
        Row({ space: 10 }) {
          ForEach(CHIPS, (chip: ChipItem) => {
            Button({ type: ButtonType.Capsule }) {
              Row({ space: 5 }) {
                Image(chip.anchor === this.active ? chip.iconOn : chip.icon).width(16).height(16)
                if (!this.labelsHidden()) {
                  Text(chip.label).fontSize(14).maxLines(1).fontColor(chip.anchor === this.active ? '#08090B' : TEXT)
                }
              }.justifyContent(FlexAlign.Center)
            }.layoutWeight(1).height(40).padding({ left: 4, right: 4 }).stateEffect(false)
              .fontColor(chip.anchor === this.active ? '#08090B' : TEXT)
              .backgroundColor(chip.anchor === this.active ? '#F2F1F7' : Color.Transparent)
              .systemMaterial(chip.anchor === this.active ? uiMaterial.Material.empty : musicMaterial())
              .onClick(() => this.onChip(chip.anchor))
          }, (chip: ChipItem) => chip.anchor)
        }.width('100%').margin({ top: 16 })
      }
    }.width('100%').hitTestBehavior(HitTestMode.None)
      .onAreaChange((oldArea: Area, area: Area) => { this.barWidth = Number(area.width); })
  }
}
