import { musicButtonPress } from './MaterialControls';
import { Song } from '../model/Song';
import { ACCENT, TEXT, MUTED, formatTime, sourceBadge } from './Theme';
import { MaterialIcon } from './MaterialControls';

// 搜索、歌单、播放队列共用的歌曲行；点击整行播放，收藏动作独立。
@Component
export struct SongRow {
  @Prop song: Song;
  @Prop active: boolean = false;
  @Prop liked: boolean = false;
  @Prop index: number = 0;
  @Prop wide: boolean = false;
  @Prop showDownload: boolean = true;
  @Prop hideDownload: boolean = false;
  @State private expanded: boolean = false;
  onPlay: () => void = () => {};
  onLike: () => void = () => {};
  onMore: () => void = () => {};
  onDownload: () => void = () => {};
  @Builder private actions() {
    Menu() {
      MenuItem({ content: this.liked ? '取消喜欢' : '喜欢' }).onClick(() => this.onLike())
      MenuItem({ content: '添加到歌单' }).onClick(() => this.onMore())
    }
  }
  build() {
    Column({ space: 0 }) {
    Row({ space: 12 }) {
      Stack({ alignContent: Alignment.TopEnd }) {
        Stack() {
          Image($r('app.media.ic_music')).width(22).height(22).fillColor(ACCENT)
          if (this.song.coverUrl) { Image(this.song.coverUrl).width('100%').height('100%').objectFit(ImageFit.Cover) }
        }.width(48).height(48).padding(0).borderRadius(10).clip(true).backgroundColor('#17FFFFFF')
        if (sourceBadge(this.song.source) !== null) {
          Image(sourceBadge(this.song.source)!).width(15).height(15).margin(2).borderRadius(8).clip(true)
        }
      }
      Column({ space: 5 }) {
        Text(this.song.name).fontSize(15).fontWeight(FontWeight.Medium).fontColor(this.active ? ACCENT : TEXT)
          .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
        Text(this.song.singer).fontSize(11).fontColor(MUTED)
          .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
      }.alignItems(HorizontalAlign.Start).layoutWeight(1)
      if (this.wide) {
        Text(formatTime(this.song.durationMs)).fontSize(11).fontColor(MUTED)
        MaterialIcon({ icon: $r('app.media.ic_heart'), label: this.liked ? '取消喜欢' : '喜欢', selected: this.liked, grouped: true, action: () => this.onLike() })
        MaterialIcon({ icon: $r('app.media.ic_plus'), label: '加入歌单', grouped: true, action: () => this.onMore() })
      }
      if (this.showDownload && !this.hideDownload && this.song.source !== 'local') {
        MaterialIcon({ icon: $r('app.media.ic_download'), label: '下载歌曲', grouped: true, action: () => this.onDownload() })
      }
      if (!this.wide) {
        Button({ type: ButtonType.Circle }) { SymbolGlyph($r('sys.symbol.chevron_down')).fontSize(16).fontColor([MUTED]).rotate({ angle: this.expanded ? 180 : 0 }) }.attributeModifier(musicButtonPress)
          .width(36).height(44).padding(0).stateEffect(false).backgroundColor(Color.Transparent).accessibilityText('展开歌曲操作')
          .onClick(() => { this.getUIContext().animateTo({ duration: 220, curve: Curve.Friction }, () => { this.expanded = !this.expanded; }); })
      }
    }.width('100%').padding({ top: 9, bottom: 9, left: 8, right: 4 })
    if (this.expanded && !this.wide) {
      Row({ space: 14 }) {
        Blank()
        MaterialIcon({ icon: $r('app.media.ic_heart'), label: this.liked ? '取消喜欢' : '喜欢', selected: this.liked, grouped: true, action: () => this.onLike() })
        MaterialIcon({ icon: $r('app.media.ic_plus'), label: '加入歌单', grouped: true, action: () => this.onMore() })
        Text(formatTime(this.song.durationMs)).fontSize(12).fontColor(MUTED)
      }.width('100%').padding({ right: 20, bottom: 8 })
    }
    }.width('100%').borderRadius(12).backgroundColor(this.active ? '#0FFFFFFF' : Color.Transparent).onClick(() => this.onPlay())
  }
}

