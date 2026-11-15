import { Song } from '../model/Song';
import { songKey } from '../services/MusicLibrary';
import { SongRow } from './SongRow';
import { TEXT, MUTED } from './Theme';
import { SongListTools } from './SongListTools';

// 本地音乐页：右上角识别/导入由页面标题层提供；列表内提供搜索、播放全部与排序。
@Component
export struct LocalMusicView {
  @Prop songs: Song[] = [];
  @Prop wide: boolean = false;
  @Prop contentTop: number = 82;
  @Prop selectedKey: string = '';
  @Prop searchOpen: boolean = false;
  @Prop searchQuery: string = '';
  scroller: Scroller = new Scroller();
  onPlay: (song: Song) => void = () => {};
  onLike: (song: Song) => void = () => {};
  onMore: (song: Song) => void = () => {};
  onScroll: (offset: number) => void = () => {};
  likedSong: (song: Song) => boolean = () => false;
  onPlayAll: () => void = () => {};
  onSort: (mode: string) => void = () => {};
  onManualSort: () => void = () => {};
  onSearchChange: (value: string) => void = () => {};
  onSearchClose: () => void = () => {};

  @Builder private sortMenu() {
    Menu() {
      MenuItem({ content: '添加顺序' }).onClick(() => this.onSort('added'))
      MenuItem({ content: '歌名首字母' }).onClick(() => this.onSort('name'))
      MenuItem({ content: '歌手名' }).onClick(() => this.onSort('artist'))
      MenuItem({ content: '专辑名首字' }).onClick(() => this.onSort('album'))
      MenuItem({ content: '手动排列' }).onClick(() => setTimeout(() => this.onManualSort(), 220))
    }
  }

  build() {
    Scroll(this.scroller) {
      Column({ space: 10 }) {
        SongListTools({ countText: `${this.songs.length} 首本地歌曲`, disabled: !this.songs.length,
          onPlayAll: () => this.onPlayAll(),
          onSort: (mode: string) => this.onSort(mode),
          onManual: () => this.onManualSort() })
        if (this.searchOpen) {
          Row({ space: 8 }) {
            Image($r('app.media.ic_search')).width(18).height(18).opacity(0.7)
            TextInput({ text: this.searchQuery, placeholder: '搜索本列表' }).layoutWeight(1).height(40).fontSize(14)
              .fontColor(TEXT).placeholderColor(MUTED).backgroundColor(Color.Transparent).padding(0)
              .onChange((value: string) => this.onSearchChange(value))
            Text('取消').fontSize(13).fontColor(MUTED).padding({ left: 6, right: 2, top: 8, bottom: 8 })
              .onClick(() => this.onSearchClose())
          }.width('100%').height(44).padding({ left: 14, right: 14 })
            .backgroundColor('#0DFFFFFF').borderRadius(16).border({ width: 1, color: '#14FFFFFF' })
        }
        if (this.songs.length) {
          Column({ space: 2 }) {
            ForEach(this.songs, (song: Song, index: number) => {
              SongRow({ song, index, wide: this.wide, showDownload: false, hideDownload: true,
                active: this.selectedKey === songKey(song), liked: this.likedSong(song),
                onPlay: () => this.onPlay(song), onLike: () => this.onLike(song), onMore: () => this.onMore(song) })
            }, (song: Song) => songKey(song))
          }.width('100%')
        } else if (this.searchQuery.trim().length) {
          Column({ space: 8 }) {
            Text('没有匹配的本地歌曲').fontSize(14).fontColor(MUTED)
            Text('换个歌名、歌手或专辑试试').fontSize(12).fontColor(MUTED)
          }.width('100%').padding({ top: 44 })
        } else {
          Column({ space: 8 }) {
            Text('还没有本地音乐').fontSize(14).fontColor(MUTED)
            Text('点击右上角「智能识别」或「导入」添加手机里的音频').fontSize(12).fontColor(MUTED)
          }.width('100%').padding({ top: 44 })
        }
      }.width('100%').padding({ top: this.contentTop + 12, bottom: 180 })
    }.width('100%').height('100%').scrollBar(BarState.Off)
      .onDidScroll((x: number, y: number, state: ScrollState) => {
        if (state !== ScrollState.Idle) this.onScroll(this.scroller.currentOffset().yOffset);
      })
  }
}
