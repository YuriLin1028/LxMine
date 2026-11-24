import { Song } from '../model/Song';
import { songKey } from '../services/MusicLibrary';
import { ArrayDataSource } from '../services/ArrayDataSource';
import { SongRow } from './SongRow';

@Component
export struct SongListView {
  @Prop @Watch('songsChanged') songs: Song[] = [];
  @Prop @Watch('metaChanged') selectedKey: string = '';
  @Prop likedSignature: string = '';
  @Prop wide: boolean = false;
  @Prop contentTop: number = 0;
  @Prop contentBottom: number = 180;
  @Prop showRemove: boolean = false;
  @Prop showSwitchPlatform: boolean = false;
  @Prop removeLabel: string = '从歌单移除';
  scroller: Scroller = new Scroller();
  @BuilderParam header: () => void = this.emptyHeader;
  likedSong: (song: Song) => boolean = () => false;
  onPlay: (song: Song, context: Song[]) => void = () => {};
  onLike: (song: Song) => void = () => {};
  onMore: (song: Song) => void = () => {};
  onDownload: (song: Song) => void = () => {};
  onRemove: (song: Song) => void = () => {};
  onSwitchPlatform: (song: Song) => void = () => {};
  onScroll: (offset: number) => void = () => {};
  private source: ArrayDataSource<Song> = new ArrayDataSource<Song>([], (song: Song) => `${songKey(song)}|${song.coverUrl ?? ''}`);
  private prevSelectedKey: string = '';

  aboutToAppear(): void { this.prevSelectedKey = this.selectedKey; this.songsChanged(); }
  private songsChanged(): void { this.source.reset(this.songs); }
  private metaChanged(): void {
    const prev = this.prevSelectedKey;
    const next = this.selectedKey;
    this.prevSelectedKey = next;
    if (prev === next) return;
    for (let i = 0; i < this.songs.length; i += 1) {
      const k = songKey(this.songs[i]);
      if (k === prev || k === next) this.source.notifyChange(i);
    }
  }
  @Builder private emptyHeader() {}

  private itemKey(song: Song): string {
    return `${songKey(song)}|${song.coverUrl ?? ''}`;
  }

  build() {
    List({ space: 2, scroller: this.scroller }) {
      this.header()
      LazyForEach(this.source, (song: Song, index: number) => {
        ListItem() {
          SongRow({ song, index, wide: this.wide, active: songKey(song) === this.selectedKey,
            liked: this.likedSong(song), showRemove: this.showRemove, removeLabel: this.removeLabel,
            showSwitchPlatform: this.showSwitchPlatform,
            onPlay: () => this.onPlay(song, this.songs),
            onLike: () => this.onLike(song), onMore: () => this.onMore(song),
            onDownload: () => this.onDownload(song), onRemove: () => this.onRemove(song),
            onSwitchPlatform: () => this.onSwitchPlatform(song) })
        }
      }, (song: Song) => this.itemKey(song))
    }.width('100%').layoutWeight(1).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false).cachedCount(8)
      .contentStartOffset(this.contentTop).contentEndOffset(this.contentBottom)
      .onDidScroll((offset: number, state: ScrollState) => {
        if (state !== ScrollState.Idle) this.onScroll(this.scroller.currentOffset().yOffset);
      })
      .id('song-list-view')
  }
}
