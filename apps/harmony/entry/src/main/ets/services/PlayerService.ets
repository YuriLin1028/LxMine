import { media } from '@kit.MediaKit';
import { avSession } from '@kit.AVSessionKit';
import { common, wantAgent } from '@kit.AbilityKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { Song } from '../model/Song';
import { fileIo } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { http } from '@kit.NetworkKit';

export interface SessionLyricLine { timeMs: number; text: string; }

// AVPlayer 生命周期与系统媒体会话。切歌必须 reset 到 idle 后才能重新设置 URL。
export class PlayerService {
  private player: media.AVPlayer | null = null;
  private creating: Promise<media.AVPlayer> | null = null;
  private session: avSession.AVSession | null = null;
  private context: common.UIAbilityContext | null = null;
  private background: boolean = false;
  private current: Song | null = null;
  private state: string = 'idle';
  private position: number = 0;
  private stateCallback: ((state: string) => void) | null = null;
  private timeCallback: ((time: number) => void) | null = null;
  private errorCallback: ((message: string) => void) | null = null;
  private nextCallback: ((step: number) => void) | null = null;
  private beforePlayCallback: (() => Promise<void>) | null = null;
  private initialPosition: number = 0;
  private autoPlay: boolean = true;
  private intentId: number = 0;
  private switching: boolean = false;
  private localArtwork: Map<string, Promise<image.PixelMap>> = new Map();
  beginSwitch(autoPlay: boolean): number {
    this.autoPlay = autoPlay;
    this.switching = true;
    this.requestId++;
    return ++this.intentId;
  }
  async pauseForSwitch(): Promise<void> {
    if (this.player?.state === 'playing') await this.player.pause();
  }
  private chain: Promise<void> = Promise.resolve();
  private requestId: number = 0;
  private metadataId: number = 0;
  private metadataChain: Promise<void> = Promise.resolve();
  private defaultArtwork: Promise<image.PixelMap> | null = null;
  private localFile: fileIo.File | null = null;
  private lyricLines: SessionLyricLine[] = [];
  private lyricText: string = '';
  private lyricOffset: number = 0;
  private lyricIndex: number = -1;
  private lastSessionTick: number = 0;
  onState(callback: (state: string) => void): void { this.stateCallback = callback; }
  onTime(callback: (time: number) => void): void { this.timeCallback = callback; }
  onError(callback: (message: string) => void): void { this.errorCallback = callback; }
  onNext(callback: (step: number) => void): void { this.nextCallback = callback; }
  onBeforePlay(callback: () => Promise<void>): void { this.beforePlayCallback = callback; }
  /** 把当前歌词同步给系统播控与锁屏歌词，offset 与舞台使用同一毫秒语义。 */
  setLyricData(lines: SessionLyricLine[], offset: number = this.lyricOffset): void {
    this.lyricLines = lines ?? [];
    this.lyricOffset = offset;
    this.lyricText = this.buildLyricText(this.lyricLines);
    this.lyricIndex = -1;
    this.updateMetadata();
    this.updateSingleLyric(true);
  }
  setArtwork(song: Song): void {
    if (!this.current || this.current.id !== song.id || this.current.source !== song.source) return;
    this.current = song;
    this.updateMetadata();
  }
  setLyricOffset(offset: number): void {
    this.lyricOffset = offset;
    this.updateSingleLyric(true);
  }
  initialize(context: common.UIAbilityContext): void { this.context = context; }
  private report(error: BusinessError): void { this.errorCallback?.(error.message); }
  private async ensurePlayer(): Promise<media.AVPlayer> {
    if (this.player) return this.player;
    if (this.creating) return this.creating;
    this.creating = media.createAVPlayer();
    const player = await this.creating;
    this.player = player;
    this.creating = null;
    player.on('stateChange', (state: string) => {
      this.state = state;
      if (state === 'initialized') player.prepare().catch((e: BusinessError) => this.report(e));
      if (state === 'prepared') {
        if (this.initialPosition > 0) {
          this.position = Math.min(this.initialPosition, Math.max(0, player.duration - 250));
          player.seek(this.position, media.SeekMode.SEEK_CLOSEST); this.timeCallback?.(this.position);
        }
        this.initialPosition = 0;
        if (this.autoPlay && !this.switching) player.play().catch((e: BusinessError) => this.report(e));
        this.updateMetadata();
      }
      if (state === 'playing') {
        this.session?.activate().catch((e: BusinessError) => console.warn(`[Session] activate ${e.message}`));
        this.startBackground();
      }
      this.stateCallback?.(state);
      this.updateSession();
      this.updateSingleLyric(true);
    });
    player.on('timeUpdate', (time: number) => {
      this.position = time; this.timeCallback?.(time);
      if (this.state === 'playing' && Date.now() - this.lastSessionTick > 900) this.updateSession();
      this.updateSingleLyric(false);
    });
    player.on('error', (error: BusinessError) => { this.report(error); this.stateCallback?.('error'); });
    if (this.context) {
      try {
        this.session = await avSession.createAVSession(this.context, 'LxMine', 'audio');
        this.session.on('play', () => { this.resume().catch((e: BusinessError) => this.report(e)); });
        this.session.on('pause', () => { this.pause().catch((e: BusinessError) => this.report(e)); });
        this.session.on('playNext', () => this.nextCallback?.(1));
        this.session.on('playPrevious', () => this.nextCallback?.(-1));
        this.session.on('seek', (time: number) => this.seek(time));
        try {
          await this.session.setExtras({ 'hicar.media.bundle.FOR_HICAR': true, 'hicar.media.bundle.PLAY_MODE': 0 });
          console.info('[HiCar] AVSession marked FOR_HICAR');
        } catch (error) { console.info(`[HiCar] extras: ${(error as BusinessError).message}`); }
        await this.session.activate();
        this.updateMetadata();
        this.updateSession();
      } catch (error) { this.errorCallback?.(`媒体会话：${(error as BusinessError).message}`); }
    }
    return player;
  }
  /** 串行切歌，避免连续点击时多个 reset/url 操作交错。 */
  async playUrl(url: string, song: Song, startMs: number = 0, autoPlay: boolean = true, intentId?: number): Promise<void> {
    if (!/^https?:\/\//i.test(url)) throw new Error('音源返回的播放地址无效');
    if (intentId !== undefined && intentId !== this.intentId) return;
    const requestId = ++this.requestId;
    if (intentId === undefined) this.autoPlay = autoPlay;
    const operation = this.chain.catch(() => {}).then(async () => {
      if (requestId !== this.requestId) return;
      const player = await this.ensurePlayer();
      if (requestId !== this.requestId) return;
      await player.reset();
      if (requestId !== this.requestId) return;
      if (this.localFile) { fileIo.closeSync(this.localFile); this.localFile = null; }
      this.current = song; this.initialPosition = Math.max(0, startMs); this.position = this.initialPosition;
      this.timeCallback?.(this.position);
      this.updateMetadata();
      this.updateSession();
      this.updateSingleLyric(true);
      this.switching = false;
      player.url = url;
    });
    this.chain = operation;
    await operation;
  }
  async playFile(path: string, song: Song, startMs: number = 0, autoPlay: boolean = true, intentId?: number): Promise<void> {
    if (!this.context || !path.startsWith(`${this.context.filesDir}/`)) throw new Error('本地文件路径无效');
    if (intentId !== undefined && intentId !== this.intentId) return;
    const requestId = ++this.requestId;
    if (intentId === undefined) this.autoPlay = autoPlay;
    const operation = this.chain.catch(() => {}).then(async () => {
      if (requestId !== this.requestId) return;
      const player = await this.ensurePlayer();
      if (requestId !== this.requestId) return;
      await player.reset();
      if (requestId !== this.requestId) return;
      if (this.localFile) fileIo.closeSync(this.localFile);
      this.localFile = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY);
      this.current = song; this.initialPosition = Math.max(0, startMs); this.position = this.initialPosition;
      this.timeCallback?.(this.position);
      this.updateMetadata(); this.updateSession(); this.updateSingleLyric(true);
      this.switching = false;
      player.fdSrc = { fd: this.localFile.fd, offset: 0, length: fileIo.statSync(path).size };
    });
    this.chain = operation; await operation;
  }
  async pause(): Promise<void> {
    // System/lockscreen pause during prepare must also cancel the pending auto-play.
    this.autoPlay = false;
    if (this.player?.state === 'playing') await this.player.pause();
    // Keep the AUDIO_PLAYBACK task/session alive while paused; stopping it made
    // the system controller stay stuck on the playing state.
    if (this.current) { this.state = 'paused'; this.updateSession(); }
  }
  async resume(): Promise<boolean> {
    this.autoPlay = true;
    if (this.switching) return false;
    this.session?.activate().catch(() => {});
    if (this.player && ['paused', 'prepared', 'completed'].includes(this.player.state)) {
      await this.beforePlayCallback?.();
      await this.player.play();
      return true;
    }
    return false;
  }
  seek(time: number): void {
    if (this.player && ['playing', 'paused', 'prepared', 'completed'].includes(this.player.state)) {
      this.player.seek(Math.max(0, Math.min(time, this.durationMs())), media.SeekMode.SEEK_CLOSEST);
      this.position = Math.max(0, Math.min(time, this.durationMs())); this.timeCallback?.(this.position);
      this.updateSession(); this.updateSingleLyric(true);
    }
  }
  durationMs(): number { const duration = this.player?.duration ?? 0; return duration > 0 ? duration : this.current?.durationMs ?? 0; }
  private buildLyricText(lines: SessionLyricLine[]): string {
    const rows: string[] = [];
    for (const line of lines) {
      if (!Number.isFinite(line.timeMs)) continue;
      const ms = Math.max(0, line.timeMs);
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(2).padStart(5, '0');
      rows.push(`[${String(minutes).padStart(2, '0')}:${seconds}]${(line.text || '').replace(/\r?\n/g, ' / ')}`);
    }
    return rows.join('\n');
  }
  private lyricIndexAt(timeMs: number): number {
    if (!this.lyricLines.length) return -1;
    let index = 0;
    for (let i = 0; i < this.lyricLines.length; i++) {
      if (this.lyricLines[i].timeMs <= timeMs) index = i; else break;
    }
    return index;
  }
  private currentLyricText(): string {
    if (!this.lyricLines.length) return '';
    const index = this.lyricIndexAt(this.position + this.lyricOffset);
    if (index < 0) return '';
    const text = (this.lyricLines[index].text || '').trim();
    return text ? text.replace(/\r?\n/g, ' ') : '♪';
  }
  private updateSingleLyric(force: boolean): void {
    if (!this.session || !this.current) return;
    const index = this.lyricLines.length ? this.lyricIndexAt(this.position + this.lyricOffset) : -1;
    if (!force && index === this.lyricIndex) return;
    this.lyricIndex = index;
    this.updateMetadata();
  }
  private updateMetadata(): void {
    if (!this.session || !this.current) return;
    const metadataId = ++this.metadataId;
    const session = this.session;
    const base: avSession.AVMetadata = { assetId: `${this.current.source}:${this.current.id}`, title: this.current.name,
      artist: this.current.singer, album: this.current.albumName, duration: this.durationMs(),
      lyric: this.lyricText, singleLyricText: this.currentLyricText() };
    const cover = (this.current.coverUrl || '').trim();
    this.metadataChain = this.metadataChain.catch(() => {}).then(async () => {
      if (metadataId !== this.metadataId || this.session !== session) return;
      base.mediaImage = await this.artwork(cover);
      if (metadataId !== this.metadataId || this.session !== session) return;
      await session.setAVMetadata(base);
    }).catch((error: BusinessError) => console.error(`[Session] metadata ${error.code} ${error.message}`));
  }
  private async artwork(cover: string): Promise<string | image.PixelMap> {
    if (!/^https?:\/\//i.test(cover) && !cover.startsWith('file://')) return this.getDefaultArtwork();
    let cached = this.localArtwork.get(cover);
    if (!cached) {
      cached = /^https?:\/\//i.test(cover) ? this.readRemoteArtwork(cover) : this.readLocalArtwork(cover);
      this.localArtwork.set(cover, cached);
      if (this.localArtwork.size > 4) {
        const oldest = Array.from(this.localArtwork.keys())[0];
        const previous = this.localArtwork.get(oldest);
        this.localArtwork.delete(oldest);
        this.metadataChain.then(() => previous).then((map: image.PixelMap | undefined) => map?.release()).catch(() => {});
      }
    }
    try { return await cached; }
    catch (_) { this.localArtwork.delete(cover); return this.getDefaultArtwork(); }
  }
  private async readRemoteArtwork(cover: string): Promise<image.PixelMap> {
    const client = http.createHttp();
    let source: image.ImageSource | null = null;
    try {
      const result = await client.request(cover, { method: http.RequestMethod.GET, expectDataType: http.HttpDataType.ARRAY_BUFFER,
        header: { 'User-Agent': 'Mozilla/5.0', 'Referer': cover.includes('qq.com') || cover.includes('gtimg.cn') ? 'https://y.qq.com/' : cover.includes('163.com') || cover.includes('126.net') ? 'https://music.163.com/' : '' }, connectTimeout: 6000, readTimeout: 6000 });
      const bytes = result.result as ArrayBuffer;
      if (result.responseCode !== 200 || bytes.byteLength > 6 * 1024 * 1024) throw new Error('封面不可用');
      source = image.createImageSource(bytes);
      return await source.createPixelMap({ desiredSize: { width: 256, height: 256 } });
    } finally { if (source) await source.release(); client.destroy(); }
  }
  private async readLocalArtwork(cover: string): Promise<image.PixelMap> {
    const path = decodeURIComponent(cover.slice(7));
    if (!this.context || !path.startsWith(`${this.context.filesDir}/`) || path.split('/').includes('..')) throw new Error('封面路径不可访问');
    const file = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY);
    let source: image.ImageSource | null = null;
    try {
      source = image.createImageSource(file.fd);
      return await source.createPixelMap({ desiredSize: { width: 256, height: 256 } });
    } finally {
      if (source) await source.release();
      fileIo.closeSync(file);
    }
  }
  private getDefaultArtwork(): Promise<image.PixelMap> {
    if (!this.defaultArtwork) {
      this.defaultArtwork = this.createDefaultArtwork().catch((error: Error) => {
        this.defaultArtwork = null;
        throw error;
      });
    }
    return this.defaultArtwork;
  }
  private async createDefaultArtwork(): Promise<image.PixelMap> {
    if (!this.context) throw new Error('媒体封面资源尚未就绪');
    const bytes = await this.context.resourceManager.getMediaContent($r('app.media.app_icon').id);
    const source = image.createImageSource(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    try { return await source.createPixelMap(); }
    finally { await source.release(); }
  }
  private sessionState(): avSession.PlaybackState {
    if (this.state === 'playing') return avSession.PlaybackState.PLAYBACK_STATE_PLAY;
    if (this.state === 'paused') return avSession.PlaybackState.PLAYBACK_STATE_PAUSE;
    if (this.state === 'prepared' && !this.autoPlay) return avSession.PlaybackState.PLAYBACK_STATE_PAUSE;
    if (this.state === 'completed') return avSession.PlaybackState.PLAYBACK_STATE_COMPLETED;
    if (this.state === 'error' || this.state === 'released' || !this.current) return avSession.PlaybackState.PLAYBACK_STATE_STOP;
    return avSession.PlaybackState.PLAYBACK_STATE_PREPARE;
  }
  private updateSession(): void {
    if (!this.session) return;
    this.lastSessionTick = Date.now();
    // speed 0 is outside the system's supported set (0.5–2.0) and makes the
    // native layer reject PAUSE with "state not valid"; the state itself carries pause.
    this.session.setAVPlaybackState({ state: this.sessionState(), speed: 1,
      position: { elapsedTime: Math.max(0, this.position), updateTime: Date.now() }
    }).catch((e: BusinessError) => console.error(`[Session] state ${e.code} ${e.message}`));
  }
  private async stopBackground(): Promise<void> {
    if (!this.background || !this.context) { this.background = false; return; }
    try { await backgroundTaskManager.stopBackgroundRunning(this.context); } catch (_) {}
    this.background = false;
  }
  private async startBackground(): Promise<void> {
    if (this.background || !this.context) return;
    this.background = true;
    try {
      const agent = await wantAgent.getWantAgent({ wants: [{ bundleName: this.context.abilityInfo.bundleName, abilityName: 'EntryAbility' }],
        operationType: wantAgent.OperationType.START_ABILITY, requestCode: 0, wantAgentFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG] });
      await this.session?.setLaunchAbility(agent);
      await backgroundTaskManager.startBackgroundRunning(this.context, backgroundTaskManager.BackgroundMode.AUDIO_PLAYBACK, agent);
    } catch (error) { this.background = false; this.errorCallback?.(`后台播放：${(error as BusinessError).message}`); }
  }
  async release(): Promise<void> {
    this.requestId++; this.metadataId++; this.intentId++; this.current = null;
    await this.chain.catch(() => {});
    await this.metadataChain.catch(() => {});
    await this.player?.release(); this.player = null;
    if (this.localFile) { fileIo.closeSync(this.localFile); this.localFile = null; }
    await this.session?.destroy(); this.session = null;
    for (const artwork of this.localArtwork.values()) await artwork.then((map: image.PixelMap) => map.release()).catch(() => {});
    this.localArtwork.clear();
    if (this.defaultArtwork) { await this.defaultArtwork.then((map: image.PixelMap) => map.release()).catch(() => {}); this.defaultArtwork = null; }
    await this.stopBackground();
  }
}

