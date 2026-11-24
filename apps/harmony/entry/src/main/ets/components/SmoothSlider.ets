import { ACCENT, TEXT } from './Theme';

/**
 * 丝滑连续滑动条：拖动期按像素连续跟随手指（无档位顿挫与磁盘写阻塞），
 * 点击轨道任意位置即刻跳转并触发提交；仅在松手/点击时按 step 精确取整提交。
 */
@Component
export struct SmoothSlider {
  @Prop @Watch('propChanged') value: number = 0;
  @Prop min: number = 0;
  @Prop max: number = 100;
  @Prop step: number = 0;
  @Prop selectedColor: ResourceColor = ACCENT;
  @Prop trackColor: ResourceColor = '#38FFFFFF';
  @Prop thumbColor: ResourceColor = TEXT;
  @Prop liveThrottleMs: number = 40;
  @Prop label: string = '滑动条';
  onLiveChange: (value: number) => void = () => {};
  onCommit: (value: number) => void = () => {};

  @State private dragging: boolean = false;
  @State private draftValue: number = 0;
  @State private trackWidth: number = 180;
  private lastLiveAt: number = 0;
  private lastLiveEmitted: number = Number.NaN;

  aboutToAppear(): void {
    this.draftValue = this.clamp(this.value);
  }

  private propChanged(): void {
    if (!this.dragging) {
      this.draftValue = this.clamp(this.value);
    }
  }

  private clamp(v: number): number {
    const lo = Math.min(this.min, this.max);
    const hi = Math.max(this.min, this.max);
    return Math.max(lo, Math.min(hi, v));
  }

  private snap(v: number): number {
    const clamped = this.clamp(v);
    if (this.step > 0) {
      const snapped = this.min + Math.round((clamped - this.min) / this.step) * this.step;
      return this.clamp(Math.round(snapped * 10000) / 10000);
    }
    return clamped;
  }

  private activeValue(): number {
    return this.dragging ? this.draftValue : this.clamp(this.value);
  }

  private ratio(): number {
    const span = Math.max(0.0001, this.max - this.min);
    return Math.max(0, Math.min(1, (this.activeValue() - this.min) / span));
  }

  private thumbSize(): number {
    return this.dragging ? 17 : 14;
  }

  private valueFromX(localX: number): number {
    const half = 8;
    const usable = Math.max(1, this.trackWidth - half * 2);
    const frac = Math.max(0, Math.min(1, (localX - half) / usable));
    return this.clamp(this.min + (this.max - this.min) * frac);
  }

  private thumbOffsetX(): number {
    const size = this.thumbSize();
    const half = 8;
    const usable = Math.max(1, this.trackWidth - half * 2);
    const center = half + usable * this.ratio();
    return Math.max(0, Math.min(this.trackWidth - size, center - size / 2));
  }

  private emitLive(raw: number, force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastLiveAt < this.liveThrottleMs) return;
    const val = this.snap(raw);
    if (!force && val === this.lastLiveEmitted) return;
    this.lastLiveAt = now;
    this.lastLiveEmitted = val;
    this.onLiveChange(val);
  }

  private handleTouch(event: TouchEvent): void {
    event.stopPropagation();
    const touch = (event.changedTouches && event.changedTouches.length > 0 ? event.changedTouches[0] : null)
      ?? (event.touches && event.touches.length > 0 ? event.touches[0] : null);
    if (!touch) return;
    const raw = this.valueFromX(touch.x);
    if (event.type === TouchType.Down) {
      this.dragging = true;
      this.draftValue = raw;
      this.lastLiveEmitted = Number.NaN;
      this.emitLive(raw, true);
    } else if (event.type === TouchType.Move) {
      if (!this.dragging) this.dragging = true;
      this.draftValue = raw;
      this.emitLive(raw, false);
    } else if (event.type === TouchType.Up) {
      const finalVal = this.snap(raw);
      this.draftValue = finalVal;
      this.dragging = false;
      this.onLiveChange(finalVal);
      this.onCommit(finalVal);
    } else if (event.type === TouchType.Cancel) {
      this.draftValue = this.clamp(this.value);
      this.dragging = false;
    }
  }

  build() {
    Stack({ alignContent: Alignment.Start }) {
      Row()
        .width('100%')
        .height(4)
        .borderRadius(999)
        .backgroundColor(this.trackColor)
        .hitTestBehavior(HitTestMode.None)
      if (this.ratio() > 0.001) {
        Row()
          .width(`${(this.ratio() * 100).toFixed(3)}%`)
          .height(4)
          .borderRadius(999)
          .backgroundColor(this.selectedColor)
          .hitTestBehavior(HitTestMode.None)
      }
      Row()
        .width(this.thumbSize())
        .height(this.thumbSize())
        .borderRadius(999)
        .backgroundColor(this.thumbColor)
        .border({ width: 1, color: '#45000000' })
        .shadow({ radius: this.dragging ? 8 : 5, color: '#55000000', offsetX: 0, offsetY: 1 })
        .position({ x: this.thumbOffsetX(), y: (36 - this.thumbSize()) / 2 })
        .hitTestBehavior(HitTestMode.None)
    }
    .width('100%')
    .height(36)
    .clip(false)
    .accessibilityText(this.label)
    .onAreaChange((_oldVal: Area, newVal: Area) => {
      const w = Number(newVal.width);
      if (w > 0) this.trackWidth = w;
    })
    .onTouch((event: TouchEvent) => this.handleTouch(event))
  }
}
