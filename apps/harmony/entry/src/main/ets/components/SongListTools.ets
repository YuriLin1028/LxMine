import { musicButtonPress } from './MaterialControls';
import { TEXT, MUTED } from './Theme';

// 所有歌曲列表统一的头部动作：播放全部 + 排列；删除歌单只由歌单库详情传入。
@Component
export struct SongListTools {
  @Prop countText: string = '';
  @Prop disabled: boolean = false;
  @Prop showDelete: boolean = false;
  onPlayAll: () => void = () => {};
  onSort: (mode: string) => void = () => {};
  onManual: () => void = () => {};
  onDelete: () => void = () => {};

  @Builder private sortMenu() {
    Menu() {
      MenuItem({ content: '添加顺序' }).onClick(() => this.onSort('added'))
      MenuItem({ content: '歌名首字母' }).onClick(() => this.onSort('name'))
      MenuItem({ content: '歌手名' }).onClick(() => this.onSort('artist'))
      MenuItem({ content: '专辑名首字' }).onClick(() => this.onSort('album'))
      // 等系统菜单完全收起后再开全屏排序层；直接在菜单项里开会被菜单的模态遮罩挡住触摸。
      MenuItem({ content: '手动排列' }).onClick(() => { setTimeout(() => this.onManual(), 220); })
    }
  }

  build() {
    Row({ space: 8 }) {
      Text(this.countText).fontSize(13).fontColor(MUTED).layoutWeight(1)
        .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
      Button('播放全部').attributeModifier(musicButtonPress).fontSize(13).fontColor(TEXT).backgroundColor(Color.Transparent)
        .buttonStyle(ButtonStyleMode.TEXTUAL).enabled(!this.disabled).onClick(() => this.onPlayAll())
      Button('排列').attributeModifier(musicButtonPress).fontSize(13).fontColor(TEXT).backgroundColor(Color.Transparent)
        .buttonStyle(ButtonStyleMode.TEXTUAL).bindMenu(this.sortMenu())
      if (this.showDelete) {
        Button('删除歌单').attributeModifier(musicButtonPress).fontSize(13).fontColor(MUTED).backgroundColor(Color.Transparent)
          .buttonStyle(ButtonStyleMode.TEXTUAL).onClick(() => this.onDelete())
      }
    }.width('100%').height(52)
  }
}
