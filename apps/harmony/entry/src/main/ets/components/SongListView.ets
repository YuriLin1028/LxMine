import { Song } from '../model/Song';
import { songKey } from '../services/MusicLibrary';
import { ArrayDataSource } from '../services/ArrayDataSource';
import { SongRow } from './SongRow';

@Component
export struct SongListView {
  @Prop @Watch('songsChanged') songs: Song[] = [];
  @Prop wide: boolean = false;
  @Prop selectedKey: string = '';
  @Prop contentTop: number = 0;
  @Prop contentBottom: number = 180;
  scroller: Scroller = new Scroller();
  @BuilderParam header: () => void = this.emptyHeader;
  likedSong: (song: Song) => boolean = () => false;
  onPlay: (song: Song, context: Song[]) => void = () => {};
  onLike: (song: Song) => void = () => {};
  onMore: (song: Song) => void = () => {};
  onDownload: (song: Song) => void = () => {};
  onScroll: (offset: number) => void = () => {};
  private source: ArrayDataSource<Song> = new ArrayDataSource<Song>([], (song: Song) => songKey(song));

  aboutToAppear(): void { this.songsChanged(); }
  private songsChanged(): void { this.source.reset(this.songs); }
  @Builder private emptyHeader() {}

  build() {
    List({ space: 2, scroller: this.scroller }) {
      this.header()
      LazyForEach(this.source, (song: Song, index: number) => {
        ListItem() {
          SongRow({ song, index, wide: this.wide, active: songKey(song) === this.selectedKey,
            liked: this.likedSong(song), onPlay: () => this.onPlay(song, this.songs),
            onLike: () => this.onLike(song), onMore: () => this.onMore(song),
            onDownload: () => this.onDownload(song) })
        }
      }, (song: Song) => songKey(song))
    }.width('100%').layoutWeight(1).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring)
      .contentStartOffset(this.contentTop).contentEndOffset(this.contentBottom)
      .onDidScroll((offset: number, state: ScrollState) => {
        if (state !== ScrollState.Idle) this.onScroll(this.scroller.currentOffset().yOffset);
      })
      .id('song-list-view')
  }
}
