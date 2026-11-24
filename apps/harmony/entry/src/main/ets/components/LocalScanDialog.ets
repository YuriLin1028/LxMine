import { ON_ACCENT, TEXT, MUTED, ACCENT } from './Theme';
import { musicButtonPress } from './MaterialControls';

export interface LocalScanItem {
  uri: string;
  name: string;
}

// 智能识别结果确认窗：逐项勾选 + 全选；确认后只把勾选的 URI 交给本地音乐服务。
@Component
export struct LocalScanDialog {
  @Prop items: LocalScanItem[] = [];
  @Prop wide: boolean = false;
  @Prop statusInset: number = 28;
  @Prop bottomInset: number = 16;
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
  onCancel: () => void = () => {};
  onConfirm: (uris: string[]) => void = () => {};
  @State private selected: boolean[] = [];

  aboutToAppear(): void {
    this.selected = this.items.map((item: LocalScanItem) => true);
  }
  private allSelected(): boolean {
    return this.selected.length > 0 && this.selected.every((value: boolean) => value);
  }
  private selectedCount(): number {
    return this.selected.filter((value: boolean) => value).length;
  }
  private toggleAll(value: boolean): void {
    this.selected = this.items.map((item: LocalScanItem) => value);
  }
  private toggle(index: number, value: boolean): void {
    const next = this.selected.slice();
    next[index] = value;
    this.selected = next;
  }
  private confirm(): void {
    const uris: string[] = [];
    for (let i = 0; i < this.items.length; i += 1) if (this.selected[i]) uris.push(this.items[i].uri);
    this.onConfirm(uris);
  }

  build() {
    Column({ space: 12 }) {
      Row() {
        Column({ space: 3 }) {
          Text(`发现 ${this.items.length} 个本地音频`).fontSize(22).fontWeight(FontWeight.Bold).fontColor(TEXT)
          Text('取消勾选不想添加的文件').fontSize(12).fontColor(MUTED)
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        Button('关闭').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontColor(MUTED)
          .onClick(() => this.onCancel())
      }.width('100%')
      Row({ space: 10 }) {
        Checkbox({ name: 'all', group: 'local-scan' }).select(this.allSelected())
          .selectedColor(ACCENT).onChange((value: boolean) => this.toggleAll(value))
        Text('全选').fontSize(14).fontColor(TEXT)
        Blank()
        Text(`${this.selectedCount()} / ${this.items.length}`).fontSize(12).fontColor(MUTED)
      }.width('100%').padding({ top: 2, bottom: 2 })
      List({ space: 2 }) {
        ForEach(this.items, (item: LocalScanItem, index: number) => {
          ListItem() {
            Row({ space: 10 }) {
              Checkbox({ name: 'file-' + index, group: 'local-scan' }).select(this.selected[index])
                .selectedColor(ACCENT).onChange((value: boolean) => this.toggle(index, value))
              Text(item.name).fontSize(13).fontColor(TEXT).maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1)
            }.width('100%').padding({ top: 8, bottom: 8, left: 4, right: 4 })
          }
        }, (item: LocalScanItem, index: number) => item.uri + ':' + index)
      }.width('100%').layoutWeight(1).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
      Row({ space: 12 }) {
        Blank()
        Button('取消').attributeModifier(musicButtonPress).height(40).padding({ left: 18, right: 18 }).fontSize(13).fontColor(TEXT)
          .backgroundColor('#14FFFFFF').borderRadius(20).onClick(() => this.onCancel())
        Button(`添加选中 ${this.selectedCount()}`).attributeModifier(musicButtonPress).height(40).padding({ left: 18, right: 18 }).fontSize(13)
          .fontColor(ON_ACCENT).backgroundColor(ACCENT).borderRadius(20).enabled(this.selectedCount() > 0)
          .onClick(() => this.confirm())
      }.width('100%')
    }.width('100%').height('100%').padding({ left: 22, right: 22, top: 20, bottom: 24 })
  }
}
