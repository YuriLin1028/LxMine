import { media } from '@kit.MediaKit';
import { audio } from '@kit.AudioKit';
import { avSession } from '@kit.AVSessionKit';
import { common, wantAgent } from '@kit.AbilityKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { Song } from '../model/Song';
import { fileIo } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { http } from '@kit.NetworkKit';
import { equalPowerGains } from './AutoMixPlanner';
import { AudioFxConfig, defaultAudioFxConfig, effectiveAudioFxBands } from './AudioFxPresets';
import { isStoreEdition } from './AppUpdater';

export interface SessionLyricLine { timeMs: number; text: string; }

interface PreloadedDeck {
  song: Song;
  url: string;
  isFile: boolean;
  startMs: number;
  player: media.AVPlayer;
  localFile: fileIo.File | null;
  ready: boolean;
}

// AVPlayer 生命周期、双轨 AI 混音与系统媒体会话。切歌必须 reset 到 idle 后才能重新设置 URL。
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
  private beforePreparedPlayCallback: ((rawDurationMs: number) => boolean) | null = null;
  private autoMixCommitCallback: ((song: Song, url: string, startPosMs: number) => void) | null = null;
  private initialPosition: number = 0;
  private pendingPlayAfterInitialSeek: boolean = false;
  private initialSeekPlayTimer: number = -1;
  private seekGuardTarget: number = -1;
  private seekGuardUntil: number = 0;
  private autoPlay: boolean = true;
  private intentId: number = 0;
  private switching: boolean = false;
  private localArtwork: Map<string, Promise<image.PixelMap>> = new Map();
  private chain: Promise<void> = Promise.resolve();
  private requestId: number = 0;
  private metadataId: number = 0;
  private metadataChain: Promise<void> = Promise.resolve();
  private lastFullMetaSig: string = '';
  private lastSentSingleLyric: string = '';
  private defaultArtwork: Promise<image.PixelMap> | null = null;
  private localFile: fileIo.File | null = null;
  private lyricLines: SessionLyricLine[] = [];
  private lyricText: string = '';
  private lyricOffset: number = 0;
  private lyricIndex: number = -1;
  private lastSessionTick: number = 0;
  private mixWithOthers: boolean = false;
  private audioFx: AudioFxConfig = defaultAudioFxConfig();
  private spatialManager: audio.AudioSpatializationManager | null = null;
  private spatialSystemActive: boolean = false;
  private spatialCallback: ((active: boolean) => void) | null = null;
  private routingManager: audio.AudioRoutingManager | null = null;
  private bluetoothAudioConnected: boolean = false;
  private bluetoothCarLyricsEnabled: boolean = false;
  private bluetoothCarLyricsMode: string = 'title';
  private bluetoothCallback: ((connected: boolean) => void) | null = null;
  private carLyricOverrideActive: boolean = false;
  private musicMonitorGain: number = 1.0;
  private userVolume: number = 1.0;

  private effectiveGain(): number {
    return Math.max(0, Math.min(1, this.userVolume * this.musicMonitorGain));
  }

  // 双轨平滑过渡与淡入淡出状态
  private preloaded: PreloadedDeck | null = null;
  private preloadToken: number = 0;
  private mixTimer: number = -1;
  private mixActive: boolean = false;
  private fadeTimer: number = -1;
  private playPauseFadeEnabled: boolean = true;
  private ppFadeTimer: number = -1;
  private ppFadeDirection: string = '';
  private ppFadeVolume: number = 1.0;
  private fadeOutCallback: ((fadingOut: boolean) => void) | null = null;
  private loadedSongKey: string = '';
  private loudnessModified: boolean = false;
  private lastPlayUrl: string = '';
  private lastPlayFilePath: string = '';
  private interruptedBySystem: boolean = false;
  private interruptedByCallScene: boolean = false;
  private duckedBySystem: boolean = false;
  private audioSceneSubscribed: boolean = false;
  private callResumeTimer: number = -1;
  private lastInterruptResumeAt: number = 0;

  private isCallAudioSceneActive(): boolean {
    try {
      const scene = audio.getAudioManager().getAudioSceneSync();
      return scene === audio.AudioScene.AUDIO_SCENE_RINGING
        || scene === audio.AudioScene.AUDIO_SCENE_PHONE_CALL
        || scene === audio.AudioScene.AUDIO_SCENE_VOICE_CHAT;
    } catch (_) {
      return false;
    }
  }
  private clearCallInterruptState(): void {
    this.interruptedBySystem = false;
    this.interruptedByCallScene = false;
    this.duckedBySystem = false;
    if (this.callResumeTimer !== -1) {
      clearTimeout(this.callResumeTimer);
      this.callResumeTimer = -1;
    }
  }
  private scheduleCallSceneResume(): void {
    if (this.callResumeTimer !== -1) clearTimeout(this.callResumeTimer);
    this.callResumeTimer = setTimeout(() => {
      this.callResumeTimer = -1;
      if (this.isCallAudioSceneActive()) return;
      if ((this.interruptedByCallScene || this.interruptedBySystem) && this.state !== 'playing') {
        this.resumeAfterSystemInterrupt().catch((e: BusinessError) => this.report(e));
      }
    }, 420);
  }
  private async resumeAfterSystemInterrupt(): Promise<void> {
    if (this.callResumeTimer !== -1) {
      clearTimeout(this.callResumeTimer);
      this.callResumeTimer = -1;
    }
    if (!this.current || this.switching) return;
    const song = this.current;
    const resumePos = Math.max(0, this.position || 0);
    this.interruptedBySystem = false;
    this.interruptedByCallScene = false;
    this.duckedBySystem = false;
    this.lastInterruptResumeAt = Date.now();
    const target = this.player;
    if (target && target.state === 'playing' && this.ppFadeDirection !== 'out') {
      try { target.setVolume(this.effectiveGain()); } catch (_) {}
      return;
    }
    try {
      const ok = await this.resume();
      if (ok) return;
    } catch (_) {}
    if (this.lastPlayFilePath) {
      await this.playFile(this.lastPlayFilePath, song, resumePos, true);
    } else if (this.lastPlayUrl) {
      await this.playUrl(this.lastPlayUrl, song, resumePos, true);
    }
  }

  onFadeOutChange(callback: (fadingOut: boolean) => void): void {
    this.fadeOutCallback = callback;
  }
  setPlayPauseFade(enabled: boolean): void {
    this.playPauseFadeEnabled = enabled;
    if (!enabled) this.cancelPlayPauseFade(true);
  }
  private cancelPlayPauseFade(restoreVolume: boolean = false): void {
    const wasFadingOut = this.ppFadeDirection === 'out';
    if (this.ppFadeTimer !== -1) {
      clearInterval(this.ppFadeTimer);
      this.ppFadeTimer = -1;
    }
    this.ppFadeDirection = '';
    if (wasFadingOut) this.fadeOutCallback?.(false);
    if (restoreVolume && this.player && !this.mixActive) {
      this.ppFadeVolume = this.effectiveGain();
      try { this.player.setVolume(this.effectiveGain()); } catch (_) {}
    }
  }
  private clearInitialSeekTimer(): void {
    if (this.initialSeekPlayTimer !== -1) {
      clearTimeout(this.initialSeekPlayTimer);
      this.initialSeekPlayTimer = -1;
    }
    this.pendingPlayAfterInitialSeek = false;
  }
  beginSwitch(autoPlay: boolean): number {
    this.clearCallInterruptState();
    this.lastInterruptResumeAt = 0;
    this.cancelAutoMix();
    this.cancelFade();
    this.cancelPlayPauseFade(false);
    this.clearInitialSeekTimer();
    this.loadedSongKey = '';
    this.seekGuardUntil = 0;
    this.seekGuardTarget = -1;
    this.autoPlay = autoPlay;
    this.switching = true;
    this.requestId++;
    return ++this.intentId;
  }
  async pauseForSwitch(): Promise<void> {
    this.cancelAutoMix();
    this.cancelPlayPauseFade(false);
    if (this.player?.state === 'playing') await this.player.pause();
  }
  setMixWithOthers(enabled: boolean): void {
    this.mixWithOthers = enabled;
    this.applyAudioConcurrency();
  }
  setAudioEffect(config: AudioFxConfig): void {
    this.audioFx = config;
    if (this.player) this.applyAudioEffectToPlayer(this.player);
    if (this.preloaded?.player) this.applyAudioEffectToPlayer(this.preloaded.player);
  }
  setMusicMonitorGain(gain: number): void {
    this.musicMonitorGain = Math.max(0, Math.min(1, Number.isFinite(gain) ? gain : 1));
    if (this.player && !this.mixActive) {
      try { this.player.setVolume(this.effectiveGain()); } catch (_) {}
    }
  }
  setVolume(volume: number): void {
    this.userVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1));
    if (this.player && !this.mixActive && this.ppFadeDirection === '') {
      try { this.player.setVolume(this.effectiveGain()); } catch (_) {}
    }
  }
  isSystemSpatialAudioActive(): boolean {
    try {
      if (!this.spatialManager) this.spatialManager = audio.getAudioManager().getSpatializationManager();
      this.spatialSystemActive = this.spatialManager.isSpatializationEnabledForCurrentDevice();
    } catch (_) {}
    return this.spatialSystemActive;
  }
  onSpatialAudioChange(callback: (active: boolean) => void): void {
    this.spatialCallback = callback;
    try {
      if (!this.spatialManager) this.spatialManager = audio.getAudioManager().getSpatializationManager();
      this.spatialSystemActive = this.spatialManager.isSpatializationEnabledForCurrentDevice();
      this.spatialManager.on('spatializationEnabledChangeForCurrentDevice', (enabled: boolean) => {
        this.spatialSystemActive = enabled;
        this.spatialCallback?.(enabled);
        if (this.player) this.applyAudioEffectToPlayer(this.player);
      });
    } catch (e) {
      console.info(`[SpatialAudio] listener unavailable: ${(e as BusinessError).message}`);
    }
  }
  private detectBluetoothOutput(): boolean {
    try {
      if (!this.routingManager) this.routingManager = audio.getAudioManager().getRoutingManager();
      const devices = this.routingManager.getDevicesSync(audio.DeviceFlag.OUTPUT_DEVICES_FLAG);
      return devices.some((d: audio.AudioDeviceDescriptor) =>
        d.deviceType === audio.DeviceType.BLUETOOTH_A2DP || d.deviceType === audio.DeviceType.BLUETOOTH_SCO
      );
    } catch (_) {
      return false;
    }
  }
  isBluetoothAudioConnected(): boolean {
    this.bluetoothAudioConnected = this.detectBluetoothOutput();
    return this.bluetoothAudioConnected;
  }
  onBluetoothAudioChange(callback: (connected: boolean) => void): void {
    this.bluetoothCallback = callback;
    this.bluetoothAudioConnected = this.detectBluetoothOutput();
    callback(this.bluetoothAudioConnected);
    try {
      if (!this.routingManager) this.routingManager = audio.getAudioManager().getRoutingManager();
      this.routingManager.on('deviceChange', audio.DeviceFlag.OUTPUT_DEVICES_FLAG, () => {
        const next = this.detectBluetoothOutput();
        if (next !== this.bluetoothAudioConnected) {
          this.bluetoothAudioConnected = next;
          this.bluetoothCallback?.(next);
          this.updateSingleLyric(true);
        }
      });
    } catch (e) {
      console.info(`[BluetoothCarLyrics] routing listener unavailable: ${(e as BusinessError).message}`);
    }
  }
  setBluetoothCarLyrics(enabled: boolean, mode: string = this.bluetoothCarLyricsMode): void {
    this.bluetoothCarLyricsEnabled = enabled;
    this.bluetoothCarLyricsMode = (mode === 'artist' || mode === 'combined') ? mode : 'title';
    this.bluetoothAudioConnected = this.detectBluetoothOutput();
    this.updateSingleLyric(true);
  }
  private applyAudioEffectToPlayer(target: media.AVPlayer): void {
    // 严格保持 1.2.1 原生默认音效行为：始终保留系统 EFFECT_DEFAULT（避免关闭 Huawei Sound / Histen 外放调音），
    // 仅在用户主动启用非原声预设/环绕/混响时施加响度增益；切回原声时归零。
    const fxActive = this.audioFx.preset !== 'off' || this.audioFx.spatial || this.audioFx.reverb !== 'none';
    const bands = effectiveAudioFxBands(this.audioFx);
    const bassLift = bands[0] * 0.34 + bands[1] * 0.24;
    const midLift = bands[2] * 0.22 + bands[3] * 0.20 + bands[4] * 0.14;
    const spatialBoost = this.audioFx.spatial ? 1.4 : 0;
    const reverbBoost = this.audioFx.reverb === 'hall' ? 1.1 : (this.audioFx.reverb === 'small' ? 0.6 : 0);
    const loudnessGain = fxActive
      ? Math.max(-8, Math.min(8, Number(((bassLift + midLift) * 0.62 + spatialBoost + reverbBoost).toFixed(2))))
      : 0;
    try {
      if (target.state === 'prepared' || target.state === 'playing' || target.state === 'paused') {
        target.audioEffectMode = audio.AudioEffectMode.EFFECT_DEFAULT;
      }
    } catch (_) {}
    if (fxActive || this.loudnessModified) {
      this.loudnessModified = fxActive && Math.abs(loudnessGain) > 0.01;
      try {
        if (target.state === 'prepared' || target.state === 'playing' || target.state === 'paused') {
          target.setLoudnessGain(loudnessGain).catch(() => {});
        }
      } catch (_) {}
    }
  }
  private applyAudioConcurrency(): void {
    try {
      const sessionManager = audio.getAudioManager().getSessionManager();
      if (this.mixWithOthers) {
        sessionManager.activateAudioSession({
          concurrencyMode: audio.AudioConcurrencyMode.CONCURRENCY_MIX_WITH_OTHERS,
        }).catch((e: BusinessError) => console.warn(`[AudioMix] activate ${e.message}`));
      } else {
        sessionManager.deactivateAudioSession().catch(() => {});
      }
    } catch (e) {
      console.warn(`[AudioMix] ${(e as BusinessError).message}`);
    }
    if (this.player) {
      try {
        this.player.audioInterruptMode = this.mixWithOthers
          ? audio.InterruptMode.INDEPENDENT_MODE
          : audio.InterruptMode.SHARE_MODE;
      } catch (_) {}
    }
  }
  onState(callback: (state: string) => void): void { this.stateCallback = callback; }
  onTime(callback: (time: number) => void): void { this.timeCallback = callback; }
  onError(callback: (message: string) => void): void { this.errorCallback = callback; }
  onNext(callback: (step: number) => void): void { this.nextCallback = callback; }
  onBeforePlay(callback: () => Promise<void>): void { this.beforePlayCallback = callback; }
  onBeforePreparedPlay(callback: (rawDurationMs: number) => boolean): void { this.beforePreparedPlayCallback = callback; }
  onAutoMixCommit(callback: (song: Song, url: string, startPosMs: number) => void): void { this.autoMixCommitCallback = callback; }

  /** 把当前歌词同步给系统播控与锁屏歌词，offset 与舞台使用同一毫秒语义。 */
  setLyricData(lines: SessionLyricLine[], offset: number = this.lyricOffset): void {
    this.lyricLines = lines ?? [];
    this.lyricOffset = offset;
    this.lyricText = this.buildLyricText(this.lyricLines);
    this.lyricIndex = -1;
    this.lastFullMetaSig = '';
    this.updateMetadata(false);
    this.updateSingleLyric(true);
  }
  setArtwork(song: Song): void {
    if (!this.current || this.current.id !== song.id || this.current.source !== song.source) return;
    this.current = song;
    this.lastFullMetaSig = '';
    this.updateMetadata(false);
  }
  setLyricOffset(offset: number): void {
    this.lyricOffset = offset;
    this.updateSingleLyric(true);
  }
  initialize(context: common.UIAbilityContext): void { this.context = context; }
  private report(error: BusinessError): void { this.errorCallback?.(error.message); }
  private attachMainListeners(player: media.AVPlayer): void {
    player.on('stateChange', (state: string) => {
      if (this.player !== player) return;
      this.state = state;
      if (state === 'initialized') {
        try { player.audioRendererInfo = { usage: audio.StreamUsage.STREAM_USAGE_MUSIC, rendererFlags: 0 }; } catch (_) {}
        player.prepare().catch((e: BusinessError) => this.report(e));
      }
      if (state === 'prepared') {
        if (this.beforePreparedPlayCallback && player.duration > 0) {
          const allowed = this.beforePreparedPlayCallback(player.duration);
          if (!allowed) {
            return;
          }
        }
        try { player.setVolume(this.effectiveGain()); } catch (_) {}
        this.applyAudioEffectToPlayer(player);
        const startPlayNow = (): void => {
          if (this.player !== player || !this.autoPlay || this.switching) return;
          if (player.state !== 'prepared' && player.state !== 'paused') return;
          if (this.playPauseFadeEnabled) {
            this.startFadeIn(player, 680);
          }
          player.play().catch((e: BusinessError) => this.report(e));
        };
        const rawDur = player.duration > 0 ? player.duration : (this.current?.durationMs ?? 0);
        const seekTarget = this.initialPosition > 200
          ? (rawDur > 500 ? Math.min(this.initialPosition, Math.max(0, rawDur - 250)) : this.initialPosition)
          : 0;
        this.initialPosition = 0;
        if (seekTarget > 200) {
          this.position = seekTarget;
          this.seekGuardTarget = seekTarget;
          this.seekGuardUntil = Date.now() + 5000;
          this.timeCallback?.(seekTarget);
          this.clearInitialSeekTimer();
          if (this.autoPlay && !this.switching) {
            this.pendingPlayAfterInitialSeek = true;
            this.initialSeekPlayTimer = setTimeout(() => {
              this.initialSeekPlayTimer = -1;
              if (this.pendingPlayAfterInitialSeek && this.player === player) {
                this.pendingPlayAfterInitialSeek = false;
                startPlayNow();
              }
            }, 1200);
          }
          player.seek(seekTarget, media.SeekMode.SEEK_CLOSEST);
        } else {
          startPlayNow();
        }
        this.updateMetadata(false);
      }
      if (state === 'playing') {
        if (this.mixWithOthers) this.applyAudioConcurrency();
        this.applyAudioEffectToPlayer(player);
        this.session?.activate().catch((e: BusinessError) => console.warn(`[Session] activate ${e.message}`));
        this.startBackground();
      }
      if (!(this.ppFadeDirection === 'out' && state === 'playing')) {
        this.stateCallback?.(state);
      }
      this.updateSession();
      this.updateSingleLyric(true);
    });
    player.on('seekDone', (seekDoneTime: number) => {
      if (this.player !== player) return;
      const shouldStartAfterSeek = this.pendingPlayAfterInitialSeek;
      if (shouldStartAfterSeek) {
        this.clearInitialSeekTimer();
      }
      const guardMatched = this.seekGuardTarget < 0 || !Number.isFinite(seekDoneTime)
        || Math.abs(seekDoneTime - this.seekGuardTarget) <= 2500 || Date.now() >= this.seekGuardUntil;
      if (guardMatched) {
        this.seekGuardUntil = 0;
        this.seekGuardTarget = -1;
      }
      if (Number.isFinite(seekDoneTime) && seekDoneTime >= 0 && guardMatched) {
        this.position = seekDoneTime;
        this.timeCallback?.(seekDoneTime);
        this.updateSession();
        this.updateSingleLyric(true);
      }
      if (shouldStartAfterSeek && this.autoPlay && !this.switching && (player.state === 'prepared' || player.state === 'paused')) {
        if (this.playPauseFadeEnabled) {
          this.startFadeIn(player, 680);
        }
        player.play().catch((e: BusinessError) => this.report(e));
      }
    });
    player.on('timeUpdate', (time: number) => {
      if (this.player !== player) return;
      if (this.seekGuardUntil > 0) {
        const now = Date.now();
        if (now < this.seekGuardUntil) {
          if (Math.abs(time - this.seekGuardTarget) > 2500) return;
          this.seekGuardUntil = 0;
          this.seekGuardTarget = -1;
        } else {
          this.seekGuardUntil = 0;
          this.seekGuardTarget = -1;
        }
      }
      this.position = time; this.timeCallback?.(time);
      if (this.state === 'playing' && Date.now() - this.lastSessionTick > 900) this.updateSession();
      this.updateSingleLyric(false);
    });
    player.on('audioInterrupt', (info: audio.InterruptEvent) => {
      if (this.player !== player || this.switching) return;
      const hint = info.hintType;
      const force = info.forceType;
      if (hint === audio.InterruptHint.INTERRUPT_HINT_RESUME) {
        if (this.interruptedBySystem || this.interruptedByCallScene || this.autoPlay) {
          this.resumeAfterSystemInterrupt().catch((e: BusinessError) => this.report(e));
        }
        return;
      }
      if (hint === audio.InterruptHint.INTERRUPT_HINT_PAUSE) {
        const wasIntendedPlaying = this.state === 'playing' || (this.autoPlay && this.ppFadeDirection !== 'out');
        if (wasIntendedPlaying) {
          this.interruptedBySystem = true;
          if (this.isCallAudioSceneActive()) this.interruptedByCallScene = true;
        }
        this.cancelActiveCrossfade();
        this.cancelFade();
        this.cancelPlayPauseFade(true);
        if (force === audio.InterruptForceType.INTERRUPT_SHARE && player.state === 'playing') {
          player.pause().catch(() => {});
        }
        if (this.current) {
          this.state = 'paused';
          this.stateCallback?.('paused');
          this.updateSession();
        }
        return;
      }
      if (hint === audio.InterruptHint.INTERRUPT_HINT_STOP) {
        const inCall = this.isCallAudioSceneActive() || this.interruptedByCallScene;
        const wasIntendedPlaying = this.state === 'playing' || (this.autoPlay && this.ppFadeDirection !== 'out');
        this.cancelActiveCrossfade();
        this.cancelFade();
        this.cancelPlayPauseFade(true);
        if (inCall && wasIntendedPlaying) {
          this.interruptedBySystem = true;
          this.interruptedByCallScene = true;
        } else {
          this.clearCallInterruptState();
          this.autoPlay = false;
        }
        if (force === audio.InterruptForceType.INTERRUPT_SHARE && player.state === 'playing') {
          player.pause().catch(() => {});
        }
        if (this.current) {
          this.state = 'paused';
          this.stateCallback?.('paused');
          this.updateSession();
        }
        return;
      }
      if (hint === audio.InterruptHint.INTERRUPT_HINT_DUCK) {
        this.duckedBySystem = true;
        if (force === audio.InterruptForceType.INTERRUPT_SHARE && !this.mixActive) {
          try { player.setVolume(Math.max(0, this.effectiveGain() * 0.28)); } catch (_) {}
        }
        return;
      }
      if (hint === audio.InterruptHint.INTERRUPT_HINT_UNDUCK) {
        this.duckedBySystem = false;
        if (!this.mixActive && this.ppFadeDirection === '') {
          try { player.setVolume(this.effectiveGain()); } catch (_) {}
        }
      }
    });
    player.on('error', (error: BusinessError) => {
      if (this.player !== player) return;
      if (Date.now() - this.lastInterruptResumeAt < 6500 && this.current && (this.lastPlayFilePath || this.lastPlayUrl)) {
        this.lastInterruptResumeAt = 0;
        const song = this.current;
        const resumePos = Math.max(0, this.position || 0);
        if (this.lastPlayFilePath) {
          this.playFile(this.lastPlayFilePath, song, resumePos, true).catch((e: BusinessError) => {
            this.report(e);
            this.stateCallback?.('error');
          });
        } else {
          this.playUrl(this.lastPlayUrl, song, resumePos, true).catch((e: BusinessError) => {
            this.report(e);
            this.stateCallback?.('error');
          });
        }
        return;
      }
      this.report(error); this.stateCallback?.('error');
    });
  }
  private async ensurePlayer(): Promise<media.AVPlayer> {
    if (this.player) return this.player;
    if (this.creating) return this.creating;
    this.creating = media.createAVPlayer();
    const player = await this.creating;
    this.player = player;
    this.creating = null;
    this.attachMainListeners(player);
    if (!this.audioSceneSubscribed) {
      this.audioSceneSubscribed = true;
      try {
        audio.getAudioManager().on('audioSceneChange', (scene: audio.AudioScene) => {
          const inCall = scene === audio.AudioScene.AUDIO_SCENE_RINGING
            || scene === audio.AudioScene.AUDIO_SCENE_PHONE_CALL
            || scene === audio.AudioScene.AUDIO_SCENE_VOICE_CHAT;
          if (inCall) {
            if (this.callResumeTimer !== -1) {
              clearTimeout(this.callResumeTimer);
              this.callResumeTimer = -1;
            }
            if (this.state === 'playing' || (this.autoPlay && this.ppFadeDirection !== 'out')) {
              this.interruptedByCallScene = true;
              this.interruptedBySystem = true;
            }
          } else if (scene === audio.AudioScene.AUDIO_SCENE_DEFAULT) {
            if (this.interruptedByCallScene || this.interruptedBySystem) {
              this.scheduleCallSceneResume();
            }
          }
        });
      } catch (_) {}
    }
    if (this.context && !this.session) {
      try {
        this.session = await avSession.createAVSession(this.context, 'LxMine', 'audio');
        this.session.on('play', () => { this.resume().catch((e: BusinessError) => this.report(e)); });
        this.session.on('pause', () => { this.pause(true).catch((e: BusinessError) => this.report(e)); });
        this.session.on('playNext', () => this.nextCallback?.(1));
        this.session.on('playPrevious', () => this.nextCallback?.(-1));
        this.session.on('seek', (time: number) => this.seek(time));
        if (!isStoreEdition()) {
          try {
            await this.session.setExtras({ 'hicar.media.bundle.FOR_HICAR': true, 'hicar.media.bundle.PLAY_MODE': 0 });
            console.info('[HiCar] AVSession marked FOR_HICAR');
          } catch (error) { console.info(`[HiCar] extras: ${(error as BusinessError).message}`); }
        }
        await this.session.activate();
        this.updateMetadata(false);
        this.updateSession();
      } catch (error) { this.errorCallback?.(`媒体会话：${(error as BusinessError).message}`); }
    }
    return player;
  }

  /** 预加载下一首到副轨 AVPlayer，准备无缝 AI 混音过渡。 */
  async preloadNext(song: Song, urlOrPath: string, isFile: boolean, startMs: number): Promise<boolean> {
    this.disposePreloaded();
    const token = ++this.preloadToken;
    try {
      const nextPlayer = await media.createAVPlayer();
      if (token !== this.preloadToken) { nextPlayer.release().catch(() => {}); return false; }
      let nextFile: fileIo.File | null = null;
      const deck: PreloadedDeck = { song, url: urlOrPath, isFile, startMs: Math.max(0, startMs), player: nextPlayer, localFile: null, ready: false };
      this.preloaded = deck;
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const done = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };
        const timeout = setTimeout(() => { done(false); }, 12000);
        nextPlayer.on('stateChange', (st: string) => {
          if (this.preloaded !== deck) return;
          if (st === 'initialized') {
            try { nextPlayer.audioRendererInfo = { usage: audio.StreamUsage.STREAM_USAGE_MUSIC, rendererFlags: 0 }; } catch (_) {}
            nextPlayer.prepare().catch(() => { clearTimeout(timeout); done(false); });
          } else if (st === 'prepared') {
            clearTimeout(timeout);
            const actualPreloadDur = nextPlayer.duration > 0 ? nextPlayer.duration : 0;
            const metaPreloadDur = deck.song.durationMs || 0;
            if (!isFile && metaPreloadDur >= 45000 && actualPreloadDur > 3000) {
              const isWrongPreload = Math.abs(actualPreloadDur - metaPreloadDur) > 8000;
              const isShortPreload = actualPreloadDur <= 72000 && actualPreloadDur < metaPreloadDur * 0.58;
              if (isWrongPreload || isShortPreload) {
                done(false);
                this.disposePreloaded();
                return;
              }
            }
            try { nextPlayer.audioInterruptMode = audio.InterruptMode.SHARE_MODE; } catch (_) {}
            try { nextPlayer.setVolume(0.001); } catch (_) {}
            this.applyAudioEffectToPlayer(nextPlayer);
            const rawDur = nextPlayer.duration > 0 ? nextPlayer.duration : (deck.song.durationMs || 0);
            const seekTarget = deck.startMs > 200
              ? (rawDur > 4000 ? Math.min(deck.startMs, Math.max(0, rawDur - 2500)) : Math.min(deck.startMs, 4000))
              : 0;
            if (seekTarget > 200) {
              let seekSettled = false;
              const finishReady = (): void => {
                if (seekSettled || this.preloaded !== deck) return;
                seekSettled = true;
                deck.ready = true;
                done(true);
              };
              const seekFallback = setTimeout(finishReady, 1400);
              try {
                nextPlayer.on('seekDone', () => { clearTimeout(seekFallback); finishReady(); });
                nextPlayer.seek(seekTarget, media.SeekMode.SEEK_CLOSEST);
              } catch (_) {
                clearTimeout(seekFallback);
                finishReady();
              }
            } else {
              deck.ready = true;
              done(true);
            }
          }
        });
        nextPlayer.on('error', () => { clearTimeout(timeout); done(false); });
        try {
          if (isFile) {
            nextFile = fileIo.openSync(urlOrPath, fileIo.OpenMode.READ_ONLY);
            deck.localFile = nextFile;
            nextPlayer.fdSrc = { fd: nextFile.fd, offset: 0, length: fileIo.statSync(urlOrPath).size };
          } else {
            nextPlayer.url = urlOrPath;
          }
        } catch (_) { clearTimeout(timeout); done(false); }
      });
    } catch (_) {
      return false;
    }
  }

  isPreloadedFor(song: Song): boolean {
    return !!(this.preloaded && this.preloaded.ready && this.preloaded.song.id === song.id && this.preloaded.song.source === song.source);
  }

  isAutoMixActive(): boolean { return this.mixActive; }

  /** 启动双轨等功率曲线播放过渡，确认副轨已真正出声推进后再开始衰减主轨，结束时无缝晋升副轨为主轨。 */
  async startAutoMix(crossfadeMs: number, style: string): Promise<boolean> {
    const deck = this.preloaded;
    const oldPlayer = this.player;
    if (!deck || !deck.ready || !oldPlayer || this.mixActive) return false;
    const oldFile = this.localFile;
    this.mixActive = true;
    const duration = Math.max(1800, Math.min(11000, crossfadeMs));
    const monitorScale = this.effectiveGain();
    let deckFailed = false;
    const onDeckErr = (): void => { deckFailed = true; };
    const restoreAudioSession = (): void => {
      if (this.mixWithOthers) return;
      try {
        audio.getAudioManager().getSessionManager().deactivateAudioSession().catch(() => {});
      } catch (_) {}
    };
    try {
      // 同进程双轨共享焦点并临时开启 CONCURRENCY_MIX_WITH_OTHERS，防止鸿蒙音频焦点策略打断或静音其中一轨。
      try {
        await audio.getAudioManager().getSessionManager().activateAudioSession({
          concurrencyMode: audio.AudioConcurrencyMode.CONCURRENCY_MIX_WITH_OTHERS,
        });
      } catch (_) {}
      try { oldPlayer.audioInterruptMode = audio.InterruptMode.SHARE_MODE; } catch (_) {}
      try { deck.player.audioInterruptMode = audio.InterruptMode.SHARE_MODE; } catch (_) {}
      deck.player.on('error', onDeckErr);
      deck.player.setVolume(Math.max(0.002, 0.004 * monitorScale));
      await deck.player.play();
    } catch (_) {
      try { deck.player.off('error', onDeckErr); } catch (_) {}
      restoreAudioSession();
      this.mixActive = false;
      this.disposePreloaded();
      return false;
    }
    // 等待副轨进入 playing 状态（最多 3500ms），在线流懒更新 currentTime 时不再 1.2s 误杀取消混音。
    const baseTime = Math.max(0, deck.player.currentTime || 0);
    const waitStarted = Date.now();
    const waitDeadline = waitStarted + 3500;
    let deckAudible = false;
    while (this.mixActive && !deckFailed && this.preloaded === deck && Date.now() < waitDeadline) {
      const curPos = deck.player.currentTime >= 0 ? deck.player.currentTime : 0;
      const waited = Date.now() - waitStarted;
      if (deck.player.state === 'playing' && (curPos >= baseTime + 20 || waited >= 350)) {
        deckAudible = true;
        break;
      }
      if (deck.player.state === 'error' || deck.player.state === 'released' || deck.player.state === 'completed') {
        deckFailed = true;
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 35));
    }
    try { deck.player.off('error', onDeckErr); } catch (_) {}
    if (!this.mixActive || this.preloaded !== deck || deckFailed || !deckAudible) {
      this.mixActive = false;
      try { oldPlayer.setVolume(this.effectiveGain()); } catch (_) {}
      this.disposePreloaded();
      restoreAudioSession();
      return false;
    }
    const startAt = Date.now();
    clearInterval(this.mixTimer);
    this.mixTimer = setInterval(() => {
      if (!this.mixActive || this.preloaded !== deck) {
        clearInterval(this.mixTimer);
        this.mixTimer = -1;
        restoreAudioSession();
        return;
      }
      const oldEnded = oldPlayer.state === 'completed' || oldPlayer.state === 'stopped' || oldPlayer.state === 'idle';
      const elapsed = Date.now() - startAt;
      const t = oldEnded ? 1 : Math.max(0, Math.min(1, elapsed / duration));
      const gains = equalPowerGains(t, style);
      const scale = this.effectiveGain();
      try { oldPlayer.setVolume(Math.max(0, Math.min(1, gains.outGain * scale))); } catch (_) {}
      try { deck.player.setVolume(Math.max(0, Math.min(1, gains.inGain * scale))); } catch (_) {}
      if (t >= 1) {
        clearInterval(this.mixTimer);
        this.mixTimer = -1;
        this.mixActive = false;
        this.preloaded = null;
        // 晋升副轨为主轨
        this.player = deck.player;
        this.localFile = deck.localFile;
        this.current = deck.song;
        this.lastPlayFilePath = deck.isFile ? deck.url : '';
        this.lastPlayUrl = deck.isFile ? '' : deck.url;
        this.loadedSongKey = `${deck.song.source ?? 'kw'}:${deck.song.id}`;
        this.state = 'playing';
        this.position = deck.player.currentTime >= 0 ? deck.player.currentTime : deck.startMs;
        try { deck.player.off('stateChange'); deck.player.off('error'); deck.player.off('seekDone'); deck.player.off('audioInterrupt'); } catch (_) {}
        this.attachMainListeners(deck.player);
        try { deck.player.setVolume(this.effectiveGain()); } catch (_) {}
        this.applyAudioEffectToPlayer(deck.player);
        if (this.mixWithOthers) this.applyAudioConcurrency();
        else restoreAudioSession();
        this.lastFullMetaSig = '';
        this.updateMetadata(false);
        this.updateSession();
        // 释放旧主轨
        try { oldPlayer.stop().catch(() => {}).finally(() => { oldPlayer.release().catch(() => {}); }); } catch (_) { oldPlayer.release().catch(() => {}); }
        if (oldFile) { try { fileIo.closeSync(oldFile); } catch (_) {} }
        this.autoMixCommitCallback?.(deck.song, deck.isFile ? `file://${deck.url}` : deck.url, this.position);
      }
    }, 35);
    return true;
  }

  cancelActiveCrossfade(): void {
    if (this.mixTimer !== -1) {
      clearInterval(this.mixTimer);
      this.mixTimer = -1;
    }
    if (this.mixActive) {
      this.mixActive = false;
      try { this.player?.setVolume(this.effectiveGain()); } catch (_) {}
      this.disposePreloaded();
    }
  }

  cancelAutoMix(): void {
    this.preloadToken++;
    if (this.mixTimer !== -1) {
      clearInterval(this.mixTimer);
      this.mixTimer = -1;
    }
    if (this.mixActive) {
      this.mixActive = false;
      try { this.player?.setVolume(this.effectiveGain()); } catch (_) {}
    }
    this.disposePreloaded();
  }

  private disposePreloaded(): void {
    const deck = this.preloaded;
    this.preloaded = null;
    if (!deck) return;
    try { deck.player.release().catch(() => {}); } catch (_) {}
    if (deck.localFile) { try { fileIo.closeSync(deck.localFile); } catch (_) {} }
  }

  private cancelFade(): void {
    if (this.fadeTimer !== -1) { clearInterval(this.fadeTimer); this.fadeTimer = -1; }
  }

  async fadeOutAndPause(durationMs: number = 1400): Promise<void> {
    this.cancelAutoMix();
    this.cancelFade();
    if (!this.player || this.player.state !== 'playing') { await this.pause(); return; }
    const startAt = Date.now();
    await new Promise<void>((resolve) => {
      this.fadeTimer = setInterval(() => {
        const t = Math.min(1, (Date.now() - startAt) / Math.max(300, durationMs));
        try { this.player?.setVolume(Math.max(0, (1 - t) * this.effectiveGain())); } catch (_) {}
        if (t >= 1) {
          this.cancelFade();
          this.pause().finally(() => {
            try { this.player?.setVolume(this.effectiveGain()); } catch (_) {}
            resolve();
          });
        }
      }, 60);
    });
  }

  private startFadeIn(target: media.AVPlayer, durationMs: number = 680, fromVolume: number = 0.01): void {
    this.cancelPlayPauseFade(false);
    const goal = this.effectiveGain();
    const startVol = Math.max(0.0, Math.min(goal, fromVolume));
    this.ppFadeDirection = 'in';
    this.ppFadeVolume = startVol;
    try { target.setVolume(startVol); } catch (_) {}
    const startAt = Date.now();
    this.ppFadeTimer = setInterval(() => {
      if (this.player !== target || this.mixActive) {
        this.cancelPlayPauseFade(false);
        return;
      }
      const t = Math.min(1, (Date.now() - startAt) / Math.max(120, durationMs));
      const eased = Math.pow(t, 1.65);
      const nextVol = startVol + (this.effectiveGain() - startVol) * eased;
      this.ppFadeVolume = nextVol;
      try { target.setVolume(Math.max(0, Math.min(1, nextVol))); } catch (_) {}
      if (t >= 1) {
        this.cancelPlayPauseFade(false);
        try { target.setVolume(this.effectiveGain()); } catch (_) {}
      }
    }, 16);
  }

  /** 串行切歌，避免连续点击时多个 reset/url 操作交错。 */
  async playUrl(url: string, song: Song, startMs: number = 0, autoPlay: boolean = true, intentId?: number): Promise<void> {
    if (!/^https?:\/\//i.test(url)) throw new Error('音源返回的播放地址无效');
    if (intentId !== undefined && intentId !== this.intentId) return;
    this.cancelAutoMix();
    this.cancelFade();
    this.cancelPlayPauseFade(false);
    const requestId = ++this.requestId;
    if (intentId === undefined) this.autoPlay = autoPlay;
    const operation = this.chain.catch(() => {}).then(async () => {
      if (requestId !== this.requestId) return;
      const player = await this.ensurePlayer();
      if (requestId !== this.requestId) return;
      await player.reset();
      if (requestId !== this.requestId) return;
      if (this.localFile) { fileIo.closeSync(this.localFile); this.localFile = null; }
      this.clearInitialSeekTimer();
      this.current = song; this.lastPlayUrl = url; this.lastPlayFilePath = ''; this.loadedSongKey = `${song.source ?? 'kw'}:${song.id}`; this.initialPosition = Math.max(0, startMs); this.position = this.initialPosition;
      if (this.initialPosition > 200) {
        this.seekGuardTarget = this.initialPosition;
        this.seekGuardUntil = Date.now() + 9500;
      } else {
        this.seekGuardTarget = -1;
        this.seekGuardUntil = 0;
      }
      this.lastFullMetaSig = '';
      this.timeCallback?.(this.position);
      this.updateMetadata(false);
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
    this.cancelAutoMix();
    this.cancelFade();
    this.cancelPlayPauseFade(false);
    const requestId = ++this.requestId;
    if (intentId === undefined) this.autoPlay = autoPlay;
    const operation = this.chain.catch(() => {}).then(async () => {
      if (requestId !== this.requestId) return;
      const player = await this.ensurePlayer();
      if (requestId !== this.requestId) return;
      await player.reset();
      if (requestId !== this.requestId) return;
      if (this.localFile) fileIo.closeSync(this.localFile);
      this.clearInitialSeekTimer();
      this.localFile = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY);
      this.current = song; this.lastPlayFilePath = path; this.lastPlayUrl = ''; this.loadedSongKey = `${song.source ?? 'kw'}:${song.id}`; this.initialPosition = Math.max(0, startMs); this.position = this.initialPosition;
      if (this.initialPosition > 200) {
        this.seekGuardTarget = this.initialPosition;
        this.seekGuardUntil = Date.now() + 9500;
      } else {
        this.seekGuardTarget = -1;
        this.seekGuardUntil = 0;
      }
      this.lastFullMetaSig = '';
      this.timeCallback?.(this.position);
      this.updateMetadata(false); this.updateSession(); this.updateSingleLyric(true);
      this.switching = false;
      player.fdSrc = { fd: this.localFile.fd, offset: 0, length: fileIo.statSync(path).size };
    });
    this.chain = operation; await operation;
  }
  async pause(fromSession: boolean = false): Promise<void> {
    // 暂停仅终止进行中的混音，不丢弃已预缓冲的下一首副轨
    this.cancelActiveCrossfade();
    this.cancelFade();
    this.clearInitialSeekTimer();
    const callInterruption = fromSession && this.isCallAudioSceneActive() && (this.state === 'playing' || this.autoPlay);
    if (callInterruption) {
      this.interruptedByCallScene = true;
      this.interruptedBySystem = true;
    } else {
      this.clearCallInterruptState();
      this.autoPlay = false;
    }
    const target = this.player;
    if (this.playPauseFadeEnabled && target && target.state === 'playing') {
      const startVol = this.ppFadeDirection ? Math.max(0, this.ppFadeVolume) : this.effectiveGain();
      this.cancelPlayPauseFade(false);
      this.ppFadeDirection = 'out';
      this.ppFadeVolume = startVol;
      this.fadeOutCallback?.(true);
      if (this.current) {
        this.state = 'paused';
        this.stateCallback?.('paused');
        this.updateSession();
      }
      const startAt = Date.now();
      const durationMs = 620;
      await new Promise<void>((resolve) => {
        this.ppFadeTimer = setInterval(() => {
          if (this.player !== target || this.ppFadeDirection !== 'out') {
            resolve();
            return;
          }
          const t = Math.min(1, (Date.now() - startAt) / durationMs);
          const nextVol = startVol * Math.pow(Math.cos(t * Math.PI * 0.5), 1.8);
          this.ppFadeVolume = nextVol;
          try { target.setVolume(Math.max(0, Math.min(1, nextVol))); } catch (_) {}
          if (t >= 1) {
            this.cancelPlayPauseFade(false);
            const finish = (): void => {
              try { target.setVolume(this.effectiveGain()); } catch (_) {}
              this.timeCallback?.(this.position);
              if (this.current) { this.state = 'paused'; this.updateSession(); }
              resolve();
            };
            if (target.state === 'playing') target.pause().then(finish).catch(finish);
            else finish();
          }
        }, 16);
      });
      return;
    }
    this.cancelPlayPauseFade(true);
    if (target?.state === 'playing') await target.pause();
    if (this.current) { this.state = 'paused'; this.updateSession(); }
  }
  async resume(expectedSongKey?: string): Promise<boolean> {
    this.cancelFade();
    this.autoPlay = true;
    if (this.switching) return false;
    if (expectedSongKey && this.loadedSongKey !== expectedSongKey) return false;
    this.session?.activate().catch(() => {});
    const target = this.player;
    if (!target) return false;
    if (target.state === 'playing' && this.ppFadeDirection === 'out') {
      const resumeFrom = Math.max(0.02, this.ppFadeVolume);
      this.state = 'playing';
      this.stateCallback?.('playing');
      this.updateSession();
      if (this.playPauseFadeEnabled) this.startFadeIn(target, 540, resumeFrom);
      else this.cancelPlayPauseFade(true);
      return true;
    }
    if (['paused', 'prepared', 'completed'].includes(target.state)) {
      await this.beforePlayCallback?.();
      if (this.playPauseFadeEnabled) {
        this.startFadeIn(target, 680, 0.01);
      } else {
        this.cancelPlayPauseFade(false);
        try { target.setVolume(this.effectiveGain()); } catch (_) {}
      }
      await target.play();
      return true;
    }
    return false;
  }
  seek(time: number): void {
    this.cancelActiveCrossfade();
    this.clearInitialSeekTimer();
    this.initialPosition = 0;
    if (this.player && ['playing', 'paused', 'prepared', 'completed'].includes(this.player.state)) {
      const target = Math.max(0, Math.min(Math.round(time), this.durationMs()));
      this.seekGuardTarget = target;
      this.seekGuardUntil = Date.now() + 1100;
      this.player.seek(target, media.SeekMode.SEEK_CLOSEST);
      this.position = target;
      this.timeCallback?.(target);
      this.updateSession();
      this.updateSingleLyric(true);
    }
  }
  durationMs(): number { const duration = this.player?.duration ?? 0; return duration > 0 ? duration : this.current?.durationMs ?? 0; }
  rawDurationMs(): number { const duration = this.player?.duration ?? 0; return duration > 0 ? duration : 0; }
  currentPositionMs(): number { return Math.max(0, this.position || 0); }
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
    const lines = this.lyricLines;
    const len = lines.length;
    if (!len) return -1;
    // O(1) fast-path for forward playback from cached lyricIndex
    const cur = this.lyricIndex;
    if (cur >= 0 && cur < len && lines[cur].timeMs <= timeMs) {
      if (cur + 1 >= len || lines[cur + 1].timeMs > timeMs) return cur;
      if (cur + 2 >= len || lines[cur + 2].timeMs > timeMs) return cur + 1;
    }
    let lo = 0;
    let hi = len - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].timeMs <= timeMs) { ans = mid; lo = mid + 1; }
      else { hi = mid - 1; }
    }
    return ans;
  }
  private currentLyricText(): string {
    if (!this.lyricLines.length) return '';
    const index = this.lyricIndexAt(this.position + this.lyricOffset);
    if (index < 0) return '';
    const text = (this.lyricLines[index].text || '').trim();
    return text ? text.replace(/\r?\n/g, ' ') : '♪';
  }
  private resolveAvrcpFields(lyric: string): [string, string, string, boolean] {
    const song = this.current!;
    const cleanTitle = song.name || 'LxMine';
    const cleanArtist = song.singer || '';
    const cleanAlbum = song.albumName || '';
    const cleanLyric = lyric.replace(/\s+/g, ' ').trim();
    const isValidLyric = cleanLyric.length > 0 && cleanLyric !== '♪' && !/^[\/\\\-—–_~·•\s]+$/.test(cleanLyric);
    const shouldPush = this.bluetoothCarLyricsEnabled && this.bluetoothAudioConnected && this.state === 'playing' && isValidLyric;
    if (!shouldPush) {
      return [cleanTitle, cleanArtist, cleanAlbum, false];
    }
    const clipped = cleanLyric.length > 96 ? cleanLyric.substring(0, 96) : cleanLyric;
    if (this.bluetoothCarLyricsMode === 'artist') {
      return [cleanTitle, clipped, cleanArtist || cleanAlbum, true];
    }
    if (this.bluetoothCarLyricsMode === 'combined') {
      return [`${clipped} · ${cleanTitle}`, cleanArtist, cleanAlbum, true];
    }
    return [clipped, cleanArtist ? `${cleanTitle} - ${cleanArtist}` : cleanTitle, cleanAlbum || cleanTitle, true];
  }
  private updateSingleLyric(force: boolean): void {
    if (!this.session || !this.current) return;
    const index = this.lyricLines.length ? this.lyricIndexAt(this.position + this.lyricOffset) : -1;
    if (!force && index === this.lyricIndex) return;
    this.lyricIndex = index;
    const text = this.currentLyricText();
    if (!force && text === this.lastSentSingleLyric) return;
    this.lastSentSingleLyric = text;
    // 仅更新单行歌词与蓝牙车载 AVRCP 文本字段，不再每行重复跨 IPC 传输 256×256 PixelMap 与完整歌词，消除掉帧。
    this.updateMetadata(true);
  }
  private updateMetadata(lyricLineOnly: boolean = false): void {
    if (!this.session || !this.current) return;
    const session = this.session;
    const assetId = `${this.current.source}:${this.current.id}`;
    const cover = (this.current.coverUrl || '').trim();
    const singleLyric = this.currentLyricText();
    const fields = this.resolveAvrcpFields(singleLyric);
    const title = fields[0];
    const artist = fields[1];
    const album = fields[2];
    const overrideNow = fields[3];
    const fullSig = `${assetId}|${cover}|${this.durationMs()}|${this.lyricText.length}`;
    if (lyricLineOnly && this.lastFullMetaSig === fullSig) {
      const light: avSession.AVMetadata = (overrideNow || this.carLyricOverrideActive)
        ? { assetId, title, artist, album, singleLyricText: singleLyric }
        : { assetId, singleLyricText: singleLyric };
      this.carLyricOverrideActive = overrideNow;
      session.setAVMetadata(light).catch(() => {});
      return;
    }
    this.carLyricOverrideActive = overrideNow;
    this.lastFullMetaSig = fullSig;
    const metadataId = ++this.metadataId;
    const base: avSession.AVMetadata = {
      assetId,
      title,
      artist,
      album,
      duration: this.durationMs(),
      lyric: this.lyricText,
      singleLyricText: singleLyric
    };
    const nextChain = this.metadataChain.catch(() => {}).then(async () => {
      if (metadataId !== this.metadataId || this.session !== session) return;
      base.mediaImage = await this.artwork(cover);
      if (metadataId !== this.metadataId || this.session !== session) return;
      await session.setAVMetadata(base);
    }).catch((error: BusinessError) => console.error(`[Session] metadata ${error.code} ${error.message}`));
    this.metadataChain = nextChain;
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
    this.cancelAutoMix();
    this.cancelFade();
    this.clearInitialSeekTimer();
    this.requestId++; this.metadataId++; this.intentId++; this.current = null;
    await this.chain.catch(() => {});
    await this.metadataChain.catch(() => {});
    await this.player?.release(); this.player = null;
    if (this.localFile) { fileIo.closeSync(this.localFile); this.localFile = null; }
    await this.session?.destroy(); this.session = null;
    for (const artwork of this.localArtwork.values()) await artwork.then((map: image.PixelMap) => map.release()).catch(() => {});
    this.localArtwork.clear();
    if (this.defaultArtwork) { await this.defaultArtwork.then((map: image.PixelMap) => map.release()).catch(() => {}); this.defaultArtwork = null; }
    try { this.spatialManager?.off('spatializationEnabledChangeForCurrentDevice'); } catch (_) {}
    this.spatialManager = null;
    try { this.routingManager?.off('deviceChange'); } catch (_) {}
    this.routingManager = null;
    if (this.audioSceneSubscribed) {
      try { audio.getAudioManager().off('audioSceneChange'); } catch (_) {}
      this.audioSceneSubscribed = false;
    }
    this.clearCallInterruptState();
    await this.stopBackground();
  }
}
