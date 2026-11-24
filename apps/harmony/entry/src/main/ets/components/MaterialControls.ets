import { uiMaterial, curves, SymbolGlyphModifier, LengthMetrics } from '@kit.ArkUI';
import { HdsNavigation, HdsNavigationTitleMode, DividerShowType, ScrollEffectType, HdsTabs, HdsTabsController, hdsMaterial, SystemMaterialParams } from '@kit.UIDesignKit';
import { musicSymbol } from './MusicSymbols';
import { TEXT, ACCENT } from './Theme';

/**
 * 自动检测当前鸿蒙设备是否原生已支持最高档（EXQUISITE）满血沉浸光感。
 * 已达最高档的旗舰设备无需显示「强化沉浸光感」开关；其余设备开放开关，通过 HDS 管线强制启用 EXQUISITE 沉浸光感。
 */
export function isNativeExquisiteDevice(): boolean {
  try {
    return uiMaterial.isImmersiveMaterialSupported()
      && uiMaterial.getGlobalMaterialLevel() === uiMaterial.MaterialLevel.EXQUISITE;
  } catch (_) {
    return false;
  }
}

export function nativeMaterialLevelLabel(): string {
  try {
    if (!uiMaterial.isImmersiveMaterialSupported()) return '基础材质';
    const level = uiMaterial.getGlobalMaterialLevel();
    if (level === uiMaterial.MaterialLevel.EXQUISITE) return '满血（EXQUISITE）';
    if (level === uiMaterial.MaterialLevel.GENTLE) return '中档（GENTLE）';
    if (level === uiMaterial.MaterialLevel.SMOOTH) return '流畅（SMOOTH）';
    return `档位 ${level}`;
  } catch (_) {
    return '标准材质';
  }
}

export function logMaterialCapabilities(boostActive: boolean): void {
  try {
    const supported = uiMaterial.isImmersiveMaterialSupported();
    const level = uiMaterial.getGlobalMaterialLevel();
    let hdsTypes: string = 'n/a';
    try { hdsTypes = JSON.stringify(hdsMaterial.getSystemMaterialTypes()); } catch (_) {}
    console.info(`[LxMineMaterial] supported=${supported} level=${level} label=${nativeMaterialLevelLabel()} hdsTypes=${hdsTypes} boost=${boostActive}`);
  } catch (e) {
    console.info(`[LxMineMaterial] probe failed: ${String(e)}`);
  }
}

export const HDS_EXQUISITE_EFFECT: SystemMaterialParams = {
  materialType: hdsMaterial.MaterialType.IMMERSIVE,
  materialLevel: hdsMaterial.MaterialLevel.EXQUISITE
};

export const EXQUISITE_PRESS_SCALE: number = 1.04;

export function exquisitePopupTransition(): TransitionEffect {
  return TransitionEffect.OPACITY
    .combine(TransitionEffect.scale({ x: 0.94, y: 0.94 }))
    .combine(TransitionEffect.translate({ y: 14 }))
    .animation({ curve: curves.springMotion(0.32, 0.78) });
}

export function exquisiteSpringCurve(): ICurve {
  return curves.springMotion(0.32, 0.76);
}

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
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
  @State private pressed: boolean = false;
  onChange: (value: string) => void = () => {};
  build() {
    Stack({ alignContent: Alignment.Center }) {
      if (this.boostImmersive) {
        HdsExquisiteCapsule({ pillWidth: 148, pillHeight: 40 })
      }
      Select(this.labels.map((value: string): SelectOption => { return { value }; }))
        .selected(Math.max(0, this.values.indexOf(this.value))).value(this.labels[Math.max(0, this.values.indexOf(this.value))])
        .width(148).height(40).font({ size: 13 }).fontColor(TEXT).selectedOptionFontColor(ACCENT)
        .arrowModifier(new SymbolGlyphModifier().fontSize(0)).showDefaultSelectedIcon(false)
        .backgroundColor(Color.Transparent).systemMaterial(this.boostImmersive ? uiMaterial.Material.empty : musicMaterial())
        .menuSystemMaterial(musicMenuMaterial()).accessibilityText(this.label)
        .onTouch((event: TouchEvent) => {
          if (event.type !== TouchType.Down && event.type !== TouchType.Up && event.type !== TouchType.Cancel) return;
          this.getUIContext().animateTo(
            this.boostImmersive ? { curve: curves.springMotion(0.30, 0.76) } : { duration: 150, curve: Curve.EaseOut },
            () => { this.pressed = event.type === TouchType.Down; }
          );
        })
        .onSelect((index: number) => { this.pressed = false; this.onChange(this.values[index]); })
    }
    .width(148).height(40).clip(false)
    .scale({
      x: this.pressed ? (this.boostImmersive ? EXQUISITE_PRESS_SCALE : MATERIAL_PRESS_SCALE) : 1,
      y: this.pressed ? (this.boostImmersive ? EXQUISITE_PRESS_SCALE : MATERIAL_PRESS_SCALE) : 1
    })
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
export struct HdsExquisiteCapsule {
  @Prop pillWidth: number = 0;
  @Prop pillHeight: number = 56;
  @State private measuredWidth: number = 0;
  private tabCtrl: HdsTabsController = new HdsTabsController();
  @Builder private emptyBar() {
    Column().width(1).height(1).opacity(0)
  }
  private resolvedWidth(): number {
    return this.pillWidth > 0 ? this.pillWidth : this.measuredWidth;
  }
  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      if (this.resolvedWidth() > 24) {
        HdsTabs({ controller: this.tabCtrl }) {
          TabContent() { Column().width('100%').height('100%').backgroundColor(Color.Transparent) }
            .tabBar((): void => { this.emptyBar(); })
        }
        .barPosition(BarPosition.End)
        .barOverlap(true)
        .vertical(false)
        .scrollable(false)
        .barHeight(this.pillHeight)
        .barBackgroundColor(Color.Transparent)
        .divider(undefined)
        .barFloatingStyle({
          barBottomMargin: 0,
          gradientMask: {
            maskColor: Color.Transparent,
            maskHeight: 0
          },
          barWidth: {
            smallWidth: this.resolvedWidth(),
            mediumWidth: this.resolvedWidth(),
            largeWidth: this.resolvedWidth()
          },
          lightColor: '#FFFFFF',
          systemMaterialEffect: HDS_EXQUISITE_EFFECT,
          thermoCtrl: false
        })
        .width(this.resolvedWidth())
        .height(this.pillHeight)
        .backgroundColor(Color.Transparent)
        .clip(false)
        .focusable(false)
        .hitTestBehavior(HitTestMode.None)
      }
    }
    .width(this.pillWidth > 0 ? this.pillWidth : '100%')
    .height(this.pillHeight)
    .clip(false)
    .focusable(false)
    .hitTestBehavior(HitTestMode.None)
    .onAreaChange((_old: Area, area: Area) => {
      if (this.pillWidth <= 0) {
        const w = Math.floor(Number(area.width));
        if (w > 24 && w !== this.measuredWidth) this.measuredWidth = w;
      }
    })
  }
}

@Component
export struct HdsExquisiteCircle {
  @Prop diameter: number = 40;
  @Prop icon: Resource | undefined = undefined;
  @Prop symbolRes: Resource | undefined = undefined;
  @Prop label: string = '';
  @Prop selected: boolean = false;
  @Prop disabled: boolean = false;
  @Prop tint: boolean = true;
  @Prop backdropOnly: boolean = false;
  @State private pressed: boolean = false;
  action: () => void = () => {};
  private iconSize(): number {
    if (this.diameter > 52) return 24;
    if (this.diameter <= 36) return 18;
    return 20;
  }
  build() {
    Stack({ alignContent: Alignment.Center }) {
      // HdsNavigation 仅承担 EXQUISITE 液态玻璃圆形底托：关闭焦点与命中，杜绝菜单项长按遮罩与内置按压方框。
      HdsNavigation() { Column() {} }
        .titleBar({
          padding: { start: LengthMetrics.vp(0), end: LengthMetrics.vp(0) },
          content: {
            menu: {
              value: [{
                content: {
                  label: '',
                  icon: new SymbolGlyphModifier($r('sys.symbol.circle')).fontSize(1).fontColor([Color.Transparent]),
                  isEnabled: true
                }
              }],
              maxCount: 1
            },
            divider: { showType: DividerShowType.OFF }
          },
          style: {
            scrollEffectOpts: { enableScrollEffect: false, scrollEffectType: ScrollEffectType.GRADIENT_BLUR },
            originalStyle: {
              backgroundStyle: { backgroundColor: Color.Transparent },
              contentStyle: { menuStyle: { iconColor: Color.Transparent } }
            },
            systemMaterialEffect: HDS_EXQUISITE_EFFECT,
            thermoCtrl: false
          },
          avoidLayoutSafeArea: false,
          enableComponentSafeArea: false
        })
        .titleMode(HdsNavigationTitleMode.MINI)
        .hideBackButton(true)
        .hideToolBar(true)
        .mode(NavigationMode.Stack)
        .width(40)
        .height(56)
        .backgroundColor(Color.Transparent)
        .clip(false)
        .scale({ x: this.diameter / 40, y: this.diameter / 40 })
        .focusable(false)
        .hitTestBehavior(HitTestMode.None)

      if (!this.backdropOnly) {
        Button({ type: ButtonType.Circle }) {
          if (this.symbolRes) {
            SymbolGlyph(this.symbolRes).fontSize(this.iconSize()).fontColor([this.selected ? ACCENT : TEXT])
          } else if (this.icon) {
            if (this.tint) {
              Image(this.icon).width(this.iconSize()).height(this.iconSize()).fillColor(this.selected ? ACCENT : TEXT)
            } else {
              Image(this.icon).width(this.iconSize()).height(this.iconSize())
            }
          }
        }
          .width(this.diameter).height(this.diameter).padding(0)
          .stateEffect(false)
          .buttonStyle(ButtonStyleMode.TEXTUAL)
          .backgroundColor(Color.Transparent)
          .systemMaterial(uiMaterial.Material.empty)
          .accessibilityText(this.label)
          .enabled(!this.disabled)
          .onTouch((event: TouchEvent) => {
            if (this.disabled) return;
            if (event.type !== TouchType.Down && event.type !== TouchType.Up && event.type !== TouchType.Cancel) return;
            this.getUIContext().animateTo({ curve: curves.springMotion(0.32, 0.78) }, () => {
              this.pressed = event.type === TouchType.Down;
            });
          })
          .onClick(() => { if (!this.disabled) this.action(); })
      }
    }
    .width(this.diameter)
    .height(this.diameter)
    .clip(false)
    .scale({
      x: this.pressed ? EXQUISITE_PRESS_SCALE : 1,
      y: this.pressed ? EXQUISITE_PRESS_SCALE : 1
    })
    .hitTestBehavior(this.backdropOnly ? HitTestMode.None : HitTestMode.Default)
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
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
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
    if (this.boostImmersive && !this.grouped) {
      HdsExquisiteCircle({
        diameter: this.diameter,
        icon: this.icon,
        label: this.label,
        selected: this.selected,
        disabled: this.disabled,
        tint: this.tint,
        action: () => this.action()
      }).id(this.componentId)
    } else {
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
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
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
    if (this.boostImmersive) {
      HdsExquisiteCircle({
        diameter: this.diameter,
        icon: this.icon,
        label: this.label,
        action: () => this.action()
      }).id(this.componentId)
    } else {
      Stack({ alignContent: Alignment.TopStart }) {
        Navigation() { Column() {} }
          .title({ builder: this.content, height: this.diameter + 32 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
          .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
          .width(this.diameter + 32).height(this.diameter + 32).backgroundColor(Color.Transparent).clip(false)
          .position({ x: -16, y: -16 }).hitTestBehavior(HitTestMode.Transparent)
      }.width(this.diameter).height(this.diameter).clip(false)
    }
  }
}
