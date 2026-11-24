import { webview } from '@kit.ArkWeb';
import { Song } from '../model/Song';
import { LyricLine } from '../services/LyricParser';
import http from '@ohos.net.http';
import { fileIo } from '@kit.CoreFileKit';
import { saveStageDiagnostics } from '../services/Store';
import { StageAudioProxy } from '../services/StageAudioProxy';
import { MINE_STAGE_REVISION } from '../model/MineRadioModes';
import { displaySync } from '@kit.ArkGraphics2D';

interface StageLyricColors { primary: string; secondary: string; highlight: string; glow: string; }
interface StageLyricItem { timeMs: number; text: string; words: Object[]; translation?: string; }
interface MineRadioMetadata { translationLines: LyricLine[]; lyricColorMode: string; lyricColors: StageLyricColors; id: string; audioUrl: string; mode: string; appearance: string; lines: StageLyricItem[]; name: string; singer: string; cover: string; bgImage: string; bgOpacity: number; wallpaperBgOpacity: number; wallpaperOverallOpacity: number; duration: number; lyricOffset: number; lyricScale: number; lyricLineSpacing: number; lyricMaxLines: number; resetCameraOnSong: boolean; topInset: number; bottomInset: number; }
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
interface CoverCacheEntry { data: ArrayBuffer; mime: string; }
@Component
export struct MineRadioStage {
  private static rawAssetCache: Map<string, ArrayBuffer> = new Map();
  private static coverCache: Map<string, CoverCacheEntry> = new Map();
  public static clearRawAssetCache(): void {
    MineRadioStage.rawAssetCache.clear();
    MineRadioStage.coverCache.clear();
  }
  @Prop @Watch('metadataChanged') song: Song;
  @Prop @Watch('metadataChanged') audioUrl: string = '';
  @Prop @Watch('metadataChanged') lines: LyricLine[] = [];
  @Prop @Watch('metadataChanged') translationLines: LyricLine[] = [];
  @Prop @Watch('metadataChanged') lyricColorMode: string = 'custom-gradient';
  @Prop @Watch('metadataChanged') lyricPrimary: string = '#7DD3FC';
  @Prop @Watch('metadataChanged') lyricSecondary: string = '#A5B4FC';
  @Prop @Watch('metadataChanged') light: boolean = false;
  @Prop @Watch('metadataChanged') bgImage: string = '';
  @Prop @Watch('metadataChanged') bgOpacity: number = 0.78;
  @Prop wallpaperHost: boolean = false;
  @Prop @Watch('metadataChanged') wallpaperBgOpacity: number = 0.42;
  @Prop @Watch('metadataChanged') wallpaperOverallOpacity: number = 0.95;
  @Prop @Watch('modeChanged') mode: string = 'mine-0';
  @Prop @Watch('metadataChanged') duration: number = 0;
  @Prop @Watch('metadataChanged') lyricOffset: number = 0;
  @Prop @Watch('metadataChanged') lyricScale: number = 1;
  @Prop @Watch('metadataChanged') lyricLineSpacing: number = 1.2;
  @Prop @Watch('metadataChanged') lyricMaxLines: number = 0;
  @Prop @Watch('metadataChanged') resetCameraOnSong: boolean = true;
  @Prop @Watch('insetsChanged') topInset: number = 0;
  @Prop @Watch('insetsChanged') bottomInset: number = 0;
  @Prop @Watch('clockChanged') positionMs: number = 0;
  @Prop @Watch('clockChanged') playing: boolean = false;
  @Prop @Watch('visibilityChanged') visible: boolean = true;
  @Prop @Watch('visibilityChanged') detail: boolean = false;
  @Prop interactive: boolean = true;
  @Prop wide: boolean = false;
  @Prop @Watch('vocalCancelChanged') vocalCancelActive: boolean = false;
  @Prop @Watch('vocalCancelChanged') vocalGain: number = 1.0;
  @StorageProp('lxmineBoostImmersive') @Watch('updateFrameRate') private boostImmersive: boolean = false;
  private controller: webview.WebviewController = new webview.WebviewController();
  private ready: boolean = false;
  private plain: boolean = false;
  private stageKind: string = 'mine';
  private crashed: boolean = false;
  private proxyStarted: boolean = false;
  private lastPlaying: boolean = false;
  private lastPosition: number = 0;
  private lastClockAt: number = 0;
  private recoveryCount: number = 0;
  private diagnosticTimer: number = -1;
  private metadataTimer: number = -1;
  private insetsTimer: number = -1;
  private inactiveTimer: number = -1;
  private lastMetadataJson: string = '';
  private cachedLinesRef: LyricLine[] | null = null;
  private cachedTransRef: LyricLine[] | null = null;
  private cachedEnrichedLines: StageLyricItem[] = [];
  private settledDiagnosticTimer: number = -1;
  private frameSync: displaySync.DisplaySync | null = null;
  private highFrameRate: boolean = false;
  private appliedTargetFps: number = 0;
  private audioProxy: StageAudioProxy = new StageAudioProxy();
  private inputHost: StageInputHost = new StageInputHost();
  onSeek: (time: number) => void = () => {};
  onDegraded: () => void = () => {};
  onVisualReady: () => void = () => {};
  onImmersiveToggle: (show: boolean) => void = () => {};
  private stageKindForMode(mode: string): string {
    if (mode === 'off') return 'plain';
    if (mode.startsWith('folia-')) return 'folia';
    return 'mine';
  }
  private stageUrlForKind(kind: string): string {
    const wp = this.wallpaperHost ? '&wallpaper=1' : '';
    if (kind === 'plain') return `http://127.0.0.1/plain-stage.html?revision=${MINE_STAGE_REVISION}${wp}`;
    if (kind === 'folia') return `http://127.0.0.1/folia-stage/index.html?revision=${MINE_STAGE_REVISION}${wp}`;
    return `http://127.0.0.1/harmony-stage.html?revision=${MINE_STAGE_REVISION}${wp}`;
  }
  aboutToAppear(): void {
    this.stageKind = this.stageKindForMode(this.mode);
    this.plain = this.stageKind === 'plain';
    this.inputHost.onReady = () => {
      if (!this.ready) {
        this.ready = true;
        this.visibilityChanged();
      }
      this.onVisualReady();
    };
    this.inputHost.onVisualReady = () => this.onVisualReady();
    this.inputHost.onImmersive = (show: boolean) => {
      if (this.visible && this.detail && this.interactive) this.onImmersiveToggle(show);
    };
    this.inputHost.onDegraded = () => this.onDegraded();
    this.inputHost.onSeek = (time: number) => { this.onSeek(time); };
    if (!this.plain || this.vocalCancelActive) this.ensureAudioProxy();
  }
  private ensureAudioProxy(): void {
    if (this.proxyStarted) return;
    this.proxyStarted = true;
    const hostCtx = this.getUIContext().getHostContext();
    if (!hostCtx) { this.proxyStarted = false; return; }
    this.audioProxy.start(`${hostCtx.filesDir}/`)
      .then(() => { this.lastMetadataJson = ''; if (this.visible || this.vocalCancelActive) this.metadataChanged(); })
      .catch((error: Error) => {
        this.proxyStarted = false;
        console.warn(`[MineRadioStage] analysis proxy: ${error.message}`);
      });
  }
  private vocalCancelChanged(): void {
    if (this.vocalCancelActive) this.ensureAudioProxy();
    if (!this.ready) return;
    this.lastMetadataJson = '';
    this.pushMetadata(true);
    this.controller.runJavaScript(`window.lxmineStage?.vocalCancel(${JSON.stringify({ active: this.vocalCancelActive, vocalGain: this.vocalGain })})`).catch(() => {});
  }
  private modeChanged(): void {
    const nextKind = this.stageKindForMode(this.mode);
    const plain = nextKind === 'plain';
    if (!plain || this.vocalCancelActive) this.ensureAudioProxy();
    if (nextKind !== this.stageKind) {
      this.stageKind = nextKind; this.plain = plain; this.ready = false; this.recoveryCount = 0; this.lastMetadataJson = '';
      try { this.controller.loadUrl(this.stageUrlForKind(nextKind)); } catch (_) {}
    } else if (this.visible || this.vocalCancelActive) {
      this.pushMetadata(true);
    }
  }
  private insetsChanged(): void {
    if (!this.ready || !this.visible) return;
    clearTimeout(this.insetsTimer);
    this.insetsTimer = setTimeout(() => {
      if (!this.ready || !this.visible) return;
      this.controller.runJavaScript(`window.lxmineStage?.setInsets?.(${JSON.stringify({ topInset: this.topInset, bottomInset: this.bottomInset })})`).catch(() => {});
    }, 24);
  }
  private visibilityChanged(): void {
    this.updateFrameRate();
    if (!this.ready) { if (this.visible && this.crashed) this.recoverRenderer(); return; }
    try {
      if (this.visible) {
        clearTimeout(this.inactiveTimer);
        this.inactiveTimer = -1;
        this.controller.onActive();
        this.lastClockAt = 0;
        this.pushMetadata(true);
        this.clockChanged();
        this.controller.runJavaScript(`window.lxmineStage?.presentation(${JSON.stringify({ visible: true, detail: this.detail })});window.lxmineStage?.vocalCancel(${JSON.stringify({ active: this.vocalCancelActive, vocalGain: this.vocalGain })})`).catch(() => {});
        clearTimeout(this.settledDiagnosticTimer);
        this.settledDiagnosticTimer = setTimeout(() => this.captureDiagnostics(), 3200);
      } else {
        clearTimeout(this.diagnosticTimer);
        clearTimeout(this.settledDiagnosticTimer);
        this.controller.runJavaScript(`window.lxmineStage?.presentation({visible:false,detail:false});window.lxmineStage?.vocalCancel(${JSON.stringify({ active: this.vocalCancelActive, vocalGain: this.vocalGain })})`)
          .catch(() => {});
        clearTimeout(this.inactiveTimer);
        if (!this.vocalCancelActive) {
          this.inactiveTimer = setTimeout(() => {
            this.inactiveTimer = -1;
            if (!this.visible && !this.vocalCancelActive && this.ready) {
              try { this.controller.onInactive(); } catch (_) {}
            }
          }, 180);
        }
      }
    } catch (_) {}
  }
  private updateFrameRate(): void {
    const active = this.visible && this.detail && !this.plain && this.playing;
    // 播放态全速请求 120Hz 原生满帧；暂停或隐藏时释放 DisplaySync 降低功耗与发热。
    const targetFps = 120;
    const minFps = 60;
    if (active === this.highFrameRate && (!active || targetFps === this.appliedTargetFps)) return;
    this.highFrameRate = active;
    try {
      if (!active) { this.appliedTargetFps = 0; this.frameSync?.stop(); return; }
      if (!this.frameSync) {
        this.frameSync = displaySync.create();
        this.frameSync.on('frame', () => {});
      }
      this.appliedTargetFps = targetFps;
      this.frameSync.setExpectedFrameRateRange({ min: minFps, max: targetFps, expected: targetFps });
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
  private getEnrichedLines(): StageLyricItem[] {
    if (this.cachedLinesRef === this.lines && this.cachedTransRef === this.translationLines) {
      return this.cachedEnrichedLines;
    }
    const trList = this.translationLines;
    const trLen = trList.length;
    let trCursor = 0;
    const result: StageLyricItem[] = new Array(this.lines.length);
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      let transText = '';
      if (trLen > 0) {
        while (trCursor + 1 < trLen && trList[trCursor + 1].timeMs <= line.timeMs) {
          trCursor++;
        }
        let bestDiff = 681;
        const from = Math.max(0, trCursor - 2);
        const to = Math.min(trLen - 1, trCursor + 3);
        for (let j = from; j <= to; j++) {
          const diff = Math.abs(trList[j].timeMs - line.timeMs);
          if (diff < bestDiff) {
            bestDiff = diff;
            transText = trList[j].text;
          }
        }
      }
      const item: StageLyricItem = { timeMs: line.timeMs, text: line.text, words: line.words as Object[] };
      if (transText) item.translation = transText;
      result[i] = item;
    }
    this.cachedLinesRef = this.lines;
    this.cachedTransRef = this.translationLines;
    this.cachedEnrichedLines = result;
    return result;
  }
  private metadataChanged(): void {
    if (!this.visible && !this.vocalCancelActive) return;
    clearTimeout(this.metadataTimer);
    this.metadataTimer = setTimeout(() => this.pushMetadata(false), 12);
  }
  private pushMetadata(forceImmediate: boolean = false): void {
    clearTimeout(this.metadataTimer);
    if (!this.ready) return;
    if (!forceImmediate && !this.visible && !this.vocalCancelActive) return;
    const enrichedLines = this.getEnrichedLines();
    const data: MineRadioMetadata = {
      translationLines: this.translationLines,
      lyricColorMode: this.lyricColorMode,
      lyricColors: { primary: this.lyricPrimary, secondary: this.lyricSecondary, highlight: this.lyricSecondary, glow: this.lyricSecondary },
      id: `${this.song.source}:${this.song.id}`,
      audioUrl: (!this.plain || this.vocalCancelActive) ? this.audioProxy.source(this.audioUrl) : '',
      mode: this.mode,
      lines: enrichedLines,
      name: this.song.name,
      singer: this.song.singer,
      cover: this.song.coverUrl,
      bgImage: this.bgImage,
      bgOpacity: this.bgOpacity,
      wallpaperBgOpacity: this.wallpaperBgOpacity,
      wallpaperOverallOpacity: this.wallpaperOverallOpacity,
      appearance: this.light ? 'light' : 'dark',
      duration: this.duration,
      lyricOffset: this.lyricOffset,
      lyricScale: this.lyricScale,
      lyricLineSpacing: this.lyricLineSpacing,
      lyricMaxLines: this.lyricMaxLines,
      resetCameraOnSong: this.resetCameraOnSong,
      topInset: this.topInset,
      bottomInset: this.bottomInset
    };
    const metadataJson = JSON.stringify(data);
    const metadataCall = metadataJson !== this.lastMetadataJson ? `window.lxmineStage?.metadata(${metadataJson});` : '';
    this.lastMetadataJson = metadataJson;
    this.controller.runJavaScript(`window.lxmineStage?.clock(${JSON.stringify({ positionMs: this.positionMs, playing: this.playing })});${metadataCall}window.lxmineStage?.vocalCancel(${JSON.stringify({ active: this.vocalCancelActive, vocalGain: this.vocalGain })});window.lxmineStage?.presentation(${JSON.stringify({ visible: this.visible, detail: this.detail })})`).catch((error: Error) => console.error(`[MineRadioStage] ${error.message}`));
  }
  private clockChanged(): void {
    this.updateFrameRate();
    if (!this.ready || (!this.visible && !this.vocalCancelActive)) return;
    const now = Date.now();
    const expected = this.lastPosition + (this.lastPlaying ? now - this.lastClockAt : 0);
    const important = !this.lastClockAt || this.lastPlaying !== this.playing || Math.abs(this.positionMs - expected) > 250;
    const changed = important || now - this.lastClockAt >= 5000;
    if (!changed) return;
    this.controller.runJavaScript(`window.lxmineStage?.clock(${JSON.stringify({ positionMs: this.positionMs, playing: this.playing })})`).catch(() => {});
    this.lastPlaying = this.playing; this.lastPosition = this.positionMs; this.lastClockAt = now;
  }
  private captureDiagnostics(): void {
    if (this.ready) {
      this.controller.runJavaScript('JSON.stringify(window.lxmineStage ? window.lxmineStage.diagnostics() : {ready:false})')
        .then((value: string) => {
          saveStageDiagnostics(JSON.stringify({ web: value, proxy: this.audioProxy.diagnostics() }), this.mode === 'off' ? 'stageDiagnosticsPlain' : 'stageDiagnosticsDynamic').catch(() => {});
          if (!this.plain && value.includes('false') && !value.includes('preset') && !value.includes('folia') && this.visible && this.recoveryCount < 2) {
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
      let buffer = MineRadioStage.rawAssetCache.get(name);
      if (!buffer) {
        const bytes = this.getUIContext().getHostContext()!.resourceManager.getRawFileContentSync(`mine-stage/${name}`);
        buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        if (buffer.byteLength <= 6 * 1024 * 1024 && MineRadioStage.rawAssetCache.size < 96) {
          MineRadioStage.rawAssetCache.set(name, buffer);
        }
      }
      const response = new WebResourceResponse();
      response.setResponseData(buffer);
      response.setResponseHeader([{ headerKey: 'Cache-Control', headerValue: 'public, max-age=31536000, immutable' }]);
      const mime = name.endsWith('.html') ? 'text/html'
        : name.endsWith('.css') ? 'text/css'
        : name.endsWith('.js') || name.endsWith('.mjs') ? 'application/javascript'
        : name.endsWith('.json') ? 'application/json'
        : name.endsWith('.png') ? 'image/png'
        : name.endsWith('.jpg') || name.endsWith('.jpeg') ? 'image/jpeg'
        : name.endsWith('.webp') ? 'image/webp'
        : name.endsWith('.svg') ? 'image/svg+xml'
        : name.endsWith('.woff2') ? 'font/woff2'
        : name.endsWith('.wasm') ? 'application/wasm'
        : 'application/octet-stream';
      response.setResponseMimeType(mime);
      if (mime.startsWith('text/') || mime === 'application/javascript' || mime === 'application/json' || mime === 'image/svg+xml') {
        response.setResponseEncoding('UTF-8');
      }
      response.setResponseCode(200); response.setReasonMessage('OK'); return response;
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
    const cachedCover = MineRadioStage.coverCache.get(remote);
    if (cachedCover) {
      MineRadioStage.coverCache.delete(remote);
      MineRadioStage.coverCache.set(remote, cachedCover);
      const hit = new WebResourceResponse();
      hit.setResponseData(cachedCover.data);
      hit.setResponseMimeType(cachedCover.mime);
      hit.setResponseHeader([{ headerKey: 'Cache-Control', headerValue: 'public, max-age=86400' }]);
      hit.setResponseCode(200);
      hit.setReasonMessage('OK');
      return hit;
    }
    const response = new WebResourceResponse();
    response.setResponseIsReady(false);
    const client = http.createHttp();
    client.request(remote, { method: http.RequestMethod.GET, expectDataType: http.HttpDataType.ARRAY_BUFFER, readTimeout: 10000, connectTimeout: 8000 })
      .then((result: http.HttpResponse) => {
        const bytes = result.result as ArrayBuffer;
        if (result.responseCode !== 200 || bytes.byteLength > 4 * 1024 * 1024) throw new Error('封面不可用');
        const headers = result.header as Record<string, string>;
        const mime = headers['content-type'] || headers['Content-Type'] || 'image/jpeg';
        if (bytes.byteLength <= 1500 * 1024) {
          MineRadioStage.coverCache.set(remote, { data: bytes, mime });
          if (MineRadioStage.coverCache.size > 24) {
            for (const oldestKey of MineRadioStage.coverCache.keys()) {
              MineRadioStage.coverCache.delete(oldestKey);
              break;
            }
          }
        }
        response.setResponseData(bytes); response.setResponseMimeType(mime);
        response.setResponseHeader([{ headerKey: 'Cache-Control', headerValue: 'public, max-age=86400' }]);
        response.setResponseCode(200); response.setReasonMessage('OK'); response.setResponseIsReady(true);
      }).catch(() => { response.setResponseData(''); response.setResponseCode(502); response.setReasonMessage('Cover unavailable'); response.setResponseIsReady(true); })
      .finally(() => client.destroy());
    return response;
  }
  aboutToDisappear(): void {
    clearTimeout(this.diagnosticTimer); clearTimeout(this.metadataTimer); clearTimeout(this.insetsTimer); clearTimeout(this.inactiveTimer); clearTimeout(this.settledDiagnosticTimer);
    try { this.frameSync?.stop(); this.frameSync?.off('frame'); } catch (_) {}
    this.frameSync = null; this.highFrameRate = false; this.ready = false; this.audioProxy.stop().catch(() => {});
  }
  build() {
    Web({ src: this.stageUrlForKind(this.stageKindForMode(this.mode)), controller: this.controller })
      .width('100%').height('100%').mixedMode(MixedMode.All).mediaPlayGestureAccess(false).mediaOptions({ audioExclusive: false, resumeInterval: 0 }).javaScriptAccess(true).domStorageAccess(true).backgroundColor(Color.Transparent)
      .visibility(this.visible ? Visibility.Visible : Visibility.Hidden)
      .hitTestBehavior(this.visible && this.interactive ? HitTestMode.Default : HitTestMode.None)
      .onInterceptRequest((event) => (event ? this.asset(event.request.getRequestUrl()) : null) as WebResourceResponse)
      .javaScriptProxy({ object: this.inputHost, name: '__lxmineNative', methodList: ['seek', 'ready', 'visualReady', 'immersive', 'degraded'], controller: this.controller })
      .onPageEnd(() => {
        this.crashed = false;
        this.ready = true;
        this.lastMetadataJson = '';
        this.visibilityChanged();
        this.onVisualReady();
      })
      .onRenderExited(() => { this.ready = false; this.crashed = true; if (this.visible) this.recoverRenderer(); })
      .onConsole((event) => { if (event) console.info(`[MineRadioStage] ${event.message.getMessage()}`); return false; })
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
