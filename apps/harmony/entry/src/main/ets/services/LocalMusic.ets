import { common } from '@kit.AbilityKit';
import { fileIo } from '@kit.CoreFileKit';
import { media } from '@kit.MediaKit';
import { image } from '@kit.ImageKit';
import { util } from '@kit.ArkTS';
import { Song } from '../model/Song';
import { songKey } from './MusicLibrary';

export interface LocalTrack {
  song: Song;
  path: string;
  sourceUri: string;
  addedAt: number;
  lyric?: string;
}

export interface DownloadTrack {
  song: Song;
  path: string;
}

interface LocalMetadata {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  coverUrl: string;
}

// 手机本地音乐：系统音频选择器 URI 复制到沙箱，提取时长/封面/内嵌歌词并持久化；
// 下载完成的歌曲也会并入本地音乐。
export class LocalMusic {
  private context: common.UIAbilityContext | null = null;
  private dir: string = '';
  private items: LocalTrack[] = [];
  onChange: (songs: Song[]) => void = () => {};
  onError: (message: string) => void = () => {};

  initialize(context: common.UIAbilityContext): void {
    this.context = context;
    this.dir = `${context.filesDir}/LocalMusic`;
    try {
      if (!fileIo.accessSync(this.dir)) fileIo.mkdirSync(this.dir, true);
    } catch (error) {
      this.onError(`本地音乐目录不可用：${(error as Error).message}`);
      this.items = [];
      this.onChange([]);
      return;
    }
    try {
      const saved = fileIo.readTextSync(`${this.dir}/index.json`);
      const parsed = JSON.parse(saved) as LocalTrack[];
      this.items = parsed.filter((item: LocalTrack) => {
        return !!item && !!item.song && typeof item.path === 'string' && fileIo.accessSync(item.path);
      });
    } catch (_) {
      this.items = [];
    }
    this.onChange(this.songs());
    this.refreshMissingMetadata().catch((error: Error) => this.onError(error.message));
  }

  /** 旧版本导入的本地歌曲补齐时长/封面/内嵌歌词。 */
  private async refreshMissingMetadata(): Promise<void> {
    console.info(`[LocalMusic] refresh metadata start count=${this.items.length}`);
    let changed = false;
    for (const item of this.items) {
      if (!item || !item.song) continue;
      const needMetadata = !item.song.durationMs || !item.song.coverUrl;
      if (needMetadata) {
        const metadata = await this.readMetadata(item.path, item.song.id);
        console.info(`[LocalMusic] metadata ${item.song.name}: duration=${metadata.durationMs} cover=${metadata.coverUrl ? 'yes' : 'no'}`);
        if (metadata.durationMs > 0 && !item.song.durationMs) { item.song.durationMs = metadata.durationMs; changed = true; }
        if (metadata.coverUrl && !item.song.coverUrl) { item.song.coverUrl = metadata.coverUrl; changed = true; }
        if (metadata.title && item.song.name.startsWith('本地音频')) { item.song.name = metadata.title; changed = true; }
        if (metadata.artist && item.song.singer === '本地文件') { item.song.singer = metadata.artist; changed = true; }
        if (metadata.album && item.song.albumName === '本地音乐') { item.song.albumName = metadata.album; changed = true; }
      }
      if (!item.lyric) {
        const lyric = this.readEmbeddedLyric(item.path);
        console.info(`[LocalMusic] lyric ${item.song.name}: ${lyric ? 'yes' : 'no'}`);
        if (lyric) { item.lyric = lyric; changed = true; }
      }
    }
    if (changed) {
      this.persist();
      this.onChange(this.songs());
    }
    console.info(`[LocalMusic] refresh metadata done changed=${changed}`);
  }

  songs(): Song[] {
    return this.items.map((item: LocalTrack) => item.song);
  }

  pathFor(song: Song): string {
    const item = this.items.find((entry: LocalTrack) => songKey(entry.song) === songKey(song));
    if (!item || !fileIo.accessSync(item.path)) return '';
    return item.path;
  }

  lyricFor(song: Song): string {
    const item = this.items.find((entry: LocalTrack) => songKey(entry.song) === songKey(song));
    return item?.lyric ?? '';
  }

  /** 软件内下载完成的歌曲自动并入本地音乐；只登记路径，不重复复制文件。 */
  adoptDownloads(downloads: DownloadTrack[]): void {
    if (!this.dir) return;
    let changed = false;
    for (const download of downloads) {
      if (!download || !download.song || !download.path || !fileIo.accessSync(download.path)) continue;
      if (this.items.some((item: LocalTrack) => songKey(item.song) === songKey(download.song))) continue;
      this.items.push({ song: download.song, path: download.path,
        sourceUri: `download:${songKey(download.song)}`, addedAt: Date.now(), lyric: '' });
      changed = true;
    }
    if (changed) {
      this.persist();
      this.onChange(this.songs());
    }
  }

  /** 复制选中的音频到沙箱；返回本次新增数量。重复选择同一 URI 会跳过。 */
  async addUris(uris: string[]): Promise<number> {
    if (!this.context || !this.dir) throw new Error('本地音乐尚未初始化');
    let added = 0;
    for (let index = 0; index < uris.length; index += 1) {
      const uri = uris[index];
      if (!uri || this.items.some((item: LocalTrack) => item.sourceUri === uri)) continue;
      const rawName = decodeURIComponent(uri.substring(uri.lastIndexOf('/') + 1)) || `本地音频 ${index + 1}`;
      const extMatch = rawName.match(/\.([a-z0-9]{2,5})$/i);
      const extension = extMatch ? extMatch[1].toLowerCase() : 'mp3';
      const id = `local-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      const destination = `${this.dir}/${id}.${extension}`;
      let source: fileIo.File | null = null;
      try {
        source = fileIo.openSync(uri, fileIo.OpenMode.READ_ONLY);
        await fileIo.copyFile(source.fd, destination);
      } catch (error) {
        this.onError(`添加「${rawName}」失败：${(error as Error).message}`);
        try { if (source) fileIo.closeSync(source); } catch (_) {}
        try { fileIo.unlinkSync(destination); } catch (_) {}
        continue;
      } finally {
        try { if (source) fileIo.closeSync(source); } catch (_) {}
      }
      const metadata = await this.readMetadata(destination, id);
      const lyric = this.readEmbeddedLyric(destination);
      const fallbackName = rawName.replace(/\.[^.]+$/, '') || '本地音频';
      const song: Song = {
        source: 'local', id, name: metadata.title || fallbackName,
        singer: metadata.artist || '本地文件', albumName: metadata.album || '本地音乐',
        albumId: '', durationMs: metadata.durationMs, qualitys: ['local'], coverUrl: metadata.coverUrl
      };
      this.items.push({ song, path: destination, sourceUri: uri, addedAt: Date.now(), lyric });
      added += 1;
    }
    if (added > 0) this.persist();
    this.onChange(this.songs());
    return added;
  }

  private async readMetadata(path: string, id: string): Promise<LocalMetadata> {
    const result: LocalMetadata = { title: '', artist: '', album: '', durationMs: 0, coverUrl: '' };
    let extractor: media.AVMetadataExtractor | null = null;
    let file: fileIo.File | null = null;
    try {
      file = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY);
      const size = fileIo.statSync(file.fd).size;
      extractor = await media.createAVMetadataExtractor();
      extractor.fdSrc = { fd: file.fd, offset: 0, length: size };
      const metadata = await extractor.fetchMetadata();
      result.title = metadata.title || '';
      result.artist = metadata.artist || metadata.albumArtist || '';
      result.album = metadata.album || '';
      let duration = Number(metadata.duration) || 0;
      // AVMetadata 的 duration 通常为毫秒；异常大的值按微秒兜底。
      if (duration > 12 * 60 * 60 * 1000) duration = Math.round(duration / 1000);
      result.durationMs = Math.max(0, duration);
      try {
        const pixelMap = await extractor.fetchAlbumCover();
        const packer = image.createImagePacker();
        const coverBytes = await packer.packing(pixelMap, { format: 'image/jpeg', quality: 82 });
        const coverPath = `${this.dir}/${id}.jpg`;
        const coverFile = fileIo.openSync(coverPath, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
        try {
          fileIo.writeSync(coverFile.fd, coverBytes);
          fileIo.fsyncSync(coverFile.fd);
        } finally {
          fileIo.closeSync(coverFile);
        }
        result.coverUrl = `file://${coverPath}`;
        await pixelMap.release();
        await packer.release();
      } catch (_) {}
    } catch (error) {
      // 元数据读取失败时保留文件名兜底，不阻止导入。
      console.warn(`[LocalMusic] metadata failed ${path}: ${(error as Error).message}`);
    } finally {
      try { if (extractor) await extractor.release(); } catch (_) {}
      try { if (file) fileIo.closeSync(file); } catch (_) {}
    }
    return result;
  }

  private syncsafe(bytes: Uint8Array, offset: number): number {
    return ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14) |
      ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f);
  }

  /** 读取 MP3 ID3v2 的 USLT/TXXX 内嵌歌词；没有标签时返回空串。 */
  private readEmbeddedLyric(path: string): string {
    let file: fileIo.File | null = null;
    try {
      const size = Math.min(fileIo.statSync(path).size, 4 * 1024 * 1024);
      const buffer = new ArrayBuffer(size);
      file = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY);
      const length = fileIo.readSync(file.fd, buffer);
      const bytes = new Uint8Array(buffer, 0, length);
      if (bytes.length >= 4 && bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
        return this.readFlacLyric(bytes);
      }
      if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return '';
      const version = bytes[3];
      const tagEnd = Math.min(bytes.length, 10 + this.syncsafe(bytes, 6));
      let pos = 10;
      while (pos + 10 <= tagEnd) {
        const id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
        if (!/^[A-Z0-9]{4}$/.test(id)) break;
        const frameSize = version === 4
          ? this.syncsafe(bytes, pos + 4)
          : (bytes[pos + 4] << 24) | (bytes[pos + 5] << 16) | (bytes[pos + 6] << 8) | bytes[pos + 7];
        const dataStart = pos + 10;
        if (frameSize <= 0 || dataStart + frameSize > bytes.length) break;
        if (id === 'USLT' || id === 'ULT') {
          const encoding = bytes[dataStart];
          let cursor = dataStart + 4;
          if (encoding === 1 || encoding === 2) {
            while (cursor + 1 < dataStart + frameSize && !(bytes[cursor] === 0 && bytes[cursor + 1] === 0)) cursor += 2;
            cursor += 2;
          } else {
            while (cursor < dataStart + frameSize && bytes[cursor] !== 0) cursor += 1;
            cursor += 1;
          }
          return this.decodeId3Text(bytes.slice(cursor, dataStart + frameSize), encoding).replace(/^\uFEFF/, '').trim();
        }
        pos = dataStart + frameSize;
      }
    } catch (_) {}
    finally {
      try { if (file) fileIo.closeSync(file); } catch (_) {}
    }
    return '';
  }

  /** FLAC Vorbis comment 中的 LYRICS / UNSYNCEDLYRICS 标签。 */
  private readFlacLyric(bytes: Uint8Array): string {
    let pos = 4;
    while (pos + 4 <= bytes.length) {
      const header = bytes[pos];
      const type = header & 0x7f;
      const last = (header & 0x80) !== 0;
      const length = (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
      const start = pos + 4;
      const end = Math.min(bytes.length, start + length);
      if (type === 4) return this.readVorbisComments(bytes.slice(start, end));
      pos = start + length;
      if (last) break;
    }
    return '';
  }

  private readVorbisComments(data: Uint8Array): string {
    let pos = 0;
    const readU32 = (): number => {
      const value = (data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)) >>> 0;
      pos += 4;
      return value;
    };
    if (data.length < 8) return '';
    const vendorLength = readU32();
    pos += vendorLength;
    if (pos + 4 > data.length) return '';
    const count = readU32();
    for (let i = 0; i < count && pos + 4 <= data.length; i += 1) {
      const length = readU32();
      if (length <= 0 || pos + length > data.length) break;
      const comment = util.TextDecoder.create('utf-8').decode(data.slice(pos, pos + length));
      pos += length;
      const separator = comment.indexOf('=');
      if (separator <= 0) continue;
      const key = comment.substring(0, separator).trim().toUpperCase();
      if (key === 'LYRICS' || key === 'UNSYNCEDLYRICS' || key === 'LYRIC') {
        return comment.substring(separator + 1).trim();
      }
    }
    return '';
  }

  private decodeId3Text(data: Uint8Array, encoding: number): string {
    const codec = encoding === 0 ? 'iso-8859-1' : encoding === 2 ? 'utf-16be' : encoding === 1 ? 'utf-16le' : 'utf-8';
    try {
      return util.TextDecoder.create(codec).decode(data);
    } catch (_) {
      try { return util.TextDecoder.create('utf-8').decode(data); } catch (_) { return ''; }
    }
  }

  private persist(): void {
    try {
      const temporary = `${this.dir}/index.json.tmp`;
      const file = fileIo.openSync(temporary, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
      try {
        fileIo.writeSync(file.fd, JSON.stringify(this.items));
        fileIo.fsyncSync(file.fd);
      } finally {
        fileIo.closeSync(file);
      }
      fileIo.renameSync(temporary, `${this.dir}/index.json`);
    } catch (error) {
      this.onError(`本地音乐索引保存失败：${(error as Error).message}`);
    }
  }
}
