import { ON_ACCENT, TEXT, MUTED, ACCENT } from './Theme';
import { EarMonitorMode, EarMonitorState } from '../services/EarMonitorService';
import { SmoothSlider } from './SmoothSlider';

interface EarModeOption {
  id: EarMonitorMode;
  label: string;
  desc: string;
}

const EAR_MODE_OPTIONS: EarModeOption[] = [
  { id: 'off', label: '关闭', desc: '关闭耳返' },
  { id: 'original', label: '原生', desc: '纯净零染色直通监听' },
  { id: 'ktv', label: 'KTV', desc: '明亮欢唱混响空间' },
  { id: 'theater', label: '剧场', desc: '温暖中小型剧场声场' },
  { id: 'concert', label: '音乐厅', desc: '宏大音乐厅华丽残响' }
];

@Component
export struct EarMonitorSheet {
  @Prop state: EarMonitorState = { mode: 'off', micVolume: 1.0, vocalVolume: 1.0, active: false, statusText: '未开启' };
  onSelectMode: (mode: EarMonitorMode) => void = () => {};
  onMicVolume: (value: number) => void = () => {};
  onVocalVolume: (value: number) => void = () => {};

  build() {
    Column({ space: 16 }) {
      Row({ space: 10 }) {
        Image($r('app.media.mic')).width(20).height(20).fillColor(this.state.active ? ACCENT : TEXT)
        Text(this.state.statusText || '佩戴耳机开启硬件低延迟实时耳返')
          .fontSize(12)
          .fontColor(this.state.active ? ACCENT : MUTED)
          .maxLines(2)
          .layoutWeight(1)
      }.width('100%')

      // 效果模式切换：关闭 / 原生 / KTV / 剧场 / 音乐厅
      Column({ space: 8 }) {
        Text('混响效果').fontSize(13).fontWeight(FontWeight.Medium).fontColor(MUTED).width('100%')
        Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
          ForEach(EAR_MODE_OPTIONS, (opt: EarModeOption) => {
            Text(opt.label)
              .fontSize(13)
              .fontWeight(this.state.mode === opt.id ? FontWeight.Medium : FontWeight.Normal)
              .fontColor(this.state.mode === opt.id ? ON_ACCENT : TEXT)
              .padding({ left: 14, right: 14, top: 8, bottom: 8 })
              .margin({ right: 8, bottom: 8 })
              .borderRadius(16)
              .backgroundColor(this.state.mode === opt.id ? ACCENT : '#1AFFFFFF')
              .onClick(() => this.onSelectMode(opt.id))
          }, (opt: EarModeOption) => opt.id)
        }.width('100%')
        Text(EAR_MODE_OPTIONS.find((item: EarModeOption) => item.id === this.state.mode)?.desc ?? '')
          .fontSize(11).fontColor(MUTED).width('100%')
      }.width('100%').padding(14).borderRadius(16).backgroundColor($r('app.color.card_surface'))

      // 麦克风音量 + 原唱人声
      Column({ space: 14 }) {
        Column({ space: 6 }) {
          Row({ space: 8 }) {
            Text('麦克风音量').fontSize(14).fontColor(TEXT).layoutWeight(1)
            Text(`${Math.round(this.state.micVolume * 100)}%`).fontSize(13).fontWeight(FontWeight.Medium).fontColor(ACCENT)
            Button({ type: ButtonType.Circle }) {
              Image($r('app.media.refresh')).width(14).height(14)
                .fillColor(Math.abs(this.state.micVolume - 1.0) > 0.01 ? ACCENT : MUTED)
            }
              .width(28).height(28).padding(0).backgroundColor('#14FFFFFF')
              .opacity(Math.abs(this.state.micVolume - 1.0) > 0.01 ? 1 : 0.55)
              .accessibilityText('重置麦克风音量')
              .onClick(() => this.onMicVolume(1.0))
          }.width('100%')
          SmoothSlider({
            value: Math.round(this.state.micVolume * 100),
            min: 0,
            max: 150,
            step: 1,
            selectedColor: ACCENT,
            trackColor: '#30FFFFFF',
            thumbColor: '#FFFFFF',
            label: '麦克风音量',
            onLiveChange: (val: number) => this.onMicVolume(Math.max(0, Math.min(1.5, val / 100))),
            onCommit: (val: number) => this.onMicVolume(Math.max(0, Math.min(1.5, val / 100)))
          }).width('100%')
        }.width('100%')

        Column({ space: 6 }) {
          Row({ space: 8 }) {
            Text('原唱人声（拉低保留伴奏）').fontSize(14).fontColor(TEXT).layoutWeight(1)
            Text(`${Math.round(this.state.vocalVolume * 100)}%`).fontSize(13).fontWeight(FontWeight.Medium).fontColor(ACCENT)
            Button({ type: ButtonType.Circle }) {
              Image($r('app.media.refresh')).width(14).height(14)
                .fillColor(Math.abs(this.state.vocalVolume - 1.0) > 0.01 ? ACCENT : MUTED)
            }
              .width(28).height(28).padding(0).backgroundColor('#14FFFFFF')
              .opacity(Math.abs(this.state.vocalVolume - 1.0) > 0.01 ? 1 : 0.55)
              .accessibilityText('重置原唱人声音量')
              .onClick(() => this.onVocalVolume(1.0))
          }.width('100%')
          SmoothSlider({
            value: Math.round(this.state.vocalVolume * 100),
            min: 0,
            max: 150,
            step: 1,
            selectedColor: ACCENT,
            trackColor: '#30FFFFFF',
            thumbColor: '#FFFFFF',
            label: '原唱人声音量',
            onLiveChange: (val: number) => this.onVocalVolume(Math.max(0, Math.min(1.5, val / 100))),
            onCommit: (val: number) => this.onVocalVolume(Math.max(0, Math.min(1.5, val / 100)))
          }).width('100%')
        }.width('100%')
      }.width('100%').padding(14).borderRadius(16).backgroundColor($r('app.color.card_surface'))

      Text('Beta 测试功能：建议佩戴有线或支持低延迟的耳机使用，避免外放啸叫。鸿蒙端调用系统硬件级 AudioLoopback 低延迟混响引擎。')
        .fontSize(11).fontColor(MUTED).width('100%')
    }.width('100%').padding({ bottom: 16 })
  }
}
