import { audio } from '@kit.AudioKit';
import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';

export type EarMonitorMode = 'off' | 'original' | 'ktv' | 'theater' | 'concert';

export interface EarMonitorState {
  mode: EarMonitorMode;
  micVolume: number;
  vocalVolume: number;
  active: boolean;
  statusText: string;
}

/**
 * C1 连续平滑软限幅器（knee=0.72, ceiling=0.94），消除分段跳变产生的爆音/杂音。
 */
function softClipEar(x: number, knee: number = 0.72, ceiling: number = 0.94): number {
  const ax = Math.abs(x);
  if (ax <= knee) return x;
  const span = ceiling - knee;
  const y = knee + span * Math.tanh((ax - knee) / span);
  return x < 0 ? -y : y;
}

class MonoBiquad {
  b0: number = 1; b1: number = 0; b2: number = 0; a1: number = 0; a2: number = 0;
  z1: number = 0; z2: number = 0;

  reset(): void { this.z1 = 0; this.z2 = 0; }

  setHighPass(fs: number, freq: number, q: number = 0.7071): void {
    const w0 = 2 * Math.PI * freq / fs;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = ((1 + cw) / 2) / a0;
    this.b1 = -(1 + cw) / a0;
    this.b2 = ((1 + cw) / 2) / a0;
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  setLowPass(fs: number, freq: number, q: number = 0.7071): void {
    const w0 = 2 * Math.PI * freq / fs;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = ((1 - cw) / 2) / a0;
    this.b1 = (1 - cw) / a0;
    this.b2 = ((1 - cw) / 2) / a0;
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  setPeaking(fs: number, freq: number, gainDb: number, q: number = 1.1): void {
    const a = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * freq / fs;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const a0 = 1 + alpha / a;
    this.b0 = (1 + alpha * a) / a0;
    this.b1 = (-2 * cw) / a0;
    this.b2 = (1 - alpha * a) / a0;
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - alpha / a) / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

export class EarMonitorService {
  private context: common.UIAbilityContext | null = null;
  private loopback: audio.AudioLoopback | null = null;
  private capturer: audio.AudioCapturer | null = null;
  private renderer: audio.AudioRenderer | null = null;
  private softwareActive: boolean = false;
  private ringBuf: Int16Array = new Int16Array(16384);
  private ringRead: number = 0;
  private ringWrite: number = 0;
  private ringPrimed: boolean = false;
  private lastOutSample: number = 0;
  private delayBuf: Float32Array = new Float32Array(32768);
  private delayIdx: number = 0;
  private micHp: MonoBiquad = new MonoBiquad();
  private micLp: MonoBiquad = new MonoBiquad();
  private micPres: MonoBiquad = new MonoBiquad();
  private lpWarm: number = 0;
  private revDamp: number = 0;
  private gateEnv: number = 0;
  private noiseFloor: number = 0.004;
  private gateGain: number = 0.02;
  private gateHold: number = 0;
  private compEnv: number = 0;
  private mode: EarMonitorMode = 'off';
  private micVolume: number = 1.0;
  private vocalVolume: number = 1.0;
  private active: boolean = false;
  private statusText: string = '未开启';
  private onStateChangeCb: ((state: EarMonitorState) => void) | null = null;
  private onVocalGainCb: ((gain: number) => void) | null = null;

  initialize(context: common.UIAbilityContext): void {
    this.context = context;
  }

  onStateChange(cb: (state: EarMonitorState) => void): void {
    this.onStateChangeCb = cb;
  }

  onVocalGainChange(cb: (gain: number) => void): void {
    this.onVocalGainCb = cb;
  }

  getState(): EarMonitorState {
    return {
      mode: this.mode,
      micVolume: this.micVolume,
      vocalVolume: this.vocalVolume,
      active: this.active,
      statusText: this.statusText,
    };
  }

  private emit(): void {
    this.onStateChangeCb?.(this.getState());
  }

  private async ensureMicPermission(): Promise<boolean> {
    if (!this.context) return false;
    try {
      const atManager = abilityAccessCtrl.createAtManager();
      const permissions: Permissions[] = ['ohos.permission.MICROPHONE'];
      const res = await atManager.requestPermissionsFromUser(this.context, permissions);
      if (Array.isArray(res.authResults) && res.authResults.length > 0 && res.authResults[0] === 0) {
        return true;
      }
      // 若此前拒绝过麦克风权限，主动拉起系统权限设置半模态弹窗引导用户开启。
      const settingRes = await atManager.requestPermissionOnSetting(this.context, permissions);
      return Array.isArray(settingRes) && settingRes.length > 0 && settingRes[0] === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
    } catch (error) {
      console.warn(`[EarMonitor] permission error: ${(error as BusinessError).message}`);
      return false;
    }
  }

  private reverbPresetFor(mode: EarMonitorMode): audio.AudioLoopbackReverbPreset {
    if (mode === 'ktv') return audio.AudioLoopbackReverbPreset.KTV;
    if (mode === 'theater') return audio.AudioLoopbackReverbPreset.THEATER;
    if (mode === 'concert') return audio.AudioLoopbackReverbPreset.CONCERT;
    return audio.AudioLoopbackReverbPreset.ORIGINAL;
  }

  private eqPresetFor(mode: EarMonitorMode): audio.AudioLoopbackEqualizerPreset {
    if (mode === 'ktv') return audio.AudioLoopbackEqualizerPreset.BRIGHT;
    if (mode === 'theater' || mode === 'concert') return audio.AudioLoopbackEqualizerPreset.FULL;
    return audio.AudioLoopbackEqualizerPreset.FLAT;
  }

  private statusDescription(status: audio.AudioLoopbackStatus): string {
    if (status === audio.AudioLoopbackStatus.AVAILABLE_RUNNING) return '硬件低延迟耳返运行中';
    if (status === audio.AudioLoopbackStatus.UNAVAILABLE_DEVICE) return '当前耳机不支持硬件直通，已切换软件低延迟耳返';
    if (status === audio.AudioLoopbackStatus.UNAVAILABLE_SCENE) return '当前音频场景暂不可用耳返';
    return '耳返已就绪';
  }

  private async stopSoftwareLoopback(): Promise<void> {
    this.softwareActive = false;
    const cap = this.capturer;
    this.capturer = null;
    if (cap) {
      try { cap.off('readData'); } catch (_) {}
      try { await cap.stop(); } catch (_) {}
      try { await cap.release(); } catch (_) {}
    }
    const ren = this.renderer;
    this.renderer = null;
    if (ren) {
      try { ren.off('writeData'); } catch (_) {}
      try { await ren.stop(); } catch (_) {}
      try { await ren.release(); } catch (_) {}
    }
    this.ringRead = 0;
    this.ringWrite = 0;
    this.ringPrimed = false;
    this.lastOutSample = 0;
    this.delayBuf.fill(0);
    this.delayIdx = 0;
    this.micHp.reset();
    this.micLp.reset();
    this.micPres.reset();
    this.lpWarm = 0;
    this.revDamp = 0;
    this.gateEnv = 0;
    this.noiseFloor = 0.004;
    this.gateGain = 0.02;
    this.gateHold = 0;
    this.compEnv = 0;
  }

  private async startSoftwareLoopback(nextMode: EarMonitorMode): Promise<boolean> {
    if (this.softwareActive && this.capturer && this.renderer) {
      this.active = true;
      this.statusText = `软件低延迟耳返运行中（${this.modeLabel(nextMode)}）`;
      this.onVocalGainCb?.(this.vocalVolume);
      return true;
    }
    await this.stopSoftwareLoopback();
    const fs = 48000;
    this.micHp.setHighPass(fs, 115, 0.7071);
    this.micLp.setLowPass(fs, 9200, 0.7071);
    this.micPres.setPeaking(fs, 3100, 3.0, 1.15);

    const streamInfo: audio.AudioStreamInfo = {
      samplingRate: audio.AudioSamplingRate.SAMPLE_RATE_48000,
      channels: audio.AudioChannel.CHANNEL_1,
      sampleFormat: audio.AudioSampleFormat.SAMPLE_FORMAT_S16LE,
      encodingType: audio.AudioEncodingType.ENCODING_TYPE_RAW,
    };
    const rendererOptions: audio.AudioRendererOptions = {
      streamInfo,
      rendererInfo: {
        usage: audio.StreamUsage.STREAM_USAGE_MUSIC,
        rendererFlags: 0,
      },
    };
    try {
      // 优先使用直播人声源（硬件人声降噪与低延迟），逐级回退语音消息/标准麦克风源。
      const preferredSources: audio.SourceType[] = [
        audio.SourceType.SOURCE_TYPE_LIVE,
        audio.SourceType.SOURCE_TYPE_VOICE_MESSAGE,
        audio.SourceType.SOURCE_TYPE_MIC,
      ];
      let cap: audio.AudioCapturer | null = null;
      for (const srcType of preferredSources) {
        try {
          cap = await audio.createAudioCapturer({
            streamInfo,
            capturerInfo: { source: srcType, capturerFlags: 0 },
          });
          if (cap) break;
        } catch (_) {}
      }
      if (!cap) return false;
      const ren = await audio.createAudioRenderer(rendererOptions);
      this.capturer = cap;
      this.renderer = ren;
      this.ringRead = 0;
      this.ringWrite = 0;
      this.ringPrimed = false;
      this.lastOutSample = 0;
      this.delayBuf.fill(0);
      this.delayIdx = 0;
      const mask = this.ringBuf.length - 1;
      const delayLen = this.delayBuf.length;
      const delayMask = delayLen - 1;
      const targetJitter = 960; // 20ms 防欠载抗抖缓冲，彻底消除断续噼啪底噪
      const maxJitter = 3840;   // 80ms 上限，保持跟唱低延迟

      cap.on('readData', (buf: ArrayBuffer) => {
        if (!this.softwareActive) return;
        const input = new Int16Array(buf);
        const mv = Math.max(0, Math.min(1.5, this.micVolume));
        const preamp = mv <= 0.001 ? 0.0 : Math.pow(mv, 1.15) * 2.2;
        const curMode = this.mode;
        for (let i = 0; i < input.length; i += 1) {
          const raw = input[i] / 32768.0;
          // 115Hz 二阶高通去喷麦/低频嗡声 + 9.2kHz 二阶低通滤除高频底噪嘶嘶声
          const clean = this.micLp.process(this.micHp.process(raw));

          // 自适应 RMS 包络降噪门（平滑开启/保持/衰减，彻底消除底噪且无过零噼啪声）
          const absClean = Math.abs(clean);
          this.gateEnv = absClean > this.gateEnv
            ? (this.gateEnv * 0.992 + absClean * 0.008)
            : (this.gateEnv * 0.9996 + absClean * 0.0004);
          if (this.gateEnv < this.noiseFloor) {
            this.noiseFloor = this.noiseFloor * 0.996 + this.gateEnv * 0.004;
          } else if (this.gateEnv < this.noiseFloor * 2.0) {
            this.noiseFloor = Math.min(0.024, this.noiseFloor * 0.99995 + this.gateEnv * 0.00005);
          }
          const openThresh = Math.max(0.0065, this.noiseFloor * 2.7);
          const closeThresh = openThresh * 0.65;
          let targetGate = this.gateGain;
          if (this.gateEnv >= openThresh) {
            this.gateHold = 4320; // 90ms 保持，避免词句间隙断音
            targetGate = 1.0;
          } else if (this.gateHold > 0) {
            this.gateHold -= 1;
            targetGate = 1.0;
          } else if (this.gateEnv <= closeThresh) {
            targetGate = 0.02; // 静音期 -34dB 底噪抑制
          } else {
            const ratio = (this.gateEnv - closeThresh) / Math.max(1e-5, openThresh - closeThresh);
            targetGate = 0.02 + 0.98 * ratio * ratio;
          }
          this.gateGain += (targetGate - this.gateGain) * (targetGate > this.gateGain ? 0.008 : 0.00028);

          // 均衡前级放大 + 轻柔人声自动压缩防大声爆音
          let boosted = clean * this.gateGain * preamp;
          const absBoost = Math.abs(boosted);
          this.compEnv = absBoost > this.compEnv
            ? (this.compEnv * 0.995 + absBoost * 0.005)
            : (this.compEnv * 0.9997 + absBoost * 0.0003);
          if (this.compEnv > 0.36) {
            const over = this.compEnv / 0.36;
            const compGain = Math.pow(over, -0.62); // ~2.6:1 柔和压缩
            boosted *= compGain;
          }

          this.lpWarm = this.lpWarm * 0.80 + boosted * 0.20;
          const pres = this.micPres.process(boosted);
          let out = boosted;
          if (curMode === 'ktv') {
            const t1 = this.delayBuf[(this.delayIdx - 6000) & delayMask];
            const t2 = this.delayBuf[(this.delayIdx - 10800) & delayMask];
            const t3 = this.delayBuf[(this.delayIdx - 1720) & delayMask];
            const fbRaw = t1 * 0.42 + t3 * 0.22;
            this.revDamp = this.revDamp * 0.38 + fbRaw * 0.62;
            this.delayBuf[this.delayIdx] = pres + this.revDamp;
            this.delayIdx = (this.delayIdx + 1) & delayMask;
            out = pres * 0.86 + t1 * 0.46 + t2 * 0.26 + t3 * 0.30;
          } else if (curMode === 'theater') {
            const warm = boosted * 0.66 + this.lpWarm * 0.56;
            const r1 = this.delayBuf[(this.delayIdx - 2640) & delayMask];
            const r2 = this.delayBuf[(this.delayIdx - 6240) & delayMask];
            const r3 = this.delayBuf[(this.delayIdx - 10320) & delayMask];
            const fbRaw = (r1 * 0.5 + r2 * 0.35 + r3 * 0.15) * 0.50;
            this.revDamp = this.revDamp * 0.52 + fbRaw * 0.48;
            this.delayBuf[this.delayIdx] = warm + this.revDamp;
            this.delayIdx = (this.delayIdx + 1) & delayMask;
            out = warm * 0.72 + r1 * 0.44 + r2 * 0.34 + r3 * 0.22;
          } else if (curMode === 'concert') {
            const c1 = this.delayBuf[(this.delayIdx - 2016) & delayMask];
            const c2 = this.delayBuf[(this.delayIdx - 5800) & delayMask];
            const c3 = this.delayBuf[(this.delayIdx - 12400) & delayMask];
            const c4 = this.delayBuf[(this.delayIdx - 21600) & delayMask];
            const fbRaw = (c1 * 0.26 + c2 * 0.28 + c3 * 0.24 + c4 * 0.20) * 0.68;
            this.revDamp = this.revDamp * 0.42 + fbRaw * 0.58;
            this.delayBuf[this.delayIdx] = pres + this.revDamp;
            this.delayIdx = (this.delayIdx + 1) & delayMask;
            out = pres * 0.62 + c1 * 0.38 + c2 * 0.40 + c3 * 0.36 + c4 * 0.28;
          } else {
            out = boosted * 0.80 + pres * 0.20;
          }
          const limited = softClipEar(mv <= 0.001 ? 0 : out, 0.72, 0.94);
          this.ringBuf[this.ringWrite] = Math.round(Math.max(-1, Math.min(1, limited)) * 32767);
          this.ringWrite = (this.ringWrite + 1) & mask;
          if (this.ringWrite === this.ringRead) {
            this.ringRead = (this.ringRead + 1) & mask;
          }
        }
        const avail = (this.ringWrite - this.ringRead) & mask;
        if (!this.ringPrimed && avail >= targetJitter) {
          this.ringPrimed = true;
        } else if (avail > maxJitter) {
          this.ringRead = (this.ringWrite - targetJitter) & mask;
        }
      });

      ren.on('writeData', (buf: ArrayBuffer): audio.AudioDataCallbackResult => {
        const out = new Int16Array(buf);
        if (!this.ringPrimed) {
          out.fill(0);
          return audio.AudioDataCallbackResult.VALID;
        }
        for (let i = 0; i < out.length; i += 1) {
          if (this.ringRead !== this.ringWrite) {
            const s = this.ringBuf[this.ringRead];
            this.ringRead = (this.ringRead + 1) & mask;
            this.lastOutSample = s;
            out[i] = s;
          } else {
            // 平滑衰减保持，避免欠载跳零造成咔哒杂音
            this.lastOutSample = Math.round(this.lastOutSample * 0.92);
            out[i] = this.lastOutSample;
          }
        }
        return audio.AudioDataCallbackResult.VALID;
      });

      this.softwareActive = true;
      await cap.start();
      await ren.start();
      this.active = true;
      this.statusText = `软件低延迟耳返运行中（${this.modeLabel(nextMode)}）`;
      this.onVocalGainCb?.(this.vocalVolume);
      return true;
    } catch (error) {
      const err = error as BusinessError;
      console.warn(`[EarMonitor] software fallback error ${err.code}: ${err.message}`);
      await this.stopSoftwareLoopback();
      return false;
    }
  }

  async setMode(nextMode: EarMonitorMode): Promise<EarMonitorState> {
    this.mode = nextMode;
    if (nextMode === 'off') {
      await this.stop();
      this.statusText = '未开启';
      this.emit();
      return this.getState();
    }
    const granted = await this.ensureMicPermission();
    if (!granted) {
      this.mode = 'off';
      this.active = false;
      this.statusText = '未获得麦克风权限，请在系统设置中允许 LxMine 使用麦克风';
      this.emit();
      return this.getState();
    }
    if (this.softwareActive) {
      const swOk = await this.startSoftwareLoopback(nextMode);
      if (!swOk) {
        this.mode = 'off';
        this.active = false;
        this.statusText = '耳返启动失败，请确认耳机与麦克风连接正常';
      }
      this.emit();
      return this.getState();
    }
    let hardwareRunning = false;
    try {
      if (!this.loopback) {
        const instance = await audio.createAudioLoopback(audio.AudioLoopbackMode.HARDWARE);
        this.loopback = instance;
        instance.on('statusChange', (status: audio.AudioLoopbackStatus) => {
          if (this.softwareActive) return;
          this.active = status === audio.AudioLoopbackStatus.AVAILABLE_RUNNING;
          this.statusText = this.statusDescription(status);
          if (!this.active && this.mode !== 'off' && (status === audio.AudioLoopbackStatus.UNAVAILABLE_DEVICE || status === audio.AudioLoopbackStatus.UNAVAILABLE_SCENE)) {
            const desired = this.mode;
            this.startSoftwareLoopback(desired).then((ok: boolean) => {
              if (!ok) {
                this.mode = 'off';
                this.statusText = '当前音频设备暂不可用耳返';
              }
              this.emit();
            }).catch(() => {});
            return;
          }
          this.emit();
        });
      }
      try { this.loopback.setReverbPreset(this.reverbPresetFor(nextMode)); } catch (_) {}
      try { this.loopback.setEqualizerPreset(this.eqPresetFor(nextMode)); } catch (_) {}
      await this.loopback.setVolume(Math.max(0, Math.min(1, this.micVolume)));
      const ok = await this.loopback.enable(true);
      const status = await this.loopback.getStatus();
      hardwareRunning = ok && status === audio.AudioLoopbackStatus.AVAILABLE_RUNNING;
      if (hardwareRunning) {
        this.active = true;
        this.statusText = `硬件低延迟耳返运行中（${this.modeLabel(nextMode)}）`;
        this.onVocalGainCb?.(this.vocalVolume);
      } else {
        try { await this.loopback.enable(false); } catch (_) {}
      }
    } catch (error) {
      const err = error as BusinessError;
      console.warn(`[EarMonitor] hardware loopback unavailable ${err.code}: ${err.message}`);
    }
    if (!hardwareRunning) {
      const swOk = await this.startSoftwareLoopback(nextMode);
      if (!swOk) {
        this.mode = 'off';
        this.active = false;
        this.statusText = '耳返启动失败，请确认麦克风权限已开启并连接耳机';
      }
    }
    this.emit();
    return this.getState();
  }

  private modeLabel(mode: EarMonitorMode): string {
    if (mode === 'original') return '原生';
    if (mode === 'ktv') return 'KTV';
    if (mode === 'theater') return '剧场';
    if (mode === 'concert') return '音乐厅';
    return '关闭';
  }

  async setMicVolume(value: number): Promise<void> {
    this.micVolume = Math.max(0, Math.min(1.5, Number.isFinite(value) ? value : 0.72));
    if (this.loopback && !this.softwareActive) {
      try { await this.loopback.setVolume(Math.min(1, this.micVolume)); } catch (_) {}
    }
    this.emit();
  }

  setVocalVolume(value: number): void {
    this.vocalVolume = Math.max(0, Math.min(1.5, Number.isFinite(value) ? value : 1.0));
    if (this.active) {
      this.onVocalGainCb?.(this.vocalVolume);
    }
    this.emit();
  }

  async stop(): Promise<void> {
    this.active = false;
    this.mode = 'off';
    await this.stopSoftwareLoopback();
    const lb = this.loopback;
    if (lb) {
      try { await lb.enable(false); } catch (_) {}
    }
    this.onVocalGainCb?.(1.0);
  }

  async release(): Promise<void> {
    await this.stop();
    const lb = this.loopback;
    this.loopback = null;
    if (lb) {
      try { lb.off('statusChange'); } catch (_) {}
    }
  }
}
