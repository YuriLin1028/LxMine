/* LxMine AI AutoMix v3 transition planner — shared pure-logic engine across Windows, Android, HarmonyOS.
 * Accurately protects the final lyric & vocal tail, preserves a clear solo outro listening window,
 * prefetches next-track vocal entry to prevent vocal clashes, and weaves Track A's outro with Track B's
 * full 0:00 intro using pro-DJ constant-presence Hold-In / Hold-Out curves, mid-point bass-swap,
 * gentle spatial filter recession, and subtle micro-tempo beatmatching. */
(function (root) {
  'use strict';

  const META_LYRIC_RE = /^(作词|作曲|词曲|词\/曲|作词\/作曲|编曲|制作人|制作|混音|母带|录音|吉他|贝斯|鼓|键盘|和声|监制|音乐总监|出品|出品方|发行|发行方|词|曲|编|唱|演唱|原唱|翻唱|统筹|企划|宣传|版权|版权声明|鸣谢|感谢|谢谢|录音棚|混音室|混音师|母带处理|OP|SP|END|完|lyricist|composer|arranger|producer|mixed|mastered|pure music|纯音乐|无歌词)(\s*[:：]|$)/i;
  const HIGH_ENERGY_RE = /\b(dj|remix|club|edm|house|techno|trap|drill|phunk|phonk|dance|rave|electro|cyber|bass|dubstep|rock|metal|punk|funk|disco|hip[\s-]?hop|rap|hyperpop|nightcore|speed[\s-]?up|sped\s+up)\b|电音|舞曲|说唱|摇滚|蹦迪|热舞|律动|劲爆|DJ版/i;
  const CALM_ENERGY_RE = /\b(acoustic|piano|unplugged|ballad|lullaby|ambient|sleep|study|meditation|classical|violin|cello|guzheng|flute|solo|live|ost|instrumental)\b|钢琴|纯音乐|轻音乐|民谣|抒情|晚安|助眠|独奏|清唱|古筝|大提琴|小提琴|慢摇|催眠/i;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(x) {
    const s = clamp(x, 0, 1);
    return s * s * (3 - 2 * s);
  }

  function ramp(u, start, end) {
    return clamp((u - start) / Math.max(0.001, end - start), 0, 1);
  }

  function cleanArtist(raw) {
    return String(raw || '').split(/[、/,，;&]+/)[0].trim().toLowerCase();
  }

  function estimateSyllables(text) {
    const s = String(text || '').trim();
    if (!s) return 4;
    const cjk = (s.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || []).length;
    const latinWords = (s.replace(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g, ' ').match(/[a-zA-Z0-9']+/g) || []).length;
    return Math.max(3, cjk + latinWords * 1.45);
  }

  function extractLineEndMs(line) {
    if (!line || typeof line !== 'object') return -1;
    const directEnd = Number(line.endTimeMs != null ? line.endTimeMs : line.endTime);
    if (Number.isFinite(directEnd) && directEnd > 0) return directEnd;
    const words = Array.isArray(line.words) ? line.words : null;
    if (words && words.length > 0) {
      let maxEnd = -1;
      for (const w of words) {
        if (!w) continue;
        const wEnd = Number(w.endTimeMs != null ? w.endTimeMs : (w.endTime != null ? w.endTime : (Number(w.timeMs != null ? w.timeMs : w.time) + Number(w.durationMs != null ? w.durationMs : w.duration || 0))));
        if (Number.isFinite(wEnd) && wEnd > maxEnd) maxEnd = wEnd;
      }
      if (maxEnd > 0) return maxEnd;
    }
    return -1;
  }

  function normalizeLyricLines(lines) {
    if (!Array.isArray(lines)) return [];
    const out = [];
    for (const line of lines) {
      if (!line) continue;
      const ms = Number(line.timeMs != null ? line.timeMs : line.time);
      const text = String(line.text || '').trim();
      if (!Number.isFinite(ms) || ms < 0 || !text) continue;
      if (/^[♪♫~\-\s.。…]+$/.test(text)) continue;
      out.push({ timeMs: ms, text, endMs: extractLineEndMs(line) });
    }
    out.sort((a, b) => a.timeMs - b.timeMs);
    return out;
  }

  function analyzeTrackProfile(track) {
    const t = track && typeof track === 'object' ? track : {};
    const durationMs = Math.max(0, Number(t.durationMs || t.duration || 0) || 0);
    const title = String(t.name || '');
    const singer = String(t.singer || t.artist || '');
    const album = String(t.albumName || t.album || '');
    const textSig = `${title} ${album} ${singer}`;
    const lines = normalizeLyricLines(t.lyricLines || t.lyrics);
    const vocalLines = lines.filter(line => !META_LYRIC_RE.test(line.text));

    let firstVocalMs = -1;
    let lastVocalMs = -1;
    let lastLine = null;
    let medianGapMs = 3400;
    let avgGapMs = 0;
    let vocalDensity = 0;
    if (vocalLines.length >= 2) {
      firstVocalMs = vocalLines[0].timeMs;
      lastLine = vocalLines[vocalLines.length - 1];
      lastVocalMs = lastLine.timeMs;
      const spanSec = Math.max(10, (lastVocalMs - firstVocalMs) / 1000);
      vocalDensity = vocalLines.length / spanSec;
      const gaps = [];
      let gapSum = 0;
      for (let i = 1; i < vocalLines.length; i++) {
        const g = vocalLines[i].timeMs - vocalLines[i - 1].timeMs;
        if (g >= 500 && g <= 14000) {
          gaps.push(g);
          gapSum += g;
        }
      }
      if (gaps.length > 0) {
        gaps.sort((a, b) => a - b);
        medianGapMs = gaps[Math.floor(gaps.length * 0.5)];
        avgGapMs = gapSum / gaps.length;
      }
    } else if (vocalLines.length === 1) {
      firstVocalMs = vocalLines[0].timeMs;
      lastLine = vocalLines[0];
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

    const measuredEnergy = Number(t.measuredEnergy);
    if (Number.isFinite(measuredEnergy) && measuredEnergy >= 0 && measuredEnergy <= 1) {
      energy = energy * 0.45 + measuredEnergy * 0.55;
    }
    energy = clamp(energy, 0.12, 0.98);
    const isCalm = energy < 0.42;
    const isHighEnergy = energy >= 0.66;

    let bpm = Number(t.measuredBpm);
    if (!Number.isFinite(bpm) || bpm < 55 || bpm > 195) {
      bpm = 82 + energy * 52;
      if (avgGapMs > 0) {
        const cadenceBpm = clamp(320000 / Math.max(1500, avgGapMs), 68, 152);
        bpm = bpm * 0.65 + cadenceBpm * 0.35;
      }
    }
    bpm = Math.round(clamp(bpm, 60, 185));

    // Realistic final vocal duration + natural vibrato/reverb tail (3.4s..6.2s total after last lyric start):
    // fully protects the last lyric without overshooting past the audible instrumental outro!
    const hasLyrics = vocalLines.length >= 2;
    let lastVocalEndMs = -1;
    let vocalFinishMs = durationMs > 0 ? Math.round(durationMs * 0.80) : 0;
    if (lastVocalMs >= 0 && lastLine) {
      if (lastLine.endMs > lastVocalMs + 400) {
        lastVocalEndMs = lastLine.endMs;
      } else {
        const syllables = estimateSyllables(lastLine.text);
        const msPerSyl = isCalm ? 265 : (isHighEnergy ? 165 : 210);
        const textDurMs = clamp(syllables * msPerSyl + 650, 2000, 4600);
        const gapRefMs = clamp(medianGapMs * 0.92, 2200, 4400);
        const sungMs = Math.round(clamp(Math.max(textDurMs, gapRefMs * 0.85), 2200, 4800));
        lastVocalEndMs = lastVocalMs + sungMs;
      }
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
      outroTailMs: pureOutroMs,
      introLeadMs,
      energy,
      bpm,
      isCalm,
      isHighEnergy,
      artistNorm: cleanArtist(singer),
      albumNorm: album.trim().toLowerCase(),
      hasLyrics,
    };
  }

  function tempoCompatibility(bpmA, bpmB) {
    if (!bpmA || !bpmB) return 0.65;
    const ratios = [bpmA / bpmB, (bpmA * 2) / bpmB, bpmA / (bpmB * 2)];
    let bestDiff = 1;
    for (const r of ratios) {
      const diff = Math.abs(1 - r);
      if (diff < bestDiff) bestDiff = diff;
    }
    return clamp(1 - bestDiff * 2.8, 0.15, 1.0);
  }

  /**
   * Computes an AI AutoMix v3 transition plan between `currentTrack` and `nextTrack`.
   */
  function planAutoMix(currentTrack, nextTrack) {
    const a = analyzeTrackProfile(currentTrack);
    const b = analyzeTrackProfile(nextTrack);
    if (a.durationMs < 24000 || !nextTrack) {
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
        summary: '曲目时长较短，使用标准衔接',
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
    // 始终保留下一首 0:00 完整前奏，让前奏从第一个音符与上一首尾奏交织
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

    // 保护下一首第一句人声：上一首在下一首开唱前自然退场，绝不人声打架，同时保留完整前奏交织
    let crossfadeMs = baseCrossfadeMs;
    if (b.hasLyrics && b.firstVocalMs >= 2200) {
      const vocalCap = Math.max(3200, Math.round(b.firstVocalMs * 0.96));
      crossfadeMs = Math.min(crossfadeMs, vocalCap);
    }

    // 黄金比例尾奏分配：先让用户完整听到一段清晰纯尾奏，随后趁尾奏依然饱满有声时织入下一首完整前奏！
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
      // 再次校验下一首人声上限
      if (b.hasLyrics && b.firstVocalMs >= 2200) {
        crossfadeMs = Math.min(crossfadeMs, Math.max(2800, Math.round(b.firstVocalMs * 0.96)));
      }
    }

    let mixStartMs;
    if (a.hasLyrics) {
      // 超长尾奏（>20s）保留清晰纯尾奏后，在尾奏乐器仍饱满的中段开始混入，而不是拖到最后几秒死寂处！
      if (usableOutroMs > soloOutroMs + crossfadeMs + 5000) {
        const livelyWait = Math.min(13500, Math.max(soloOutroMs, usableOutroMs - crossfadeMs - 2500));
        mixStartMs = a.vocalFinishMs + Math.round(livelyWait);
      } else {
        mixStartMs = a.vocalFinishMs + soloOutroMs;
      }
    } else {
      mixStartMs = Math.round(a.durationMs - crossfadeMs - endSilenceMs);
    }

    // 节拍锁定模式对齐最近乐句半小节（绝不早于 vocalFinishMs + soloOutroMs）
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

    // 确保混音在曲目物理结束前完整跑完（优先微调 crossfadeMs，绝不倒退打断末句人声）
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
    const extras = [];
    if (tempoMatch) extras.push('微调速对拍');
    else if (bassSwap) extras.push('低频交换');
    else if (filterSweep === 'lowpass-warm') extras.push('尾奏前奏交织');
    else if (filterSweep === 'highpass-lift') extras.push('能量抬升');
    const summary = `${strategyLabel} · ${secStr}s${extras.length ? ' · ' + extras[0] : ''}`;
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

  /**
   * Pro-DJ constant-presence Hold-In / Hold-Out gain envelopes (t in [0, 1]):
   * - Zero pop-in at t=0 (out=1, in=0)
   * - Track A holds musical presence while Track B's intro weaves in on top (t=0.0..0.45)
   * - Both outro & intro glow together across the overlap zone with zero hollow dip
   * - Track B reaches full 1.0 as Track A gracefully dissolves into the background.
   */
  function equalPowerGains(t, strategy) {
    const u = clamp(Number(t) || 0, 0, 1);
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
    // echo-wash-bridge & default: Track A holds warm while Track B's intro weaves in smoothly (0..0.68)
    const outPhase = u <= 0.34 ? (u / 0.34) * 0.14 : (0.14 + 0.86 * smoothstep(ramp(u, 0.34, 1.0)));
    return {
      outGain: Math.cos(outPhase * Math.PI * 0.5),
      inGain: Math.sin(smoothstep(ramp(u, 0.0, 0.68)) * Math.PI * 0.5),
    };
  }

  const api = { analyzeTrackProfile, planAutoMix, equalPowerGains, tempoCompatibility };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LxAutoMix = api;
})(typeof window !== 'undefined' ? window : globalThis);
