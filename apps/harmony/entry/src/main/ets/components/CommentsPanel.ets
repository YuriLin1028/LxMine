import { Song } from '../model/Song';
import { SongComment, SongComments, fetchSongComments } from '../services/MusicComments';
import { PageHeader } from './PageHeader';
import { TEXT, MUTED, ACCENT } from './Theme';

function relativeTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const diff = Date.now() - ms;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
  const date = new Date(ms);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

@Component
export struct CommentsPanel {
  @Prop @Watch('songChanged') song: Song | null = null;
  @Prop wide: boolean = false;
  @Prop statusInset: number = 28;
  @Prop bottomInset: number = 16;
  onClose: () => void = () => {};
  @State private data: SongComments | null = null;
  @State private loading: boolean = false;
  @State private error: string = '';
  private scroller: Scroller = new Scroller();
  private token: number = 0;
  aboutToAppear(): void { this.load(); }
  private songChanged(): void { this.load(); }
  private load(): void {
    const song = this.song;
    if (!song) { this.data = null; this.error = ''; this.loading = false; return; }
    const token = ++this.token;
    this.loading = true; this.error = ''; this.data = null;
    fetchSongComments(song).then((result: SongComments) => {
      if (token !== this.token) return;
      this.data = result; this.loading = false;
      setTimeout(() => { try { this.scroller.scrollTo({ xOffset: 0, yOffset: 0 }); } catch (_) {} }, 0);
    }).catch((reason: Error) => {
      if (token !== this.token) return;
      this.error = reason.message; this.loading = false;
    });
  }
  @Builder private commentRow(comment: SongComment) {
    Row({ space: 12 }) {
      Stack({ alignContent: Alignment.Center }) {
        if (comment.avatar) {
          Image(comment.avatar).width(40).height(40).borderRadius(20).objectFit(ImageFit.Cover).backgroundColor('#1A1C20')
        } else {
          Text(comment.nick.substring(0, 1)).fontSize(15).fontColor(ACCENT).width(40).height(40).textAlign(TextAlign.Center).backgroundColor('#16FFFFFF').borderRadius(20)
        }
      }.width(40).height(40).borderRadius(20).clip(true)
      Column({ space: 6 }) {
        Row({ space: 8 }) {
          Text(comment.nick).fontSize(13).fontColor(ACCENT).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1)
          Text(relativeTime(comment.time)).fontSize(10).fontColor(MUTED).maxLines(1)
        }.width('100%')
        Text(comment.content || '（图片评论）').fontSize(14).fontColor(TEXT).lineHeight(21).width('100%')
        Row({ space: 6 }) {
          if (comment.location) { Text(comment.location).fontSize(10).fontColor(MUTED).maxLines(1) }
          Blank()
          SymbolGlyph($r('sys.symbol.heart')).fontSize(12).fontColor([MUTED])
          Text(comment.liked > 0 ? `${comment.liked}` : '赞').fontSize(10).fontColor(MUTED)
        }.width('100%')
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
    }.width('100%').padding({ top: 12, bottom: 12 }).alignItems(VerticalAlign.Top)
  }
  @Builder private notice(platform: string) {
    Row({ space: 10 }) {
      Image($r('app.media.ic_comment_official')).width(18).height(18).fillColor(MUTED)
      Column({ space: 3 }) {
        Text(`评论来自${platform}`).fontSize(12).fontColor(TEXT)
        Text('仅供浏览，发表评论请前往原平台').fontSize(10).fontColor(MUTED)
      }.alignItems(HorizontalAlign.Start).layoutWeight(1)
    }.width('100%').padding(14).borderRadius(16).backgroundColor('#0DFFFFFF')
  }
  @Builder private stateBlock() {
    Column({ space: 14 }) {
      if (this.loading) {
        LoadingProgress().width(34).height(34).color(ACCENT)
        Text('正在读取评论…').fontSize(13).fontColor(MUTED)
      } else if (this.error) {
        Text(this.error).fontSize(13).fontColor('#FFB4B4').textAlign(TextAlign.Center).maxLines(3)
        Button('重试').fontSize(13).fontColor(TEXT).height(36).padding({ left: 20, right: 20 }).backgroundColor('#16FFFFFF').borderRadius(18).onClick(() => this.load())
      } else {
        Image($r('app.media.ic_comment_official')).width(30).height(30).fillColor(MUTED)
        Text('还没有评论').fontSize(13).fontColor(MUTED)
      }
    }.width('100%').height(280).justifyContent(FlexAlign.Center)
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column().width('100%').height('100%').backgroundColor('#0A08090B').backgroundBlurStyle(BlurStyle.COMPONENT_THIN)
      Column() {
        PageHeader({ title: this.song?.name ?? '歌曲评论',
          subtitle: this.song ? `${this.song.singer}${this.data ? ' · ' + this.data.platform : ''}` : '网络平台评论',
          wide: this.wide, topInset: this.statusInset, backLabel: '返回歌曲', onBack: () => this.onClose() })
        Scroll(this.scroller) {
          Column({ space: 16 }) {
            if (this.data) {
              this.notice(this.data.platform)
              if (this.data.hot.length) {
                Text('热门评论').fontSize(18).fontWeight(FontWeight.Medium).fontColor(TEXT).width('100%')
                ForEach(this.data.hot, (comment: SongComment) => {
                  this.commentRow(comment)
                  Divider().color('#12FFFFFF').strokeWidth(1)
                }, (comment: SongComment) => 'hot-' + comment.id)
              }
              if (this.data.latest.length) {
                Text('最新评论').fontSize(18).fontWeight(FontWeight.Medium).fontColor(TEXT).width('100%').margin({ top: 4 })
                ForEach(this.data.latest, (comment: SongComment, index: number) => {
                  this.commentRow(comment)
                  if (index < (this.data?.latest.length ?? 0) - 1) Divider().color('#12FFFFFF').strokeWidth(1)
                }, (comment: SongComment) => 'new-' + comment.id)
              }
              Text(`共 ${this.data.total} 条评论，仅显示近期公开内容`).fontSize(11).fontColor(MUTED).width('100%').textAlign(TextAlign.Center).margin({ top: 6 })
            } else {
              this.stateBlock()
            }
          }.width('100%').constraintSize({ maxWidth: 860 }).padding({ left: this.wide ? 32 : 20, right: this.wide ? 32 : 20, top: 6, bottom: this.bottomInset + 40 }).alignItems(HorizontalAlign.Start)
        }.layoutWeight(1).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring)
      }.width('100%').height('100%')
    }.width('100%').height('100%').expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
