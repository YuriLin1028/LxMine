import { webview } from '@kit.ArkWeb';
import { Song } from '../model/Song';
import { LyricLine } from '../services/LyricParser';
import http from '@ohos.net.http';
import { fileIo } from '@kit.CoreFileKit';
import { saveStageDiagnostics } from '../services/Store';
import { StageAudioProxy } from '../services/StageAudioProxy';
import { MINE_STAGE_REVISION } from '../model/MineRadioModes';
import { displaySync } from '@kit.ArkGraphics2D';
import { display } from '@kit.ArkUI';

interface StageLyricColors { primary: string; secondary: string; highlight: string; glow: string; }
interface MineRadioMetadata { translationLines: LyricLine[]; lyricColorMode: string; lyricColors: StageLyricColors; id: string; audioUrl: string; mode: string; appearance: string; lines: LyricLine[]; name: string; singer: string; cover: string; duration: number; lyricOffset: number; topInset: number; bottomInset: number; }
class StageInputHost {
  onSeek: (time: number) => void = () => {};
  onReady: () => void = () => {};
  onVisualReady: () => void = () => {};
  onImmersive: (show: boolean) => void = () => {};
  onDegraded: () => void = () => {};
  visualReady(): void { this.onVisualReady(); }
  ready(): void { this.onReady(); }
  degraded(): void { this.onDegraded(); }
  seek(time: number): void { if (Number.isFinite(time)) this.onSeek(Math.max(0, time)); }
  immersive(show: string): void { this.onImmersive(show === '1'); }
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
  @Prop @Watch('metadataChanged') light: boolean = false;
  @Prop @Watch('modeChanged') mode: string = 'mine-0';
  @Prop @Watch('metadataChanged') duration: number = 0;
  @Prop @Watch('metadataChanged') lyricOffset: number = 0;
  @Prop @Watch('metadataChanged') topInset: number = 0;
  @Prop @Watch('metadataChanged') bottomInset: number = 0;
  @Prop @Watch('clockChanged') positionMs: number = 0;
  @Prop @Watch('clockChanged') playing: boolean = false;
  @Prop @Watch('visibilityChanged') visible: boolean = true;
  @Prop @Watch('visibilityChanged') detail: boolean = false;
  @Prop interactive: boolean = true;
  private controller: webview.WebviewController = new webview.WebviewController();
  private ready: boolean = false;
  private plain: boolean = false;
  private crashed: boolean = false;
  private lastPlaying: boolean = false;
  private lastPosition: number = 0;
  private lastClockAt: number = 0;
  private recoveryCount: number = 0;
  private diagnosticTimer: number = -1;
  private metadataTimer: number = -1;
  private lastMetadataJson: string = '';
  private settledDiagnosticTimer: number = -1;
  private frameSync: displaySync.DisplaySync | null = null;
  private highFrameRate: boolean = false;
  private audioProxy: StageAudioProxy = new StageAudioProxy();
  private inputHost: StageInputHost = new StageInputHost();
  onSeek: (time: number) => void = () => {};
  onDegraded: () => void = () => {};
  onVisualReady: () => void = () => {};
  onImmersiveToggle: (show: boolean) => void = () => {};
  aboutToAppear(): void {
    this.plain = this.mode === 'off';
    this.inputHost.onReady = () => { if (!this.ready) { this.ready = true; this.visibilityChanged(); } };
    this.inputHost.onVisualReady = () => this.onVisualReady();
    this.inputHost.onImmersive = (show: boolean) => {
      if (this.visible && this.detail && this.interactive) this.onImmersiveToggle(show);
    };
    this.inputHost.onDegraded = () => this.onDegraded();
    this.inputHost.onSeek = (time: number) => { this.onSeek(time); this.scheduleDiagnostics(); };
    if (!this.plain) this.audioProxy.start(`${this.getUIContext().getHostContext()!.filesDir}/Downloads/`).then(() => this.metadataChanged()).catch((error: Error) => console.warn(`[MineRadioStage] analysis proxy: ${error.message}`));
  }
  private modeChanged(): void {
    const plain = this.mode === 'off';
    if (plain !== this.plain && this.ready) {
      this.plain = plain; this.ready = false; this.recoveryCount = 0;
      this.controller.loadUrl(`http://127.0.0.1/${plain ? 'plain-stage.html' : 'harmony-stage.html'}?revision=${MINE_STAGE_REVISION}`);
    } else this.metadataChanged();
  }
  private visibilityChanged(): void {
    this.updateFrameRate();
    if (!this.ready) { if (this.visible && this.crashed) this.recoverRenderer(); return; }
    try {
      if (this.visible) {
        this.controller.onActive(); this.lastClockAt = 0; this.pushMetadata(); this.clockChanged();
        this.controller.runJavaScript(`window.lxmineStage?.presentation(${JSON.stringify({ visible: true, detail: this.detail })})`).catch(() => {});
        this.scheduleDiagnostics();
        clearTimeout(this.settledDiagnosticTimer);
        this.settledDiagnosticTimer = setTimeout(() => this.captureDiagnostics(), 3000);
      } else {
        clearTimeout(this.diagnosticTimer);
        clearTimeout(this.settledDiagnosticTimer);
        this.pushMetadata();
        this.controller.runJavaScript('window.lxmineStage?.presentation({visible:false,detail:false})')
          .catch(() => {});
      }
    } catch (_) {}
  }
  private updateFrameRate(): void {
    const high = this.visible && this.detail && this.playing && !this.plain;
    if (high === this.highFrameRate) return;
    this.highFrameRate = high;
    try {
      if (!high) { this.frameSync?.stop(); return; }
      if (!this.frameSync) {
        this.frameSync = displaySync.create();
        this.frameSync.on('frame', () => {});
      }
      const refresh = Math.max(60, Math.min(144, Math.round(display.getDefaultDisplaySync().refreshRate)));
      this.frameSync.setExpectedFrameRateRange({ min: 60, max: refresh, expected: refresh });
      this.frameSync.start();
    } catch (error) { console.warn(`[MineRadioStage] frame rate request: ${(error as Error).message}`); }
  }
  private recoverRenderer(): void {
    this.crashed = false;
    if (this.recoveryCount++ < 2) this.controller.refresh();
    else {
      this.onDegraded();
    }
  }
  private metadataChanged(): void {
    clearTimeout(this.metadataTimer);
    this.metadataTimer = setTimeout(() => this.pushMetadata(), 16);
  }
  private pushMetadata(): void {
    clearTimeout(this.metadataTimer);
    if (!this.ready) return;
    const data: MineRadioMetadata = { translationLines: this.translationLines, lyricColorMode: this.lyricColorMode, lyricColors: { primary: this.lyricPrimary, secondary: this.lyricSecondary, highlight: this.lyricSecondary, glow: this.lyricSecondary }, id: `${this.song.source}:${this.song.id}`, audioUrl: this.plain ? '' : this.audioProxy.source(this.audioUrl), mode: this.mode, lines: this.lines, name: this.song.name, singer: this.song.singer,
      cover: this.song.coverUrl, appearance: this.light ? 'light' : 'dark', duration: this.duration, lyricOffset: this.lyricOffset, topInset: this.topInset, bottomInset: this.bottomInset };
      const metadataJson = JSON.stringify(data);
      const metadataCall = metadataJson !== this.lastMetadataJson ? `window.lxmineStage?.metadata(${metadataJson});` : '';
      this.lastMetadataJson = metadataJson;
      this.controller.runJavaScript(`window.lxmineStage?.clock(${JSON.stringify({ positionMs: this.positionMs, playing: this.playing })});${metadataCall}window.lxmineStage?.presentation(${JSON.stringify({ visible: this.visible, detail: this.detail })})`).catch((error: Error) => console.error(`[MineRadioStage] ${error.message}`));
  }
  private clockChanged(): void {
    this.updateFrameRate();
    if (!this.ready || !this.visible) return;
    const now = Date.now();
    const expected = this.lastPosition + (this.lastPlaying ? now - this.lastClockAt : 0);
    const important = !this.lastClockAt || this.lastPlaying !== this.playing || Math.abs(this.positionMs - expected) > 250;
    const changed = important || now - this.lastClockAt >= 5000;
    if (!changed) return;
    this.controller.runJavaScript(`window.lxmineStage?.clock(${JSON.stringify({ positionMs: this.positionMs, playing: this.playing })})`).catch(() => {});
    this.lastPlaying = this.playing; this.lastPosition = this.positionMs; this.lastClockAt = now;
    // 诊断只在播放状态/进度跳变时去抖采集；周期性采集会在首页滚动时持续写盘。
    if (important) this.scheduleDiagnostics();
  }
  private scheduleDiagnostics(): void {
    clearTimeout(this.diagnosticTimer);
    this.diagnosticTimer = setTimeout(() => this.captureDiagnostics(), 450);
  }
  private captureDiagnostics(): void {
    if (this.ready) {
      this.controller.runJavaScript('JSON.stringify(window.lxmineStage ? window.lxmineStage.diagnostics() : {ready:false})')
        .then((value: string) => {
          saveStageDiagnostics(JSON.stringify({ web: value, proxy: this.audioProxy.diagnostics() }), this.mode === 'off' ? 'stageDiagnosticsPlain' : 'stageDiagnosticsDynamic').catch(() => {});
          // ArkWeb serializes a JS string once more when returning it to ArkTS.
          if (!this.plain && value.includes('false') && !value.includes('preset') && this.visible && this.recoveryCount < 2) {
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
      response.setResponseHeader([{ headerKey: 'Cache-Control', headerValue: 'no-store' }]);
      response.setResponseMimeType(name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'application/javascript' : 'application/octet-stream');
      response.setResponseEncoding('UTF-8'); response.setResponseCode(200); response.setReasonMessage('OK'); return response;
    } catch (error) { console.error(`[MineRadioStage] asset ${name}: ${(error as Error).message}`); return null; }
  }
  private coverResource(url: string): WebResourceResponse | null {
    let remote: string = '';
    try { remote = decodeURIComponent(url.split('url=')[1].split('&')[0]); } catch (_) { return null; }
    if (remote.startsWith('file://')) {
      const path = decodeURIComponent(remote.slice(7));
      if (!path.startsWith(`${this.getUIContext().getHostContext()!.filesDir}/`) || path.split('/').includes('..')) return null;
      let file: fileIo.File | null = null;
      try {
        const size = fileIo.statSync(path).size;
        if (size <= 0 || size > 6 * 1024 * 1024) return null;
        file = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY);
        const bytes = new ArrayBuffer(size); const count = fileIo.readSync(file.fd, bytes);
        const response = new WebResourceResponse();
        response.setResponseData(bytes.slice(0, count)); response.setResponseMimeType(path.endsWith('.png') ? 'image/png' : 'image/jpeg');
        response.setResponseCode(200); response.setReasonMessage('OK'); return response;
      } catch (_) { return null; }
      finally { if (file) fileIo.closeSync(file); }
    }
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
  aboutToDisappear(): void {
    clearTimeout(this.diagnosticTimer); clearTimeout(this.metadataTimer); clearTimeout(this.settledDiagnosticTimer);
    try { this.frameSync?.stop(); this.frameSync?.off('frame'); } catch (_) {}
    this.frameSync = null; this.highFrameRate = false; this.ready = false; this.audioProxy.stop().catch(() => {});
  }
  build() {
    Web({ src: `http://127.0.0.1/${this.mode === 'off' ? 'plain-stage.html' : 'harmony-stage.html'}?revision=${MINE_STAGE_REVISION}`, controller: this.controller })
      .width('100%').height('100%').mixedMode(MixedMode.All).mediaPlayGestureAccess(false).mediaOptions({ audioExclusive: false, resumeInterval: 0 }).javaScriptAccess(true).domStorageAccess(true).backgroundColor(Color.Transparent)
      .visibility(this.visible ? Visibility.Visible : Visibility.Hidden)
      .hitTestBehavior(this.visible && this.interactive ? HitTestMode.Default : HitTestMode.None)
      .onInterceptRequest((event) => (event ? this.asset(event.request.getRequestUrl()) : null) as WebResourceResponse)
      .javaScriptProxy({ object: this.inputHost, name: '__lxmineNative', methodList: ['seek', 'ready', 'visualReady', 'immersive', 'degraded'], controller: this.controller })
      .onPageEnd(() => { this.crashed = false; this.ready = true; this.lastMetadataJson = ''; this.visibilityChanged(); })
      .onRenderExited(() => { this.ready = false; this.crashed = true; if (this.visible) this.recoverRenderer(); })
      .onConsole((event) => { if (event) console.info(`[MineRadioStage] ${event.message.getMessage()}`); return false; })
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
