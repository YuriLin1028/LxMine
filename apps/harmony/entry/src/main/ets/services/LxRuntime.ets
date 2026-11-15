import { webview } from '@kit.ArkWeb';
import { http } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';

// 隐藏沙箱仅承载自定义源与共享歌单编解码，所有可见界面均为 ArkUI。
export interface LxSourceInfo { name: string; description: string; version: string; author: string; homepage: string; }
export interface LxHash { hash: string; }
export interface LxSongInfo {
  source: string; songmid: string; name: string; singer: string; albumName: string;
  albumId: string; interval: number; type: string; hash?: string; _types?: Record<string, LxHash>;
}
interface HttpPayload { url: string; method?: string; headers?: Record<string, string>; body?: string; form?: Record<string, string>; timeout?: number; }
interface InitSource { actions?: string[]; qualitys?: string[]; }
interface LxInitPayload { sources?: Record<string, InitSource>; }
interface BridgeResult { ok: boolean; error?: string; data?: Object | string; }
interface Pending { resolve: (json: string) => void; reject: (error: Error) => void; timer: number; }
interface RequestInfo { musicInfo: LxSongInfo; type: string; }
interface RequestPayload { source: string; action: string; info: RequestInfo; }
interface NativeResponse { statusCode: number; headers: Object; body: Object | string; }
interface NativeResult { response?: NativeResponse; error?: string; }
export interface LyricResult { lyric?: string; lxlyric?: string; tlyric?: string; rlyric?: string; romalrc?: string; }

export class LxHost {
  private controller: webview.WebviewController | null = null;
  private pending: Map<string, Pending> = new Map();
  private seq: number = 0;
  private init: Pending | null = null;
  private declarations: Record<string, InitSource> = {};
  attach(controller: webview.WebviewController): void { this.controller = controller; }
  supports(source: string, action: string): boolean { return this.declarations[source]?.actions?.includes(action) ?? false; }
  quality(source: string, preferred: string): string {
    const options = this.declarations[source]?.qualitys ?? [];
    return options.includes(preferred) ? preferred : (options[0] ?? '128k');
  }
  onInited(json: string): void {
    if (!this.init) return;
    const pending = this.init;
    this.init = null;
    clearTimeout(pending.timer);
    try {
      const payload = JSON.parse(json) as LxInitPayload;
      if (!payload.sources || Object.keys(payload.sources).length === 0) throw new Error('源没有声明支持的平台');
      this.declarations = payload.sources;
      pending.resolve(json);
    } catch (error) { pending.reject(error as Error); }
  }
  onResult(id: string, json: string): void {
    const task = this.pending.get(id);
    if (!task) return;
    this.pending.delete(id);
    clearTimeout(task.timer);
    try {
      const result = JSON.parse(json) as BridgeResult;
      if (!result.ok) throw new Error(result.error ?? '音源请求失败');
      task.resolve(typeof result.data === 'string' ? result.data : JSON.stringify(result.data));
    } catch (error) { task.reject(error as Error); }
  }
  /** 一个请求一个 HttpRequest 实例，避免 URL 与歌词并发时互相取消。 */
  httpRequest(id: string, json: string): void {
    const client = http.createHttp();
    try {
      const payload = JSON.parse(json) as HttpPayload;
      const body = payload.form ? Object.keys(payload.form).map((key: string) => `${encodeURIComponent(key)}=${encodeURIComponent(payload.form![key])}`).join('&') : payload.body;
      const headers = payload.headers ?? {};
      if (payload.form) headers['content-type'] = 'application/x-www-form-urlencoded';
      client.request(payload.url, { method: (payload.method ?? 'GET').toUpperCase() as http.RequestMethod,
        header: headers, extraData: body, connectTimeout: payload.timeout ?? 20000, readTimeout: payload.timeout ?? 20000
      }).then((response: http.HttpResponse) => {
        let body: Object | string = response.result as string;
        try { body = JSON.parse(body as string) as Object; } catch (error) { /* 文本响应原样返回。 */ }
        const result: NativeResult = { response: { statusCode: response.responseCode, headers: response.header, body } };
        this.finishHttp(id, JSON.stringify(result));
      }).catch((error: BusinessError) => this.finishHttp(id, JSON.stringify({ error: error.message } as NativeResult)))
        .finally(() => client.destroy());
    } catch (error) {
      client.destroy();
      this.finishHttp(id, JSON.stringify({ error: 'HTTP 请求格式错误' } as NativeResult));
    }
  }
  private finishHttp(id: string, json: string): void {
    this.controller?.runJavaScript(`window.__lxHttpResult(${JSON.stringify(id)},${JSON.stringify(json)})`).catch(() => {});
  }
  async loadSource(script: string, info: LxSourceInfo): Promise<void> {
    if (!this.controller) throw new Error('音源运行时尚未就绪');
    if (this.init) throw new Error('正在加载音源');
    this.declarations = {};
    const ready = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => { this.init = null; reject(new Error('音源初始化超时')); }, 15000);
      this.init = { resolve, reject, timer };
    });
    this.controller.runJavaScript(`window.__lxRunSource(${JSON.stringify(script)},${JSON.stringify(info)})`).catch((error: BusinessError) => {
      if (this.init) { clearTimeout(this.init.timer); this.init.reject(new Error(error.message)); this.init = null; }
    });
    await ready;
  }
  private bridge(expression: string, timeoutMs: number = 20000): Promise<string> {
    if (!this.controller) return Promise.reject(new Error('运行时尚未就绪'));
    const id = String(++this.seq);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('请求超时，请稍后重试')); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.controller!.runJavaScript(expression.replace('__REQUEST_ID__', JSON.stringify(id))).catch((error: BusinessError) => {
        clearTimeout(timer); this.pending.delete(id); reject(new Error(error.message));
      });
    });
  }
  request(action: string, info: LxSongInfo): Promise<string> {
    if (!this.supports(info.source, action)) return Promise.reject(new Error(`当前音源不支持 ${info.source} 的 ${action}，请切换音源`));
    const payload: RequestPayload = { source: info.source, action, info: { musicInfo: info, type: info.type } };
    return this.bridge(`window.__lxRequest(__REQUEST_ID__,${JSON.stringify(JSON.stringify(payload))})`);
  }
  requestMusicUrl(info: LxSongInfo): Promise<string> { return this.request('musicUrl', info); }
  async requestLyricBundle(info: LxSongInfo): Promise<LyricResult> {
    const raw = await this.request('lyric', info);
    return raw.trim().startsWith('{') ? JSON.parse(raw) as LyricResult : { lyric: raw };
  }
  async requestLyric(info: LxSongInfo): Promise<string> {
    const raw = await this.request('lyric', info);
    if (raw.trim().startsWith('{')) {
      const lyrics = JSON.parse(raw) as LyricResult;
      return lyrics.lxlyric || lyrics.lyric || '';
    }
    return raw;
  }
  importPlaylist(input: string, source: string): Promise<string> {
    return this.bridge(`window.__lxImportPlaylist(__REQUEST_ID__,${JSON.stringify(input)},${JSON.stringify(source)})`, 120000);
  }
  catalogue(operation: string, paramsJson: string): Promise<string> {
    return this.bridge(`window.__lxCatalogue(__REQUEST_ID__,${JSON.stringify(operation)},${paramsJson})`, 30000);
  }
  dispose(): void {
    if (this.init) { clearTimeout(this.init.timer); this.init.reject(new Error('运行时已关闭')); this.init = null; }
    for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(new Error('运行时已关闭')); }
    this.pending.clear(); this.controller = null;
  }
}
