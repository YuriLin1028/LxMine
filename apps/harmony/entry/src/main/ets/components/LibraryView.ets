import { Song } from '../model/Song';
import { MusicPlaylist } from '../services/MusicLibrary';
import { TEXT, MUTED, ACCENT } from './Theme';

interface LibraryTile {
  kind: string;
  id: string;
  name: string;
  count: string;
  detail: string;
  cover: string;
  iconKind: string;
}

interface MosaicSlot {
  tile: LibraryTile;
  x: number;
  y: number;
  w: number;
  h: number;
}

// 歌单库：时刻/相册式随机方块拼贴。只固定 12vp 卡片间距与 20/32vp 窗口边距；
// 卡片按 span（1–2 列 / 1–2 行）随机占位，尺寸与比例自然变化。
@Component
export struct LibraryView {
  @Prop @Watch('rebuildMosaic') recentSongs: Song[] = [];
  @Prop @Watch('rebuildMosaic') playlists: MusicPlaylist[] = [];
  @Prop @Watch('rebuildMosaic') wide: boolean = false;
  @Prop @Watch('rebuildMosaic') availableWidth: number = 400;
  @Prop @Watch('rebuildMosaic') mosaicSeed: number = 0;
  @Prop @Watch('rebuildMosaic') localCount: number = 0;
  @Prop @Watch('rebuildMosaic') localCover: string = '';
  @Prop contentTop: number = 82;
  scroller: Scroller = new Scroller();
  onOpen: (playlist: MusicPlaylist) => void = () => {};
  onLocal: () => void = () => {};
  onImport: () => void = () => {};
  onCreate: () => void = () => {};
  onScroll: (offset: number) => void = () => {};
  @State private slots: MosaicSlot[] = [];
  @State private mosaicHeight: number = 0;
  private gap: number = 12;

  aboutToAppear(): void { this.rebuildMosaic(); }
  private inset(): number { return this.wide ? 32 : 20; }
  private contentWidth(): number { return Math.max(240, this.availableWidth - this.inset() * 2); }
  private columns(): number { return this.contentWidth() >= 620 ? 4 : 2; }
  private cell(): number { return (this.contentWidth() - (this.columns() - 1) * this.gap) / this.columns(); }
  private baseRow(): number { return this.cell() * 0.78; }

  private tiles(): LibraryTile[] {
    const out: LibraryTile[] = [];
    let favorite: MusicPlaylist | null = null;
    for (const playlist of this.playlists) {
      if (playlist.isFavorite) { favorite = playlist; break; }
    }
    if (favorite) {
      out.push({ kind: 'playlist', id: favorite.id, name: favorite.name,
        count: `${favorite.songs?.length ?? favorite.songIds?.length ?? 0} 首歌曲`,
        detail: '你收藏的歌曲', cover: favorite.songs?.[0]?.coverUrl ?? '', iconKind: 'heart' });
    }
    out.push({ kind: 'recent', id: 'recent-local', name: '最近播放',
      count: `${this.recentSongs.length} 首歌曲`, detail: '按最近播放时间排列',
      cover: this.recentSongs[0]?.coverUrl ?? '', iconKind: 'clock' });
    for (const playlist of this.playlists) {
      if (playlist.isFavorite) continue;
      const count = playlist.songs?.length ?? playlist.songIds?.length ?? 0;
      out.push({ kind: 'playlist', id: playlist.id, name: playlist.name,
        count: playlist.kind === 'lx' ? `${count} 首歌曲` : '本地文件歌单',
        detail: '歌单', cover: playlist.songs?.[0]?.coverUrl ?? '', iconKind: 'music' });
    }
    out.push({ kind: 'local', id: 'local-hm', name: '本地音乐',
      count: `${this.localCount} 首本地歌曲`, detail: '智能识别手机里的音频',
      cover: this.localCover, iconKind: 'music' });
    return out;
  }

  private spanFor(index: number, columns: number, total: number): number[] {
    // 4 张：2x2 + 2x1 + 1x1 + 1x1，四列/两列都能填满；
    // 其余用固定变化序列（6 张时四列正好填满 4x3），避免常见数量下的大空洞。
    const four: number[][] = [[2, 2], [2, 1], [1, 1], [1, 1]];
    const five: number[][] = [[2, 2], [2, 2], [2, 1], [1, 1], [1, 1]];
    const patterns: number[][] = [
      [2, 2], [1, 1], [1, 2], [2, 1], [1, 1], [2, 1],
      [1, 2], [1, 1], [2, 2], [1, 2], [2, 1], [1, 1]
    ];
    const pattern = total === 4 ? four[index] : total === 5 ? five[index] : patterns[index % patterns.length];
    return [Math.min(pattern[0], columns), pattern[1]];
  }

  private emptyRow(columns: number): boolean[] {
    const row: boolean[] = [];
    for (let i = 0; i < columns; i += 1) row.push(false);
    return row;
  }

  // 用持久化的 mosaicSeed 洗牌一次：首次随机决定哪张卡进大/小格，之后每次启动复用同一顺序。
  private shuffledTiles(tiles: LibraryTile[]): LibraryTile[] {
    const out = tiles.slice();
    let state = (this.mosaicSeed >>> 0) || 0x9E3779B9;
    const rand = (): number => {
      state = (state ^ (state << 13)) >>> 0;
      state = (state ^ (state >>> 17)) >>> 0;
      state = (state ^ (state << 5)) >>> 0;
      return state / 4294967296;
    };
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  private rebuildMosaic(): void {
    const tiles = this.shuffledTiles(this.tiles());
    const columns = this.columns();
    const cell = this.cell();
    const rowHeight = this.baseRow();
    const occupied: boolean[][] = [];
    const slots: MosaicSlot[] = [];
    let maxRow = 0;
    for (let i = 0; i < tiles.length; i += 1) {
      const tile = tiles[i];
      const span = this.spanFor(i, columns, tiles.length);
      const cs = span[0];
      const rs = span[1];
      let placed = false;
      for (let r = 0; !placed && r < 200; r += 1) {
        if (!occupied[r]) occupied[r] = this.emptyRow(columns);
        for (let c = 0; c <= columns - cs; c += 1) {
          let free = true;
          for (let rr = r; rr < r + rs && free; rr += 1) {
            if (!occupied[rr]) occupied[rr] = this.emptyRow(columns);
            for (let cc = c; cc < c + cs; cc += 1) {
              if (occupied[rr][cc]) { free = false; break; }
            }
          }
          if (!free) continue;
          for (let rr = r; rr < r + rs; rr += 1) {
            for (let cc = c; cc < c + cs; cc += 1) occupied[rr][cc] = true;
          }
          const w = cs * cell + (cs - 1) * this.gap;
          const h = rs * rowHeight + (rs - 1) * this.gap;
          slots.push({ tile, x: c * cell + c * this.gap, y: r * rowHeight + r * this.gap, w, h });
          if (r + rs > maxRow) maxRow = r + rs;
          placed = true;
          break;
        }
      }
    }
    this.slots = slots;
    this.mosaicHeight = maxRow > 0 ? maxRow * rowHeight + (maxRow - 1) * this.gap : 0;
  }

  private openTile(tile: LibraryTile): void {
    if (tile.kind === 'local') { this.onLocal(); return; }
    if (tile.kind === 'recent') {
      this.onOpen({ id: 'recent-local', name: '最近播放', kind: 'recent', songs: this.recentSongs, createdAt: 0, updatedAt: 0 });
      return;
    }
    const playlist = this.playlists.find((item: MusicPlaylist) => item.id === tile.id);
    if (playlist) this.onOpen(playlist);
  }

  private tileIcon(kind: string): Resource {
    if (kind === 'heart') return $r('sys.symbol.heart');
    if (kind === 'clock') return $r('sys.symbol.clock');
    return $r('sys.symbol.music_note_list');
  }

  private gradFor(name: string): string[] {
    const grads: string[][] = [
      ['#2E3A8C', '#6C4AB6'], ['#0F6F5C', '#3FA796'], ['#8C2E2E', '#C76B4A'],
      ['#3C5A99', '#7FA8E0'], ['#6A3A8C', '#B84AB6'], ['#8C6A1E', '#D9B24A']
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return grads[hash % grads.length];
  }

  @Builder private tileView(slot: MosaicSlot) {
    Stack({ alignContent: Alignment.TopStart }) {
      if (slot.tile.cover) {
        Image(slot.tile.cover).width('100%').height('100%').objectFit(ImageFit.Cover)
      } else {
        Column() { SymbolGlyph(this.tileIcon(slot.tile.iconKind)).fontSize(52).fontColor([ACCENT]) }
          .width('100%').height('100%').justifyContent(FlexAlign.Center)
          .linearGradient({ angle: 135, colors: [[this.gradFor(slot.tile.name)[0], 0], [this.gradFor(slot.tile.name)[1], 1]] })
      }
      Column().width('100%').height('100%')
        .linearGradient({ angle: 180, colors: [['#05070A00', 0.35], ['#CC05070A', 1]] })
      Column() {
        Row() {
          Blank()
          Text(slot.tile.count).fontSize(10).fontColor('#E8FFFFFF')
            .padding({ left: 8, right: 8, top: 3, bottom: 3 })
            .backgroundColor('#66000000').borderRadius(9).maxLines(1)
        }.width('100%')
        Blank()
        Column({ space: 3 }) {
          Text(slot.tile.name).fontSize(15).fontWeight(FontWeight.Medium).fontColor('#F4F4F4')
            .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
          Text(slot.tile.detail).fontSize(11).fontColor('#C9FFFFFF')
            .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
        }.alignItems(HorizontalAlign.Start).width('100%')
      }.width('100%').height('100%').padding(12)
    }.width(slot.w).height(slot.h).borderRadius(18).clip(true)
      .position({ x: slot.x, y: slot.y })
      .onClick(() => this.openTile(slot.tile))
  }

  build() {
    Scroll(this.scroller) {
      Column() {
        Stack({ alignContent: Alignment.TopStart }) {
          ForEach(this.slots, (slot: MosaicSlot) => {
            this.tileView(slot)
          }, (slot: MosaicSlot) => slot.tile.kind + ':' + slot.tile.id + ':' + slot.x + ':' + slot.y)
        }.width('100%').height(this.mosaicHeight)
      }.width('100%').padding({ top: this.contentTop + 12, bottom: 180 })
    }.width('100%').height('100%').scrollBar(BarState.Off)
      .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.scroller.currentOffset().yOffset); })
  }
}
