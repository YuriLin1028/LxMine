import { request } from '@kit.BasicServicesKit';
import { common } from '@kit.AbilityKit';
import { fileIo, fileUri } from '@kit.CoreFileKit';
import { http } from '@kit.NetworkKit';
import { Song } from '../model/Song';
import { songKey } from './MusicLibrary';

export interface MusicDownload {
  id: string; song: Song; quality: string; state: string; received: number; total: number; path: string; error: string;
  exportUri?: string; exportDirPath?: string; exportFileName?: string; exportedPaths?: string[]; exported?: boolean; exportError?: string;
}
export interface DownloadRemoveResult {
  removedPaths: string[];
  removedSongKeys: string[];
  deletedSourceCount: number;
  failedExportFiles: string[];
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
  async start(song: Song, quality: string, url: string, exportUri: string = '', exportDirPath: string = '', exportFileName: string = ''): Promise<void> {
    if (!this.context || !/^https?:\/\//i.test(url)) throw new Error('无法开始下载');
    if (this.items.some((item: MusicDownload) => songKey(item.song) === songKey(song) && item.state === 'downloading')) throw new Error('这首歌曲正在下载');
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const extension = quality.includes('flac') ? 'flac' : 'mp3';
    const temp = `${this.context.cacheDir}/lxmine-download-${id}.part`;
    const item: MusicDownload = { id, song, quality, state: 'downloading', received: 0, total: 0,
      path: `${this.context.filesDir}/Downloads/${id}.${extension}`, error: '', exportUri, exportDirPath, exportFileName, exported: false };
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
        if (item.state === 'complete') {
          if (item.exportUri) this.exportFile(item.id, item.exportUri).catch((error: Error) => this.onError(error.message));
          else if (item.exportDirPath) this.exportToDir(item.id, item.exportDirPath, item.exportFileName || '').catch((error: Error) => this.onError(error.message));
        }
      });
      task.on('fail', (code: number) => {
        if (item.state !== 'downloading') return;
        this.tasks.delete(id);
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
    else if (item.exportDirPath) await this.exportToDir(item.id, item.exportDirPath, item.exportFileName || '');
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
      this.recordExportedPath(item, uri);
    } catch (error) {
      item.exportError = `保存到系统失败：${(error as Error).message}`;
      throw new Error(item.exportError);
    } finally {
      if (source) fileIo.closeSync(source.fd);
      if (destination) fileIo.closeSync(destination.fd);
      this.exporting.delete(id); this.publish(true);
    }
  }
  async exportToDir(id: string, dirPath: string, fileName: string): Promise<void> {
    const item = this.items.find((entry: MusicDownload) => entry.id === id && entry.state === 'complete');
    if (!item || !dirPath || this.exporting.has(id)) return;
    this.exporting.add(id);
    let source: fileIo.File | null = null;
    let destination: fileIo.File | null = null;
    try {
      const ext = item.path.toLowerCase().endsWith('.flac') ? 'flac' : 'mp3';
      const rawBase = (fileName || `${item.song.singer} - ${item.song.name}`).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\s*-\s*/, '').trim().slice(0, 120) || item.id;
      const baseNoExt = rawBase.toLowerCase().endsWith(`.${ext}`) ? rawBase.slice(0, -(ext.length + 1)) : rawBase;
      const cleanDir = dirPath.endsWith('/') ? dirPath.slice(0, -1) : dirPath;
      let finalName = `${baseNoExt}.${ext}`;
      let targetPath = `${cleanDir}/${finalName}`;
      const existingOwnPath = this.resolveFsPath(item.exportUri || '');
      let seq = 2;
      while (targetPath !== existingOwnPath && this.pathExists(targetPath) && seq <= 50) {
        finalName = `${baseNoExt} (${seq++}).${ext}`;
        targetPath = `${cleanDir}/${finalName}`;
      }
      source = await fileIo.open(item.path, fileIo.OpenMode.READ_ONLY);
      destination = await fileIo.open(targetPath, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
      await fileIo.copyFile(source.fd, destination.fd);
      await fileIo.fsync(destination.fd);
      item.exportUri = targetPath; item.exportDirPath = cleanDir; item.exportFileName = finalName; item.exported = true; item.exportError = '';
      this.recordExportedPath(item, targetPath);
    } catch (error) {
      item.exportError = `导出到系统目录失败：${(error as Error).message}`;
      throw new Error(item.exportError);
    } finally {
      if (source) fileIo.closeSync(source.fd);
      if (destination) fileIo.closeSync(destination.fd);
      this.exporting.delete(id); this.publish(true);
    }
  }
  async exportOfflineSong(song: Song, targetUri: string = '', dirPath: string = '', fileName: string = ''): Promise<boolean> {
    const item = this.items.find((entry: MusicDownload) => songKey(entry.song) === songKey(song) && entry.state === 'complete');
    if (!item || !fileIo.accessSync(item.path)) return false;
    if (targetUri) { await this.exportFile(item.id, targetUri); return true; }
    if (dirPath) { await this.exportToDir(item.id, dirPath, fileName); return true; }
    return false;
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

  updateCovers(covers: Map<string, string>): void {
    let changed = false;
    for (const item of this.items) {
      if (item.song.coverUrl) continue;
      const found = covers.get(songKey(item.song)) ?? '';
      if (found) {
        const copy = JSON.parse(JSON.stringify(item.song)) as Song;
        copy.coverUrl = found;
        item.song = copy;
        changed = true;
      }
    }
    if (changed) this.publish(true);
  }

  findByIds(ids: string[]): MusicDownload[] {
    if (!ids.length) return [];
    const targetIds = new Set<string>(ids);
    return this.items.filter((item: MusicDownload) => targetIds.has(item.id));
  }

  private pathExists(fsPath: string): boolean {
    if (!fsPath) return false;
    try { return fileIo.accessSync(fsPath); } catch (_) { return false; }
  }

  private resolveFsPath(uriOrPath: string): string {
    if (!uriOrPath) return '';
    if (uriOrPath.startsWith('file://')) {
      try { return new fileUri.FileUri(uriOrPath).path; } catch (_) { return ''; }
    }
    return uriOrPath;
  }

  private recordExportedPath(item: MusicDownload, uriOrPath: string): void {
    if (!uriOrPath) return;
    const list = Array.isArray(item.exportedPaths) ? item.exportedPaths.slice() : [];
    if (!list.includes(uriOrPath)) list.push(uriOrPath);
    item.exportedPaths = list;
  }

  private deleteFileVerified(fsPath: string): string {
    if (!fsPath) return 'missing';
    if (!this.pathExists(fsPath)) return 'missing';
    try {
      fileIo.unlinkSync(fsPath);
    } catch (_) {}
    return this.pathExists(fsPath) ? 'failed' : 'deleted';
  }

  async remove(id: string, deleteSourceFile: boolean = false): Promise<DownloadRemoveResult> {
    return this.removeBatch([id], deleteSourceFile);
  }

  async removeBatch(ids: string[], deleteSourceFile: boolean = false): Promise<DownloadRemoveResult> {
    const empty: DownloadRemoveResult = { removedPaths: [], removedSongKeys: [], deletedSourceCount: 0, failedExportFiles: [] };
    if (!ids.length) return empty;
    const targetIds = new Set<string>(ids);
    const removedPaths: string[] = [];
    const removedSongKeys: string[] = [];
    const failedExportFiles: string[] = [];
    let deletedSourceCount = 0;
    for (const item of this.items) {
      if (!targetIds.has(item.id)) continue;
      if (item.state === 'downloading') {
        await this.cancel(item.id);
      }
      removedSongKeys.push(songKey(item.song));
      if (deleteSourceFile) {
        if (this.context && item.path && item.path.startsWith(this.context.filesDir + '/Downloads/')) {
          const sandboxOutcome = this.deleteFileVerified(item.path);
          if (sandboxOutcome === 'deleted') deletedSourceCount += 1;
          if (sandboxOutcome !== 'failed') removedPaths.push(item.path);
        }
        const candidates = new Set<string>();
        if (item.exportDirPath && item.exportFileName) {
          const cleanDir = item.exportDirPath.endsWith('/') ? item.exportDirPath.slice(0, -1) : item.exportDirPath;
          candidates.add(`${cleanDir}/${item.exportFileName}`);
        }
        if (item.exportUri) {
          const resolved = this.resolveFsPath(item.exportUri);
          if (resolved) candidates.add(resolved);
        }
        if (Array.isArray(item.exportedPaths)) {
          for (const extra of item.exportedPaths) {
            const resolved = this.resolveFsPath(extra);
            if (resolved) candidates.add(resolved);
          }
        }
        candidates.forEach((extPath: string) => {
          if (!extPath || extPath === item.path) return;
          const outcome = this.deleteFileVerified(extPath);
          if (outcome === 'deleted') {
            deletedSourceCount += 1;
            removedPaths.push(extPath);
          } else if (outcome === 'failed') {
            const slash = extPath.lastIndexOf('/');
            failedExportFiles.push(slash >= 0 ? extPath.substring(slash + 1) : (item.song.name || extPath));
          }
        });
      }
    }
    this.items = this.items.filter((entry: MusicDownload) => !targetIds.has(entry.id));
    this.publish(true);
    return { removedPaths, removedSongKeys, deletedSourceCount, failedExportFiles };
  }
}
