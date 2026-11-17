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
  @Prop light: boolean = false;
  build() {
    Stack() {
      if (this.coverUrl) {
        Image(this.coverUrl).sourceSize({ width: 512, height: 512 }).width('100%').height('100%').objectFit(ImageFit.Cover).blur(36).opacity(this.light ? 0.32 : 0.82)
      }
      Column().width('100%').height('100%').backgroundColor(this.light ? '#59C8CDD4' : '#9E151619')
    }.width('100%').height('100%').backgroundColor(this.light ? '#D0D4DB' : INK).hitTestBehavior(HitTestMode.None)
  }
}
