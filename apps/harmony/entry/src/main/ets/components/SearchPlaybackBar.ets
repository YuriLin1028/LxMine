import { uiMaterial } from '@kit.ArkUI';
import { Song } from '../model/Song';
import { MaterialIcon, musicSurfaceMaterial, HdsExquisiteCapsule } from './MaterialControls';
import { TEXT, MUTED } from './Theme';

// Compact now-playing bar used by the search page and search results. It owns
// playback controls only; navigation stays out of the search surface.
@Component
export struct SearchPlaybackBar {
  @Prop song: Song | null = null;
  @Prop playing: boolean = false;
  @Prop busy: boolean = false;
  @Prop colorFirst: string = '#FFFFFF';
  @Prop colorLast: string = '#B8B8B8';
  @StorageLink('lxliaForeground') private foreground: boolean = true;
  @StorageProp('lxmineBoostImmersive') private boostImmersive: boolean = false;
  onPlayer: () => void = () => {};
  onToggle: () => void = () => {};
  onNext: (step: number) => void = () => {};
  onQueue: () => void = () => {};
  @State private coverAngle: number = 0;
  private spinTimer: number = -1;
  aboutToAppear(): void {
    this.spinTimer = setInterval(() => {
      if (this.playing && this.foreground) this.getUIContext().animateTo({ duration: 100, curve: Curve.Linear }, () => { this.coverAngle += 1.5; });
    }, 100);
  }
  aboutToDisappear(): void { clearInterval(this.spinTimer); }
  @LocalBuilder private content() {
    Stack({ alignContent: Alignment.Center }) {
      if (this.boostImmersive) {
        HdsExquisiteCapsule({ pillWidth: 0, pillHeight: 64 })
      }
      Row({ space: 8 }) {
        Stack() {
          SymbolGlyph($r('sys.symbol.music_note_list')).fontSize(20).fontColor([TEXT])
          if (this.song?.coverUrl) { Image(this.song.coverUrl).width('100%').height('100%').objectFit(ImageFit.Cover).rotate({ angle: this.coverAngle }) }
        }.width(44).height(44).borderRadius(22).clip(true).backgroundColor('#18FFFFFF')
          .onClick(() => { if (this.song) this.onPlayer(); })
        Column({ space: 3 }) {
          Text(this.song?.name ?? '尚未播放').fontSize(14).fontColor(TEXT).fontWeight(FontWeight.Medium).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
          Text(this.busy ? '正在准备…' : this.song?.singer ?? '选择歌曲，开始聆听').fontSize(11).fontColor(MUTED).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
        }.layoutWeight(1).alignItems(HorizontalAlign.Start).onClick(() => { if (this.song) this.onPlayer(); })
        MaterialIcon({ icon: $r('app.media.ic_previous'), label: '上一首', diameter: 34, grouped: true, disabled: !this.song || this.busy, action: () => this.onNext(-1) })
        MaterialIcon({ icon: this.playing ? $r('app.media.ic_pause') : $r('app.media.ic_play'), label: this.playing ? '暂停' : '播放', diameter: 40, grouped: true, disabled: this.busy || !this.song, action: () => this.onToggle() })
        MaterialIcon({ icon: $r('app.media.ic_next'), label: '下一首', diameter: 34, grouped: true, disabled: !this.song || this.busy, action: () => this.onNext(1) })
        MaterialIcon({ icon: $r('app.media.ic_queue'), label: '播放队列', diameter: 34, grouped: true, action: () => this.onQueue() })
      }.width('100%').height(64).padding({ left: 8, right: 8 }).borderRadius(32)
        .backgroundColor(Color.Transparent).systemMaterial(this.boostImmersive ? uiMaterial.Material.empty : musicSurfaceMaterial()).clip(false)
    }.width('100%').height(64).margin({ top: 16 }).clip(false)
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Navigation() { Column() {} }
        .title({ builder: this.content, height: 96 }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
        .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
        .width('100%').height(96).backgroundColor(Color.Transparent).clip(false).position({ x: 0, y: -16 })
    }.width('100%').height(64)
  }
}
