import { uiMaterial, curves } from '@kit.ArkUI';
import { musicSymbol } from './MusicSymbols';

// ImmersiveMaterial 的普通控件必须位于 Navigation 标题区；这个容器同时用于浮动播控。
// 不叠加自制背景、边框或 BlurStyle，让系统负责折射、触摸光效和降级。
// applyShadow 必须为 false：材质阴影会超出组件上边界，被容器切成"上部遮罩"
// （快捷胶囊/播放页顶排按钮实测），开发规范见 docs/MOBILE_PC_PARITY.md。
const MATERIAL: uiMaterial.ImmersiveMaterial = new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.ULTRA_THIN,
  materialColor: Color.Transparent, interactive: true, applyShadow: false, lightEffect: { color: '#FFFFFF' } });
const SURFACE: uiMaterial.ImmersiveMaterial = new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.ULTRA_THIN,
  materialColor: Color.Transparent, interactive: true, applyShadow: false, lightEffect: { color: '#FFFFFF' } });
const SHEET: uiMaterial.ImmersiveMaterial = new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.THICK,
  materialColor: '#A01A1C1F', interactive: false, applyShadow: true });
const MENU: uiMaterial.ImmersiveMaterial = new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.THIN,
  materialColor: '#D91A1C1F', interactive: false, applyShadow: true });
export function musicMaterial(): uiMaterial.ImmersiveMaterial { return MATERIAL; }
export function musicSurfaceMaterial(): uiMaterial.ImmersiveMaterial { return SURFACE; }
export function musicSheetMaterial(): uiMaterial.ImmersiveMaterial { return SHEET; }
export function musicMenuMaterial(): uiMaterial.ImmersiveMaterial { return MENU; }
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
  @Prop raw: boolean = false;
  // raw 图标默认用 fillColor 染成白色；描边型 SVG（sparkle/scan）需关闭染色保留原描边。
  @Prop tint: boolean = true;
  @State private pressed: boolean = false;
  action: () => void = () => {};
  build() {
    Button({ type: ButtonType.Circle }) {
      if (this.raw) {
        // 二级页顶栏也用 38 球 + 20 图标；raw 与 MaterialBall 的 24×24 SVG 同源，避免描边粗细不一。
        if (this.tint) {
          Image(this.icon).width(this.diameter > 56 ? 22 : 20).height(this.diameter > 56 ? 22 : 20).fillColor(this.selected ? '#F4D28A' : '#F4F4F4')
        } else {
          Image(this.icon).width(this.diameter > 56 ? 22 : 20).height(this.diameter > 56 ? 22 : 20)
        }
      } else {
        SymbolGlyph(musicSymbol(this.icon)).fontSize(this.diameter > 56 ? 26 : this.diameter === 38 ? 20 : 21)
          .fontColor([this.selected ? '#F4D28A' : '#F4F4F4'])
      }
    }.width(this.diameter).height(this.diameter).padding(0).stateEffect(false).buttonStyle(this.grouped ? ButtonStyleMode.TEXTUAL : ButtonStyleMode.NORMAL)
      .backgroundColor(Color.Transparent).fontColor('#F2F1F7').systemMaterial(this.grouped ? uiMaterial.Material.empty : musicMaterial()).accessibilityText(this.label).enabled(!this.disabled)
      .id(this.componentId)
      .scale({ x: this.pressed ? 0.94 : 1, y: this.pressed ? 0.94 : 1 })
      .animation({ curve: curves.springMotion(0.36, 0.9) })
      .onTouch((event: TouchEvent) => {
        if (this.disabled) return;
        if (event.type === TouchType.Down) this.pressed = true;
        else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.pressed = false;
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
      if (this.symbol) {
        SymbolGlyph(musicSymbol(this.icon)).fontSize(this.diameter >= 38 ? 20 : 18).fontColor(['#F4F4F4'])
      } else {
        Image(this.icon).width(this.diameter >= 38 ? 20 : 18).height(this.diameter >= 38 ? 20 : 18).fillColor('#F4F4F4')
      }
    }.width(this.diameter).height(this.diameter).margin({ left: 16, top: 16 }).padding(0)
      .backgroundColor(Color.Transparent).stateEffect(false).buttonStyle(ButtonStyleMode.NORMAL)
      .systemMaterial(musicMaterial()).accessibilityText(this.label)
      .scale({ x: this.pressed ? 0.94 : 1, y: this.pressed ? 0.94 : 1 })
      .animation({ curve: curves.springMotion(0.36, 0.9) })
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) this.pressed = true;
        else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.pressed = false;
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
