import { ON_ACCENT, TEXT, MUTED, ACCENT } from './Theme';
import { musicButtonPress } from './MaterialControls';
import { Song } from '../model/Song';
import { songKey } from '../services/MusicLibrary';

@Component
export struct BatchDownloadSheet {
  @Prop title: string = '选择要下载的歌曲';
  @Prop @Watch('resetCandidates') songs: Song[] = [];
  @Prop qualityLabel: string = '标准 128k';
  @Prop wide: boolean = false;
  @Prop statusInset: number = 28;
  @Prop bottomInset: number = 16;
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
  onCancel: () => void = () => {};
  onConfirm: (selectedSongs: Song[]) => void = () => {};
  @State private candidates: Song[] = [];
  @State private selectedKeys: string[] = [];

  aboutToAppear(): void {
    this.resetCandidates();
  }

  private resetCandidates(): void {
    const seen = new Set<string>();
    const list: Song[] = [];
    for (const s of this.songs) {
      if (!s || s.source === 'local') continue;
      const k = songKey(s);
      if (seen.has(k)) continue;
      seen.add(k);
      list.push(s);
    }
    this.candidates = list;
    this.selectedKeys = list.map((s: Song) => songKey(s));
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

  private submit(): void {
    if (!this.selectedKeys.length) return;
    const set = new Set<string>(this.selectedKeys);
    const chosen = this.candidates.filter((s: Song) => set.has(songKey(s)));
    if (chosen.length) this.onConfirm(chosen);
  }

  build() {
    Column({ space: 12 }) {
      Row() {
        Column({ space: 3 }) {
          Text(this.title).fontSize(22).fontWeight(FontWeight.Bold).fontColor(TEXT)
          Text(`勾选需要批量下载的歌曲（当前音质：${this.qualityLabel}）`).fontSize(12).fontColor(MUTED)
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        Button('关闭').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontColor(MUTED)
          .onClick(() => this.onCancel())
      }.width('100%')

      Row({ space: 10 }) {
        Checkbox({ name: 'dl-all', group: 'batch-dl' })
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
          Text('当前列表没有可下载的在线歌曲').fontSize(14).fontColor(MUTED)
        }.width('100%').layoutWeight(1).justifyContent(FlexAlign.Center)
      } else {
        List({ space: 2 }) {
          ForEach(this.candidates, (song: Song, index: number) => {
            ListItem() {
              Row({ space: 10 }) {
                Checkbox({ name: `dl-${songKey(song)}` })
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
        Button(`开始下载（${this.selectedKeys.length} 首）`)
          .attributeModifier(musicButtonPress).height(40).padding({ left: 20, right: 20 })
          .fontSize(13).fontColor(ON_ACCENT).backgroundColor(ACCENT).borderRadius(20)
          .enabled(this.selectedKeys.length > 0)
          .onClick(() => this.submit())
      }.width('100%')
    }
    .width('100%')
    .height('100%')
    .padding({ left: 22, right: 22, top: 20, bottom: 24 })
  }
}
