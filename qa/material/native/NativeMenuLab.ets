import { NativePlayer } from '../components/NativePlayer';
import { Song } from '../model/Song';
import {uiMaterial,display} from '@kit.ArkUI';
import {musicMaterial} from '../components/MaterialControls';
@Entry
@Component
struct NativeMenuLab {
  @State private textBackground:boolean=false;
  private song: Song = { source: 'wy', id: 'qa-native-menu', name: 'LxMine', singer: '', albumName: '', albumId: '', durationMs: 0, qualitys: ['128k'], coverUrl: '' };
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Image(this.textBackground?$rawfile('material-lab-type.png'):$rawfile('material-lab.png')).width(360).height(720).objectFit(ImageFit.Fill).position({x:0,y:0})
      NativePlayer({song:this.song,availableWidth:376,statusInset:38,styleName:'mine-7',quality:'flac',lines:[]})
      Select([{value:'标准'},{value:'高品质'},{value:'无损'}]).selected(0).value('标准').font({size:14}).backgroundColor(Color.Transparent).systemMaterial(musicMaterial()).onSelect(()=>{}).position({x:24,y:708}).id('menu-lab-select')
      Button(this.textBackground?'文字背景':'网格背景').position({x:24,y:752}).height(32).onClick(()=>{this.textBackground=!this.textBackground;}).id('menu-lab-background')
      Text(`DPR=${display.getDefaultDisplaySync().densityPixels}; supported=${uiMaterial.isImmersiveMaterialSupported()}; level=${uiMaterial.getGlobalMaterialLevel()}; scene=${this.textBackground?'type':'grid'}`).fontSize(10).fontColor(Color.White).position({x:4,y:790}).id('menu-lab-metadata')
    }.width('100%').height('100%').backgroundColor('#303030').expandSafeArea([SafeAreaType.SYSTEM],[SafeAreaEdge.TOP,SafeAreaEdge.BOTTOM])
  }
}
