import { window } from '@kit.ArkUI';
import { DesktopLyricDisplayLine } from '../services/HarmonyPcWindowService';

@Entry
@Component
struct DesktopLyricsPage {
  @StorageProp('lxmine_pc_lyric_main') mainText: string = 'LxMine';
  @StorageProp('lxmine_pc_lyric_sub') subText: string = '';
  @StorageProp('lxmine_pc_lyric_lines_json') @Watch('parseLines') linesJson: string = '[]';
  @StorageProp('lxmine_pc_lyric_line_count') lineCount: number = 3;
  @StorageProp('lxmine_pc_lyric_color') primaryColor: string = '#7DD3FC';
  @StorageProp('lxmine_pc_lyric_color2') secondaryColor: string = '#A5B4FC';
  @StorageProp('lxmine_pc_lyric_gradient') useGradient: boolean = true;
  @StorageProp('lxmine_pc_lyric_scale') fontSizeScale: number = 1.0;
  @StorageProp('lxmine_pc_lyric_playing') playing: boolean = false;
  @StorageProp('lxmine_pc_lyric_locked') locked: boolean = false;
  @State private prev2Text: string = '';
  @State private prev1Text: string = '';
  @State private activeLineText: string = '';
  @State private next1Text: string = '';
  @State private next2Text: string = '';
  @State private hovered: boolean = false;

  aboutToAppear(): void {
    this.parseLines();
  }

  private parseLines(): void {
    let parsed: DesktopLyricDisplayLine[] = [];
    try {
      const raw = JSON.parse(this.linesJson || '[]') as DesktopLyricDisplayLine[];
      if (Array.isArray(raw)) parsed = raw;
    } catch (_) {
      parsed = [];
    }
    if (!parsed.length) {
      this.prev2Text = '';
      this.prev1Text = '';
      this.activeLineText = '';
      this.next1Text = '';
      this.next2Text = '';
      return;
    }
    let activeIdx = parsed.findIndex((entry: DesktopLyricDisplayLine) => entry && entry.active);
    if (activeIdx < 0) activeIdx = Math.floor(parsed.length / 2);
    this.activeLineText = parsed[activeIdx]?.text || '';
    this.prev1Text = activeIdx - 1 >= 0 ? (parsed[activeIdx - 1]?.text || '') : '';
    this.prev2Text = activeIdx - 2 >= 0 ? (parsed[activeIdx - 2]?.text || '') : '';
    this.next1Text = activeIdx + 1 < parsed.length ? (parsed[activeIdx + 1]?.text || '') : '';
    this.next2Text = activeIdx + 2 < parsed.length ? (parsed[activeIdx + 2]?.text || '') : '';
  }

  private startDrag(): void {
    if (this.locked) return;
    try {
      window.findWindow('lxmine_desktop_lyrics').startMoving().catch(() => {});
    } catch (_) {}
  }

  private sendCmd(prefix: string): void {
    AppStorage.setOrCreate('lxmine_pc_lyric_cmd', `${prefix}:${Date.now()}`);
  }

  private toggleLock(): void {
    const next = !this.locked;
    AppStorage.setOrCreate('lxmine_pc_lyric_locked', next);
    AppStorage.setOrCreate('lxmine_pc_lyric_cmd', `lock:${next ? 1 : 0}:${Date.now()}`);
  }

  private scaled(base: number): number {
    const s = Math.max(0.72, Math.min(1.55, Number(this.fontSizeScale) || 1));
    return Math.round(base * s);
  }

  private activeDisplayText(): string {
    return this.activeLineText || this.mainText || 'LxMine';
  }

  build() {
    Stack({ alignContent: Alignment.Top }) {
      // 主体歌词区（支持 1 / 2 / 3 / 5 行与翻译副行，与 Windows 桌面歌词对齐）
      Column({ space: 4 }) {
        if (this.lineCount >= 5 && this.prev2Text) {
          Text(this.prev2Text)
            .fontSize(this.scaled(14))
            .fontWeight(FontWeight.Medium)
            .fontColor(this.secondaryColor || '#A5B4FC')
            .opacity(0.32)
            .textAlign(TextAlign.Center)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .textShadow({ radius: 10, color: '#B0000000', offsetX: 0, offsetY: 1 })
            .width('100%')
        }
        if (this.lineCount >= 3 && this.prev1Text) {
          Text(this.prev1Text)
            .fontSize(this.scaled(17))
            .fontWeight(FontWeight.Medium)
            .fontColor(this.secondaryColor || '#A5B4FC')
            .opacity(0.56)
            .textAlign(TextAlign.Center)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .textShadow({ radius: 12, color: '#BF000000', offsetX: 0, offsetY: 1 })
            .width('100%')
        }

        Text(this.activeDisplayText())
          .fontSize(this.scaled(30))
          .fontWeight(FontWeight.Bold)
          .fontColor(this.primaryColor || '#7DD3FC')
          .opacity(this.playing ? 1.0 : 0.84)
          .textAlign(TextAlign.Center)
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .textShadow(this.useGradient
            ? { radius: 18, color: this.secondaryColor || '#A5B4FC', offsetX: 0, offsetY: 1 }
            : { radius: 16, color: '#D8000000', offsetX: 0, offsetY: 2 })
          .width('100%')

        if (this.useGradient) {
          Row()
            .width('34%')
            .height(2.5)
            .borderRadius(2)
            .opacity(this.playing ? 0.85 : 0.45)
            .linearGradient({ angle: 90, colors: [[this.primaryColor || '#7DD3FC', 0], [this.secondaryColor || '#A5B4FC', 1]] })
        }

        if (this.subText) {
          Text(this.subText)
            .fontSize(this.scaled(15))
            .fontWeight(FontWeight.Medium)
            .fontColor(this.useGradient ? (this.secondaryColor || '#E8FFFFFF') : '#E8FFFFFF')
            .opacity(this.playing ? 0.9 : 0.72)
            .textAlign(TextAlign.Center)
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .textShadow({ radius: 10, color: '#C0000000', offsetX: 0, offsetY: 1 })
            .width('100%')
        }

        if (this.lineCount >= 2 && this.next1Text) {
          Text(this.next1Text)
            .fontSize(this.scaled(17))
            .fontWeight(FontWeight.Medium)
            .fontColor(this.secondaryColor || '#A5B4FC')
            .opacity(0.56)
            .textAlign(TextAlign.Center)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .textShadow({ radius: 12, color: '#BF000000', offsetX: 0, offsetY: 1 })
            .width('100%')
        }
        if (this.lineCount >= 5 && this.next2Text) {
          Text(this.next2Text)
            .fontSize(this.scaled(14))
            .fontWeight(FontWeight.Medium)
            .fontColor(this.secondaryColor || '#A5B4FC')
            .opacity(0.32)
            .textAlign(TextAlign.Center)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .textShadow({ radius: 10, color: '#B0000000', offsetX: 0, offsetY: 1 })
            .width('100%')
        }
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .padding({ left: 22, right: 22, top: 34, bottom: 12 })
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) this.startDrag();
      })

      // 顶部悬浮控制胶囊（对齐 Windows：锁定 / 上一首 / 播放暂停 / 下一首 / 关闭）
      if (this.hovered && !this.locked) {
        Row({ space: 10 }) {
          Text('锁定')
            .fontSize(12).fontWeight(FontWeight.Medium).fontColor(this.primaryColor || '#7DD3FC')
            .padding({ left: 6, right: 6, top: 2, bottom: 2 }).borderRadius(8)
            .hoverEffect(HoverEffect.Highlight)
            .onClick(() => this.toggleLock())
          Text('|').fontSize(11).fontColor('#38FFFFFF')
          Text('上一首')
            .fontSize(12).fontWeight(FontWeight.Medium).fontColor('#E8FFFFFF')
            .padding({ left: 4, right: 4, top: 2, bottom: 2 }).borderRadius(8)
            .hoverEffect(HoverEffect.Highlight)
            .onClick(() => this.sendCmd('prev'))
          Text(this.playing ? '暂停' : '播放')
            .fontSize(12).fontWeight(FontWeight.Bold).fontColor('#FFFFFF')
            .padding({ left: 6, right: 6, top: 2, bottom: 2 }).borderRadius(8)
            .hoverEffect(HoverEffect.Highlight)
            .onClick(() => this.sendCmd('toggle'))
          Text('下一首')
            .fontSize(12).fontWeight(FontWeight.Medium).fontColor('#E8FFFFFF')
            .padding({ left: 4, right: 4, top: 2, bottom: 2 }).borderRadius(8)
            .hoverEffect(HoverEffect.Highlight)
            .onClick(() => this.sendCmd('next'))
          Text('|').fontSize(11).fontColor('#38FFFFFF')
          Text('关闭')
            .fontSize(12).fontWeight(FontWeight.Medium).fontColor('#E0FFFFFF')
            .padding({ left: 6, right: 6, top: 2, bottom: 2 }).borderRadius(8)
            .hoverEffect(HoverEffect.Highlight)
            .onClick(() => this.sendCmd('close'))
        }
        .margin({ top: 6 })
        .padding({ left: 12, right: 12, top: 5, bottom: 5 })
        .borderRadius(16)
        .backgroundColor('#B810141C')
        .border({ width: 1, color: '#38FFFFFF' })
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.hovered && !this.locked ? '#3410141C' : Color.Transparent)
    .borderRadius(20)
    .onHover((isHover: boolean) => { this.hovered = isHover; })
  }
}
