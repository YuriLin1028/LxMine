import { ON_ACCENT, TEXT, MUTED, ACCENT } from './Theme';
import { musicButtonPress } from './MaterialControls';
import { Song } from '../model/Song';
import { MusicPlaylist, songKey } from '../services/MusicLibrary';

@Component
export struct BatchCollectSheet {
  @Prop title: string = '批量收藏歌曲';
  @Prop @Watch('resetCandidates') songs: Song[] = [];
  @Prop playlists: MusicPlaylist[] = [];
  @Prop wide: boolean = false;
  @Prop statusInset: number = 28;
  @Prop bottomInset: number = 16;
  onCancel: () => void = () => {};
  onConfirm: (selectedSongs: Song[], targetPlaylistId: string, newPlaylistName: string) => void = () => {};
  @State private candidates: Song[] = [];
  @State private selectedKeys: string[] = [];
  @State private selectedTargetId: string = '__favorite__';
  @State private newPlaylistName: string = '';

  aboutToAppear(): void {
    this.resetCandidates();
  }

  private resetCandidates(): void {
    const seen = new Set<string>();
    const list: Song[] = [];
    for (const s of this.songs) {
      if (!s) continue;
      const k = songKey(s);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      list.push(s);
    }
    this.candidates = list;
    this.selectedKeys = list.map((s: Song) => songKey(s));
    const fav = this.playlists.find((p: MusicPlaylist) => p.isFavorite);
    this.selectedTargetId = fav ? fav.id : '__favorite__';
  }

  private targetPlaylists(): MusicPlaylist[] {
    const fav = this.playlists.filter((p: MusicPlaylist) => p.isFavorite);
    const custom = this.playlists.filter((p: MusicPlaylist) => !p.isFavorite && p.kind === 'lx');
    return fav.concat(custom);
  }

  private currentTargetExistingKeys(): Set<string> {
    if (this.selectedTargetId === '__new__') return new Set<string>();
    const target = this.selectedTargetId === '__favorite__'
      ? this.playlists.find((p: MusicPlaylist) => p.isFavorite)
      : this.playlists.find((p: MusicPlaylist) => p.id === this.selectedTargetId);
    const set = new Set<string>();
    if (target) {
      for (const s of (target.songs ?? [])) set.add(songKey(s));
    }
    return set;
  }

  private currentTargetLabel(): string {
    if (this.selectedTargetId === '__new__') {
      const clean = this.newPlaylistName.trim();
      return clean ? clean : '新建歌单';
    }
    if (this.selectedTargetId === '__favorite__') return '我的收藏';
    const found = this.playlists.find((p: MusicPlaylist) => p.id === this.selectedTargetId);
    return found ? (found.isFavorite ? '我的收藏' : found.name) : '我的收藏';
  }

  private isSelected(song: Song): boolean {
    return this.selectedKeys.includes(songKey(song));
  }

  private toggleSong(song: Song): void {
    const key = songKey(song);
    if (this.selectedKeys.includes(key)) {
      this.selectedKeys = this.selectedKeys.filter((item: string) => item !== key);
    } else {
      this.selectedKeys = this.selectedKeys.concat([key]);
    }
  }

  private toggleAll(): void {
    if (this.candidates.length > 0 && this.selectedKeys.length === this.candidates.length) {
      this.selectedKeys = [];
    } else {
      this.selectedKeys = this.candidates.map((s: Song) => songKey(s));
    }
  }

  private invertSelection(): void {
    const current = new Set<string>(this.selectedKeys);
    this.selectedKeys = this.candidates.map((s: Song) => songKey(s)).filter((k: string) => !current.has(k));
  }

  private canSubmit(): boolean {
    if (!this.selectedKeys.length) return false;
    if (this.selectedTargetId === '__new__' && !this.newPlaylistName.trim()) return false;
    return true;
  }

  private submit(): void {
    if (!this.canSubmit()) return;
    const set = new Set<string>(this.selectedKeys);
    const chosen = this.candidates.filter((s: Song) => set.has(songKey(s)));
    if (chosen.length) {
      this.onConfirm(chosen, this.selectedTargetId, this.newPlaylistName.trim());
    }
  }

  @Builder private targetChip(id: string, label: string) {
    Button(label)
      .attributeModifier(musicButtonPress)
      .height(32)
      .padding({ left: 13, right: 13 })
      .fontSize(12)
      .fontWeight(this.selectedTargetId === id ? FontWeight.Medium : FontWeight.Normal)
      .fontColor(this.selectedTargetId === id ? ON_ACCENT : TEXT)
      .backgroundColor(this.selectedTargetId === id ? ACCENT : $r('app.color.card_surface'))
      .borderRadius(16)
      .onClick(() => { this.selectedTargetId = id; })
  }

  build() {
    Column({ space: 12 }) {
      Row() {
        Column({ space: 3 }) {
          Text(this.title).fontSize(22).fontWeight(FontWeight.Bold).fontColor(TEXT)
          Text('选择目标歌单并勾选需要收藏的歌曲，重复曲目会自动去重').fontSize(12).fontColor(MUTED)
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        Button('关闭').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontColor(MUTED)
          .onClick(() => this.onCancel())
      }.width('100%')

      Column({ space: 8 }) {
        Text('添加到目标歌单').fontSize(12).fontColor(MUTED).width('100%')
        Scroll() {
          Row({ space: 8 }) {
            if (!this.playlists.some((p: MusicPlaylist) => p.isFavorite)) {
              this.targetChip('__favorite__', '我的收藏')
            }
            ForEach(this.targetPlaylists(), (playlist: MusicPlaylist) => {
              this.targetChip(playlist.id, playlist.isFavorite ? '我的收藏' : playlist.name)
            }, (playlist: MusicPlaylist) => playlist.id)
            this.targetChip('__new__', '+ 新建歌单')
          }
        }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).width('100%')

        if (this.selectedTargetId === '__new__') {
          TextInput({ text: this.newPlaylistName, placeholder: '输入新歌单名称' })
            .width('100%').height(40).fontSize(14).fontColor(TEXT).placeholderColor(MUTED)
            .backgroundColor($r('app.color.card_surface')).borderRadius(12).padding({ left: 12, right: 12 })
            .onChange((value: string) => { this.newPlaylistName = value; })
        }
      }.width('100%')

      Row({ space: 10 }) {
        Checkbox({ name: 'collect-all', group: 'batch-collect' })
          .select(this.candidates.length > 0 && this.selectedKeys.length === this.candidates.length)
          .selectedColor(ACCENT)
          .onClick(() => this.toggleAll())
        Text(`已选 ${this.selectedKeys.length} / ${this.candidates.length} 首`)
          .fontSize(12).fontColor(TEXT).layoutWeight(1)
          .onClick(() => this.toggleAll())
        Button(this.selectedKeys.length === this.candidates.length ? '取消全选' : '全选')
          .attributeModifier(musicButtonPress).height(30).padding({ left: 11, right: 11 })
          .fontSize(12).fontColor(TEXT).backgroundColor($r('app.color.card_surface')).borderRadius(15)
          .onClick(() => this.toggleAll())
        Button('反选')
          .attributeModifier(musicButtonPress).height(30).padding({ left: 11, right: 11 })
          .fontSize(12).fontColor(TEXT).backgroundColor($r('app.color.card_surface')).borderRadius(15)
          .onClick(() => this.invertSelection())
      }.width('100%')

      if (!this.candidates.length) {
        Column() {
          Text('当前列表没有可收藏的歌曲').fontSize(14).fontColor(MUTED)
        }.width('100%').layoutWeight(1).justifyContent(FlexAlign.Center)
      } else {
        List({ space: 2 }) {
          ForEach(this.candidates, (song: Song, index: number) => {
            ListItem() {
              Row({ space: 10 }) {
                Checkbox({ name: `collect-${songKey(song)}` })
                  .select(this.isSelected(song))
                  .selectedColor(ACCENT)
                  .hitTestBehavior(HitTestMode.None)
                Text(`${index + 1}`.padStart(2, '0')).fontSize(11).fontColor(MUTED).width(24)
                Column({ space: 2 }) {
                  Text(song.name).fontSize(13).fontColor(TEXT).maxLines(1)
                    .textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
                  Text(song.singer).fontSize(10).fontColor(MUTED).maxLines(1)
                    .textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
                }.alignItems(HorizontalAlign.Start).layoutWeight(1)
                if (this.currentTargetExistingKeys().has(songKey(song))) {
                  Text('已在歌单')
                    .fontSize(10)
                    .fontColor(MUTED)
                    .padding({ left: 7, right: 7, top: 3, bottom: 3 })
                    .backgroundColor($r('app.color.card_surface'))
                    .borderRadius(8)
                }
              }
              .width('100%')
              .padding({ top: 8, bottom: 8, left: 6, right: 6 })
              .borderRadius(10)
              .backgroundColor(this.isSelected(song) ? '#1464D2FF' : Color.Transparent)
              .onClick(() => this.toggleSong(song))
            }
          }, (song: Song) => songKey(song))
        }.width('100%').layoutWeight(1).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
      }

      Row({ space: 12 }) {
        Blank()
        Button('取消').attributeModifier(musicButtonPress).height(40).padding({ left: 18, right: 18 })
          .fontSize(13).fontColor(TEXT).backgroundColor($r('app.color.card_surface')).borderRadius(20)
          .onClick(() => this.onCancel())
        Button(`收藏到「${this.currentTargetLabel()}」（${this.selectedKeys.length}）`)
          .attributeModifier(musicButtonPress).height(40).padding({ left: 20, right: 20 })
          .fontSize(13).fontColor(ON_ACCENT).backgroundColor(ACCENT).borderRadius(20)
          .enabled(this.canSubmit())
          .onClick(() => this.submit())
      }.width('100%')
    }
    .width('100%')
    .height('100%')
    .padding({ left: 22, right: 22, top: 20, bottom: 24 })
  }
}
