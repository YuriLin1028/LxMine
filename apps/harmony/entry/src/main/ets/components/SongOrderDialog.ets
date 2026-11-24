import { ON_ACCENT, TEXT, MUTED, ACCENT } from './Theme';
import { musicButtonPress } from './MaterialControls';
import { Song } from '../model/Song';
import { songKey } from '../services/MusicLibrary';

// 手动排列：长按并拖动条目排序（手指/鼠标均可），确认后把顺序写回当前列表。
@Component
export struct SongOrderDialog {
  @Prop songs: Song[] = [];
  @Prop title: string = '手动排列';
  @Prop wide: boolean = false;
  @Prop statusInset: number = 28;
  @Prop bottomInset: number = 16;
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
  onCancel: () => void = () => {};
  onDone: (keys: string[]) => void = () => {};
  @State private order: Song[] = [];
  @State private dragName: string = '';

  aboutToAppear(): void { this.order = this.songs.slice(); }

  @Builder private orderPreview() {
    Row({ space: 8 }) {
      Text('≡').fontSize(16).fontColor(MUTED)
      Text(this.dragName).fontSize(13).fontColor(TEXT).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
    }.width(240).height(46).padding({ left: 14, right: 14 })
      .backgroundColor('#F0202226').borderRadius(14).border({ width: 1, color: '#33FFFFFF' })
  }

  build() {
    Column({ space: 12 }) {
      Row() {
        Column({ space: 3 }) {
          Text(this.title).fontSize(22).fontWeight(FontWeight.Bold).fontColor(TEXT)
          Text('长按歌曲并拖动，松手即可调整顺序').fontSize(12).fontColor(MUTED)
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        Button('关闭').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontColor(MUTED)
          .onClick(() => this.onCancel())
      }.width('100%')
      List({ space: 2 }) {
        ForEach(this.order, (song: Song, index: number) => {
          ListItem() {
            Row({ space: 10 }) {
              Text(`${index + 1}`.padStart(2, '0')).fontSize(11).fontColor(MUTED).width(22)
              Column({ space: 2 }) {
                Text(song.name).fontSize(13).fontColor(TEXT).maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
                Text(song.singer).fontSize(10).fontColor(MUTED).maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
              }.alignItems(HorizontalAlign.Start).layoutWeight(1)
              // 拖动手柄；拖动整个条目也可。
              Text('≡').fontSize(18).fontColor(MUTED).width(28).textAlign(TextAlign.Center)
            }.width('100%').padding({ top: 7, bottom: 7, left: 4, right: 4 })
          }
        }, (song: Song, index: number) => songKey(song) + ':' + index)
      }.width('100%').layoutWeight(1).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
        .editMode(true)
        .onItemDragStart((event: ItemDragInfo, itemIndex: number) => {
          this.dragName = this.order[itemIndex]?.name ?? '';
          return this.orderPreview;
        })
        .onItemDrop((event: ItemDragInfo, itemIndex: number, insertIndex: number, isSuccess: boolean) => {
          if (!isSuccess || insertIndex < 0) return;
          const next = this.order.slice();
          const moved = next.splice(itemIndex, 1)[0];
          next.splice(Math.min(insertIndex, next.length), 0, moved);
          this.order = next;
        })
      Row({ space: 12 }) {
        Blank()
        Button('取消').attributeModifier(musicButtonPress).height(40).padding({ left: 18, right: 18 }).fontSize(13).fontColor(TEXT)
          .backgroundColor('#14FFFFFF').borderRadius(20).onClick(() => this.onCancel())
        Button('完成').attributeModifier(musicButtonPress).height(40).padding({ left: 20, right: 20 }).fontSize(13).fontColor(ON_ACCENT)
          .backgroundColor(ACCENT).borderRadius(20)
          .onClick(() => this.onDone(this.order.map((song: Song) => songKey(song))))
      }.width('100%')
    }.width('100%').height('100%').padding({ left: 22, right: 22, top: 20, bottom: 24 })
  }
}
