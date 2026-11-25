import { LengthMetrics } from '@kit.ArkUI';
import { Song } from '../model/Song';
import { MusicPlaylist, songKey } from '../services/MusicLibrary';
import { FeedPlaylist } from '../services/HomeFeed';
import { TEXT, MUTED, ACCENT, sourceBadge } from './Theme';
import { SongRow } from './SongRow';
import { SongListTools } from './SongListTools';
import { SongOrderDialog } from './SongOrderDialog';
import { orderSongList } from '../services/SongOrder';

// Dedicated page behind every home section's 「更多」 entry. The home itself
// stays one row per section; this page is the only place that tiles content.
@Component
export struct FeedSectionPage {
  @Prop playlists: FeedPlaylist[] = [];
  @Prop songs: Song[] = [];
  @Prop localPlaylists: MusicPlaylist[] = [];
  @Prop wide: boolean = false;
  @Prop contentTop: number = 94;
  @Prop emptyText: string = '暂无内容';
  // 分类/相似等按需板块：数据仍在拉取时显示加载圈，而不是"暂无内容"。
  @Prop sectionLoading: boolean = false;
  scroller: Scroller = new Scroller();
  onOpenFeed: (item: FeedPlaylist) => void = () => {};
  onPlaySong: (song: Song, queue: Song[]) => void = () => {};
  onPlaySongs: (songs: Song[]) => void = () => {};
  @Prop statusInset: number = 28;
  @Prop bottomInset: number = 16;
  @Prop likedSignature: string = '';
  onOpenLocal: (playlist: MusicPlaylist) => void = () => {};
  onScroll: (offset: number) => void = () => {};
  // 歌曲行统一走标准 SongRow（与歌单详情一致），这些回调供其操作按钮使用。
  @Prop selectedKey: string = '';
  likedSong: (song: Song) => boolean = () => false;
  onLikeSong: (song: Song) => void = () => {};
  onAddToPlaylist: (song: Song) => void = () => {};
  onDownloadSong: (song: Song) => void = () => {};
  onPlayNextSong: (song: Song) => void = () => {};
  onBatchCollectSongs: (songs: Song[]) => void = () => {};
  onBatchDownloadSongs: (songs: Song[]) => void = () => {};
  @State private sortMode: string = 'added';
  @State private manualOrder: string[] = [];
  @State private orderOpen: boolean = false;
  @State private orderSongs: Song[] = [];
  private orderedSongs(): Song[] { return orderSongList(this.songs, this.sortMode, this.manualOrder); }
  private static readonly GRADS: string[][] = [
    ['#1E3A8A', '#38BDF8'], ['#0F6F5C', '#3FA796'], ['#312E81', '#818CF8'],
    ['#164E63', '#22D3EE'], ['#4C1D95', '#A78BFA'], ['#0C4A6E', '#60A5FA'],
  ];
  private gradFor(name: string): string[] {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return FeedSectionPage.GRADS[hash % FeedSectionPage.GRADS.length];
  }
  @Builder private feedCard(item: FeedPlaylist) {
    Column({ space: 8 }) {
      Stack({ alignContent: Alignment.TopEnd }) {
        Stack() {
          if (item.cover) {
            Image(item.cover).sourceSize({ width: 320, height: 320 }).autoResize(true).width('100%').height('100%').objectFit(ImageFit.Cover)
          } else {
            Column() {
              Text(item.name.slice(0, 1)).fontSize(40).fontWeight(FontWeight.Bold).fontColor('#F2F1F7')
            }.width('100%').height('100%').justifyContent(FlexAlign.Center)
             .linearGradient({ angle: 135, colors: [[this.gradFor(item.name)[0], 0], [this.gradFor(item.name)[1], 1]] })
          }
        }.width('100%').aspectRatio(1).borderRadius(16).clip(true).backgroundColor('#17191C')
        if (item.source && sourceBadge(item.source) !== null) {
          Image(sourceBadge(item.source)!).width(18).height(18).margin(5).borderRadius(9).clip(true)
        }
      }.width('100%')
      Text(item.name).fontSize(13).fontColor(TEXT).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
      Text(item.count > 0 ? `${item.count} 首` : '推荐内容').fontSize(10).fontColor(MUTED).width('100%')
    }.width(this.wide ? '23%' : '47%').alignItems(HorizontalAlign.Start).borderRadius(16).hoverEffect(HoverEffect.Highlight).onClick(() => this.onOpenFeed(item))
  }
  @Builder private songRow(song: Song) {
    // 标准歌曲行：搜索、歌单详情、板块详情共用同一组件，禁止自造列表样式。
    SongRow({ song, index: 0, wide: this.wide, showPlayNext: true,
      active: !!this.selectedKey && this.selectedKey === songKey(song),
      liked: this.likedSong(song),
      onPlay: () => this.onPlaySong(song, this.orderedSongs()),
      onPlayNext: () => this.onPlayNextSong(song),
      onLike: () => this.onLikeSong(song),
      onMore: () => this.onAddToPlaylist(song),
      onDownload: () => this.onDownloadSong(song) })
  }
  @Builder private localCard(playlist: MusicPlaylist) {
    Column({ space: 8 }) {
      Stack() {
        if (playlist.isFavorite) {
          Image($r('app.media.ic_heart_fill')).width(34).height(34)
        } else {
          Image($r('app.media.ic_music')).width(34).height(34).fillColor(ACCENT)
        }
        if (playlist.customCover) {
          Image(playlist.customCover).sourceSize({ width: 320, height: 320 }).autoResize(true).width('100%').height('100%').objectFit(ImageFit.Cover)
        } else if ((playlist.songs ?? []).some((s: Song) => s.coverUrl.length > 0)) {
          Image((playlist.songs ?? []).find((s: Song) => s.coverUrl.length > 0)!.coverUrl).sourceSize({ width: 320, height: 320 }).autoResize(true).width('100%').height('100%').objectFit(ImageFit.Cover)
        }
      }.width('100%').aspectRatio(1).borderRadius(14).clip(true).backgroundColor('#17191C')
      Text(playlist.name).fontSize(13).fontColor(TEXT).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
      Text(`${playlist.songs?.length ?? playlist.songIds?.length ?? 0} 首歌曲`).fontSize(10).fontColor(MUTED).width('100%')
    }.width(this.wide ? '23%' : '47%').alignItems(HorizontalAlign.Start).borderRadius(14).hoverEffect(HoverEffect.Highlight).onClick(() => this.onOpenLocal(playlist))
  }
  build() {
    Stack() {
    Scroll(this.scroller) {
      Row() {
      Column({ space: 20 }) {
        if (this.songs.length) {
          SongListTools({ countText: `${this.songs.length} 首歌曲`,
            wide: this.wide, showBatchCollect: true, showBatchDownload: true,
            onPlayAll: () => { const list = this.orderedSongs(); if (list.length) this.onPlaySongs(list); },
            onSort: (mode: string) => { this.sortMode = mode; },
            onManual: () => { this.orderSongs = this.orderedSongs(); this.orderOpen = true; },
            onBatchCollect: () => { const list = this.orderedSongs(); if (list.length) this.onBatchCollectSongs(list); },
            onBatchDownload: () => { const list = this.orderedSongs(); if (list.length) this.onBatchDownloadSongs(list); } })
          Column({ space: 8 }) {
            ForEach(this.orderedSongs(), (song: Song) => { this.songRow(song) }, (song: Song) => `${song.source}:${song.id}|${song.coverUrl ?? ''}`)
          }.width('100%')
        }
        if (this.playlists.length) {
          Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween, space: { main: LengthMetrics.vp(10), cross: LengthMetrics.vp(18) } }) {
            ForEach(this.playlists, (item: FeedPlaylist) => { this.feedCard(item) }, (item: FeedPlaylist) => `${item.id}|${item.cover ?? ''}|${item.count}`)
          }.width('100%')
        }
        if (this.localPlaylists.length) {
          Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween, space: { main: LengthMetrics.vp(10), cross: LengthMetrics.vp(18) } }) {
            ForEach(this.localPlaylists, (playlist: MusicPlaylist) => { this.localCard(playlist) }, (playlist: MusicPlaylist) => playlist.id)
          }.width('100%')
        }
        if (!this.songs.length && !this.playlists.length && !this.localPlaylists.length) {
          if (this.sectionLoading) {
            Row({ space: 10 }) {
              LoadingProgress().width(30).height(30).color(ACCENT)
              Text('正在载入板块内容…').fontSize(14).fontColor(MUTED)
            }.width('100%').justifyContent(FlexAlign.Center).padding({ top: 120 })
          } else {
            Text(this.emptyText).fontSize(14).fontColor(MUTED).width('100%').textAlign(TextAlign.Center).padding({ top: 120 })
          }
        }
      }.width('100%').constraintSize({ maxWidth: 1000 }).padding({ left: this.wide ? 32 : 20, right: this.wide ? 32 : 20, top: this.contentTop + 16, bottom: 180 }).alignItems(HorizontalAlign.Start)
      }.width('100%').justifyContent(FlexAlign.Center).alignItems(VerticalAlign.Top)
    }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
      .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.scroller.currentOffset().yOffset); })
      if (this.orderOpen) {
        SongOrderDialog({ songs: this.orderSongs, wide: this.wide, statusInset: this.statusInset, bottomInset: this.bottomInset,
          onCancel: () => { this.orderOpen = false; },
          onDone: (keys: string[]) => { this.manualOrder = keys; this.sortMode = 'manual'; this.orderOpen = false; } })
      }
    }.width('100%').height('100%')
  }
}
