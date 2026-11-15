import { common } from '@kit.AbilityKit';
import { harmonyShare, systemShare } from '@kit.ShareKit';
import { Song } from '../model/Song';

// HarmonyOS native share / tap-to-share / air-transfer bridge. The current song is
// encoded as a lxmine:// deep link so another device with LxMine can play it.
export class ShareService {
  private song: Song | null = null;
  private started: boolean = false;
  private lastError: string = '';

  setSong(song: Song | null): void { this.song = song; }
  getSong(): Song | null { return this.song; }
  getLastError(): string { return this.lastError; }

  start(): void {
    if (this.started) return;
    try {
      harmonyShare.on('knockShare', (target: harmonyShare.SharableTarget) => { this.sendTo(target); });
      harmonyShare.on('gesturesShare', (target: harmonyShare.SharableTarget) => { this.sendTo(target); });
      this.started = true;
    } catch (error) {
      this.lastError = (error as Error).message;
      console.warn(`[Share] ${this.lastError}`);
    }
  }

  stop(): void {
    if (!this.started) return;
    try {
      harmonyShare.off('knockShare');
      harmonyShare.off('gesturesShare');
    } catch (_) {}
    this.started = false;
  }

  private sendTo(target: harmonyShare.SharableTarget): void {
    const song = this.song;
    if (!song) {
      target.reject(harmonyShare.SharableErrorCode.NO_CONTENT_ERROR).catch(() => {});
      return;
    }
    target.share(this.buildData(song)).catch((error: Error) => { this.lastError = error.message; });
  }

  private songUri(song: Song): string {
    const query = [
      `source=${encodeURIComponent(song.source ?? '')}`,
      `id=${encodeURIComponent(song.id)}`,
      `name=${encodeURIComponent(song.name)}`,
      `singer=${encodeURIComponent(song.singer)}`,
      `album=${encodeURIComponent(song.albumName ?? '')}`,
      `cover=${encodeURIComponent(song.coverUrl ?? '')}`,
      `duration=${encodeURIComponent(`${song.durationMs ?? 0}`)}`,
    ].join('&');
    return `lxmine://play?${query}`;
  }

  buildData(song: Song): systemShare.SharedData {
    const record: systemShare.SharedRecord = {
      utd: 'general.hyperlink',
      content: this.songUri(song),
      title: `${song.name} - ${song.singer}`,
    };
    return new systemShare.SharedData(record);
  }

  async show(context: common.UIAbilityContext): Promise<void> {
    const song = this.song;
    if (!song) throw new Error('当前没有正在播放的歌曲');
    const controller = new systemShare.ShareController(this.buildData(song));
    const options: systemShare.ShareControllerOptions = {
      selectionMode: systemShare.SelectionMode.SINGLE,
      previewMode: systemShare.SharePreviewMode.DEFAULT,
    };
    await controller.show(context, options);
  }
}
