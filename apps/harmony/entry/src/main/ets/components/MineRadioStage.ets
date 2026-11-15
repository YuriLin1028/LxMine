import { webview } from '@kit.ArkWeb';
import { Song } from '../model/Song';
import { LyricLine } from '../services/LyricParser';
import http from '@ohos.net.http';
import { saveStageDiagnostics } from '../services/Store';
import { StageAudioProxy } from '../services/StageAudioProxy';

interface StageLyricColors { primary: string; secondary: string; highlight: string; glow: string; }
interface MineRadioMetadata { translationLines: LyricLine[]; lyricColorMode: string; lyricColors: StageLyricColors; id: string; audioUrl: string; mode: string; lines: LyricLine[]; name: string; singer: string; cover: string; duration: number; lyricOffset: number; topInset: number; bottomInset: number; }
class StageInputHost {
  onSeek: (time: number) => void = () => {};
  seek(time: number): void { if (Number.isFinite(time)) this.onSeek(Math.max(0, time)); }
}
@Component
export struct MineRadioStage {
  @Prop @Watch('metadataChanged') song: Song;
  @Prop @Watch('metadataChanged') audioUrl: string = '';
  @Prop @Watch('metadataChanged') lines: LyricLine[] = [];
  @Prop @Watch('metadataChanged') translationLines: LyricLine[] = [];
  @Prop @Watch('metadataChanged') lyricColorMode: string = 'custom-gradient';
  @Prop @Watch('metadataChanged') lyricPrimary: string = '#F4D28A';
  @Prop @Watch('metadataChanged') lyricSecondary: string = '#8FB2A6';
  @Prop @Watch('metadataChanged') mode: string = 'mine-0';
  @Prop @Watch('metadataChanged') duration: number = 0;
  @Prop @Watch('metadataChanged') lyricOffset: number = 0;
  @Prop @Watch('metadataChanged') topInset: number = 0;
  @Prop @Watch('metadataChanged') bottomInset: number = 0;
  @Prop @Watch('clockChanged') positionMs: number = 0;
  @Prop @Watch('clockChanged') playing: boolean = false;
  @Prop @Watch('visibilityChanged') visible: boolean = true;
  private controller: webview.WebviewController = new webview.WebviewController();
  private ready: boolean = false;
  private lastPlaying: boolean = false;
  private lastPosition: number = 0;
  private recoveryCount: number = 0;
  private diagnosticTimer: number = -1;
  private audioProxy: StageAudioProxy = new StageAudioProxy();
  private inputHost: StageInputHost = new StageInputHost();
  onSeek: (time: number) => void = () => {};
  aboutToAppear(): void {
    this.inputHost.onSeek = (time: number) => { this.onSeek(time); this.scheduleDiagnostics(); };
    this.audioProxy.start(`${this.getUIContext().getHostContext()!.filesDir}/Downloads/`).then(() => this.metadataChanged()).catch((error: Error) => console.warn(`[MineRadioStage] analysis proxy: ${error.message}`));
  }
  private visibilityChanged(): void {
    if (!this.ready) return;
    try { if (this.visible) { this.controller.onActive(); this.metadataChanged(); this.clockChanged(); this.scheduleDiagnostics(); } else this.controller.onInactive(); } catch (_) {}
  }
  private metadataChanged(): void {
    if (!this.ready) return;
    const data: MineRadioMetadata = { translationLines: this.translationLines, lyricColorMode: this.lyricColorMode, lyricColors: { primary: this.lyricPrimary, secondary: this.lyricSecondary, highlight: this.lyricSecondary, glow: this.lyricSecondary }, id: this.song.id, audioUrl: this.audioProxy.source(this.audioUrl), mode: this.mode, lines: this.lines, name: this.song.name, singer: this.song.singer,
      cover: this.song.coverUrl, duration: this.duration, lyricOffset: this.lyricOffset, topInset: this.topInset, bottomInset: this.bottomInset };
    this.controller.runJavaScript(`window.lxmineStage?.metadata(${JSON.stringify(data)})`).catch((error: Error) => console.error(`[MineRadioStage] ${error.message}`));
  }
  private clockChanged(): void {
    if (this.ready) this.controller.runJavaScript(`window.lxmineStage?.clock(${JSON.stringify({ positionMs: this.positionMs, playing: this.playing })})`).catch(() => {});
    const changed = this.lastPlaying !== this.playing || Math.abs(this.positionMs - this.lastPosition) > 1500;
    this.lastPlaying = this.playing; this.lastPosition = this.positionMs;
    // 诊断只在播放状态/进度跳变时去抖采集；周期性采集会在首页滚动时持续写盘。
    if (changed) this.scheduleDiagnostics();
  }
  private scheduleDiagnostics(): void {
    clearTimeout(this.diagnosticTimer);
    this.diagnosticTimer = setTimeout(() => this.captureDiagnostics(), 450);
  }
  private captureDiagnostics(): void {
    if (this.ready) {
      this.controller.runJavaScript('JSON.stringify(window.lxmineStage ? window.lxmineStage.diagnostics() : {ready:false})')
        .then((value: string) => {
          saveStageDiagnostics(JSON.stringify({ web: value, proxy: this.audioProxy.diagnostics() })).catch(() => {});
          // ArkWeb serializes a JS string once more when returning it to ArkTS.
          if (value.includes('false') && !value.includes('preset') && this.visible && this.recoveryCount < 2) {
            this.recoveryCount++;
            this.ready = false;
            this.controller.refresh();
          }
        }).catch(() => {});
    }
  }
  private asset(url: string): WebResourceResponse | null {
    const origin = 'http://127.0.0.1/';
    if (!url.startsWith(origin)) return null;
    if (url.startsWith(`${origin}api/cover?url=`)) return this.coverResource(url);
    const name = url.slice(origin.length).split('?')[0];
    if (!/^[A-Za-z0-9_./-]+$/.test(name) || name.split('/').includes('..')) return null;
    try {
      const bytes = this.getUIContext().getHostContext()!.resourceManager.getRawFileContentSync(`mine-stage/${name}`);
      const response = new WebResourceResponse();
      response.setResponseData(bytes.buffer as ArrayBuffer);
      response.setResponseMimeType(name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'application/javascript' : 'application/octet-stream');
      response.setResponseEncoding('UTF-8'); response.setResponseCode(200); response.setReasonMessage('OK'); return response;
    } catch (error) { console.error(`[MineRadioStage] asset ${name}: ${(error as Error).message}`); return null; }
  }
  private coverResource(url: string): WebResourceResponse | null {
    let remote: string = '';
    try { remote = decodeURIComponent(url.split('url=')[1].split('&')[0]); } catch (_) { return null; }
    if (!/^https?:\/\//.test(remote)) return null;
    const response = new WebResourceResponse();
    response.setResponseIsReady(false);
    const client = http.createHttp();
    client.request(remote, { method: http.RequestMethod.GET, expectDataType: http.HttpDataType.ARRAY_BUFFER, readTimeout: 10000, connectTimeout: 8000 })
      .then((result: http.HttpResponse) => {
        const bytes = result.result as ArrayBuffer;
        if (result.responseCode !== 200 || bytes.byteLength > 4 * 1024 * 1024) throw new Error('封面不可用');
        const headers = result.header as Record<string, string>;
        response.setResponseData(bytes); response.setResponseMimeType(headers['content-type'] || headers['Content-Type'] || 'image/jpeg');
        response.setResponseCode(200); response.setReasonMessage('OK'); response.setResponseIsReady(true);
      }).catch(() => { response.setResponseData(''); response.setResponseCode(502); response.setReasonMessage('Cover unavailable'); response.setResponseIsReady(true); })
      .finally(() => client.destroy());
    return response;
  }
  aboutToDisappear(): void { clearTimeout(this.diagnosticTimer); this.ready = false; this.audioProxy.stop().catch(() => {}); }
  build() {
    Web({ src: 'http://127.0.0.1/harmony-stage.html', controller: this.controller })
      .width('100%').height('100%').mixedMode(MixedMode.All).mediaPlayGestureAccess(false).mediaOptions({ audioExclusive: false, resumeInterval: 0 }).javaScriptAccess(true).domStorageAccess(true).backgroundColor(Color.Transparent)
      .onInterceptRequest((event) => (event ? this.asset(event.request.getRequestUrl()) : null) as WebResourceResponse)
      .javaScriptProxy({ object: this.inputHost, name: '__lxmineNative', methodList: ['seek'], controller: this.controller })
      .onPageEnd(() => { this.ready = true; this.metadataChanged(); this.clockChanged(); this.visibilityChanged(); this.scheduleDiagnostics(); })
      .onRenderExited(() => { this.ready = false; if (this.visible && this.recoveryCount < 2) { this.recoveryCount++; this.controller.refresh(); } })
      .onConsole((event) => { if (event) console.info(`[MineRadioStage] ${event.message.getMessage()}`); return false; })
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
