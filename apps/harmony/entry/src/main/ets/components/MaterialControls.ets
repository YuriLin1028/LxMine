import { uiMaterial, curves, SymbolGlyphModifier } from '@kit.ArkUI';
import { musicSymbol } from './MusicSymbols';
import { TEXT, ACCENT } from './Theme';

// ImmersiveMaterial 的普通控件必须位于 Navigation 标题区；这个容器同时用于浮动播控。
// 不叠加自制背景、边框或 BlurStyle，让系统负责折射、触摸光效和降级。
// applyShadow 必须为 false：材质阴影会超出组件上边界，被容器切成"上部遮罩"
// （快捷胶囊/播放页顶排按钮实测），开发规范见 docs/MOBILE_PC_PARITY.md。
const MATERIAL: uiMaterial.ImmersiveMaterial = new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.ULTRA_THIN,
  materialColor: Color.Transparent, interactive: true, applyShadow: false, lightEffect: { color: '#FFFFFF' } });
const SURFACE: uiMaterial.ImmersiveMaterial = new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.ULTRA_THIN,
  materialColor: Color.Transparent, interactive: true, applyShadow: false, lightEffect: { color: '#FFFFFF' } });
const SHEET: uiMaterial.ImmersiveMaterial = new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.THICK,
  materialColor: $r('app.color.sheet_surface'), interactive: false, applyShadow: true });
const MENU: uiMaterial.ImmersiveMaterial = new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.THIN,
  materialColor: $r('app.color.menu_surface'), interactive: false, applyShadow: true });
export function musicMaterial(): uiMaterial.ImmersiveMaterial { return MATERIAL; }
export function musicSurfaceMaterial(): uiMaterial.ImmersiveMaterial { return SURFACE; }
export function musicSheetMaterial(): uiMaterial.ImmersiveMaterial { return SHEET; }
export function musicMenuMaterial(): uiMaterial.ImmersiveMaterial { return MENU; }
export const MATERIAL_PRESS_SCALE: number = 1.03;
class MusicButtonPress implements AttributeModifier<ButtonAttribute> {
  applyNormalAttribute(instance: ButtonAttribute): void {
    instance.stateEffect(false).scale({ x: 1, y: 1 });
  }
  applyPressedAttribute(instance: ButtonAttribute): void {
    instance.stateEffect(false).scale({ x: MATERIAL_PRESS_SCALE, y: MATERIAL_PRESS_SCALE });
  }
}
export const musicButtonPress: AttributeModifier<ButtonAttribute> = new MusicButtonPress();
@Component
export struct MaterialSelect {
  @Prop labels: string[] = [];
  @Prop values: string[] = [];
  @Prop value: string = '';
  @Prop label: string = '';
  @State private pressed: boolean = false;
  onChange: (value: string) => void = () => {};
  build() {
    Select(this.labels.map((value: string): SelectOption => { return { value }; }))
      .selected(Math.max(0, this.values.indexOf(this.value))).value(this.labels[Math.max(0, this.values.indexOf(this.value))])
      .width(148).height(40).font({ size: 13 }).fontColor(TEXT).selectedOptionFontColor(ACCENT)
      .arrowModifier(new SymbolGlyphModifier().fontSize(0)).showDefaultSelectedIcon(false)
      .backgroundColor(Color.Transparent).systemMaterial(musicMaterial()).accessibilityText(this.label)
      .scale({ x: this.pressed ? MATERIAL_PRESS_SCALE : 1, y: this.pressed ? MATERIAL_PRESS_SCALE : 1 })
      .onTouch((event: TouchEvent) => {
        if (event.type !== TouchType.Down && event.type !== TouchType.Up && event.type !== TouchType.Cancel) return;
        this.getUIContext().animateTo({ duration: 150, curve: Curve.EaseOut }, () => { this.pressed = event.type === TouchType.Down; });
      })
      .onSelect((index: number) => { this.pressed = false; this.onChange(this.values[index]); })
  }
}
@Component
export struct MaterialToggle {
  @Prop value: boolean = false;
  @Prop label: string = '';
  @State private pressed: boolean = false;
  onChange: (value: boolean) => void = () => {};
  build() {
    Toggle({ type: ToggleType.Switch, isOn: this.value })
      .selectedColor(ACCENT)
      .backgroundColor(Color.Transparent).systemMaterial(musicMaterial()).accessibilityText(this.label)
      .scale({ x: this.pressed ? MATERIAL_PRESS_SCALE : 1, y: this.pressed ? MATERIAL_PRESS_SCALE : 1 })
      .onTouch((event: TouchEvent) => {
        if (event.type !== TouchType.Down && event.type !== TouchType.Up && event.type !== TouchType.Cancel) return;
        this.getUIContext().animateTo({ duration: 150, curve: Curve.EaseOut }, () => { this.pressed = event.type === TouchType.Down; });
      })
      .onChange(this.onChange)
  }
}
@Component
export struct MaterialSurface {
  @Prop surfaceHeight: number = 72;
  @BuilderParam content: () => void = this.empty;
  @Builder private empty() { Column() {} }
  build() {
    Navigation() { Column() {} }
      .title({ builder: this.content, height: this.surfaceHeight + 32 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
      .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true)
      .mode(NavigationMode.Stack).width('100%').height(this.surfaceHeight + 32).backgroundColor(Color.Transparent).clip(false)
  }
}
@Component
export struct MaterialIcon {
  @Prop icon: Resource;
  @Prop label: string = '';
  @Prop diameter: number = 44;
  @Prop selected: boolean = false;
  @Prop disabled: boolean = false;
  @Prop grouped: boolean = false;
  @Prop componentId: string = '';
  @Prop raw: boolean = true;
  // 多色 SVG（红心实心/魔棒/星芒）关闭染色以保留原色，单色精雕矢量默认染为 TEXT/ACCENT。
  @Prop tint: boolean = true;
  @State private pressed: boolean = false;
  action: () => void = () => {};
  @Builder private glyph() {
      if (this.tint) {
        Image(this.icon).width(this.diameter > 56 ? 24 : 20).height(this.diameter > 56 ? 24 : 20).fillColor(this.selected ? ACCENT : TEXT)
      } else {
        Image(this.icon).width(this.diameter > 56 ? 24 : 20).height(this.diameter > 56 ? 24 : 20)
      }
  }
  build() {
    Button({ type: ButtonType.Circle }) { this.glyph() }
      .width(this.diameter).height(this.diameter).padding(0).stateEffect(false).buttonStyle(this.grouped ? ButtonStyleMode.TEXTUAL : ButtonStyleMode.NORMAL)
      .backgroundColor(Color.Transparent).fontColor(TEXT).systemMaterial(this.grouped ? uiMaterial.Material.empty : musicMaterial()).accessibilityText(this.label).enabled(!this.disabled)
      .id(this.componentId)
      // The enclosing dock owns its single press scale, including its contents.
      .scale({ x: this.pressed && !this.grouped ? MATERIAL_PRESS_SCALE : 1, y: this.pressed && !this.grouped ? MATERIAL_PRESS_SCALE : 1 })
      .onTouch((event: TouchEvent) => {
        if (this.disabled) return;
        if (event.type !== TouchType.Down && event.type !== TouchType.Up && event.type !== TouchType.Cancel) return;
        this.getUIContext().animateTo({ curve: curves.springMotion(0.36, 0.9) }, () => { this.pressed = event.type === TouchType.Down; });
      })
      .onClick(() => this.action())
  }
}

// A compact immersive-material ball. A Navigation title host gives the system
// material enough room for its rounded edge and light halo; the outer node stays
// at the visual ball size so it can sit in a text row without reflowing it.
@Component
export struct MaterialBall {
  @Prop icon: Resource;
  @Prop label: string = '';
  @Prop diameter: number = 36;
  @Prop componentId: string = '';
  // 顶栏返回等线条图标用系统 SymbolGlyph（旧版"小于号"观感）；
  // 首页"更多"等自定义实心图标保持 Image。
  @Prop symbol: boolean = false;
  @State private pressed: boolean = false;
  action: () => void = () => {};
  @Builder private content() {
    Button({ type: ButtonType.Circle }) {
      // 图标必须在承载 systemMaterial 的 Button 内部：拖拽形变时图标才会跟球一起动。
      Image(this.icon).width(this.diameter >= 38 ? 20 : 18).height(this.diameter >= 38 ? 20 : 18).fillColor(TEXT)
    }.width(this.diameter).height(this.diameter).margin({ left: 16, top: 16 }).padding(0)
      .backgroundColor(Color.Transparent).stateEffect(false).buttonStyle(ButtonStyleMode.NORMAL)
      .systemMaterial(musicMaterial()).accessibilityText(this.label)
      .scale({ x: this.pressed ? MATERIAL_PRESS_SCALE : 1, y: this.pressed ? MATERIAL_PRESS_SCALE : 1 })
      .onTouch((event: TouchEvent) => {
        if (event.type !== TouchType.Down && event.type !== TouchType.Up && event.type !== TouchType.Cancel) return;
        this.getUIContext().animateTo({ curve: curves.springMotion(0.36, 0.9) }, () => { this.pressed = event.type === TouchType.Down; });
      })
      .onClick(() => this.action()).id(this.componentId)
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Navigation() { Column() {} }
        .title({ builder: this.content, height: this.diameter + 32 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
        .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
        .width(this.diameter + 32).height(this.diameter + 32).backgroundColor(Color.Transparent).clip(false)
        .position({ x: -16, y: -16 }).hitTestBehavior(HitTestMode.Transparent)
    }.width(this.diameter).height(this.diameter).clip(false)
  }
}
