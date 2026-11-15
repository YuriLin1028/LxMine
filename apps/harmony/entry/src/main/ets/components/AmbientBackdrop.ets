import { INK } from './Theme';

// Album colour and motion come from the shared MineRadio engine. The cover wash
// also fills the gap left by the stage spring before it settles.
@Component
export struct AmbientBackdrop {
  @Prop playing: boolean = false;
  @Prop styleName: string = 'mine-0';
  @Prop coverUrl: string = '';
  @Prop colorFirst: string = '#FFFFFF';
  @Prop colorLast: string = '#B8B8B8';
  build() {
    Stack() {
      if (this.coverUrl) {
        Image(this.coverUrl).width('100%').height('100%').objectFit(ImageFit.Cover).blur(36).opacity(0.82)
      } else {
        Column().width('100%').height('100%')
          .linearGradient({ angle: 155, colors: [[this.colorFirst, 0], [this.colorLast, 0.55], [INK, 1]] })
          .opacity(0.55)
      }
      Column().width('100%').height('100%').backgroundColor('#3D08090B')
    }.width('100%').height('100%').backgroundColor(INK).hitTestBehavior(HitTestMode.None)
  }
}
