import { ON_ACCENT, TEXT, MUTED, ACCENT } from './Theme';
import { musicButtonPress } from './MaterialControls';

interface HsvTriple { h: number; s: number; v: number; }

const SWATCH_COLORS: string[] = [
  '#7DD3FC', '#A5B4FC', '#F9A8D4', '#FDE68A',
  '#86EFAC', '#67E8F9', '#C4B5FD', '#FCA5A5',
  '#FFFFFF', '#E2E8F0', '#38BDF8', '#F472B6'
];

function hexToHsv(hex: string): HsvTriple {
  const clean = (hex || '').replace(/^#/, '').trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return { h: 200, s: 0.5, v: 0.98 };
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * (((b - r) / d) + 2);
    else h = 60 * (((r - g) / d) + 4);
    if (h < 0) h += 360;
  }
  const s = max > 1e-6 ? d / max : 0;
  return { h, s, v: max };
}

function hsvToHex(h: number, s: number, v: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(1, s));
  const vv = Math.max(0, Math.min(1, v));
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  let r = 0; let g = 0; let b = 0;
  if (hh < 60) { r = c; g = x; b = 0; }
  else if (hh < 120) { r = x; g = c; b = 0; }
  else if (hh < 180) { r = 0; g = c; b = x; }
  else if (hh < 240) { r = 0; g = x; b = c; }
  else if (hh < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (n: number): string => Math.max(0, Math.min(255, Math.round((n + m) * 255))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

@Component
export struct ColorPickerSheet {
  @Prop title: string = '选择歌词颜色';
  @Prop initialColor: string = '#7DD3FC';
  @Prop wide: boolean = false;
  @Prop statusInset: number = 28;
  @Prop bottomInset: number = 16;
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
  onCancel: () => void = () => {};
  onConfirm: (hex: string) => void = () => {};
  @State private hue: number = 200;
  @State private sat: number = 0.5;
  @State private val: number = 0.98;
  @State private hexDraft: string = '#7DD3FC';
  @State private padWidth: number = 280;
  @State private padHeight: number = 176;

  aboutToAppear(): void {
    const hsv = hexToHsv(this.initialColor);
    this.hue = hsv.h;
    this.sat = hsv.s;
    this.val = hsv.v;
    this.hexDraft = hsvToHex(this.hue, this.sat, this.val);
  }

  private currentHex(): string {
    return hsvToHex(this.hue, this.sat, this.val);
  }

  private pureHueHex(): string {
    return hsvToHex(this.hue, 1, 1);
  }

  private updateFromPad(x: number, y: number): void {
    const w = Math.max(1, this.padWidth);
    const h = Math.max(1, this.padHeight);
    this.sat = Math.max(0, Math.min(1, x / w));
    this.val = Math.max(0, Math.min(1, 1 - y / h));
    this.hexDraft = this.currentHex();
  }

  private applyHex(value: string): void {
    const clean = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(clean)) {
      const hsv = hexToHsv(clean);
      this.hue = hsv.h;
      this.sat = hsv.s;
      this.val = hsv.v;
      this.hexDraft = clean.toUpperCase();
    }
  }

  build() {
    Column({ space: 14 }) {
      Row({ space: 10 }) {
        Row().width(28).height(28).borderRadius(14).backgroundColor(this.currentHex())
          .border({ width: 1.5, color: '#80FFFFFF' })
        Column({ space: 2 }) {
          Text(this.title).fontSize(20).fontWeight(FontWeight.Bold).fontColor(TEXT)
          Text('拖动色盘或色相条自由调色，也可点击预设色板').fontSize(12).fontColor(MUTED)
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        Button('关闭').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontColor(MUTED)
          .onClick(() => this.onCancel())
      }.width('100%')

      // 2D 饱和度/明度色盘
      Stack({ alignContent: Alignment.TopStart }) {
        Column().width('100%').height('100%')
          .linearGradient({ angle: 90, colors: [['#FFFFFF', 0], [this.pureHueHex(), 1]] })
        Column().width('100%').height('100%')
          .linearGradient({ angle: 180, colors: [['#00000000', 0], ['#FF000000', 1]] })
        Row()
          .width(22).height(22).borderRadius(11)
          .backgroundColor(this.currentHex())
          .border({ width: 2.5, color: '#FFFFFF' })
          .shadow({ radius: 6, color: '#80000000', offsetY: 2 })
          .position({
            x: Math.max(0, Math.min(this.padWidth - 22, this.sat * this.padWidth - 11)),
            y: Math.max(0, Math.min(this.padHeight - 22, (1 - this.val) * this.padHeight - 11))
          })
          .hitTestBehavior(HitTestMode.None)
      }
      .width('100%')
      .height(176)
      .borderRadius(16)
      .clip(true)
      .border({ width: 1, color: '#28FFFFFF' })
      .onAreaChange((_old: Area, area: Area) => {
        const w = Number(area.width);
        const h = Number(area.height);
        if (w > 20) this.padWidth = w;
        if (h > 20) this.padHeight = h;
      })
      .onTouch((event: TouchEvent) => {
        if (event.touches.length > 0) {
          this.updateFromPad(event.touches[0].x, event.touches[0].y);
        }
      })

      // 色相滑条
      Column({ space: 6 }) {
        Row() {
          Text('色相').fontSize(12).fontColor(MUTED).layoutWeight(1)
          Text(`${Math.round(this.hue)}°`).fontSize(12).fontColor(TEXT)
        }.width('100%')
        Stack({ alignContent: Alignment.Center }) {
          Row().width('100%').height(14).borderRadius(7)
            .linearGradient({
              angle: 90,
              colors: [
                ['#FF0000', 0], ['#FFFF00', 0.17], ['#00FF00', 0.33],
                ['#00FFFF', 0.5], ['#0000FF', 0.67], ['#FF00FF', 0.83], ['#FF0000', 1]
              ]
            })
          Slider({ value: Math.round(this.hue), min: 0, max: 359, step: 1 })
            .width('100%')
            .trackColor(Color.Transparent)
            .selectedColor(Color.Transparent)
            .blockColor('#FFFFFF')
            .onChange((v: number) => {
              this.hue = Math.max(0, Math.min(359, v));
              this.hexDraft = this.currentHex();
            })
        }.width('100%').height(28)
      }.width('100%')

      // 精选色板
      Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween }) {
        ForEach(SWATCH_COLORS, (hex: string) => {
          Row()
            .width(34).height(34).borderRadius(17)
            .backgroundColor(hex)
            .margin({ bottom: 8, right: 6 })
            .border({ width: this.currentHex() === hex ? 2.5 : 1, color: this.currentHex() === hex ? '#FFFFFF' : '#35FFFFFF' })
            .onClick(() => this.applyHex(hex))
        }, (hex: string) => hex)
      }.width('100%')

      // 十六进制输入 + 实时预览
      Row({ space: 10 }) {
        Text('色值').fontSize(13).fontColor(MUTED)
        TextInput({ text: this.hexDraft, placeholder: '#7DD3FC' })
          .layoutWeight(1).height(40).fontSize(14).fontColor(TEXT).placeholderColor(MUTED)
          .backgroundColor('#16FFFFFF').borderRadius(12)
          .onChange((value: string) => {
            this.hexDraft = value;
            this.applyHex(value);
          })
      }.width('100%')

      Row({ space: 12 }) {
        Blank()
        Button('取消').attributeModifier(musicButtonPress).height(40).padding({ left: 18, right: 18 })
          .fontSize(13).fontColor(TEXT).backgroundColor('#18FFFFFF').borderRadius(20)
          .onClick(() => this.onCancel())
        Button('确定使用').attributeModifier(musicButtonPress).height(40).padding({ left: 20, right: 20 })
          .fontSize(13).fontColor(ON_ACCENT).backgroundColor(ACCENT).borderRadius(20)
          .onClick(() => this.onConfirm(this.currentHex()))
      }.width('100%')
    }
    .width('100%')
    .padding({ left: 22, right: 22, top: 20, bottom: 28 })
  }
}
