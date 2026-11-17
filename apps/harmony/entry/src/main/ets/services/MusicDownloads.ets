import { request } from '@kit.BasicServicesKit';
import { common } from '@kit.AbilityKit';
import { fileIo } from '@kit.CoreFileKit';
import { http } from '@kit.NetworkKit';
import { Song } from '../model/Song';
import { songKey } from './MusicLibrary';

export interface MusicDownload {
  id: string; song: Song; quality: string; state: string; received: number; total: number; path: string; error: string;
  exportUri?: string; exported?: boolean; exportError?: string;
}
export class MusicDownloads {
  private context: common.UIAbilityContext | null = null;
  private items: MusicDownload[] = [];
  private tasks: Map<string, request.DownloadTask> = new Map();
  private streams: Map<string, http.HttpRequest> = new Map();
  private streamEnds: Map<string, (error?: Error) => void> = new Map();
  private exporting: Set<string> = new Set();
  onChange: (items: MusicDownload[]) => void = () => {};
  onError: (message: string) => void = () => {};
  initialize(context: common.UIAbilityContext): void {
    this.context = context;
    try { if (!fileIo.accessSync(`${context.filesDir}/Downloads`)) fileIo.mkdirSync(`${context.filesDir}/Downloads`, true); }
    catch (error) { this.onError(`下载目录不可用：${(error as Error).message}`); return; }
    try {
      const saved = fileIo.readTextSync(`${context.filesDir}/Downloads/index.json`);
      this.items = JSON.parse(saved) as MusicDownload[];
      for (const item of this.items) if (item.state === 'downloading') { item.state = 'interrupted'; item.error = '下载被中断，请重试'; }
    } catch (_) { this.items = []; }
    this.onChange(this.items.slice());
  }
  private publish(persist: boolean = false): void {
    try { if (persist && this.context) {
      const manifest = `${this.context.filesDir}/Downloads/index.json`;
      const file = fileIo.openSync(`${manifest}.tmp`, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
      try { fileIo.writeSync(file.fd, JSON.stringify(this.items)); fileIo.fsyncSync(file.fd); } finally { fileIo.closeSync(file); }
      fileIo.renameSync(`${manifest}.tmp`, manifest);
    }
    } catch (error) { this.onError(`下载记录保存失败：${(error as Error).message}`); }
    this.onChange(this.items.slice());
  }
  offline(song: Song): string {
    const item = this.items.find((item: MusicDownload) => songKey(item.song) === songKey(song) && item.state === 'complete');
    if (!item || !this.context || !item.path.startsWith(`${this.context.filesDir}/Downloads/`)) return '';
    return fileIo.accessSync(item.path) ? item.path : '';
  }
  async start(song: Song, quality: string, url: string, exportUri: string = ''): Promise<void> {
    if (!this.context || !/^https?:\/\//i.test(url)) throw new Error('无法开始下载');
    if (this.items.some((item: MusicDownload) => songKey(item.song) === songKey(song) && item.state === 'downloading')) throw new Error('这首歌曲正在下载');
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const extension = quality.includes('flac') ? 'flac' : 'mp3';
    const temp = `${this.context.cacheDir}/lxmine-download-${id}.part`;
    const item: MusicDownload = { id, song, quality, state: 'downloading', received: 0, total: 0,
      path: `${this.context.filesDir}/Downloads/${id}.${extension}`, error: '', exportUri, exported: false };
    this.items.unshift(item); this.publish(true);
    try {
      const task = await request.downloadFile(this.context, { url, filePath: temp, title: song.name, description: song.singer, enableMetered: true, background: true });
      if (item.state === 'cancelled') { await task.remove(); return; }
      this.tasks.set(id, task);
      let lastProgress = 0;
      task.on('progress', (received: number, total: number) => {
        if (item.state !== 'downloading') return;
        item.received = received; item.total = total;
        if (Date.now() - lastProgress >= 250) { lastProgress = Date.now(); this.publish(); }
      });
      task.on('complete', () => {
        if (item.state !== 'downloading') { this.cleanTemp(temp); return; }
        try {
          const size = fileIo.statSync(temp).size;
          if (size <= 0) throw new Error('下载文件为空');
          const probe = fileIo.openSync(temp, fileIo.OpenMode.READ_ONLY);
          const prefix = new ArrayBuffer(Math.min(128, size));
          try { fileIo.readSync(probe.fd, prefix); } finally { fileIo.closeSync(probe); }
          const text = Array.from(new Uint8Array(prefix)).map((byte: number) => String.fromCharCode(byte)).join('').trim().toLowerCase();
          if (text.startsWith('<!doctype') || text.startsWith('<html') || text.startsWith('{') || text.startsWith('[')) throw new Error('音源返回了错误页面，未保存为歌曲');
          fileIo.renameSync(temp, item.path); item.received = size; item.total = size; item.state = 'complete';
        } catch (error) { item.state = 'failed'; item.error = (error as Error).message; this.cleanTemp(temp); }
        this.tasks.delete(id); this.publish(true);
        if (item.state === 'complete' && item.exportUri) this.exportFile(item.id, item.exportUri).catch((error: Error) => this.onError(error.message));
      });
      task.on('fail', (code: number) => {
        if (item.state !== 'downloading') return;
        this.tasks.delete(id);
        // Some music hosts reject the legacy background downloader. Retry with
        // the application's streaming HTTP stack without buffering the track.
        this.streamDownload(item, temp, url).catch((error: Error) => {
          if (item.state !== 'downloading') return;
          this.cleanTemp(temp); item.state = 'failed';
          item.error = `下载失败（${code}）：${error.message}`;
          this.publish(true); this.onError(item.error);
        });
      });
    } catch (error) { item.state = 'failed'; item.error = (error as Error).message; this.publish(true); throw error as Error; }
  }
  private async streamDownload(item: MusicDownload, temp: string, url: string): Promise<void> {
    this.cleanTemp(temp);
    const file = fileIo.openSync(temp, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
    const client = http.createHttp(); this.streams.set(item.id, client);
    item.received = 0; item.total = 0;
    let lastUpdate = 0;
    const ended = new Promise<void>((resolve, reject) => {
      this.streamEnds.set(item.id, (error?: Error) => { if (error) reject(error); else resolve(); });
      client.on('dataEnd', () => resolve());
    });
    // Attach a rejection handler immediately, including cancellation before headers.
    ended.catch(() => {});
    client.on('headersReceive', (raw: Object) => {
      const headers = raw as Record<string, string>;
      item.total = Number(headers['content-length'] || headers['Content-Length']) || 0;
    });
    client.on('dataReceive', (bytes: ArrayBuffer) => {
      if (item.state !== 'downloading') return;
      try {
        fileIo.writeSync(file.fd, bytes); item.received += bytes.byteLength;
        if (Date.now() - lastUpdate > 200) { lastUpdate = Date.now(); this.publish(); }
      } catch (error) { this.streamEnds.get(item.id)?.(error as Error); client.destroy(); }
    });
    try {
      const code = await client.requestInStream(url, { method: http.RequestMethod.GET,
        header: { 'Accept-Encoding': 'identity' }, usingCache: false, connectTimeout: 15000, readTimeout: 120000 });
      if (code !== 200 && code !== 206) throw new Error(`音源服务器返回 HTTP ${code}`);
      await ended;
      if (item.state !== 'downloading') return;
      if (item.received <= 0 || (item.total > 0 && item.received !== item.total)) throw new Error('下载文件不完整');
      fileIo.fsyncSync(file.fd);
    } finally {
      fileIo.closeSync(file); client.destroy(); this.streams.delete(item.id); this.streamEnds.delete(item.id);
    }
    const probe = fileIo.openSync(temp, fileIo.OpenMode.READ_ONLY);
    const bytes = new ArrayBuffer(Math.min(64, item.received));
    try { fileIo.readSync(probe.fd, bytes); } finally { fileIo.closeSync(probe); }
    const prefix = Array.from(new Uint8Array(bytes)).map((byte: number) => String.fromCharCode(byte)).join('').trim().toLowerCase();
    if (prefix.startsWith('<!doctype') || prefix.startsWith('<html') || prefix.startsWith('{') || prefix.startsWith('[')) throw new Error('音源返回了错误页面');
    fileIo.renameSync(temp, item.path); item.total = item.received; item.state = 'complete'; this.publish(true);
    if (item.exportUri) await this.exportFile(item.id, item.exportUri);
  }
  async exportFile(id: string, uri: string): Promise<void> {
    const item = this.items.find((entry: MusicDownload) => entry.id === id && entry.state === 'complete');
    if (!item || this.exporting.has(id)) return;
    this.exporting.add(id);
    let source: fileIo.File | null = null;
    let destination: fileIo.File | null = null;
    try {
      source = await fileIo.open(item.path, fileIo.OpenMode.READ_ONLY);
      destination = await fileIo.open(uri, fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
      await fileIo.copyFile(source.fd, destination.fd);
      await fileIo.fsync(destination.fd);
      item.exportUri = uri; item.exported = true; item.exportError = '';
    } catch (error) {
      item.exportError = `保存到系统失败：${(error as Error).message}`;
      throw new Error(item.exportError);
    } finally {
      if (source) fileIo.closeSync(source.fd);
      if (destination) fileIo.closeSync(destination.fd);
      this.exporting.delete(id); this.publish(true);
    }
  }
  private cleanTemp(path: string): void { try { if (fileIo.accessSync(path)) fileIo.unlinkSync(path); } catch (_) {} }
  async cancel(id: string): Promise<void> {
    const item = this.items.find((item: MusicDownload) => item.id === id);
    if (!item || item.state !== 'downloading') return;
    item.state = 'cancelled'; item.error = '已取消'; this.publish(true);
    this.streamEnds.get(id)?.(new Error('已取消'));
    this.streams.get(id)?.destroy();
    try { await this.tasks.get(id)?.remove(); } finally {
      this.tasks.delete(id);
      if (this.context) this.cleanTemp(`${this.context.cacheDir}/lxmine-download-${id}.part`);
    }
  }
}
