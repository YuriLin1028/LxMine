import { musicButtonPress } from './MaterialControls';
import { TEXT, MUTED, ACCENT } from './Theme';

// 所有歌曲列表统一的头部动作：播放全部 + 排列；删除歌单只由歌单库详情传入。
@Component
export struct SongListTools {
  @Prop countText: string = '';
  @Prop disabled: boolean = false;
  @Prop showDelete: boolean = false;
  @Prop deleteLabel: string = '删除歌单';
  @Prop showEdit: boolean = false;
  @Prop showCustomCover: boolean = false;
  @Prop showBatchDownload: boolean = false;
  @Prop showCollect: boolean = false;
  @Prop collected: boolean = false;
  @Prop collectLabel: string = '收藏到曲库';
  onPlayAll: () => void = () => {};
  onSort: (mode: string) => void = () => {};
  onManual: () => void = () => {};
  onDelete: () => void = () => {};
  onRename: () => void = () => {};
  onCustomCover: () => void = () => {};
  onBatchDelete: () => void = () => {};
  onBatchDownload: () => void = () => {};
  onCollect: () => void = () => {};

  @Builder private sortMenu() {
    Menu() {
      MenuItem({ content: '添加顺序' }).onClick(() => this.onSort('added'))
      MenuItem({ content: '歌名首字母' }).onClick(() => this.onSort('name'))
      MenuItem({ content: '歌手名' }).onClick(() => this.onSort('artist'))
      MenuItem({ content: '专辑名首字' }).onClick(() => this.onSort('album'))
      // 等系统菜单完全收起后再开全屏排序层；直接在菜单项里开会被菜单的模态遮罩挡住触摸。
      MenuItem({ content: '自定义顺序（拖动）' }).onClick(() => { setTimeout(() => this.onManual(), 220); })
    }
  }

  @Builder private editMenu() {
    Menu() {
      MenuItem({ content: '重命名歌单' }).onClick(() => { setTimeout(() => this.onRename(), 220); })
      if (this.showCustomCover) {
        MenuItem({ content: '自定义封面' }).onClick(() => { setTimeout(() => this.onCustomCover(), 220); })
      }
      MenuItem({ content: '批量移除歌曲' }).enabled(!this.disabled).onClick(() => { setTimeout(() => this.onBatchDelete(), 220); })
      MenuItem({ content: '自定义歌曲顺序' }).enabled(!this.disabled).onClick(() => { setTimeout(() => this.onManual(), 220); })
      if (this.showDelete) {
        MenuItem({ content: '删除整个歌单' }).onClick(() => { setTimeout(() => this.onDelete(), 220); })
      }
    }
  }

  build() {
    Row({ space: 6 }) {
      Text(this.countText).fontSize(13).fontColor(MUTED).layoutWeight(1)
        .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
      Button('播放全部').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontSize(13).fontColor(ACCENT).backgroundColor(Color.Transparent)
        .enabled(!this.disabled).onClick(() => this.onPlayAll())
      if (this.showCollect) {
        Button(this.collected ? '已收藏' : this.collectLabel)
          .attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontSize(13)
          .fontColor(this.collected ? MUTED : ACCENT).backgroundColor(Color.Transparent)
          .enabled(!this.disabled).onClick(() => this.onCollect())
      }
      if (this.showBatchDownload) {
        Button('批量下载').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontSize(13).fontColor(ACCENT).backgroundColor(Color.Transparent)
          .enabled(!this.disabled).onClick(() => this.onBatchDownload())
      }
      Button('排列').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontSize(13).fontColor(ACCENT).backgroundColor(Color.Transparent)
        .bindMenu(this.sortMenu())
      if (this.showEdit) {
        Button('编辑').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontSize(13).fontColor(ACCENT).backgroundColor(Color.Transparent)
          .bindMenu(this.editMenu())
      } else {
        if (this.showCustomCover) {
          Button('封面').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontSize(13).fontColor(ACCENT).backgroundColor(Color.Transparent)
            .onClick(() => this.onCustomCover())
        }
        if (this.showDelete) {
          Button(this.deleteLabel).attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontSize(13).fontColor(MUTED).backgroundColor(Color.Transparent)
            .onClick(() => this.onDelete())
        }
      }
    }.width('100%').height(52)
  }
}
