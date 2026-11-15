import { uiMaterial, display } from '@kit.ArkUI';
import { musicMaterial } from '../components/MaterialControls';

@Entry
@Component
struct MaterialLab {
  @State private materialEnabled: boolean = true;
  private density: number = display.getDefaultDisplaySync().densityPixels;
  @Builder private surfaces() {
    Stack({ alignContent: Alignment.TopStart }) {
      Row() {}.width(312).height(52).borderRadius(26).position({ x: 24, y: 112 })
        .backgroundColor(Color.Transparent).systemMaterial(this.materialEnabled ? musicMaterial() : uiMaterial.Material.empty).id('lab-capsule-52')
      Row() {}.width(312).height(72).borderRadius(36).position({ x: 24, y: 256 })
        .backgroundColor(Color.Transparent).systemMaterial(this.materialEnabled ? musicMaterial() : uiMaterial.Material.empty).id('lab-capsule-72')
      Row() {}.width(64).height(64).borderRadius(32).position({ x: 24, y: 400 })
        .backgroundColor(Color.Transparent).systemMaterial(this.materialEnabled ? musicMaterial() : uiMaterial.Material.empty).id('lab-circle-64')
      Row() {}.width(216).height(112).borderRadius(28).position({ x: 120, y: 400 })
        .backgroundColor(Color.Transparent).systemMaterial(this.materialEnabled ? musicMaterial() : uiMaterial.Material.empty).id('lab-panel-28')
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
