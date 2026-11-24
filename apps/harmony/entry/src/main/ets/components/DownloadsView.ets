import { musicButtonPress, musicMenuMaterial } from './MaterialControls';
import { MusicDownload } from '../services/MusicDownloads';
import { Song } from '../model/Song';
import { TEXT, MUTED, ACCENT, sourceBadge } from './Theme';

@CustomDialog
struct DownloadDeleteDialog {
  controller?: CustomDialogController;
  title: string = '删除下载任务';
  message: string = '';
  onConfirm: (deleteSourceFile: boolean) => void = () => {};
  onCancel: () => void = () => {};
  @State private deleteSourceFile: boolean = false;

  build() {
    Column({ space: 16 }) {
      Text(this.title)
        .fontSize(20).fontWeight(FontWeight.Bold).fontColor(TEXT).width('100%')
      Text(this.message)
        .fontSize(14).fontColor(MUTED).lineHeight(20).width('100%')
      Row({ space: 12 }) {
        Stack({ alignContent: Alignment.Center }) {
          if (this.deleteSourceFile) {
            Text('✓').fontSize(13).fontWeight(FontWeight.Bold).fontColor('#FFFFFF')
          }
        }
        .width(22).height(22).borderRadius(6)
        .backgroundColor(this.deleteSourceFile ? '#FF5C6C' : Color.Transparent)
        .border({ width: 1.5, color: this.deleteSourceFile ? '#FF5C6C' : MUTED })
        Column({ space: 2 }) {
          Text('同时删除本地音频源文件').fontSize(14).fontWeight(FontWeight.Medium).fontColor(TEXT).width('100%')
          Text('勾选后一并清理应用内与下载目录中的音频文件；不勾选仅移除记录')
            .fontSize(12).fontColor(MUTED).width('100%')
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
      }
      .width('100%')
      .padding(12)
      .borderRadius(14)
      .backgroundColor('#12FFFFFF')
      .onClick(() => { this.deleteSourceFile = !this.deleteSourceFile; })

      Row({ space: 10 }) {
        Button('取消')
          .attributeModifier(musicButtonPress)
          .layoutWeight(1).height(40).fontSize(14)
          .backgroundColor('#1AFFFFFF').fontColor(TEXT).borderRadius(20)
          .onClick(() => {
            this.onCancel();
            this.controller?.close();
          })
        Button(this.deleteSourceFile ? '删除记录与源文件' : '仅移除记录')
          .attributeModifier(musicButtonPress)
          .layoutWeight(1).height(40).fontSize(14)
          .backgroundColor('#E0FF5C6C').fontColor('#FFFFFF').borderRadius(20)
          .onClick(() => {
            const removeFiles = this.deleteSourceFile;
            this.controller?.close();
            this.onConfirm(removeFiles);
          })
      }.width('100%')
    }
    .width('100%')
    .padding(22)
    .borderRadius(24)
  }
}

@Component
export struct DownloadsView {
  @Prop @Watch('syncSelection') items: MusicDownload[] = [];
  @Prop contentTop: number = 82;
  @State private batchMode: boolean = false;
  @State private selectedIds: string[] = [];
  private pendingDeleteIds: string[] = [];
  private deleteSourceFile: boolean = false;
  private deleteDialogController: CustomDialogController | null = null;
  onPlay: (song: Song) => void = () => {};
  onCancel: (id: string) => void = () => {};
  onExport: (item: MusicDownload) => void = () => {};
  onBatchExport: (items: MusicDownload[]) => void = () => {};
  onDelete: (ids: string[], deleteSourceFile: boolean) => void = () => {};
  scroller: Scroller = new Scroller();
  onScroll: (offset: number) => void = () => {};

  private static readonly GRADS: string[][] = [
    ['#1E3A8A', '#38BDF8'], ['#0F6F5C', '#3FA796'], ['#312E81', '#818CF8'],
    ['#164E63', '#22D3EE'], ['#4C1D95', '#A78BFA'], ['#0C4A6E', '#60A5FA'],
  ];

  private gradFor(name: string): string[] {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return DownloadsView.GRADS[hash % DownloadsView.GRADS.length];
  }

  private syncSelection(): void {
    if (!this.items.length) {
      this.batchMode = false;
      this.selectedIds = [];
      return;
    }
    const valid = new Set<string>(this.items.map((item: MusicDownload) => item.id));
    const filtered = this.selectedIds.filter((id: string) => valid.has(id));
    if (filtered.length !== this.selectedIds.length) {
      this.selectedIds = filtered;
    }
  }

  private isSelected(id: string): boolean {
    return this.selectedIds.includes(id);
  }

  private toggleSelect(id: string): void {
    if (this.selectedIds.includes(id)) {
      this.selectedIds = this.selectedIds.filter((entry: string) => entry !== id);
    } else {
      this.selectedIds = this.selectedIds.concat([id]);
    }
  }

  private toggleSelectAll(): void {
    if (this.selectedIds.length === this.items.length) {
      this.selectedIds = [];
    } else {
      this.selectedIds = this.items.map((item: MusicDownload) => item.id);
    }
  }

  private selectedCompletedItems(): MusicDownload[] {
    const chosen = new Set<string>(this.selectedIds);
    return this.items.filter((item: MusicDownload) => chosen.has(item.id) && item.state === 'complete');
  }

  private openDeleteDialog(ids: string[], title: string, message: string): void {
    this.pendingDeleteIds = ids.slice();
    this.deleteSourceFile = false;
    this.deleteDialogController = new CustomDialogController({
      builder: DownloadDeleteDialog({
        title,
        message,
        onCancel: () => {
          this.pendingDeleteIds = [];
        },
        onConfirm: (removeFiles: boolean) => {
          this.deleteSourceFile = removeFiles;
          this.confirmDelete();
        }
      }),
      autoCancel: true,
      alignment: DialogAlignment.Center,
      systemMaterial: musicMenuMaterial(),
      cancel: () => {
        this.pendingDeleteIds = [];
      }
    });
    this.deleteDialogController.open();
  }

  private askDeleteSingle(item: MusicDownload): void {
    this.openDeleteDialog(
      [item.id],
      '删除下载任务',
      `确认删除「${item.song.name}」吗？`
    );
  }

  private askDeleteBatch(): void {
    if (!this.selectedIds.length) return;
    this.openDeleteDialog(
      this.selectedIds,
      '批量删除下载',
      `确认删除已选的 ${this.selectedIds.length} 项下载任务吗？`
    );
  }

  private confirmDelete(): void {
    const ids = this.pendingDeleteIds.slice();
    const removeFiles = this.deleteSourceFile;
    this.pendingDeleteIds = [];
    if (!ids.length) return;
    this.selectedIds = this.selectedIds.filter((id: string) => !ids.includes(id));
    if (!this.selectedIds.length && ids.length >= this.items.length) {
      this.batchMode = false;
    }
    this.onDelete(ids, removeFiles);
  }

  aboutToDisappear(): void {
    try { this.deleteDialogController?.close(); } catch (_) {}
    this.deleteDialogController = null;
  }

  build() {
    Scroll(this.scroller) {
        Column({ space: 14 }) {
          if (!this.items.length) {
            Text('下载的音乐会保存在这里').fontSize(17).fontColor(MUTED).padding(24)
          } else {
            Row({ space: 8 }) {
              if (this.batchMode) {
                Button(this.selectedIds.length === this.items.length ? '取消全选' : '全选')
                  .attributeModifier(musicButtonPress)
                  .height(32).fontSize(13).padding({ left: 12, right: 12 })
                  .backgroundColor('#1AFFFFFF').fontColor(TEXT).borderRadius(16)
                  .onClick(() => this.toggleSelectAll())
                Text(`已选 ${this.selectedIds.length} 项`).fontSize(13).fontColor(MUTED).maxLines(1)
                Blank()
                Button('另存为')
                  .attributeModifier(musicButtonPress)
                  .height(32).fontSize(13).padding({ left: 12, right: 12 })
                  .enabled(this.selectedCompletedItems().length > 0)
                  .opacity(this.selectedCompletedItems().length > 0 ? 1 : 0.42)
                  .backgroundColor('#2438BDF8').fontColor(ACCENT).borderRadius(16)
                  .onClick(() => {
                    const targets = this.selectedCompletedItems();
                    if (targets.length > 0) this.onBatchExport(targets);
                  })
                Button('删除')
                  .attributeModifier(musicButtonPress)
                  .height(32).fontSize(13).padding({ left: 12, right: 12 })
                  .enabled(this.selectedIds.length > 0)
                  .opacity(this.selectedIds.length > 0 ? 1 : 0.42)
                  .backgroundColor('#24FF6B76').fontColor('#FF6B76').borderRadius(16)
                  .onClick(() => this.askDeleteBatch())
                Button('完成')
                  .attributeModifier(musicButtonPress)
                  .height(32).fontSize(13).padding({ left: 12, right: 12 })
                  .backgroundColor('#1AFFFFFF').fontColor(TEXT).borderRadius(16)
                  .onClick(() => { this.batchMode = false; this.selectedIds = []; })
              } else {
                Blank()
                Button('批量管理')
                  .attributeModifier(musicButtonPress)
                  .height(32).fontSize(13).padding({ left: 14, right: 14 })
                  .backgroundColor('#1AFFFFFF').fontColor(ACCENT).borderRadius(16)
                  .onClick(() => { this.batchMode = true; this.selectedIds = []; })
              }
            }.width('100%')
          }

          ForEach(this.items, (item: MusicDownload) => {
            Column({ space: 10 }) {
              Row({ space: 12 }) {
                if (this.batchMode) {
                  Stack({ alignContent: Alignment.Center }) {
                    if (this.isSelected(item.id)) {
                      Text('✓').fontSize(13).fontWeight(FontWeight.Bold).fontColor('#09111E')
                    }
                  }
                  .width(22).height(22).borderRadius(11)
                  .backgroundColor(this.isSelected(item.id) ? ACCENT : Color.Transparent)
                  .border({ width: 1.5, color: this.isSelected(item.id) ? ACCENT : MUTED })
                }
                Stack({ alignContent: Alignment.TopEnd }) {
                  Stack() {
                    Column() {
                      Image($r('app.media.ic_music')).width(20).height(20).fillColor('#E8FFFFFF')
                    }.width('100%').height('100%').justifyContent(FlexAlign.Center)
                     .linearGradient({ angle: 135, colors: [[this.gradFor(item.song.name)[0], 0], [this.gradFor(item.song.name)[1], 1]] })
                    if (item.song.coverUrl) {
                      Image(item.song.coverUrl).width('100%').height('100%').objectFit(ImageFit.Cover)
                    }
                  }.width(48).height(48).borderRadius(10).clip(true).backgroundColor('#17191C')
                  if (sourceBadge(item.song.source) !== null) {
                    Image(sourceBadge(item.song.source)!).width(15).height(15).margin(2).borderRadius(8).clip(true)
                  }
                }
                Column({ space: 5 }) {
                  Text(item.song.name).fontSize(16).fontColor(TEXT).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
                  Text(item.state === 'complete' ? item.exportError || (item.exported ? (item.exportDirPath ? `已保存到下载目录 · ${item.quality}` : `已保存到系统所选位置 · ${item.quality}`) : `已下载 · ${item.quality} · 可另存到系统`) : item.state === 'downloading' ? `${(item.received / 1048576).toFixed(1)} MB${item.total > 0 ? ' / ' + (item.total / 1048576).toFixed(1) + ' MB' : ''}` : item.error)
                    .fontSize(12).fontColor(MUTED).maxLines(2).width('100%')
                }.layoutWeight(1).alignItems(HorizontalAlign.Start)
                if (!this.batchMode) {
                  if (item.state === 'downloading') {
                    Button('取消').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).backgroundColor(Color.Transparent).fontColor(ACCENT).onClick(() => this.onCancel(item.id))
                  }
                  if (item.state === 'complete') {
                    Button('另存为').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).backgroundColor(Color.Transparent).fontColor(ACCENT).onClick(() => this.onExport(item))
                  }
                  if (item.state !== 'downloading') {
                    Button('删除').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).backgroundColor(Color.Transparent).fontColor('#FF6B76').onClick(() => this.askDeleteSingle(item))
                  }
                }
              }.width('100%')
              if (item.state === 'downloading') {
                Progress({ value: item.received, total: Math.max(1, item.total), type: ProgressType.Linear }).width('100%').color(ACCENT)
              }
            }
            .width('100%').padding(16).borderRadius(18)
            .backgroundColor($r('app.color.card_surface'))
            .border({ width: this.batchMode && this.isSelected(item.id) ? 1.5 : 0, color: ACCENT })
            .onClick(() => {
              if (this.batchMode) this.toggleSelect(item.id);
              else if (item.state === 'complete') this.onPlay(item.song);
            })
          }, (item: MusicDownload) => `${item.id}:${item.song.coverUrl || ''}:${item.state}:${item.exported ? 1 : 0}:${this.batchMode ? 1 : 0}:${this.isSelected(item.id) ? 1 : 0}`)
        }.width('100%').padding({ top: this.contentTop + 12, bottom: 180 })
      }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).fadingEdge(false)
        .onDidScroll((x: number, y: number, state: ScrollState) => { if (state !== ScrollState.Idle) this.onScroll(this.scroller.currentOffset().yOffset); })
  }
}
