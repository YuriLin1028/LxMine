import { musicButtonPress } from './MaterialControls';
import { Song } from '../model/Song';
import { songKey } from '../services/MusicLibrary';
import { isHarmonyPc } from '../services/HarmonyPcWindowService';
import { ACCENT, TEXT, MUTED, formatTime, sourceBadge } from './Theme';
import { MaterialIcon } from './MaterialControls';

// 搜索、歌单、播放队列共用的歌曲行；点击整行播放，收藏/切换平台动作独立。
@Component
export struct SongRow {
  @Prop song: Song;
  @Prop active: boolean = false;
  @Prop liked: boolean = false;
  @Prop index: number = 0;
  @Prop wide: boolean = false;
  @Prop showDownload: boolean = true;
  @Prop hideDownload: boolean = false;
  @Prop showRemove: boolean = false;
  @Prop showSwitchPlatform: boolean = false;
  @Prop showPlayNext: boolean = false;
  @Prop removeLabel: string = '从歌单移除';
  @StorageProp('lxmine_liked_keys') private likedKeysBlob: string = '';
  @State private expanded: boolean = false;
  onPlay: () => void = () => {};
  onPlayNext: () => void = () => {};
  onLike: () => void = () => {};
  onMore: () => void = () => {};
  onDownload: () => void = () => {};
  onRemove: () => void = () => {};
  onSwitchPlatform: () => void = () => {};

  private isRowLiked(): boolean {
    if (this.likedKeysBlob.length > 0) {
      return this.likedKeysBlob.includes('|' + songKey(this.song) + '|');
    }
    return this.liked;
  }

  private static readonly GRADS: string[][] = [
    ['#1E3A8A', '#38BDF8'], ['#0F6F5C', '#3FA796'], ['#312E81', '#818CF8'],
    ['#164E63', '#22D3EE'], ['#4C1D95', '#A78BFA'], ['#0C4A6E', '#60A5FA'],
  ];

  private gradFor(name: string): string[] {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return SongRow.GRADS[hash % SongRow.GRADS.length];
  }

  @Builder private actions() {
    Menu() {
      if (this.showPlayNext) {
        MenuItem({ content: '下一首播放' }).onClick(() => this.onPlayNext())
      }
      MenuItem({ content: this.isRowLiked() ? '取消收藏' : '收藏' }).onClick(() => this.onLike())
      MenuItem({ content: '添加到歌单' }).onClick(() => this.onMore())
      if (this.showDownload && !this.hideDownload && this.song.source !== 'local') {
        MenuItem({ content: '下载歌曲' }).onClick(() => this.onDownload())
      }
      if (this.showSwitchPlatform && this.song.source !== 'local') {
        MenuItem({ content: '切换歌曲平台' }).onClick(() => this.onSwitchPlatform())
      }
      if (this.showRemove) {
        MenuItem({ content: this.removeLabel }).onClick(() => this.onRemove())
      }
    }
  }

  build() {
    Column({ space: 0 }) {
      Row({ space: 10 }) {
        Stack({ alignContent: Alignment.TopEnd }) {
          Stack() {
            Column() {
              Image($r('app.media.ic_music')).width(20).height(20).fillColor('#E8FFFFFF')
            }.width('100%').height('100%').justifyContent(FlexAlign.Center)
             .linearGradient({ angle: 135, colors: [[this.gradFor(this.song.name)[0], 0], [this.gradFor(this.song.name)[1], 1]] })
            if (this.song.coverUrl) {
              Image(this.song.coverUrl).sourceSize({ width: 128, height: 128 }).autoResize(true).width('100%').height('100%').objectFit(ImageFit.Cover)
            }
          }.width(48).height(48).padding(0).borderRadius(10).clip(true).backgroundColor('#17191C')
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
          MaterialIcon({ icon: this.isRowLiked() ? $r('app.media.ic_heart_fill') : $r('app.media.ic_heart'), tint: !this.isRowLiked(), label: this.isRowLiked() ? '取消收藏' : '收藏', selected: this.isRowLiked(), grouped: true, action: () => this.onLike() })
          if (this.showPlayNext) {
            MaterialIcon({ icon: $r('app.media.ic_play_next'), label: '下一首播放', grouped: true, action: () => this.onPlayNext() })
          }
          if (this.showSwitchPlatform && this.song.source !== 'local') {
            MaterialIcon({ icon: $r('app.media.ic_switch_platform'), label: '切换歌曲平台', grouped: true, action: () => this.onSwitchPlatform() })
          }
          MaterialIcon({ icon: $r('app.media.ic_plus'), label: '加入歌单', grouped: true, action: () => this.onMore() })
          if (this.showRemove) {
            MaterialIcon({ icon: $r('app.media.ic_trash'), label: this.removeLabel, grouped: true, action: () => this.onRemove() })
          }
          if (this.showDownload && !this.hideDownload && this.song.source !== 'local') {
            MaterialIcon({ icon: $r('app.media.ic_download'), diameter: 44, label: '下载歌曲', grouped: true, action: () => this.onDownload() })
          }
        } else {
          Row({ space: 2 }) {
            MaterialIcon({ icon: this.isRowLiked() ? $r('app.media.ic_heart_fill') : $r('app.media.ic_heart'), diameter: 34, tint: !this.isRowLiked(), label: this.isRowLiked() ? '取消收藏' : '收藏', selected: this.isRowLiked(), grouped: true, action: () => this.onLike() })
            if (this.showPlayNext) {
              MaterialIcon({ icon: $r('app.media.ic_play_next'), diameter: 34, label: '下一首播放', grouped: true, action: () => this.onPlayNext() })
            }
            if (this.showDownload && !this.hideDownload && this.song.source !== 'local') {
              MaterialIcon({ icon: $r('app.media.ic_download'), diameter: 34, label: '下载歌曲', grouped: true, action: () => this.onDownload() })
            }
            Button({ type: ButtonType.Circle }) {
              Image($r('app.media.ic_down')).width(18).height(18).fillColor(MUTED).rotate({ angle: this.expanded ? 180 : 0 })
            }.attributeModifier(musicButtonPress)
              .width(30).height(40).padding(0).stateEffect(false).backgroundColor(Color.Transparent).accessibilityText('展开歌曲操作')
              .onClick(() => { this.getUIContext().animateTo({ duration: 220, curve: Curve.Friction }, () => { this.expanded = !this.expanded; }); })
          }.alignItems(VerticalAlign.Center)
        }
      }.width('100%').padding({ top: 9, bottom: 9, left: 8, right: 4 })
      if (this.expanded && !this.wide) {
        Row({ space: 12 }) {
          Blank()
          if (this.showSwitchPlatform && this.song.source !== 'local') {
            MaterialIcon({ icon: $r('app.media.ic_switch_platform'), label: '切换歌曲平台', grouped: true, action: () => this.onSwitchPlatform() })
          }
          MaterialIcon({ icon: $r('app.media.ic_plus'), label: '加入歌单', grouped: true, action: () => this.onMore() })
          if (this.showRemove) {
            MaterialIcon({ icon: $r('app.media.ic_trash'), label: this.removeLabel, grouped: true, action: () => this.onRemove() })
          }
          Text(formatTime(this.song.durationMs)).fontSize(12).fontColor(MUTED)
        }.width('100%').padding({ right: 20, bottom: 8 })
      }
    }.width('100%').borderRadius(12).backgroundColor(this.active ? '#0FFFFFFF' : Color.Transparent)
      .hoverEffect(HoverEffect.Highlight)
      .bindContextMenu(this.actions, isHarmonyPc() ? ResponseType.RightClick : ResponseType.LongPress)
      .onClick(() => this.onPlay())
  }
}
