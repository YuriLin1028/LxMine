import { MaterialBall } from './MaterialControls';
import { TEXT, MUTED } from './Theme';

// 二级及以下页面唯一顶栏（docs/MOBILE_PC_PARITY.md「二级页顶栏」规范）：
// 38vp 返回球 + 28vp 粗标题 + 12vp 副标题，视觉球顶固定 statusInset + 6vp。
// 返回球使用 MaterialBall：自带 Navigation 标题宿主与 16vp 材质上伸空间，
// 因此放在页面 Stack / 根 Navigation 标题区 / 评论浮层里都能保持同样的沉浸材质与拖拽形变。
// 标题块必须与球顶端对齐，只允许副标题向下生长；Row 垂直居中会在两行标题时把球压下去。
@Component
export struct PageHeader {
  @Prop title: string = '';
  @Prop subtitle: string = '';
  @Prop wide: boolean = false;
  @Prop topInset: number = 0;
  @Prop backLabel: string = '返回';
  @Prop showBack: boolean = true;
  @BuilderParam actions: () => void = this.emptyActions;
  onBack: () => void = () => {};
  @Builder private emptyActions() { Column() {} }
  build() {
    Row({ space: 12 }) {
      if (this.showBack) {
        MaterialBall({ icon: $r('app.media.ic_back'), diameter: 38, label: this.backLabel, symbol: true, action: () => this.onBack() })
      }
      Column({ space: 3 }) {
        Text(this.title).fontSize(28).fontWeight(FontWeight.Bold).fontColor(TEXT).maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
        if (this.subtitle) {
          Text(this.subtitle).fontSize(12).fontColor(MUTED).maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
        }
      }.alignItems(HorizontalAlign.Start).layoutWeight(1).margin({ top: 2 })
      // 子页操作球统一 38vp、间距 8vp；没有操作时由空 Row 占 0 宽。
      Row({ space: 8 }) { this.actions() }.alignItems(VerticalAlign.Top)
    }
    .width('100%')
    .alignItems(VerticalAlign.Top)
    .padding({ left: this.wide ? 32 : 20, right: this.wide ? 32 : 20, top: this.topInset + 6, bottom: 6 })
  }
}
