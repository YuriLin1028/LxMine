import { INK } from './Theme';

// Album colour and motion come from the shared MineRadio engine. The cover wash
// also fills the gap left by the stage spring before it settles.
@Component
export struct AmbientBackdrop {
  @Prop playing: boolean = false;
  @Prop styleName: string = 'mine-0';
  @Prop coverUrl: string = '';
  @Prop bgImage: string = '';
  @Prop bgOpacity: number = 0.78;
  @Prop colorFirst: string = '#FFFFFF';
  @Prop colorLast: string = '#B8B8B8';
  @Prop light: boolean = false;
  build() {
    Stack() {
      if (this.bgImage.length > 0) {
        Image(this.bgImage).width('100%').height('100%').objectFit(ImageFit.Cover)
          .opacity(Math.max(0, Math.min(1, this.bgOpacity)))
      } else if (this.coverUrl) {
        Image(this.coverUrl).sourceSize({ width: 512, height: 512 }).width('100%').height('100%').objectFit(ImageFit.Cover).blur(36)
          .opacity(Math.max(0, Math.min(1, this.bgOpacity)))
      }
      Column().width('100%').height('100%').backgroundColor(
        this.bgImage.length > 0
          ? (this.light ? '#38EBF0F6' : '#420C0E12')
          : (this.light ? '#59C8CDD4' : '#9E151619')
      )
    }.width('100%').height('100%').backgroundColor(this.light ? '#D0D4DB' : INK).hitTestBehavior(HitTestMode.None)
  }
}
