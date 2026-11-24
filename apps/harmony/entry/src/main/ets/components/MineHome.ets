import { Song } from '../model/Song';
import { MusicPlaylist, songKey } from '../services/MusicLibrary';
import { isHarmonyPc } from '../services/HarmonyPcWindowService';
import { FeedPlaylist, HomeFeed, FeedSection } from '../services/HomeFeed';
import { TEXT, MUTED, ACCENT, sourceBadge, formatPlayCount } from './Theme';
import { MaterialBall, MaterialIcon } from './MaterialControls';
import { SongRow } from './SongRow';
import { SongListTools } from './SongListTools';
import { SongOrderDialog } from './SongOrderDialog';
import { orderSongList } from '../services/SongOrder';
import { ArrayDataSource as RowSource } from '../services/ArrayDataSource';

// 横向卡片行按可视范围构建；首页一次有 10+ 行、每行最多 36 项，全量构建会明显掉帧。
interface CoverBadgeSpec { fallback: number; countText: string; name: string; }


@Component
export struct MineHome {
  @Prop song: Song | null = null;
  @Prop playlists: MusicPlaylist[] = [];
  @Prop wide: boolean = false;
  @Prop sourceCount: number = 0;
  @Prop contentTop: number = 148;
  @Prop feed: HomeFeed | null = null;
  @Prop platform: string = 'wy';
  onOpenFeed: (playlist: FeedPlaylist) => void = () => {};
  onPlayFeedSong: (song: Song, queue: Song[]) => void = () => {};
  onPlaySongs: (songs: Song[]) => void = () => {};
  @Prop statusInset: number = 28;
  @Prop bottomInset: number = 16;
  @Prop likedSignature: string = '';
  likedSong: (song: Song) => boolean = () => false;
  onLikeSong: (song: Song) => void = () => {};
  onAddToPlaylist: (song: Song) => void = () => {};
  onDownloadSong: (song: Song) => void = () => {};
  @Prop activeAnchor: string = 'banner';
  onChip: (anchor: string) => void = () => {};
  @Prop activeFeedId: string = '';
  @Prop playing: boolean = false;
  @Prop selectedKey: string = '';
  @Prop activePlaylistId: string = '';
  onPlayBanner: (playlist: FeedPlaylist) => void = () => {};
  scroller: Scroller = new Scroller();
  onSearch: () => void = () => {};
  onSources: () => void = () => {};
  onPlayer: () => void = () => {};
  onOpen: (playlist: MusicPlaylist) => void = () => {};
  onMore: (section: string, x: number, y: number, size: number) => void = () => {};
  onScroll: (offset: number) => void = () => {};
  // 滚动到达边缘（页底/页顶）时上报：页底判定不能用 maxScrollSeen 近似，
  // 否则首次下滑全程被当成页底，胶囊高亮失效。
  onEdge: (edge: Edge) => void = () => {};
  @State private newSongsSort: string = 'added';
  @State private newSongsManual: string[] = [];
  @State private newSongsOrderOpen: boolean = false;
  @State private newSongsOrderSongs: Song[] = [];
  private sortedNewSongs(): Song[] {
    return orderSongList(this.feed?.newSongs ?? [], this.newSongsSort, this.newSongsManual);
  }
  private openNewSongsOrder(): void {
    this.newSongsOrderSongs = this.sortedNewSongs();
    this.newSongsOrderOpen = true;
  }
  private openMore(section: string): void {
    let x = 0; let y = 0; let size = 36;
    try {
      const rect = this.getUIContext().getComponentUtils().getRectangleById('feed-more-' + section);
      x = rect.windowOffset.x; y = rect.windowOffset.y; size = rect.size.width;
    } catch (_) {}
    this.onMore(section, x, y, size);
  }
  private rowSources: Map<string, RowSource<Object>> = new Map();
  private rowSource(key: string, items: Object[]): RowSource<Object> {
    const existing = this.rowSources.get(key);
    if (existing) { existing.reset(items); return existing; }
    const created = new RowSource<Object>(items);
    this.rowSources.set(key, created);
    return created;
  }
  /** 平台角标：m 是距封面边缘的内缩，保证不出圆角；多平台融合的来源没有角标。 */
  @Builder private badge(source: string | undefined, diameter: number, m: number) {
    if (sourceBadge(source) !== null) {
      Image(sourceBadge(source)!).width(diameter).height(diameter).margin(m)
        .borderRadius(diameter / 2).clip(true)
    }
  }
  private static readonly GRADS: string[][] = [
    ['#1E3A8A', '#38BDF8'], ['#0F6F5C', '#3FA796'], ['#312E81', '#818CF8'],
    ['#164E63', '#22D3EE'], ['#4C1D95', '#A78BFA'], ['#1E293B', '#60A5FA'],
  ];
  private gradFor(name: string): string[] {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return MineHome.GRADS[hash % MineHome.GRADS.length];
  }
  @Builder private coverWithBadge(cover: string, radius: number, source: string | undefined, badgeSize: number, $$: CoverBadgeSpec) {
    Stack({ alignContent: Alignment.TopEnd }) {
      Stack({ alignContent: Alignment.BottomStart }) {
        if (cover) {
          Image(cover).sourceSize({ width: 320, height: 320 }).autoResize(true).width('100%').height('100%').objectFit(ImageFit.Cover)
        } else {
          Column() {
            Text($$.name.slice(0, 2)).fontSize($$.fallback * 0.7).fontWeight(FontWeight.Bold).fontColor('#F2F1F7')
          }.width('100%').height('100%').justifyContent(FlexAlign.Center)
           .linearGradient({ angle: 135, colors: [[this.gradFor($$.name)[0], 0], [this.gradFor($$.name)[1], 1]] })
        }
        if ($$.countText) {
          Row({ space: 3 }) {
            Image($r('app.media.ic_play')).width(11).height(11).fillColor(TEXT)
            Text($$.countText).fontSize(10).fontColor(TEXT).maxLines(1)
          }.padding({ left: 6, right: 7, top: 3, bottom: 3 }).margin(6)
            .borderRadius(11).backgroundColor('#66000000')
        }
      }.width('100%').aspectRatio(1).borderRadius(radius).clip(true).backgroundColor('#17191C')
      this.badge(source, badgeSize, badgeSize >= 20 ? 5 : 4)
    }.width('100%')
  }
  @Builder private sectionTitle(title: string, note: string = '', section: string = '') {
    Row({ space: 10 }) {
      Column({ space: 2 }) {
        Text(title).fontSize(21).fontWeight(FontWeight.Bold).fontColor(TEXT)
        if (note) { Text(note).fontSize(11).fontColor(MUTED).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }) }
      }.alignItems(HorizontalAlign.Start).layoutWeight(1)
      if (section) {
        MaterialBall({ icon: $r('app.media.ic_more'), label: title + '，更多', diameter: 36, componentId: 'feed-more-' + section, action: () => this.openMore(section) })
      }
    }.width('100%').padding({ left: this.bleed(), right: this.bleed() })
  }
  private bannerNote(item: FeedPlaylist): string {
    if (item.id === 'daily-30') {
      if (this.feed?.personalized) {
        return `为你定制 · 结合听歌口味 ${item.count} 首`;
      }
      const now = new Date();
      return `${now.getMonth() + 1}月${now.getDate()}日 · 融合推荐 ${item.count} 首`;
    }
    const plays = formatPlayCount(item.playCount);
    const parts: string[] = [];
    if (plays) parts.push(`${plays}次播放`);
    if (item.count > 0) parts.push(`${item.count} 首`);
    return parts.join(' · ') || '打开播放';
  }
  private bannerItems(): FeedPlaylist[] {
    const items: FeedPlaylist[] = [];
    if (this.feed?.daily) items.push(this.feed.daily);
    const chartPool = this.feed?.bannerCharts?.length ? this.feed.bannerCharts : (this.feed?.charts ?? []);
    for (const chart of chartPool) {
      if (items.length >= 6) break;
      items.push(chart);
    }
    return items;
  }
  /** 横向行出血：静止时左右留距，滑动时贴屏幕物理边缘；平板与手机同一套规则。 */
  private bleed(): number { return 20; }
  /** 华为音乐样式的头图：竖向长卡片并排（大融合榜单），角标只在单一来源时出现。 */
  @Builder private homeBanner(item: FeedPlaylist) {
    Stack({ alignContent: Alignment.TopEnd }) {
      Stack({ alignContent: Alignment.BottomStart }) {
        if (item.cover) {
          Image(item.cover).sourceSize({ width: 420, height: 420 }).autoResize(true).width('100%').height('100%').objectFit(ImageFit.Cover)
        } else {
          Column()
            .width('100%').height('100%')
            .linearGradient({ angle: 135, colors: [[this.gradFor(item.name)[0], 0], [this.gradFor(item.name)[1], 1]] })
        }
        Column().width('100%').height('100%')
          .linearGradient({ angle: 180, colors: [['#22000000', 0.3], ['#CC05070A', 1]] })
        Row({ space: 8 }) {
          Column({ space: 4 }) {
            Text(item.name).fontSize(18).fontWeight(FontWeight.Bold).fontColor('#F4F4F4').maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
            Text(this.bannerNote(item)).fontSize(11).fontColor('#B3FFFFFF').maxLines(1)
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          Row() {
            if (this.playing && (this.activeFeedId === item.id || this.activePlaylistId === 'feed-' + item.id)) {
              Image($r('app.media.ic_pause')).width(24).height(24).fillColor(ACCENT)
            } else {
              Image($r('app.media.ic_play')).width(24).height(24).fillColor(ACCENT)
            }
          }.justifyContent(FlexAlign.Center)
          // 播放键只管播放/暂停（ArkUI 点击不冒泡，不会触发卡片跳转）。
          .onClick(() => this.onPlayBanner(item))
        }.width('100%').padding(14)
      }.width('100%').height('100%').borderRadius(20).clip(true).backgroundColor('#17191C')
      this.badge(item.source, 22, 12)
    }.width('100%').height('100%').onClick(() => this.onOpenFeed(item))
  }
  @Builder private homeBannerRow() {
    List({ space: 12 }) {
      LazyForEach(this.rowSource('banner', this.bannerItems()), (item: Object) => {
        ListItem() { this.homeBanner(item as FeedPlaylist) }.width('46%')
      }, (item: Object) => { const p = item as FeedPlaylist; return `${p.id}|${p.cover ?? ''}|${p.count}`; })
    }.listDirection(Axis.Horizontal).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).cachedCount(3)
      .width('100%').height(238)
      .contentStartOffset(this.bleed()).contentEndOffset(this.bleed())
  }
  @Builder private songCardMenu(song: Song, queue: Song[]) {
    Menu() {
      MenuItem({ content: '立即播放' }).onClick(() => this.onPlayFeedSong(song, queue))
      MenuItem({ content: this.likedSong(song) ? '取消收藏' : '收藏' }).onClick(() => this.onLikeSong(song))
      MenuItem({ content: '添加到歌单' }).onClick(() => this.onAddToPlaylist(song))
      if (song.source !== 'local') {
        MenuItem({ content: '下载歌曲' }).onClick(() => this.onDownloadSong(song))
      }
    }
  }
  @Builder private feedPlaylistCard(item: FeedPlaylist) {
    Column({ space: 8 }) {
      this.coverWithBadge(item.cover ?? '', 16, item.source, 20,
        { fallback: 40, countText: formatPlayCount(item.playCount), name: item.name })
      Text(item.name).fontSize(13).fontColor(TEXT).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%').height(36)
    }.width(148).height(202).alignItems(HorizontalAlign.Start).borderRadius(16).hoverEffect(HoverEffect.Highlight).onClick(() => this.onOpenFeed(item))
  }
  @Builder private feedSongCard(song: Song, queue: Song[]) {
    Column({ space: 8 }) {
      this.coverWithBadge(song.coverUrl, 16, song.source, 20, { fallback: 36, countText: '', name: song.name })
      Text(song.name).fontSize(13).fontColor(TEXT).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%').height(18)
      Text(song.singer).fontSize(10).fontColor(MUTED).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%').height(14)
    }.width(140).height(190).alignItems(HorizontalAlign.Start).borderRadius(16).hoverEffect(HoverEffect.Highlight)
      .bindContextMenu(this.songCardMenu(song, queue), isHarmonyPc() ? ResponseType.RightClick : ResponseType.LongPress)
      .onClick(() => this.onPlayFeedSong(song, queue))
  }
  @Builder private feedSongLine(song: Song) {
    // 新歌速递行 = 标准 SongRow（与歌单详情/搜索一致），禁止自造列表样式。
    SongRow({ song, index: 0, wide: this.wide,
      active: this.playing && this.selectedKey === songKey(song),
      liked: this.likedSong(song),
      onPlay: () => this.onPlayFeedSong(song, this.sortedNewSongs()),
      onLike: () => this.onLikeSong(song),
      onMore: () => this.onAddToPlaylist(song),
      onDownload: () => this.onDownloadSong(song) })
  }
  @Builder private localPlaylistCard(playlist: MusicPlaylist) {
    Column({ space: 8 }) {
      Stack() {
        if (playlist.isFavorite) {
          Image($r('app.media.ic_heart_fill')).width(34).height(34)
        } else {
          Image($r('app.media.ic_music')).width(34).height(34).fillColor(ACCENT)
        }
        if (playlist.customCover) {
          Image(playlist.customCover).sourceSize({ width: 220, height: 220 }).autoResize(true).width('100%').height('100%').objectFit(ImageFit.Cover)
        } else if ((playlist.songs ?? []).some((s: Song) => s.coverUrl.length > 0)) {
          Image((playlist.songs ?? []).find((s: Song) => s.coverUrl.length > 0)!.coverUrl).sourceSize({ width: 220, height: 220 }).autoResize(true).width('100%').height('100%').objectFit(ImageFit.Cover)
        }
      }.width('100%').aspectRatio(1).borderRadius(14).clip(true).backgroundColor('#17191C')
      Text(playlist.name).fontSize(12).fontColor(TEXT).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%').height(16)
    }.width(108).height(132).alignItems(HorizontalAlign.Start).borderRadius(14).hoverEffect(HoverEffect.Highlight).onClick(() => this.onOpen(playlist))
  }
  @Builder private feedPlaylistRow(key: string, items: FeedPlaylist[]) {
    List({ space: 12 }) {
      LazyForEach(this.rowSource('p:' + key, items), (item: Object) => {
        ListItem() { this.feedPlaylistCard(item as FeedPlaylist) }
      }, (item: Object) => { const p = item as FeedPlaylist; return `${p.source ?? ''}:${p.id}|${p.cover ?? ''}`; })
    }.listDirection(Axis.Horizontal).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).cachedCount(3)
      .width('100%').height(216)
      .contentStartOffset(this.bleed()).contentEndOffset(this.bleed())
  }
  @Builder private feedSongCardRow(key: string, items: Song[]) {
    List({ space: 12 }) {
      LazyForEach(this.rowSource('s:' + key, items), (item: Object) => {
        ListItem() { this.feedSongCard(item as Song, items) }
      }, (item: Object) => { const song = item as Song; return `${song.source}:${song.id}|${song.coverUrl ?? ''}`; })
    }.listDirection(Axis.Horizontal).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).cachedCount(3)
      .width('100%').height(194)
      .contentStartOffset(this.bleed()).contentEndOffset(this.bleed())
  }

  build() {
    Stack({alignContent:Alignment.TopStart}) {
    Scroll(this.scroller) {
      Column({ space: 24 }) {
        if (!this.feed) {
          // 首页刷新（双击 LxMine 标题）时的载入提示，与 PC 端"正在载入"一致。
          Row({ space: 10 }) {
            LoadingProgress().width(26).height(26).color(ACCENT)
            Text('正在载入首页内容…').fontSize(14).fontColor(MUTED)
          }.width('100%').justifyContent(FlexAlign.Center).padding({ top: 140 })
        }
        if (this.bannerItems().length) {
          Column() {
            this.homeBannerRow()
          }.width('100%').id('section-banner')
        }

        if (this.feed && (this.feed.forYou?.length ?? 0) > 0) {
          Column({ space: 12 }) {
            this.sectionTitle('猜你喜欢', (this.feed.topArtists?.length ? '基于常听：' + this.feed.topArtists.slice(0, 3).join(' · ') : '根据你的听歌口味推荐'), 'forYou')
            this.feedSongCardRow('forYou', this.feed.forYou ?? [])
          }.width('100%').alignItems(HorizontalAlign.Start).id('section-forYou')
        }

        if (this.feed && this.feed.newSongs.length) {
          Column({ space: 10 }) {
            this.sectionTitle('新歌速递', '四平台新声同步汇聚', 'newSongs')
            SongListTools({ countText: `${this.feed.newSongs.length} 首歌曲`,
              onPlayAll: () => { const list = this.sortedNewSongs(); if (list.length) this.onPlaySongs(list); },
              onSort: (mode: string) => { this.newSongsSort = mode; },
              onManual: () => this.openNewSongsOrder() })
              .padding({ left: this.bleed(), right: this.bleed() })
            Column({ space: 2 }) {
              ForEach(this.sortedNewSongs().slice(0, 10), (song: Song) => { this.feedSongLine(song) }, (song: Song) => `${song.source}:${song.id}|${song.coverUrl ?? ''}`)
            }.width('100%').padding({ left: this.bleed(), right: this.bleed() })
          }.width('100%').alignItems(HorizontalAlign.Start).id('section-newSongs')
        }
        if(this.feed?.sections?.length){
          ForEach(this.feed.sections,(section:FeedSection)=>{
            Column({space:12}){
            if(section.kind==='playlist'){
              this.sectionTitle(section.title,'',section.id)
              if(section.items.length){this.feedPlaylistRow('sec-'+section.id, section.items)}
              else {Text(section.error??'平台暂无内容').fontColor(MUTED).fontSize(13)}
            }
            }.width('100%').alignItems(HorizontalAlign.Start).transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({x:12})))
              .id('section-' + section.id)
          },(section:FeedSection)=>section.id)
        }
        if (this.feed && this.feed.similar.length) {
          Column({ space: 12 }) {
            this.sectionTitle('相似推荐', this.song?.singer ?? '继续发现', 'similar')
            this.feedSongCardRow('similar', this.feed.similar)
          }.width('100%').id('section-similar')
        }

      }.width('100%').padding({ bottom: 180, top: this.contentTop + 64 }).alignItems(HorizontalAlign.Start)
    }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
      .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.scroller.currentOffset().yOffset); })
      .onScrollEdge((edge: Edge) => { this.onEdge(edge); })
      if (this.newSongsOrderOpen) {
        SongOrderDialog({ songs: this.newSongsOrderSongs, wide: this.wide, statusInset: this.statusInset, bottomInset: this.bottomInset,
          onCancel: () => { this.newSongsOrderOpen = false; },
          onDone: (keys: string[]) => { this.newSongsManual = keys; this.newSongsSort = 'manual'; this.newSongsOrderOpen = false; } })
      }
    }.width('100%').height('100%').clip(false)
  }
}
