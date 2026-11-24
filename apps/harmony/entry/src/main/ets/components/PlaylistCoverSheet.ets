import { ON_ACCENT, TEXT, MUTED, ACCENT } from './Theme';
import { musicButtonPress } from './MaterialControls';
import { Song } from '../model/Song';
import { MusicPlaylist } from '../services/MusicLibrary';

interface CoverChoice {
  cover: string;
  label: string;
}

@Component
export struct PlaylistCoverSheet {
  @Prop playlist: MusicPlaylist;
  @Prop wide: boolean = false;
  @Prop statusInset: number = 28;
  @Prop bottomInset: number = 16;
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
  onCancel: () => void = () => {};
  onPickLocal: () => void = () => {};
  onSelectCover: (cover: string) => void = () => {};
  onResetDefault: () => void = () => {};

  private songCovers(): CoverChoice[] {
    const out: CoverChoice[] = [];
    const seen = new Set<string>();
    for (const s of (this.playlist.songs ?? [])) {
      const url = (s?.coverUrl || '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ cover: url, label: s.name || '歌曲封面' });
      if (out.length >= 24) break;
    }
    return out;
  }

  build() {
    Column({ space: 14 }) {
      Row() {
        Column({ space: 3 }) {
          Text('自定义歌单封面').fontSize(22).fontWeight(FontWeight.Bold).fontColor(TEXT)
          Text(`「${this.playlist.name}」· 选取歌单内歌曲封面或本地图片`).fontSize(12).fontColor(MUTED)
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        Button('关闭').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontColor(MUTED)
          .onClick(() => this.onCancel())
      }.width('100%')

      Row({ space: 10 }) {
        Button('从本地选择图片')
          .attributeModifier(musicButtonPress).height(38).layoutWeight(1)
          .fontSize(13).fontColor(ON_ACCENT).backgroundColor(ACCENT).borderRadius(19)
          .onClick(() => this.onPickLocal())
        if (this.playlist.customCover) {
          Button('恢复默认封面')
            .attributeModifier(musicButtonPress).height(38).padding({ left: 14, right: 14 })
            .fontSize(13).fontColor(TEXT).backgroundColor('#1AFFFFFF').borderRadius(19)
            .onClick(() => this.onResetDefault())
        }
      }.width('100%')

      Text('从歌单内歌曲封面选取').fontSize(13).fontWeight(FontWeight.Medium).fontColor(MUTED).width('100%')

      if (!this.songCovers().length) {
        Column() {
          Text('歌单中暂无可用歌曲封面，可直接从本地选择图片').fontSize(13).fontColor(MUTED)
        }.width('100%').layoutWeight(1).justifyContent(FlexAlign.Center)
      } else {
        Grid() {
          ForEach(this.songCovers(), (item: CoverChoice) => {
            GridItem() {
              Column({ space: 5 }) {
                Stack({ alignContent: Alignment.TopEnd }) {
                  Image(item.cover)
                    .width('100%').aspectRatio(1).borderRadius(12).objectFit(ImageFit.Cover)
                  if (this.playlist.customCover === item.cover) {
                    Text('✓')
                      .fontSize(12).fontWeight(FontWeight.Bold).fontColor('#081018')
                      .width(22).height(22).textAlign(TextAlign.Center)
                      .backgroundColor(ACCENT).borderRadius(11).margin(6)
                  }
                }
                .border({ width: this.playlist.customCover === item.cover ? 2 : 0, color: ACCENT })
                .borderRadius(12).clip(true)
                Text(item.label).fontSize(11).fontColor(TEXT).maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
              }
              .onClick(() => this.onSelectCover(item.cover))
            }
          }, (item: CoverChoice) => item.cover)
        }
        .columnsTemplate(this.wide ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr')
        .columnsGap(10)
        .rowsGap(12)
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Off)
        .fadingEdge(false)
      }
    }
    .width('100%')
    .height('100%')
    .padding({ left: 22, right: 22, top: 20, bottom: 24 })
  }
}
