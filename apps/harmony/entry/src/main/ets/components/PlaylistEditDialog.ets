import { ON_ACCENT, TEXT, MUTED, ACCENT } from './Theme';
import { musicButtonPress } from './MaterialControls';
import { Song } from '../model/Song';
import { songKey } from '../services/MusicLibrary';

@Component
export struct PlaylistEditDialog {
  @Prop initialName: string = '';
  @Prop songs: Song[] = [];
  @Prop wide: boolean = false;
  @Prop statusInset: number = 28;
  @Prop bottomInset: number = 16;
  onCancel: () => void = () => {};
  onSave: (nextName: string, remainingSongs: Song[]) => void = () => {};
  onBatchDownload: (selectedSongs: Song[]) => void = () => {};
  @State private nameDraft: string = '';
  @State private workingSongs: Song[] = [];
  @State private selectedKeys: string[] = [];

  aboutToAppear(): void {
    this.nameDraft = this.initialName;
    this.workingSongs = this.songs.slice();
    this.selectedKeys = [];
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
    if (this.workingSongs.length > 0 && this.selectedKeys.length === this.workingSongs.length) {
      this.selectedKeys = [];
    } else {
      this.selectedKeys = this.workingSongs.map((song: Song) => songKey(song));
    }
  }

  private removeSelected(): void {
    if (!this.selectedKeys.length) return;
    const removeSet = new Set<string>(this.selectedKeys);
    this.workingSongs = this.workingSongs.filter((song: Song) => !removeSet.has(songKey(song)));
    this.selectedKeys = [];
  }

  private downloadSelected(): void {
    if (!this.selectedKeys.length) return;
    const chosenSet = new Set<string>(this.selectedKeys);
    const chosen = this.workingSongs.filter((song: Song) => chosenSet.has(songKey(song)));
    if (chosen.length) this.onBatchDownload(chosen);
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column().width('100%').height('100%').backgroundColor('#B3000000')
        .onClick(() => this.onCancel())
      Column({ space: 12 }) {
        Row() {
          Column({ space: 3 }) {
            Text('编辑歌单').fontSize(20).fontWeight(FontWeight.Bold).fontColor(TEXT)
            Text('修改歌单名称，或勾选多首歌曲批量移除／下载').fontSize(11).fontColor(MUTED)
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          Text('关闭').fontSize(13).fontColor(MUTED).padding({ left: 12, right: 4, top: 6, bottom: 6 })
            .onClick(() => this.onCancel())
        }.width('100%')

        TextInput({ text: this.nameDraft, placeholder: '歌单名称' })
          .height(44).fontSize(14).fontColor(TEXT).placeholderColor(MUTED)
          .backgroundColor('#14FFFFFF').borderRadius(12)
          .onChange((value: string) => { this.nameDraft = value; })

        Row({ space: 10 }) {
          Checkbox({ name: 'all', group: 'playlist-edit' })
            .select(this.workingSongs.length > 0 && this.selectedKeys.length === this.workingSongs.length)
            .selectedColor(ACCENT)
            .onClick(() => this.toggleAll())
          Text(`全选（已选 ${this.selectedKeys.length} / ${this.workingSongs.length} 首）`)
            .fontSize(12).fontColor(TEXT).layoutWeight(1)
            .onClick(() => this.toggleAll())
          if (this.selectedKeys.length > 0) {
            Button('移除所选').attributeModifier(musicButtonPress).height(32).padding({ left: 12, right: 12 })
              .fontSize(12).fontColor('#FF6B76').backgroundColor('#1FFF4D5A').borderRadius(16)
              .onClick(() => this.removeSelected())
            Button('下载所选').attributeModifier(musicButtonPress).height(32).padding({ left: 12, right: 12 })
              .fontSize(12).fontColor(TEXT).backgroundColor('#14FFFFFF').borderRadius(16)
              .onClick(() => this.downloadSelected())
          }
        }.width('100%').padding({ top: 4, bottom: 4 })

        List({ space: 2 }) {
          ForEach(this.workingSongs, (song: Song, index: number) => {
            ListItem() {
              Row({ space: 10 }) {
                Checkbox({ name: songKey(song) })
                  .select(this.isSelected(song))
                  .selectedColor(ACCENT)
                  .hitTestBehavior(HitTestMode.None)
                Text(`${index + 1}`.padStart(2, '0')).fontSize(11).fontColor(MUTED).width(22)
                Column({ space: 2 }) {
                  Text(song.name).fontSize(13).fontColor(TEXT).maxLines(1)
                    .textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
                  Text(song.singer).fontSize(10).fontColor(MUTED).maxLines(1)
                    .textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
                }.alignItems(HorizontalAlign.Start).layoutWeight(1)
                Button({ type: ButtonType.Circle }) {
                  Image($r('app.media.ic_trash')).width(16).height(16).fillColor(MUTED)
                }.width(32).height(32).backgroundColor(Color.Transparent)
                  .onClick(() => {
                    const key = songKey(song);
                    this.workingSongs = this.workingSongs.filter((item: Song) => songKey(item) !== key);
                    this.selectedKeys = this.selectedKeys.filter((item: string) => item !== key);
                  })
              }.width('100%').padding({ top: 7, bottom: 7, left: 4, right: 4 })
                .onClick(() => this.toggleSong(song))
            }
          }, (song: Song) => songKey(song))
        }.width('100%').layoutWeight(1).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring)

        Row({ space: 12 }) {
          Blank()
          Button('取消').attributeModifier(musicButtonPress).height(40).padding({ left: 18, right: 18 }).fontSize(13).fontColor(TEXT)
            .backgroundColor('#14FFFFFF').borderRadius(20).onClick(() => this.onCancel())
          Button('保存').attributeModifier(musicButtonPress).height(40).padding({ left: 20, right: 20 }).fontSize(13).fontColor(ON_ACCENT)
            .backgroundColor(ACCENT).borderRadius(20)
            .onClick(() => this.onSave(this.nameDraft.trim() || this.initialName, this.workingSongs))
        }.width('100%')
      }.width(this.wide ? 620 : '92%').height('76%').padding(20)
        .backgroundColor('#F0181A1E').borderRadius(24).border({ width: 1, color: '#26FFFFFF' })
        .hitTestBehavior(HitTestMode.Default)
    }.width('100%').height('100%').padding({ top: this.statusInset, bottom: this.bottomInset })
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
      .hitTestBehavior(HitTestMode.Default)
  }
}
