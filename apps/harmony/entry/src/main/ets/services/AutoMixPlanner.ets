import { Song } from '../model/Song';
import { LyricLine } from './LyricParser';

export interface AutoMixPlan {
  enabled: boolean;
  strategy: string;
  strategyLabel: string;
  vocalFinishMs: number;
  mixStartMs: number;
  nextEntryMs: number;
  crossfadeMs: number;
  bassSwap: boolean;
  filterSweep: string;
  tempoMatch: boolean;
  rateA: number;
  rateB: number;
  compatibility: number;
  bpmA: number;
  bpmB: number;
  summary: string;
}

export interface EqualPowerPair {
  outGain: number;
  inGain: number;
}

interface TrackProfile {
  durationMs: number;
  firstVocalMs: number;
  lastVocalMs: number;
  lastVocalEndMs: number;
  vocalFinishMs: number;
  pureOutroMs: number;
  introLeadMs: number;
  energy: number;
  bpm: number;
  isCalm: boolean;
  isHighEnergy: boolean;
  artistNorm: string;
  albumNorm: string;
  hasLyrics: boolean;
}

const META_LYRIC_RE = /^(作词|作曲|词曲|词\/曲|作词\/作曲|编曲|制作人|制作|混音|母带|录音|吉他|贝斯|鼓|键盘|和声|监制|音乐总监|出品|出品方|发行|发行方|词|曲|编|唱|演唱|原唱|翻唱|统筹|企划|宣传|版权|版权声明|鸣谢|感谢|谢谢|录音棚|混音室|混音师|母带处理|OP|SP|END|完|lyricist|composer|arranger|producer|mixed|mastered|pure music|纯音乐|无歌词)(\s*[:：]|$)/i;
const HIGH_ENERGY_RE = /\b(dj|remix|club|edm|house|techno|trap|drill|phunk|phonk|dance|rave|electro|cyber|bass|dubstep|rock|metal|punk|funk|disco|hip[\s-]?hop|rap|hyperpop|nightcore|speed[\s-]?up|sped\s+up)\b|电音|舞曲|说唱|摇滚|蹦迪|热舞|律动|劲爆|DJ版/i;
const CALM_ENERGY_RE = /\b(acoustic|piano|unplugged|ballad|lullaby|ambient|sleep|study|meditation|classical|violin|cello|guzheng|flute|solo|live|ost|instrumental)\b|钢琴|纯音乐|轻音乐|民谣|抒情|晚安|助眠|独奏|清唱|古筝|大提琴|小提琴|慢摇|催眠/i;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(x: number): number {
  const s = clamp(x, 0, 1);
  return s * s * (3 - 2 * s);
}

function ramp(u: number, start: number, end: number): number {
  return clamp((u - start) / Math.max(0.001, end - start), 0, 1);
}

function primaryArtist(raw: string): string {
  const parts = (raw || '').split(/[、/,，;&]+/);
  return (parts[0] ?? '').trim().toLowerCase();
}

function estimateSyllables(text: string): number {
  const s = (text || '').trim();
  if (!s) return 4;
  const cjk = (s.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) ?? []).length;
  const latinWords = (s.replace(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g, ' ').match(/[a-zA-Z0-9']+/g) ?? []).length;
  return Math.max(3, cjk + latinWords * 1.45);
}

function analyzeTrack(song: Song, durationOverrideMs: number, lines: LyricLine[]): TrackProfile {
  const durationMs = Math.max(0, durationOverrideMs > 0 ? durationOverrideMs : (song.durationMs || 0));
  const textSig = `${song.name || ''} ${song.albumName || ''} ${song.singer || ''}`;
  const valid: LyricLine[] = [];
  for (const line of lines) {
    const t = (line.text || '').trim();
    if (!t || line.timeMs < 0) continue;
    if (/^[♪♫~\-\s.。…]+$/.test(t)) continue;
    if (META_LYRIC_RE.test(t)) continue;
    valid.push(line);
  }
  valid.sort((a: LyricLine, b: LyricLine) => a.timeMs - b.timeMs);

  let firstVocalMs = -1;
  let lastVocalMs = -1;
  let lastLine: LyricLine | null = null;
  let medianGapMs = 3400;
  let avgGapMs = 0;
  let vocalDensity = 0;
  if (valid.length >= 2) {
    firstVocalMs = valid[0].timeMs;
    lastLine = valid[valid.length - 1];
    lastVocalMs = lastLine.timeMs;
    const spanSec = Math.max(10, (lastVocalMs - firstVocalMs) / 1000);
    vocalDensity = valid.length / spanSec;
    const gaps: number[] = [];
    let gapSum = 0;
    for (let i = 1; i < valid.length; i++) {
      const g = valid[i].timeMs - valid[i - 1].timeMs;
      if (g >= 500 && g <= 14000) {
        gaps.push(g);
        gapSum += g;
      }
    }
    if (gaps.length > 0) {
      gaps.sort((x: number, y: number) => x - y);
      medianGapMs = gaps[Math.floor(gaps.length * 0.5)];
      avgGapMs = gapSum / gaps.length;
    }
  } else if (valid.length === 1) {
    firstVocalMs = valid[0].timeMs;
    lastLine = valid[0];
    lastVocalMs = lastLine.timeMs;
  }

  let energy = 0.54;
  if (HIGH_ENERGY_RE.test(textSig)) energy += 0.28;
  if (CALM_ENERGY_RE.test(textSig)) energy -= 0.28;
  if (vocalDensity >= 0.48) energy += 0.14;
  else if (vocalDensity >= 0.34) energy += 0.05;
  else if (vocalDensity > 0 && vocalDensity < 0.22) energy -= 0.14;
  if (durationMs > 0 && durationMs < 175000) energy += 0.06;
  if (durationMs > 300000) energy -= 0.08;
  energy = clamp(energy, 0.12, 0.98);
  const isCalm = energy < 0.42;
  const isHighEnergy = energy >= 0.66;

  let bpm = 82 + energy * 52;
  if (avgGapMs > 0) {
    const cadenceBpm = clamp(320000 / Math.max(1500, avgGapMs), 68, 152);
    bpm = bpm * 0.65 + cadenceBpm * 0.35;
  }
  bpm = Math.round(clamp(bpm, 60, 185));

  const hasLyrics = valid.length >= 2;
  let lastVocalEndMs = -1;
  let vocalFinishMs = durationMs > 0 ? Math.round(durationMs * 0.80) : 0;
  if (lastVocalMs >= 0 && lastLine) {
    const syllables = estimateSyllables(lastLine.text);
    const msPerSyl = isCalm ? 265 : (isHighEnergy ? 165 : 210);
    const textDurMs = clamp(syllables * msPerSyl + 650, 2000, 4600);
    const gapRefMs = clamp(medianGapMs * 0.92, 2200, 4400);
    const sungMs = Math.round(clamp(Math.max(textDurMs, gapRefMs * 0.85), 2200, 4800));
    lastVocalEndMs = lastVocalMs + sungMs;
    const tailReverbMs = isCalm ? 1700 : (isHighEnergy ? 1000 : 1350);
    vocalFinishMs = durationMs > 0
      ? Math.min(durationMs, lastVocalEndMs + tailReverbMs)
      : (lastVocalEndMs + tailReverbMs);
  }

  const pureOutroMs = durationMs > 0 && hasLyrics
    ? Math.max(0, durationMs - vocalFinishMs)
    : Math.min(18000, Math.round(durationMs * 0.14));
  const introLeadMs = hasLyrics && firstVocalMs >= 0
    ? firstVocalMs
    : (isCalm ? 10000 : (isHighEnergy ? 8500 : 9000));

  return {
    durationMs,
    firstVocalMs,
    lastVocalMs,
    lastVocalEndMs,
    vocalFinishMs,
    pureOutroMs,
    introLeadMs,
    energy,
    bpm,
    isCalm,
    isHighEnergy,
    artistNorm: primaryArtist(song.singer || ''),
    albumNorm: (song.albumName || '').trim().toLowerCase(),
    hasLyrics,
  };
}

function tempoCompatibility(bpmA: number, bpmB: number): number {
  if (!bpmA || !bpmB) return 0.65;
  const ratios: number[] = [bpmA / bpmB, (bpmA * 2) / bpmB, bpmA / (bpmB * 2)];
  let bestDiff = 1;
  for (const r of ratios) {
    const diff = Math.abs(1 - r);
    if (diff < bestDiff) bestDiff = diff;
  }
  return clamp(1 - bestDiff * 2.8, 0.15, 1.0);
}

export function planAutoMix(
  currentSong: Song | null,
  currentDurationMs: number,
  currentLyrics: LyricLine[],
  nextSong: Song | null,
  nextLyrics: LyricLine[] = [],
): AutoMixPlan {
  if (!currentSong || !nextSong) {
    return {
      enabled: false,
      strategy: 'none',
      strategyLabel: '标准衔接',
      vocalFinishMs: 0,
      mixStartMs: Math.max(0, currentDurationMs - 1000),
      nextEntryMs: 0,
      crossfadeMs: 0,
      bassSwap: false,
      filterSweep: 'none',
      tempoMatch: false,
      rateA: 1,
      rateB: 1,
      compatibility: 0,
      bpmA: 0,
      bpmB: 0,
      summary: '队列仅 1 首歌曲，待加入更多曲目后自动混音',
    };
  }
  const a = analyzeTrack(currentSong, currentDurationMs, currentLyrics);
  const b = analyzeTrack(nextSong, nextSong.durationMs || 0, nextLyrics);
  if (a.durationMs < 24000) {
    return {
      enabled: false,
      strategy: 'none',
      strategyLabel: '标准衔接',
      vocalFinishMs: a.vocalFinishMs,
      mixStartMs: Math.max(0, a.durationMs - 1000),
      nextEntryMs: 0,
      crossfadeMs: 0,
      bassSwap: false,
      filterSweep: 'none',
      tempoMatch: false,
      rateA: 1,
      rateB: 1,
      compatibility: 0,
      bpmA: a.bpm,
      bpmB: b.bpm,
      summary: '当前曲目较短，使用标准衔接',
    };
  }

  const tempoScore = tempoCompatibility(a.bpm, b.bpm);
  const energySigned = b.energy - a.energy;
  const energyDelta = Math.abs(energySigned);
  const energyScore = clamp(1 - energyDelta * 1.35, 0.22, 1.0);
  const continuityBonus = (a.albumNorm && a.albumNorm === b.albumNorm)
    ? 0.12
    : (a.artistNorm && a.artistNorm === b.artistNorm ? 0.08 : 0);
  const compatibility = clamp(tempoScore * 0.55 + energyScore * 0.45 + continuityBonus, 0.18, 1.0);

  const shortNextIntro = b.hasLyrics && b.firstVocalMs >= 0 && b.firstVocalMs < 2200;
  const shortOutro = a.hasLyrics && a.pureOutroMs < 2600;

  let strategy = 'echo-wash-bridge';
  let strategyLabel = '余韵丝滑桥接';
  let baseCrossfadeMs = 7600;
  let bassSwap = false;
  let filterSweep = 'lowpass-warm';
  let tempoMatch = false;
  let rateA = 1;
  let rateB = 1;
  const nextEntryMs = 0;

  if (shortNextIntro || shortOutro) {
    strategy = 'clean-air-handoff';
    strategyLabel = '呼吸气口衔接';
    baseCrossfadeMs = Math.round(clamp(shortNextIntro ? Math.max(2600, b.firstVocalMs + 900) : 3400, 2600, 4000));
    bassSwap = false;
    filterSweep = 'none';
  } else if (a.energy >= 0.54 && b.energy >= 0.54 && tempoScore >= 0.60 && a.pureOutroMs >= 5500) {
    strategy = 'beat-lock-mix';
    strategyLabel = '节拍锁定混音';
    const avgBpm = (a.bpm + b.bpm) * 0.5;
    const barMs = (60000 / Math.max(60, avgBpm)) * 4;
    const targetBars = (compatibility >= 0.72 && a.pureOutroMs >= 10000) ? 4 : 3;
    baseCrossfadeMs = Math.round(clamp(barMs * targetBars, 6600, 10200));
    bassSwap = true;
    filterSweep = 'highpass-lift';
    const rawRatio = a.bpm / Math.max(1, b.bpm);
    if (rawRatio >= 0.94 && rawRatio <= 1.065 && Math.abs(1 - rawRatio) >= 0.012) {
      rateA = Number(clamp(avgBpm / a.bpm, 0.965, 1.035).toFixed(4));
      rateB = Number(clamp(avgBpm / b.bpm, 0.965, 1.035).toFixed(4));
      tempoMatch = true;
    }
  } else if (energySigned >= 0.20) {
    strategy = 'energy-lift-drop';
    strategyLabel = '能量抬升切入';
    baseCrossfadeMs = Math.round(clamp(5600 + compatibility * 1800, 5400, 7600));
    bassSwap = b.energy >= 0.56;
    filterSweep = 'highpass-lift';
  } else if (energySigned <= -0.20) {
    strategy = 'energy-cool-settle';
    strategyLabel = '缓降沉淀过渡';
    baseCrossfadeMs = Math.round(clamp(6400 + (1 - energyDelta) * 2000, 6200, 8800));
    bassSwap = false;
    filterSweep = 'lowpass-warm';
  } else {
    strategy = 'echo-wash-bridge';
    strategyLabel = '余韵丝滑桥接';
    baseCrossfadeMs = Math.round(clamp(6400 + compatibility * 2400, 6200, 9000));
    bassSwap = a.energy >= 0.50 && b.energy >= 0.50 && tempoScore >= 0.58;
    filterSweep = 'lowpass-warm';
  }

  let crossfadeMs = baseCrossfadeMs;
  if (b.hasLyrics && b.firstVocalMs >= 2200) {
    const vocalCap = Math.max(3200, Math.round(b.firstVocalMs * 0.96));
    crossfadeMs = Math.min(crossfadeMs, vocalCap);
  }

  const endSilenceMs = a.pureOutroMs >= 20000 ? 3200 : (a.pureOutroMs >= 10000 ? 2000 : 900);
  const usableOutroMs = Math.max(0, a.pureOutroMs - endSilenceMs);
  let soloOutroMs = 0;
  if (a.hasLyrics) {
    if (usableOutroMs >= 15000) {
      soloOutroMs = Math.round(clamp(usableOutroMs * 0.36, 4200, 9500));
      crossfadeMs = Math.round(clamp(crossfadeMs, 6400, Math.min(10500, usableOutroMs - soloOutroMs + 800)));
    } else if (usableOutroMs >= 8500) {
      soloOutroMs = Math.round(clamp(usableOutroMs * 0.28, 2200, 4200));
      crossfadeMs = Math.round(clamp(Math.min(crossfadeMs, usableOutroMs - soloOutroMs + 600), 5400, 9000));
    } else if (usableOutroMs >= 4500) {
      soloOutroMs = Math.round(clamp(usableOutroMs * 0.22, 1000, 2000));
      crossfadeMs = Math.round(clamp(Math.min(crossfadeMs, usableOutroMs - soloOutroMs + 600), 3800, 6600));
    } else {
      soloOutroMs = Math.round(clamp(usableOutroMs * 0.15, 0, 800));
      crossfadeMs = Math.round(clamp(Math.max(2600, a.pureOutroMs - soloOutroMs - 300), 2400, 4800));
    }
    if (b.hasLyrics && b.firstVocalMs >= 2200) {
      crossfadeMs = Math.min(crossfadeMs, Math.max(2800, Math.round(b.firstVocalMs * 0.96)));
    }
  }

  let mixStartMs: number;
  if (a.hasLyrics) {
    if (usableOutroMs > soloOutroMs + crossfadeMs + 5000) {
      const livelyWait = Math.min(13500, Math.max(soloOutroMs, usableOutroMs - crossfadeMs - 2500));
      mixStartMs = a.vocalFinishMs + Math.round(livelyWait);
    } else {
      mixStartMs = a.vocalFinishMs + soloOutroMs;
    }
  } else {
    mixStartMs = Math.round(a.durationMs - crossfadeMs - endSilenceMs);
  }

  const minAllowedStart = a.hasLyrics ? (a.vocalFinishMs + soloOutroMs) : Math.round(a.durationMs * 0.72);
  if (strategy === 'beat-lock-mix' && a.bpm >= 60) {
    const halfBarMs = (60000 / a.bpm) * 2;
    const anchor = a.firstVocalMs >= 0 ? a.firstVocalMs : 0;
    const steps = Math.ceil(Math.max(0, mixStartMs - anchor) / halfBarMs);
    const snapped = Math.round(anchor + steps * halfBarMs);
    if (snapped >= minAllowedStart && snapped <= a.durationMs - crossfadeMs - 400) {
      mixStartMs = snapped;
    }
  }

  const availAfterStart = a.durationMs - mixStartMs - 350;
  if (availAfterStart < crossfadeMs) {
    if (availAfterStart >= 2400) {
      crossfadeMs = Math.round(availAfterStart);
    } else {
      const vocalFloor = a.hasLyrics && a.lastVocalEndMs > 0
        ? Math.min(a.lastVocalEndMs + 400, a.durationMs - 2400)
        : (a.durationMs - 3200);
      mixStartMs = Math.round(Math.max(a.durationMs * 0.65, vocalFloor));
      crossfadeMs = Math.round(clamp(a.durationMs - mixStartMs - 300, 2200, 3400));
      strategy = 'clean-air-handoff';
      strategyLabel = '呼吸气口衔接';
      bassSwap = false;
      filterSweep = 'none';
      tempoMatch = false;
      rateA = 1;
      rateB = 1;
    }
  }

  const maxFade = Math.min(10800, Math.round(a.durationMs * 0.28));
  crossfadeMs = Math.round(clamp(crossfadeMs, 2200, maxFade));
  const maxStart = Math.max(4000, a.durationMs - 2200);
  const minStart = a.hasLyrics && a.lastVocalEndMs > 0 && a.lastVocalEndMs < maxStart - 300
    ? Math.max(Math.round(a.durationMs * 0.60), a.lastVocalEndMs)
    : Math.round(a.durationMs * 0.65);
  mixStartMs = Math.round(clamp(mixStartMs, minStart, maxStart));

  const secStr = (crossfadeMs / 1000).toFixed(1);
  const tag = bassSwap ? '低频交换' : (filterSweep === 'lowpass-warm' ? '尾奏前奏交织' : (filterSweep === 'highpass-lift' ? '能量抬升' : ''));
  const summary = `${strategyLabel} · ${secStr}s${tag ? ` · ${tag}` : ''}`;
  return {
    enabled: true,
    strategy,
    strategyLabel,
    vocalFinishMs: Math.round(a.vocalFinishMs),
    mixStartMs,
    nextEntryMs,
    crossfadeMs,
    bassSwap,
    filterSweep,
    tempoMatch,
    rateA,
    rateB,
    compatibility: Math.round(compatibility * 100) / 100,
    bpmA: a.bpm,
    bpmB: b.bpm,
    summary,
  };
}

export function equalPowerGains(t: number, strategy: string): EqualPowerPair {
  const u = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  if (u <= 0) return { outGain: 1, inGain: 0 };
  if (u >= 1) return { outGain: 0, inGain: 1 };
  if (strategy === 'clean-air-handoff') {
    return {
      outGain: Math.cos(smoothstep(ramp(u, 0.0, 0.66)) * Math.PI * 0.5),
      inGain: Math.sin(smoothstep(ramp(u, 0.26, 0.92)) * Math.PI * 0.5),
    };
  }
  if (strategy === 'beat-lock-mix' || strategy === 'beat-blend') {
    const outPhase = u <= 0.40 ? (u / 0.40) * 0.10 : (0.10 + 0.90 * smoothstep(ramp(u, 0.40, 0.96)));
    return {
      outGain: Math.cos(outPhase * Math.PI * 0.5),
      inGain: Math.sin(smoothstep(ramp(u, 0.0, 0.58)) * Math.PI * 0.5),
    };
  }
  if (strategy === 'energy-lift-drop') {
    const outPhase = u <= 0.32 ? (u / 0.32) * 0.14 : (0.14 + 0.86 * smoothstep(ramp(u, 0.32, 0.88)));
    return {
      outGain: Math.cos(outPhase * Math.PI * 0.5),
      inGain: Math.sin(smoothstep(ramp(u, 0.04, 0.60)) * Math.PI * 0.5),
    };
  }
  if (strategy === 'energy-cool-settle') {
    const outPhase = u <= 0.36 ? (u / 0.36) * 0.16 : (0.16 + 0.84 * smoothstep(ramp(u, 0.36, 1.0)));
    return {
      outGain: Math.cos(outPhase * Math.PI * 0.5),
      inGain: Math.sin(smoothstep(ramp(u, 0.06, 0.74)) * Math.PI * 0.5),
    };
  }
  const outPhase = u <= 0.34 ? (u / 0.34) * 0.14 : (0.14 + 0.86 * smoothstep(ramp(u, 0.34, 1.0)));
  return {
    outGain: Math.cos(outPhase * Math.PI * 0.5),
    inGain: Math.sin(smoothstep(ramp(u, 0.0, 0.68)) * Math.PI * 0.5),
  };
}
