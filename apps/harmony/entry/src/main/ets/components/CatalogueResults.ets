import { musicButtonPress } from './MaterialControls';
import { CatalogueEntity } from '../services/CatalogueApi';
import { ArrayDataSource } from '../services/ArrayDataSource';
import { TEXT, MUTED } from './Theme';
import { MaterialIcon } from './MaterialControls';
@Component
export struct CatalogueResults {
  @Prop @Watch('itemsChanged') items: CatalogueEntity[] = [];
  @Prop contentTop: number = 190;
  @Prop hasMore: boolean = false;
  @Prop loading: boolean = false;
  scroller: Scroller = new Scroller();
  onOpen: (item: CatalogueEntity) => void = () => {};
  onDownload: (item: CatalogueEntity) => void = () => {};
  onMore: () => void = () => {};
  onScroll: (offset: number) => void = () => {};
  private source: ArrayDataSource<CatalogueEntity> = new ArrayDataSource<CatalogueEntity>([],
    (item: CatalogueEntity) => `${item.source}:${item.kind}:${item.id}`);
  aboutToAppear(): void { this.itemsChanged(); }
  private itemsChanged(): void { this.source.reset(this.items); }
  build() {
    List({ space: 8, scroller: this.scroller }) {
      LazyForEach(this.source, (item: CatalogueEntity) => {
        ListItem() {
          Row({ space: 14 }) {
            Stack() {
              SymbolGlyph($r('sys.symbol.music_note_list')).fontSize(24).fontColor([MUTED])
              if (item.cover) { Image(item.cover).width('100%').height('100%').objectFit(ImageFit.Cover) }
            }.width(58).height(58).borderRadius(12).clip(true).backgroundColor('#151719')
            Column({ space: 6 }) {
              Text(item.name).fontSize(16).fontColor(TEXT).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
              Text(item.artist || (item.kind === 'songlist' ? `${item.count ?? 0} 首歌曲` : '')).fontSize(12).fontColor(MUTED).maxLines(1)
            }.layoutWeight(1).alignItems(HorizontalAlign.Start)
            if (item.song) { MaterialIcon({ icon: $r('app.media.ic_download'), label: '下载歌曲', grouped: true, action: () => this.onDownload(item) }) }
            Text(item.kind === 'songlist' ? '导入' : item.song ? '播放' : '查看').fontSize(13).fontColor(MUTED)
          }.width('100%').padding({ top: 12, bottom: 12 }).onClick(() => this.onOpen(item))
        }
      }, (item: CatalogueEntity) => `${item.source}:${item.kind}:${item.id}`)
      if (this.hasMore) { ListItem() { Button(this.loading ? '加载中…' : '加载更多').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontColor(TEXT).backgroundColor(Color.Transparent).enabled(!this.loading).onClick(() => this.onMore()) } }
    }.width('100%').height('100%').contentStartOffset(this.contentTop).contentEndOffset(180).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring)
      .onDidScroll((offset: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.scroller.currentOffset().yOffset); })
  }
}
