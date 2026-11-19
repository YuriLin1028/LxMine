import { musicButtonPress } from './MaterialControls';
import { MusicDownload } from '../services/MusicDownloads';
import { Song } from '../model/Song';
import { TEXT, MUTED, ACCENT } from './Theme';
@Component
export struct DownloadsView {
  @Prop items: MusicDownload[] = [];
  @Prop contentTop: number = 82;
  onPlay: (song: Song) => void = () => {};
  onCancel: (id: string) => void = () => {};
  onExport: (item: MusicDownload) => void = () => {};
  scroller: Scroller = new Scroller();
  onScroll: (offset: number) => void = () => {};
  build() {
    Scroll(this.scroller) {
      Column({ space: 14 }) {
        if (!this.items.length) { Text('下载的音乐会保存在这里').fontSize(17).fontColor(MUTED).padding(24) }
        ForEach(this.items, (item: MusicDownload) => {
          Column({ space: 10 }) {
            Row({ space: 14 }) {
              SymbolGlyph($r('sys.symbol.arrow_down_circle')).fontSize(26).fontColor([item.state === 'complete' ? ACCENT : MUTED])
              Column({ space: 5 }) {
                Text(item.song.name).fontSize(16).fontColor(TEXT).maxLines(1).width('100%')
                Text(item.state === 'complete' ? item.exportError || (item.exported ? `已保存到系统所选位置 · ${item.quality}` : `已下载 · ${item.quality} · 可另存到系统`) : item.state === 'downloading' ? `${(item.received / 1048576).toFixed(1)} MB${item.total > 0 ? ' / ' + (item.total / 1048576).toFixed(1) + ' MB' : ''}` : item.error)
                  .fontSize(12).fontColor(MUTED).maxLines(2).width('100%')
              }.layoutWeight(1).alignItems(HorizontalAlign.Start)
              if (item.state === 'downloading') { Button('取消').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).backgroundColor(Color.Transparent).fontColor(ACCENT).onClick(() => this.onCancel(item.id)) }
              if (item.state === 'complete') { Button('另存为').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).backgroundColor(Color.Transparent).fontColor(ACCENT).onClick(() => this.onExport(item)) }
            }.width('100%')
            if (item.state === 'downloading') { Progress({ value: item.received, total: Math.max(1, item.total), type: ProgressType.Linear }).width('100%').color(ACCENT) }
          }.width('100%').padding(16).borderRadius(18).backgroundColor($r('app.color.card_surface')).onClick(() => { if (item.state === 'complete') this.onPlay(item.song); })
        }, (item: MusicDownload) => item.id)
      }.width('100%').padding({ top: this.contentTop + 12, bottom: 180 })
    }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off)
      .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.scroller.currentOffset().yOffset); })
  }
}
