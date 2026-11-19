import { Song } from '../model/Song';
import { LxHost } from '../services/LxRuntime';
import { searchLx, LxSearchSource } from '../services/SearchApi';
import { songKey } from '../services/MusicLibrary';
import { musicButtonPress, musicSheetMaterial } from './MaterialControls';
import { ACCENT, TEXT, MUTED, formatTime, platformName, sourceBadge } from './Theme';

interface PlatformTabSpec {
  id: string;
  label: string;
}

const PLATFORM_TABS: PlatformTabSpec[] = [
  { id: 'all', label: '智能推荐' },
  { id: 'wy', label: '网易云' },
  { id: 'tx', label: 'QQ音乐' },
  { id: 'kg', label: '酷狗' },
  { id: 'kw', label: '酷我' },
];

@Component
export struct PlatformSwitchDialog {
  @Prop song: Song;
  @Prop contextLabel: string = '播放队列';
  @Prop statusInset: number = 28;
  @Prop bottomInset: number = 16;
  host: LxHost | null = null;
  onSelect: (replacement: Song) => void = () => {};
  onClose: () => void = () => {};

  @State private activeTab: string = 'all';
  @State private loading: boolean = true;
  @State private candidates: Song[] = [];
  @State private errorText: string = '';
  private requestId: number = 0;

  aboutToAppear(): void {
    this.fetchCandidates('all');
  }

  private async fetchCandidates(tab: string): Promise<void> {
    this.activeTab = tab;
    this.loading = true;
    this.errorText = '';
    const token = ++this.requestId;
    const keyword = `${this.song.name} ${(this.song.singer ?? '').replace(/未知歌手|本地文件/g, '').split(/[、,&/;，]/)[0]}`.trim();
    try {
      let items: Song[] = [];
      if (tab === 'all' && this.host) {
        const raw = await this.host.catalogue('platform-candidates', JSON.stringify({
          song: this.song,
          sources: ['wy', 'tx', 'kg', 'kw'],
        }));
        items = JSON.parse(raw) as Song[];
      } else if (tab !== 'all') {
        const res = await searchLx(tab as LxSearchSource, keyword || this.song.name, 1, 20);
        items = res.items;
        if (this.host) {
          const missing = items.filter((s: Song) => !s.coverUrl).slice(0, 10);
          if (missing.length > 0) {
            try {
              const coverRaw = await this.host.catalogue('song-covers', JSON.stringify({ songs: missing }));
              const coverMap = JSON.parse(coverRaw) as Record<string, string>;
              items = items.map((s: Song): Song => {
                const found = coverMap[`${s.source}:${s.id}`];
                if (!s.coverUrl && found) {
                  const copy = JSON.parse(JSON.stringify(s)) as Song;
                  copy.coverUrl = found;
                  return copy;
                }
                return s;
              });
            } catch (_) {}
          }
        }
      }
      if (token !== this.requestId) return;
      this.candidates = items;
      if (!items.length) this.errorText = '暂未检索到同曲目其他平台版本';
    } catch (e) {
      if (token !== this.requestId) return;
      this.errorText = (e as Error).message || '检索其他平台版本失败';
    } finally {
      if (token === this.requestId) this.loading = false;
    }
  }

  private bestQualityLabel(song: Song): string {
    const qs = song.qualitys ?? [];
    if (qs.includes('flac24bit')) return 'Hi-Res';
    if (qs.includes('flac')) return 'FLAC';
    if (qs.includes('320k')) return '320k';
    return '128k';
  }

  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#66000000')
        .backdropBlur(20)
        .onClick(() => this.onClose())

      Column({ space: 14 }) {
        Row({ space: 10 }) {
          Column({ space: 4 }) {
            Text('切换歌曲平台').fontSize(20).fontWeight(FontWeight.Bold).fontColor(TEXT)
            Text(`${this.song.name} · ${this.song.singer}（当前：${platformName(this.song.source ?? '')} · ${this.contextLabel}）`)
              .fontSize(12).fontColor(MUTED).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          Button('关闭').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontColor(MUTED)
            .onClick(() => this.onClose())
        }.width('100%')

        Row({ space: 8 }) {
          ForEach(PLATFORM_TABS, (tab: PlatformTabSpec) => {
            Button(tab.label, { type: ButtonType.Normal })
              .attributeModifier(musicButtonPress)
              .height(34)
              .padding({ left: 12, right: 12 })
              .fontSize(12)
              .fontColor(this.activeTab === tab.id ? '#06131F' : TEXT)
              .fontWeight(this.activeTab === tab.id ? FontWeight.Bold : FontWeight.Normal)
              .backgroundColor(this.activeTab === tab.id ? ACCENT : '#17FFFFFF')
              .borderRadius(17)
              .stateEffect(false)
              .onClick(() => { this.fetchCandidates(tab.id); })
          }, (tab: PlatformTabSpec) => tab.id)
        }.width('100%')

        if (this.loading) {
          Column({ space: 10 }) {
            LoadingProgress().width(32).height(32).color(ACCENT)
            Text('正在匹配各平台同曲目音源…').fontSize(13).fontColor(MUTED)
          }.width('100%').layoutWeight(1).justifyContent(FlexAlign.Center)
        } else if (this.errorText && !this.candidates.length) {
          Column({ space: 10 }) {
            Text(this.errorText).fontSize(14).fontColor(MUTED)
          }.width('100%').layoutWeight(1).justifyContent(FlexAlign.Center)
        } else {
          List({ space: 6 }) {
            ForEach(this.candidates, (cand: Song) => {
              ListItem() {
                Row({ space: 12 }) {
                  Stack({ alignContent: Alignment.TopEnd }) {
                    Stack() {
                      Image($r('app.media.ic_music')).width(20).height(20).fillColor(ACCENT)
                      if (cand.coverUrl) {
                        Image(cand.coverUrl).width('100%').height('100%').objectFit(ImageFit.Cover)
                      }
                    }.width(46).height(46).borderRadius(10).clip(true).backgroundColor('#1BFFFFFF')
                    if (sourceBadge(cand.source) !== null) {
                      Image(sourceBadge(cand.source)!).width(15).height(15).margin(2).borderRadius(8).clip(true)
                    }
                  }
                  Column({ space: 4 }) {
                    Row({ space: 6 }) {
                      Text(cand.name).fontSize(14).fontWeight(FontWeight.Medium)
                        .fontColor(songKey(cand) === songKey(this.song) ? ACCENT : TEXT)
                        .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1)
                    }.width('100%')
                    Text(`${cand.singer}${cand.albumName ? ' · ' + cand.albumName : ''}`)
                      .fontSize(11).fontColor(MUTED).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
                  }.alignItems(HorizontalAlign.Start).layoutWeight(1)
                  Column({ space: 4 }) {
                    Row({ space: 4 }) {
                      Text(platformName(cand.source ?? '')).fontSize(10).fontColor(ACCENT)
                        .padding({ left: 6, right: 6, top: 2, bottom: 2 }).backgroundColor('#1F64D2FF').borderRadius(6)
                      Text(this.bestQualityLabel(cand)).fontSize(9).fontColor(TEXT)
                        .padding({ left: 5, right: 5, top: 2, bottom: 2 }).backgroundColor('#1AFFFFFF').borderRadius(5)
                    }
                    Text(formatTime(cand.durationMs)).fontSize(11).fontColor(MUTED)
                  }.alignItems(HorizontalAlign.End)
                }
                .width('100%')
                .padding({ left: 10, right: 10, top: 8, bottom: 8 })
                .borderRadius(14)
                .backgroundColor(songKey(cand) === songKey(this.song) ? '#1764D2FF' : '#0AFFFFFF')
                .onClick(() => { this.onSelect(cand); })
              }
            }, (cand: Song) => `${cand.source}:${cand.id}:${cand.coverUrl ?? ''}`)
          }.width('100%').layoutWeight(1).scrollBar(BarState.Off)
        }
      }
      .width('100%')
      .height('72%')
      .padding({ left: 20, right: 20, top: 20, bottom: Math.max(20, this.bottomInset + 12) })
      .borderRadius({ topLeft: 28, topRight: 28 })
      .clip(true)
      .backgroundColor($r('app.color.menu_surface'))
      .backgroundBlurStyle(BlurStyle.BACKGROUND_THICK, {
        colorMode: ThemeColorMode.SYSTEM,
        adaptiveColor: AdaptiveColor.DEFAULT,
        scale: 1.0,
      })
      .border({ width: { top: 0.5 }, color: '#26FFFFFF' })
      .shadow({ radius: 32, color: '#40000000', offsetY: -6 })
      .onClick(() => {})
    }.width('100%').height('100%').id('platform-switch-dialog')
  }
}
