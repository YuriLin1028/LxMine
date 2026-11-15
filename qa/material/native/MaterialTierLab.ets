import { uiMaterial, display } from '@kit.ArkUI';
import { musicMaterial, musicMenuMaterial, musicSheetMaterial } from '../components/MaterialControls';

@Entry
@Component
struct MaterialTierLab {
  @State private materialEnabled: boolean = true;
  private density: number = display.getDefaultDisplaySync().densityPixels;
  @Builder private surfaces() {
    Stack({ alignContent: Alignment.TopStart }) {
      Row() {}.width(312).height(52).borderRadius(26).position({ x: 24, y: 56 })
        .backgroundColor(Color.Transparent).systemMaterial(this.materialEnabled ? musicMaterial() : uiMaterial.Material.empty).id('lab-tier-capsule')
      Row() {}.width(240).height(100).borderRadius(24).position({ x: 24, y: 128 })
        .backgroundColor(Color.Transparent).systemMaterial(this.materialEnabled ? musicMenuMaterial() : uiMaterial.Material.empty).id('lab-menu')
      Row() {}.width(42).height(42).borderRadius(21).position({ x: 24, y: 272 })
        .backgroundColor(Color.Transparent).systemMaterial(this.materialEnabled ? musicMaterial() : uiMaterial.Material.empty).id('lab-circle-42')
      Row() {}.width(312).height(160).borderRadius(30).position({ x: 24, y: 360 })
        .backgroundColor(Color.Transparent).systemMaterial(this.materialEnabled ? musicSheetMaterial() : uiMaterial.Material.empty).id('lab-sheet')
    }.width(360).height(600).clip(false)
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Image($rawfile('material-lab.png')).width(360).height(720).objectFit(ImageFit.Fill).id('lab-background')
      Navigation() { Column() {} }
        .title({ builder: this.surfaces, height: 600 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
        .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
        .width(360).height(620).backgroundColor(Color.Transparent).clip(false)
      Text(`DPR=${this.density}; supported=${uiMaterial.isImmersiveMaterialSupported()}; level=${uiMaterial.getGlobalMaterialLevel()}; enabled=${this.materialEnabled}`)
        .fontSize(12).fontColor(Color.White).width(350).position({ x: 4, y: 630 }).id('lab-metadata')
      Button(this.materialEnabled ? 'MATERIAL ON' : 'MATERIAL OFF').width(200).height(44).position({ x: 80, y: 672 })
        .onClick(() => { this.materialEnabled = !this.materialEnabled; }).id('material-lab-toggle')
    }.width(360).height(720).position({ x: 0, y: 0 })
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM]).backgroundColor('#242424')
  }
}
