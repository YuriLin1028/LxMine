import { window } from '@kit.ArkUI';

@Entry
@Component
struct DesktopLyricsPage {
  @StorageProp('lxmine_pc_lyric_main') mainText: string = 'LxMine';
  @StorageProp('lxmine_pc_lyric_sub') subText: string = '';
  @StorageProp('lxmine_pc_lyric_color') accentColor: string = '#64D2FF';
  @StorageProp('lxmine_pc_lyric_locked') locked: boolean = false;
  @State private hovered: boolean = false;

  private startDrag(): void {
    if (this.locked) return;
    try {
      window.findWindow('lxmine_desktop_lyrics').startMoving().catch(() => {});
    } catch (_) {}
  }

  private toggleLock(): void {
    const next = !this.locked;
    AppStorage.setOrCreate('lxmine_pc_lyric_locked', next);
    AppStorage.setOrCreate('lxmine_pc_lyric_cmd', `lock:${next ? 1 : 0}:${Date.now()}`);
  }

  private closeLyrics(): void {
    AppStorage.setOrCreate('lxmine_pc_lyric_cmd', `close:${Date.now()}`);
  }

  build() {
    Column({ space: 6 }) {
      if (this.hovered && !this.locked) {
        Row({ space: 12 }) {
          Text('拖动移动')
            .fontSize(11).fontColor('#B8FFFFFF')
          Text('锁定穿透')
            .fontSize(11).fontColor('#64D2FF')
            .onClick(() => this.toggleLock())
          Text('关闭')
            .fontSize(11).fontColor('#E0FFFFFF')
            .onClick(() => this.closeLyrics())
        }
        .padding({ left: 14, right: 14, top: 4, bottom: 4 })
        .borderRadius(14)
        .backgroundColor('#88141820')
      }

      Text(this.mainText || 'LxMine')
        .fontSize(28)
        .fontWeight(FontWeight.Bold)
        .fontColor(this.accentColor || '#64D2FF')
        .textAlign(TextAlign.Center)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .textShadow({ radius: 14, color: '#CC000000', offsetX: 0, offsetY: 2 })
        .width('100%')

      if (this.subText) {
        Text(this.subText)
          .fontSize(16)
          .fontWeight(FontWeight.Medium)
          .fontColor('#E8FFFFFF')
          .textAlign(TextAlign.Center)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .textShadow({ radius: 10, color: '#BB000000', offsetX: 0, offsetY: 1 })
          .width('100%')
      }
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .padding({ left: 20, right: 20 })
    .backgroundColor(this.hovered && !this.locked ? '#3A12161E' : Color.Transparent)
    .borderRadius(20)
    .onHover((isHover: boolean) => { this.hovered = isHover; })
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) this.startDrag();
    })
  }
}
