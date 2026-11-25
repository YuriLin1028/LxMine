import React, { Component, Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  DEFAULT_CADENZA_TUNING,
  DEFAULT_LATENT_BACKGROUND_TUNING,
  DEFAULT_LUMIERE_TUNING,
  DEFAULT_MONET_TUNING,
  DEFAULT_SONNET_TUNING,
  DEFAULT_TEMPERA_TUNING,
  type AudioBands,
  type DualTheme,
  type Line,
  type Theme,
  type VisualizerBackgroundMode,
} from '../types';
import type { VisualizerSharedProps } from '../components/visualizer/definition';
import VisualizerBackgroundRenderer from '../components/visualizer/backgrounds/VisualizerBackgroundRenderer';
import { PlayerBottomBarLayoutContext } from '../components/floating-player/PlayerBottomBarLayoutContext';
import { playerBottomBarLiveOffset } from '../stores/motionSignals';
import { generateBuiltinDualTheme } from '../utils/builtinTheme/generateBuiltinDualTheme';
import { extractColors } from '../utils/colorExtractor';
import { LXMINE_UNIFIED_FONT_STACK } from '../utils/fontStacks';
import { loadPixi } from '../components/visualizer/loadPixi';
import '../index.css';
import './stage.css';

const LATENT_MESH_ONLY_TUNING = {
  ...DEFAULT_LATENT_BACKGROUND_TUNING,
  displayMode: 'mesh' as const,
};

void i18next.use(initReactI18next).init({
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  resources: {
    'zh-CN': {
      translation: {
        ui: {
          noLyrics: '',
          lyricsNotFound: '',
          instrumental: '',
          waitingForMusic: '',
          noTrack: '',
        },
        common: {
          reset: '重置',
        },
      },
    },
  },
  interpolation: { escapeValue: false },
});

const loaders = {
  partita: () => import('../components/visualizer/partita/VisualizerPartita'),
  pendolo: () => import('../components/visualizer/pendolo/VisualizerPendolo'),
  diorama: () => import('../components/visualizer/diorama/VisualizerDiorama'),
  fume: () => import('../components/visualizer/fume/VisualizerFume'),
  sonnet: () => import('../components/visualizer/sonnet/VisualizerSonnet'),
  tempera: () => import('../components/visualizer/tempera/VisualizerTempera'),
  lumiere: () => import('../components/visualizer/lumiere/VisualizerLumiere'),
  monet: () => import('../components/visualizer/monet/VisualizerMonet'),
  cadenza: () => import('../components/visualizer/cadenza/VisualizerCadenza'),
  claddagh: () => import('../components/visualizer/claddagh/VisualizerCladdagh'),
  tilt: () => import('../components/visualizer/tilt/VisualizerTilt'),
  classic: () => import('../components/visualizer/classic/Visualizer'),
  cappella: () => import('../components/visualizer/cappella/VisualizerCappella'),
} as const;

type FoliaStageModeKey = keyof typeof loaders;
type VisualizerComponentType = React.ComponentType<VisualizerSharedProps>;

const resolvedComponents: Partial<Record<FoliaStageModeKey, VisualizerComponentType>> = {};
const loadPromises: Partial<Record<FoliaStageModeKey, Promise<{ default: VisualizerComponentType }>>> = {};
let chunkWarmListeners: Array<() => void> = [];

function loadModeModule(id: FoliaStageModeKey): Promise<{ default: VisualizerComponentType }> {
  const existing = loadPromises[id];
  if (existing) return existing;
  const rawLoader = loaders[id] as () => Promise<{ default: VisualizerComponentType }>;
  const promise = rawLoader().then((mod) => {
    resolvedComponents[id] = mod.default;
    const notify = chunkWarmListeners;
    chunkWarmListeners = [];
    for (const fn of notify) fn();
    return mod;
  });
  loadPromises[id] = promise;
  return promise;
}

const modeComponents = Object.fromEntries(
  (Object.keys(loaders) as FoliaStageModeKey[]).map((id) => [
    id,
    lazy(() => loadModeModule(id)),
  ]),
) as Record<FoliaStageModeKey, React.LazyExoticComponent<VisualizerComponentType>>;

function scheduleIdleStep(work: () => void, fallbackDelayMs: number): void {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(work, { timeout: fallbackDelayMs + 180 });
  } else {
    window.setTimeout(work, fallbackDelayMs);
  }
}

function prewarmAllFoliaChunks(): void {
  // Warm chunks lazily only when the stage is hidden and the browser is idle,
  // avoiding JS parse/compile jank while the user is actively viewing a song or switching tracks.
  const keys = Object.keys(loaders) as FoliaStageModeKey[];
  let cursor = 0;
  const pump = () => {
    if (presentationState.visible || isWallpaperHost) {
      window.setTimeout(() => scheduleIdleStep(pump, 1500), 2200);
      return;
    }
    while (cursor < keys.length && resolvedComponents[keys[cursor]]) cursor += 1;
    if (cursor >= keys.length) return;
    const key = keys[cursor++];
    void loadModeModule(key).catch(() => {}).finally(() => {
      if (cursor < keys.length) {
        window.setTimeout(() => scheduleIdleStep(pump, 600), 500);
      }
    });
  };
  window.setTimeout(() => scheduleIdleStep(pump, 2500), 3200);
}
prewarmAllFoliaChunks();

function resolveFoliaMode(rawMode?: string): FoliaStageModeKey {
  const clean = String(rawMode || '').replace(/^folia-/, '').trim().toLowerCase();
  if (clean && clean in loaders) return clean as FoliaStageModeKey;
  return 'partita';
}

function defaultBackgroundForMode(mode: FoliaStageModeKey): VisualizerBackgroundMode {
  if (mode === 'monet') return 'monet';
  return 'latent';
}

interface StageLyricWord {
  text?: string;
  timeMs?: number;
  startTimeMs?: number;
  durationMs?: number;
  endTimeMs?: number;
}

interface StageLyricLine {
  timeMs: number;
  text: string;
  translation?: string;
  words?: StageLyricWord[];
}

interface StageMetadata {
  id?: string;
  audioUrl?: string;
  nativeSpectrum?: boolean;
  mode?: string;
  appearance?: string;
  lines?: StageLyricLine[];
  translationLines?: { timeMs: number; text: string }[];
  lyricColorMode?: string;
  lyricColors?: { primary?: string; secondary?: string; highlight?: string; glow?: string };
  name?: string;
  singer?: string;
  cover?: string;
  bgImage?: string;
  bgOpacity?: number;
  wallpaperBgOpacity?: number;
  wallpaperOverallOpacity?: number;
  duration?: number;
  lyricOffset?: number;
  lyricScale?: number;
  lyricLineSpacing?: number;
  lyricMaxLines?: number;
  topInset?: number;
  bottomInset?: number;
  positionMs?: number;
  playing?: boolean;
}

interface StageClock {
  positionMs: number;
  playing: boolean;
}

interface StagePresentation {
  visible?: boolean;
  detail?: boolean;
}

interface StageSpectrum {
  frequency?: string;
  waveform?: string;
  sampleRate?: number;
  positionMs?: number;
}

interface NativeBridge {
  ready?: () => void;
  visualReady?: () => void;
  degraded?: () => void;
  seek?: (ms: number) => void;
  immersive?: (show: string) => void;
}

declare global {
  interface Window {
    __lxmineNative?: NativeBridge;
    __lxmineStagePresentation?: { visible: boolean; detail: boolean };
    lxmineStage?: {
      metadata: (data: StageMetadata) => void;
      clock: (data: StageClock) => void;
      spectrum: (data: StageSpectrum) => void;
      presentation: (state: StagePresentation) => void;
      setBackground: (data: { bgImage?: string; bgOpacity?: number; wallpaperBgOpacity?: number; wallpaperOverallOpacity?: number }) => void;
      setInsets?: (insets: { topInset?: number; bottomInset?: number }) => void;
      vocalCancel: (state: { active?: boolean; vocalGain?: number }) => void;
      diagnostics: () => Record<string, unknown>;
    };
  }
}

const isWallpaperHost = typeof location !== 'undefined' && location.search.indexOf('wallpaper=1') >= 0;
if (isWallpaperHost) {
  document.documentElement.classList.add('wallpaper-host');
}

const currentTimeMV = motionValue(0);
const audioPowerMV = motionValue(0);
const audioBandsMV: AudioBands = {
  bass: motionValue(0),
  lowMid: motionValue(0),
  mid: motionValue(0),
  vocal: motionValue(0),
  treble: motionValue(0),
};

// Clock & presentation state
let anchorMs = 0;
let anchorAt = performance.now();
let clockRate = 1;
let clockRateUntil = 0;
let clockPlaying = false;
let lyricOffsetMs = 0;
let trackDurationMs = 0;
let frameCount = 0;
let visualReadySignaled = false;
const runtimeErrors: string[] = [];
// Folia visualizers have React commit + entrance/spring latency (~100-180ms vs classic canvas);
// apply a small calibrated lead so syllable sweep & line transitions lock onto audio vocals.
const FOLIA_VISUAL_LEAD_MS = 120;
const paletteExtractCache = new Map<string, string[]>();

const presentationState = {
  visible: isWallpaperHost,
  detail: isWallpaperHost,
};
window.__lxmineStagePresentation = presentationState;

// Spectrum state (native PCM or WebAudio Analyser)
const nativeSpectrumState = {
  enabled: false,
  receivedAt: 0,
  frequency: new Uint8Array(1024),
  sampleRate: 44100,
};

const vocalCancelState = { active: false, vocalGain: 1.0 };
let analysisAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let freqScratch: Uint8Array<ArrayBuffer> | null = null;
let mediaSourceNode: MediaElementAudioSourceNode | null = null;
let audioSyncTimer: number | null = null;
let vocalNodes: {
  midVocalDirect: GainNode;
  midLowPreserve: GainNode;
  midVocalBoostEq: BiquadFilterNode;
  sideVocalNotch: BiquadFilterNode;
  sidePreserve: GainNode;
  outGain: GainNode;
} | null = null;
let currentAudioUrl = '';

function currentPositionSec(): number {
  const now = performance.now();
  let rawMs = anchorMs;
  if (clockPlaying) {
    if (clockRate !== 1 && clockRateUntil > 0 && now >= clockRateUntil) {
      // Bounded rate window elapsed: fold caught-up position and return strictly to 1.0x
      // so long gaps between host syncs can NEVER drift or lag behind audio.
      anchorMs = anchorMs + (clockRateUntil - anchorAt) * clockRate;
      anchorAt = clockRateUntil;
      clockRate = 1;
      clockRateUntil = 0;
    }
    rawMs = anchorMs + (now - anchorAt) * clockRate;
  }
  const clampedMs = trackDurationMs > 0 ? Math.min(trackDurationMs, Math.max(0, rawMs)) : Math.max(0, rawMs);
  return clampedMs / 1000;
}

function applyClockSample(incomingMsRaw: number, nextPlaying: boolean, snapImmediate: boolean = false): void {
  const now = performance.now();
  const currentMs = currentPositionSec() * 1000;
  const incomingMs = Math.max(0, Number(incomingMsRaw || 0));
  const diffMs = incomingMs - currentMs;

  if (!snapImmediate && clockPlaying && nextPlaying) {
    if (Math.abs(diffMs) > 450 || anchorAt <= 0) {
      anchorMs = incomingMs;
      anchorAt = now;
      clockRate = 1;
      clockRateUntil = 0;
      lastPushedSec = -1;
    } else if (Math.abs(diffMs) < 18) {
      // Negligible jitter: stay at exact 1.0x
      anchorMs = currentMs;
      anchorAt = now;
      clockRate = 1;
      clockRateUntil = 0;
    } else {
      // Time-windowed convergence: smoothly absorb drift over catchupMs, then lock back to 1.0x.
      const catchupMs = Math.min(850, Math.max(220, Math.abs(diffMs) * 2.4));
      const rate = Math.max(0.90, Math.min(1.10, 1 + diffMs / catchupMs));
      const actualWindowMs = Math.abs(rate - 1) > 0.0005 ? Math.min(1200, Math.abs(diffMs / (rate - 1))) : 0;
      anchorMs = currentMs;
      anchorAt = now;
      clockRate = rate;
      clockRateUntil = actualWindowMs > 0 ? now + actualWindowMs : 0;
    }
  } else if (!snapImmediate && clockPlaying && !nextPlaying) {
    anchorMs = Math.abs(diffMs) < 400 ? currentMs : incomingMs;
    anchorAt = now;
    clockRate = 1;
    clockRateUntil = 0;
    lastPushedSec = -1;
  } else {
    anchorMs = incomingMs;
    anchorAt = now;
    clockRate = 1;
    clockRateUntil = 0;
    lastPushedSec = -1;
  }

  if (clockPlaying !== nextPlaying) {
    clockPlaying = nextPlaying;
    scheduleAudioStreamSync(false);
  }
}

function makeSoftClipCurve(knee: number, ceiling: number): Float32Array<ArrayBuffer> {
  const n = 4096;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const span = ceiling - knee;
  for (let i = 0; i < n; i += 1) {
    const x = (i * 2) / (n - 1) - 1;
    const ax = Math.abs(x);
    if (ax <= knee) curve[i] = x;
    else {
      const y = knee + span * Math.tanh((ax - knee) / span);
      curve[i] = x < 0 ? -y : y;
    }
  }
  return curve;
}

function applyVocalCancelGains(): void {
  if (!vocalNodes || !audioCtx) return;
  const now = audioCtx.currentTime;
  const active = !!vocalCancelState.active;
  let v = Math.max(0, Math.min(1.5, Number(vocalCancelState.vocalGain)));
  if (!Number.isFinite(v)) v = 1.0;
  const suppress = Math.max(0, 1 - Math.min(1, v));
  const boost = Math.max(0, (v - 1.0) * 2.0);
  const midDirect = v <= 1.0 ? v * v : 1.0;
  const lowKeep = suppress * (1 + suppress * 0.12);
  const midBoostDb = boost * 5.2;
  const sideNotchDb = suppress > 0 ? -7.5 * suppress : -2.2 * boost;
  const sideGain = suppress > 0 ? 1.0 + suppress * 0.42 : 1.0 - boost * 0.34;
  const trim = 1.0 / (1.0 + boost * 0.24);
  vocalNodes.midVocalDirect.gain.setTargetAtTime(midDirect, now, 0.025);
  vocalNodes.midLowPreserve.gain.setTargetAtTime(lowKeep, now, 0.025);
  vocalNodes.midVocalBoostEq.gain.setTargetAtTime(midBoostDb, now, 0.025);
  vocalNodes.sideVocalNotch.gain.setTargetAtTime(sideNotchDb, now, 0.025);
  vocalNodes.sidePreserve.gain.setTargetAtTime(sideGain, now, 0.025);
  vocalNodes.outGain.gain.setTargetAtTime(active ? trim : 0.0, now, 0.025);
}

function ensureAudioGraph(): void {
  if (audioCtx || !analysisAudio) return;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx = new Ctor();
    mediaSourceNode = audioCtx.createMediaElementSource(analysisAudio);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 1024;
    analyserNode.smoothingTimeConstant = 0.72;
    freqScratch = new Uint8Array(new ArrayBuffer(analyserNode.frequencyBinCount));
    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    mediaSourceNode.connect(analyserNode);
    analyserNode.connect(silentGain);
    silentGain.connect(audioCtx.destination);
  } catch (err) {
    console.warn('[FoliaStage] audio analysis unavailable:', err);
  }
}

function ensureVocalCancelChain(): void {
  if (vocalNodes || !audioCtx || !mediaSourceNode) return;
  try {
    // HarmonyOS vocal cancel M/S DSP chain (lazily constructed ONLY when vocal cancel is enabled,
    // avoiding a 2x-oversampled WaveShaper + DynamicsCompressor + 6 biquads during normal playback).
    const vcSplit = audioCtx.createChannelSplitter(2);
    const vcMerge = audioCtx.createChannelMerger(2);
    const lToMid = audioCtx.createGain(); lToMid.gain.value = 0.5;
    const rToMid = audioCtx.createGain(); rToMid.gain.value = 0.5;
    const lToSide = audioCtx.createGain(); lToSide.gain.value = 0.5;
    const rToSide = audioCtx.createGain(); rToSide.gain.value = -0.5;
    const midBus = audioCtx.createGain(); midBus.gain.value = 1.0;
    const sideBus = audioCtx.createGain(); sideBus.gain.value = 1.0;
    const midVocalDirect = audioCtx.createGain(); midVocalDirect.gain.value = 1.0;
    const midVocalBoostEq = audioCtx.createBiquadFilter(); midVocalBoostEq.type = 'peaking'; midVocalBoostEq.frequency.value = 1650; midVocalBoostEq.Q.value = 0.72; midVocalBoostEq.gain.value = 0.0;
    const midLowLp1 = audioCtx.createBiquadFilter(); midLowLp1.type = 'lowpass'; midLowLp1.frequency.value = 148; midLowLp1.Q.value = 0.707;
    const midLowLp2 = audioCtx.createBiquadFilter(); midLowLp2.type = 'lowpass'; midLowLp2.frequency.value = 148; midLowLp2.Q.value = 0.707;
    const midLowPreserve = audioCtx.createGain(); midLowPreserve.gain.value = 0.0;
    const midOut = audioCtx.createGain(); midOut.gain.value = 1.0;
    const sideVocalNotch = audioCtx.createBiquadFilter(); sideVocalNotch.type = 'peaking'; sideVocalNotch.frequency.value = 1550; sideVocalNotch.Q.value = 0.52; sideVocalNotch.gain.value = 0.0;
    const sidePreserve = audioCtx.createGain(); sidePreserve.gain.value = 1.0;
    const sideInvert = audioCtx.createGain(); sideInvert.gain.value = -1.0;
    const outGain = audioCtx.createGain(); outGain.gain.value = 0.0;
    const shaper = audioCtx.createWaveShaper(); shaper.curve = makeSoftClipCurve(0.72, 0.94); shaper.oversample = '2x';
    const limiter = audioCtx.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.knee.value = 14; limiter.ratio.value = 6; limiter.attack.value = 0.002; limiter.release.value = 0.08;
    mediaSourceNode.connect(vcSplit);
    vcSplit.connect(lToMid, 0); vcSplit.connect(rToMid, 1);
    vcSplit.connect(lToSide, 0); vcSplit.connect(rToSide, 1);
    lToMid.connect(midBus); rToMid.connect(midBus);
    lToSide.connect(sideBus); rToSide.connect(sideBus);
    midBus.connect(midVocalDirect); midVocalDirect.connect(midVocalBoostEq); midVocalBoostEq.connect(midOut);
    midBus.connect(midLowLp1); midLowLp1.connect(midLowLp2); midLowLp2.connect(midLowPreserve); midLowPreserve.connect(midOut);
    sideBus.connect(sideVocalNotch); sideVocalNotch.connect(sidePreserve);
    sidePreserve.connect(sideInvert);
    midOut.connect(vcMerge, 0, 0); sidePreserve.connect(vcMerge, 0, 0);
    midOut.connect(vcMerge, 0, 1); sideInvert.connect(vcMerge, 0, 1);
    vcMerge.connect(outGain); outGain.connect(limiter); limiter.connect(shaper); shaper.connect(audioCtx.destination);
    vocalNodes = { midVocalDirect, midLowPreserve, midVocalBoostEq, sideVocalNotch, sidePreserve, outGain };
    applyVocalCancelGains();
  } catch (err) {
    console.warn('[FoliaStage] vocal cancel chain unavailable:', err);
  }
}

function scheduleAudioStreamSync(immediate = false): void {
  if (audioSyncTimer !== null) {
    window.clearTimeout(audioSyncTimer);
    audioSyncTimer = null;
  }
  if (immediate || vocalCancelState.active || !clockPlaying) {
    syncAudioStream();
    return;
  }
  // Defer secondary analysis stream resume off the Play click frame so animations stay at VSync.
  audioSyncTimer = window.setTimeout(() => {
    audioSyncTimer = null;
    syncAudioStream();
  }, 150);
}

function syncAudioStream(): void {
  if (nativeSpectrumState.enabled && !vocalCancelState.active) {
    if (analysisAudio) {
      analysisAudio.pause();
      if (analysisAudio.getAttribute('src')) {
        analysisAudio.removeAttribute('src');
        analysisAudio.load();
      }
    }
    return;
  }
  const needStream = vocalCancelState.active
    ? !!currentAudioUrl && clockPlaying
    : presentationState.visible && presentationState.detail && !!currentAudioUrl && clockPlaying;

  if (!needStream) {
    if (analysisAudio) {
      analysisAudio.pause();
      if (!vocalCancelState.active && (!presentationState.visible || !presentationState.detail) && analysisAudio.getAttribute('src')) {
        analysisAudio.removeAttribute('src');
        analysisAudio.load();
      }
    }
    // Only suspend AudioContext when leaving the detail stage — never on brief play/pause toggles,
    // which otherwise trigger a 100-300ms WASAPI/CoreAudio device release & re-acquire hitch.
    if (audioCtx && audioCtx.state === 'running' && !vocalCancelState.active && (!presentationState.visible || !presentationState.detail)) {
      audioCtx.suspend().catch(() => {});
    }
    return;
  }

  if (!analysisAudio) {
    analysisAudio = new Audio();
    analysisAudio.crossOrigin = 'anonymous';
    analysisAudio.preload = 'auto';
    analysisAudio.addEventListener('loadedmetadata', () => syncAudioStream());
  }
  if (analysisAudio.getAttribute('src') !== currentAudioUrl) {
    analysisAudio.src = currentAudioUrl;
    analysisAudio.load();
  }
  ensureAudioGraph();
  if (vocalCancelState.active) {
    ensureVocalCancelChain();
    applyVocalCancelGains();
  } else if (vocalNodes) {
    applyVocalCancelGains();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  const pos = currentPositionSec();
  const driftLimit = vocalCancelState.active ? 0.35 : 1.25;
  if (Math.abs((analysisAudio.currentTime || 0) - pos) > driftLimit && analysisAudio.readyState >= 1) {
    try { analysisAudio.currentTime = pos; } catch (_) {}
  }
  if (analysisAudio.paused) {
    analysisAudio.play().catch(() => {});
  }
}

const smoothedBands = { bass: 0, lowMid: 0, mid: 0, vocal: 0, treble: 0, power: 0 };
let bandsSettled = true;
let lastPushedSec = -1;

function updateBandsFromFft(bins: Uint8Array, sampleRate: number): void {
  const binCount = bins.length;
  if (!binCount) return;
  bandsSettled = false;
  const nyquist = sampleRate * 0.5;
  const avgRange255 = (hzLo: number, hzHi: number): number => {
    const start = Math.max(0, Math.floor((hzLo / nyquist) * binCount));
    const end = Math.min(binCount - 1, Math.max(start, Math.ceil((hzHi / nyquist) * binCount)));
    let sum = 0;
    let count = 0;
    for (let i = start; i <= end; i += 1) {
      sum += bins[i];
      count += 1;
    }
    return count > 0 ? sum / count : 0;
  };
  const bass = avgRange255(25, 160);
  const lowMid = avgRange255(160, 480);
  const mid = avgRange255(480, 1400);
  const vocal = avgRange255(1400, 3600);
  const treble = avgRange255(3600, 11000);
  const power = Math.min(255, bass * 0.34 + lowMid * 0.22 + mid * 0.18 + vocal * 0.16 + treble * 0.14);

  const smooth = (prev: number, next: number) => prev + (next - prev) * (next > prev ? 0.18 : 0.09);
  smoothedBands.bass = smooth(smoothedBands.bass, bass);
  smoothedBands.lowMid = smooth(smoothedBands.lowMid, lowMid);
  smoothedBands.mid = smooth(smoothedBands.mid, mid);
  smoothedBands.vocal = smooth(smoothedBands.vocal, vocal);
  smoothedBands.treble = smooth(smoothedBands.treble, treble);
  smoothedBands.power = smooth(smoothedBands.power, power);

  audioBandsMV.bass.set(smoothedBands.bass);
  audioBandsMV.lowMid.set(smoothedBands.lowMid);
  audioBandsMV.mid.set(smoothedBands.mid);
  audioBandsMV.vocal.set(smoothedBands.vocal);
  audioBandsMV.treble.set(smoothedBands.treble);
  audioPowerMV.set(smoothedBands.power);
}

function decayAudioBands(): void {
  if (bandsSettled) return;
  smoothedBands.bass *= 0.91;
  smoothedBands.lowMid *= 0.91;
  smoothedBands.mid *= 0.91;
  smoothedBands.vocal *= 0.91;
  smoothedBands.treble *= 0.91;
  smoothedBands.power *= 0.91;
  const peak = Math.max(
    smoothedBands.bass,
    smoothedBands.lowMid,
    smoothedBands.mid,
    smoothedBands.vocal,
    smoothedBands.treble,
    smoothedBands.power,
  );
  if (peak < 0.25) {
    smoothedBands.bass = 0;
    smoothedBands.lowMid = 0;
    smoothedBands.mid = 0;
    smoothedBands.vocal = 0;
    smoothedBands.treble = 0;
    smoothedBands.power = 0;
    bandsSettled = true;
  }
  audioBandsMV.bass.set(smoothedBands.bass);
  audioBandsMV.lowMid.set(smoothedBands.lowMid);
  audioBandsMV.mid.set(smoothedBands.mid);
  audioBandsMV.vocal.set(smoothedBands.vocal);
  audioBandsMV.treble.set(smoothedBands.treble);
  audioPowerMV.set(smoothedBands.power);
}

function notifyHost(kind: 'ready' | 'visualReady'): void {
  try {
    if (kind === 'ready') window.__lxmineNative?.ready?.();
    else window.__lxmineNative?.visualReady?.();
  } catch (_) {}
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: kind === 'ready' ? 'lxmine-stage-ready' : 'lxmine-stage-visual-ready' },
        location.origin,
      );
    }
  } catch (_) {}
}

function signalVisualReadySoon(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      visualReadySignaled = true;
      notifyHost('visualReady');
    });
  });
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seedStr: string): () => number {
  let s = hashSeed(seedStr) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let wordSegmenter: Intl.Segmenter | null = null;
let graphemeSegmenter: Intl.Segmenter | null = null;

function splitGraphemes(text: string): string[] {
  const s = String(text || '');
  if (!s) return [];
  try {
    if (!graphemeSegmenter && typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      graphemeSegmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
    }
    if (graphemeSegmenter) {
      return Array.from(graphemeSegmenter.segment(s), seg => seg.segment);
    }
  } catch (_) {}
  return Array.from(s);
}

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;

function splitNaturalWordChunks(text: string): string[] {
  const clean = String(text || '').trim();
  if (!clean) return [];
  const rawTokens: string[] = [];
  try {
    if (!wordSegmenter && typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      wordSegmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
    }
    if (wordSegmenter) {
      for (const seg of wordSegmenter.segment(clean)) {
        if (seg.segment) rawTokens.push(seg.segment);
      }
    }
  } catch (_) {}
  if (!rawTokens.length) {
    rawTokens.push(...clean.split(/(\s+)/).filter(Boolean));
  }
  // Merge trailing spaces onto the previous token and split overly long CJK chunks (max 3 graphemes)
  // so every line supports smooth per-word karaoke AND clean multi-line wrapping on portrait screens.
  const chunks: string[] = [];
  for (const token of rawTokens) {
    if (/^\s+$/.test(token)) {
      if (chunks.length > 0) chunks[chunks.length - 1] += token;
      continue;
    }
    const graphemes = splitGraphemes(token);
    if (CJK_RE.test(token) && graphemes.length > 3) {
      for (let i = 0; i < graphemes.length; i += 2) {
        chunks.push(graphemes.slice(i, i + 2).join(''));
      }
    } else {
      chunks.push(token);
    }
  }
  return chunks.length ? chunks : [clean];
}

function isPlaceholderLyric(text: string): boolean {
  const s = String(text || '').trim();
  return !s || /^[/\\\-—–_~·•\s]+$/.test(s);
}

function parseHexRgb(hex?: string): [number, number, number] | null {
  const clean = String(hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(clean)) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clampByte(r), clampByte(g), clampByte(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function mixHexColor(hexA: string, hexB: string, ratio: number): string {
  const a = parseHexRgb(hexA);
  const b = parseHexRgb(hexB);
  if (!a || !b) return hexA || hexB || '#7dd3fc';
  const t = Math.max(0, Math.min(1, ratio));
  return rgbToHex(
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t,
  );
}

function adaptLyricHex(hex: string | undefined, isDaylight: boolean, floorOrCeiling: number, fallback: string): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return fallback;
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  if (!isDaylight) {
    if (lum < floorOrCeiling) {
      const lift = floorOrCeiling - lum;
      return rgbToHex((r + lift) * 255, (g + lift) * 255, (b + lift) * 255);
    }
    return rgbToHex(rgb[0], rgb[1], rgb[2]);
  }
  if (lum > floorOrCeiling) {
    const scale = floorOrCeiling / Math.max(0.01, lum);
    return rgbToHex(rgb[0] * scale, rgb[1] * scale, rgb[2] * scale);
  }
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

function convertLines(data: StageMetadata): Line[] {
  const rawLines = Array.isArray(data.lines) ? data.lines : [];
  const rawTrans = Array.isArray(data.translationLines) ? data.translationLines : [];
  const durationSec = Number(data.duration || 0) > 0 ? Number(data.duration) / 1000 : 0;

  const filtered = rawLines.filter(line => line && !isPlaceholderLyric(line.text));
  return filtered.map((line, idx) => {
    const startSec = Math.max(0, Number(line.timeMs || 0) / 1000);
    const nextStartSec = idx + 1 < filtered.length
      ? Math.max(startSec + 0.15, Number(filtered[idx + 1].timeMs || 0) / 1000)
      : Math.max(startSec + 4.0, durationSec > startSec + 0.5 ? durationSec : startSec + 4.0);
    const endSec = Math.max(startSec + 0.2, nextStartSec);
    const fullText = String(line.text || '').trim();

    let translation = typeof line.translation === 'string' ? line.translation.trim() : '';
    if (!translation && rawTrans.length) {
      let bestDiff = 681;
      for (const tr of rawTrans) {
        const diff = Math.abs(Number(tr.timeMs || 0) - Number(line.timeMs || 0));
        if (diff < bestDiff) {
          bestDiff = diff;
          translation = String(tr.text || '').trim();
        }
      }
    }

    const rawWords = Array.isArray(line.words) ? line.words : [];
    let words: Line['words'];
    let isWordByWord = false;
    if (rawWords.length > 1) {
      isWordByWord = true;
      words = rawWords.map((w, wi) => {
        const wStart = Math.max(startSec, Number(w.timeMs ?? w.startTimeMs ?? line.timeMs) / 1000);
        const wDur = Number(w.durationMs ?? 0) / 1000;
        const wEnd = w.endTimeMs != null
          ? Math.max(wStart + 0.04, Number(w.endTimeMs) / 1000)
          : wDur > 0
            ? wStart + wDur
            : wi + 1 < rawWords.length
              ? Math.max(wStart + 0.04, Number(rawWords[wi + 1].timeMs ?? rawWords[wi + 1].startTimeMs ?? line.timeMs) / 1000)
              : endSec;
        return { text: String(w.text || ''), startTime: wStart, endTime: Math.min(endSec, Math.max(wStart + 0.04, wEnd)) };
      });
    } else {
      // Synthesize smooth per-word timings matching LxMineLyrics (plain-stage & MineRadio)
      // so non-YRC LRC songs also enjoy unified word-by-word sweep and portrait multi-line wrapping.
      const chunks = splitNaturalWordChunks(fullText);
      const lineSpan = Math.max(0.25, endSec - startSec);
      const singSpan = Math.min(lineSpan, Math.max(0.25, lineSpan * 0.88));
      const weights = chunks.map(c => Math.max(1, splitGraphemes(c.trim()).length));
      const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
      let cursor = startSec;
      isWordByWord = chunks.length > 1;
      words = chunks.map((chunk, ci) => {
        const dur = (weights[ci] / totalWeight) * singSpan;
        const wStart = cursor;
        const wEnd = ci === chunks.length - 1 ? startSec + singSpan : Math.min(endSec, wStart + Math.max(0.04, dur));
        cursor = wEnd;
        return { text: chunk, startTime: wStart, endTime: Math.max(wStart + 0.04, wEnd) };
      });
    }

    const autoWordSegments = words.length > 1 ? words.map(w => w.text) : undefined;
    return {
      id: `${idx}:${line.timeMs}`,
      startTime: startSec,
      endTime: endSec,
      fullText,
      translation: translation || undefined,
      words,
      isWordByWord,
      autoWordSegments,
    };
  });
}

function resolveCoverProxyUrl(raw?: string): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('/api/cover')) return value;
  try {
    const parsed = new URL(value, location.href);
    if (parsed.origin === location.origin) return parsed.href;
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:') {
      return `${location.origin}/api/cover?url=${encodeURIComponent(parsed.href)}`;
    }
  } catch (_) {}
  return value;
}

class ModeErrorBoundary extends Component<
  { modeKey: string; fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    runtimeErrors.push(String(error?.message || error));
    console.error('[FoliaStage] mode render error:', error);
  }
  componentDidUpdate(prevProps: { modeKey: string }) {
    if (prevProps.modeKey !== this.props.modeKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// Two-finger vertical swipe for immersive chrome toggle (matches mine-stage-gestures.js)
function bindTwoFingerImmersiveGesture(): void {
  let multiple = false;
  let committed = false;
  let startY = 0;
  let lastY = 0;
  let startDist = 0;
  let lastDist = 0;
  const centerY = (touches: TouchList) => (touches[0].clientY + touches[1].clientY) * 0.5;
  const touchDist = (touches: TouchList) => Math.hypot(
    (touches[0].clientX || 0) - (touches[1].clientX || 0),
    (touches[0].clientY || 0) - (touches[1].clientY || 0),
  );
  const reset = () => {
    multiple = false;
    committed = false;
    startY = lastY = startDist = lastDist = 0;
  };
  document.addEventListener('touchstart', (event) => {
    if (!presentationState.visible || !presentationState.detail) { reset(); return; }
    if (event.touches.length >= 2 && !multiple) {
      multiple = true;
      committed = false;
      startY = lastY = centerY(event.touches);
      startDist = lastDist = touchDist(event.touches);
    }
    if (multiple) event.preventDefault();
  }, { passive: false, capture: true });
  document.addEventListener('touchmove', (event) => {
    if (!multiple) return;
    event.preventDefault();
    if (event.touches.length >= 2) {
      lastY = centerY(event.touches);
      lastDist = touchDist(event.touches);
    }
  }, { passive: false, capture: true });
  const finish = (event: TouchEvent) => {
    if (event.type === 'touchcancel' || !presentationState.visible || !presentationState.detail) { reset(); return; }
    if (!multiple) return;
    event.preventDefault();
    if (!committed && event.touches.length < 2) {
      committed = true;
      const pinched = Math.abs(lastDist - startDist) > 18;
      if (!pinched && Math.abs(lastY - startY) > 36) {
        try { window.__lxmineNative?.immersive?.(lastY < startY ? '1' : '0'); } catch (_) {}
      }
    }
    if (!event.touches.length) multiple = false;
  };
  document.addEventListener('touchend', finish, { passive: false, capture: true });
  document.addEventListener('touchcancel', finish, { passive: false, capture: true });
}
bindTwoFingerImmersiveGesture();

const initialUrlMode = (() => {
  try {
    return new URLSearchParams(location.search).get('mode') || '';
  } catch (_) {
    return '';
  }
})();
if (initialUrlMode) {
  void loadModeModule(resolveFoliaMode(initialUrlMode)).catch(() => {});
}

// React bridge hooks
let setStageMeta: ((data: StageMetadata) => void) | null = null;
let setStageVisible: ((visible: boolean) => void) | null = null;
const TRANSPARENT_BG = { transparent: true } as const;
let latestMeta: StageMetadata = {
  mode: initialUrlMode,
  appearance: 'dark',
  lines: [],
  name: '',
  singer: '',
  cover: '',
  bgImage: '',
  bgOpacity: 0.78,
  wallpaperBgOpacity: 0.42,
  wallpaperOverallOpacity: 0.95,
  duration: 0,
  lyricOffset: 0,
  lyricScale: 1,
  lyricLineSpacing: 1.2,
  lyricMaxLines: 0,
};
let metaRevision = 0;
let currentSongId = '';
let lastLinesSig = '';
let lastTransSig = '';

function linesSignature(lines?: StageLyricLine[]): string {
  if (!Array.isArray(lines) || !lines.length) return '0';
  const first = lines[0];
  const mid = lines[lines.length >> 1];
  const last = lines[lines.length - 1];
  return [
    lines.length,
    first?.timeMs ?? 0, first?.text ?? '', first?.words?.length ?? 0,
    mid?.timeMs ?? 0, mid?.text ?? '', mid?.words?.length ?? 0,
    last?.timeMs ?? 0, last?.text ?? '', last?.words?.length ?? 0,
  ].join('|');
}

function transSignature(lines?: { timeMs: number; text: string }[]): string {
  if (!Array.isArray(lines) || !lines.length) return '0';
  const first = lines[0];
  const last = lines[lines.length - 1];
  return `${lines.length}|${first?.timeMs ?? 0}|${first?.text ?? ''}|${last?.timeMs ?? 0}|${last?.text ?? ''}`;
}

function applyWallpaperCssVars(data: { wallpaperBgOpacity?: number; wallpaperOverallOpacity?: number }): void {
  const rootEl = document.documentElement;
  if (!rootEl) return;
  if (data.wallpaperBgOpacity != null && Number.isFinite(Number(data.wallpaperBgOpacity))) {
    rootEl.style.setProperty('--wp-bg-opacity', String(Math.max(0, Math.min(1, Number(data.wallpaperBgOpacity)))));
  }
  if (data.wallpaperOverallOpacity != null && Number.isFinite(Number(data.wallpaperOverallOpacity))) {
    rootEl.style.setProperty('--wp-overall-opacity', String(Math.max(0.2, Math.min(1, Number(data.wallpaperOverallOpacity)))));
  }
}

window.lxmineStage = {
  metadata(data) {
    if (!data) return;
    const rev = ++metaRevision;
    if (data.nativeSpectrum === true) {
      nativeSpectrumState.enabled = true;
    }
    const nextAudio = String(data.audioUrl || '');
    if (nextAudio !== currentAudioUrl) {
      currentAudioUrl = nextAudio;
      scheduleAudioStreamSync(false);
    }
    const nextId = data.id ? String(data.id) : currentSongId;
    const songChanged = Boolean(nextId && nextId !== currentSongId);
    if (songChanged) {
      currentSongId = nextId;
    }
    lyricOffsetMs = Number(data.lyricOffset || 0);
    trackDurationMs = Number(data.duration || 0);
    if (data.positionMs != null && Number.isFinite(Number(data.positionMs))) {
      applyClockSample(
        Number(data.positionMs),
        data.playing != null ? !!data.playing : clockPlaying,
        songChanged,
      );
    } else if (songChanged) {
      anchorMs = 0;
      anchorAt = performance.now();
      clockRate = 1;
      clockRateUntil = 0;
      lastPushedSec = -1;
    } else if (data.playing != null && clockPlaying !== !!data.playing) {
      applyClockSample(currentPositionSec() * 1000, !!data.playing, false);
    }
    applyWallpaperCssVars(data);

    // Preserve identical line/translation array references across non-lyric metadata updates
    // (cover arrival, duration, audioUrl) so convertLines/Intl.Segmenter & visualizers don't rebuild.
    let nextLines = data.lines;
    if (data.lines !== undefined) {
      const sig = linesSignature(data.lines);
      if (!songChanged && sig === lastLinesSig && latestMeta.lines !== undefined) {
        nextLines = latestMeta.lines;
      } else {
        lastLinesSig = sig;
      }
    }
    let nextTrans = data.translationLines;
    if (data.translationLines !== undefined) {
      const tsig = transSignature(data.translationLines);
      if (!songChanged && tsig === lastTransSig && latestMeta.translationLines !== undefined) {
        nextTrans = latestMeta.translationLines;
      } else {
        lastTransSig = tsig;
      }
    }

    const nextModeRaw = data.mode || latestMeta.mode || 'folia-partita';
    const nextMode = resolveFoliaMode(nextModeRaw);

    const commit = () => {
      if (rev !== metaRevision) return;
      latestMeta = {
        ...latestMeta,
        ...data,
        ...(nextLines !== undefined ? { lines: nextLines } : {}),
        ...(nextTrans !== undefined ? { translationLines: nextTrans } : {}),
        mode: nextModeRaw,
      };
      const bottomInset = Number(latestMeta.bottomInset || 0);
      playerBottomBarLiveOffset.set(Math.max(40, bottomInset > 0 ? bottomInset : 168));
      setStageMeta?.(latestMeta);
      ensureTickLoop();
      signalVisualReadySoon();
    };

    if (resolvedComponents[nextMode]) {
      commit();
    } else {
      void loadModeModule(nextMode).then(commit, commit);
    }
  },

  clock(data) {
    if (!data) return;
    applyClockSample(Number(data.positionMs || 0), !!data.playing, false);
    ensureTickLoop();
  },

  spectrum(data) {
    if (!data || !data.frequency) return;
    nativeSpectrumState.enabled = true;
    try {
      const bytes = atob(data.frequency);
      const len = Math.min(bytes.length, nativeSpectrumState.frequency.length);
      for (let i = 0; i < len; i += 1) {
        nativeSpectrumState.frequency[i] = bytes.charCodeAt(i);
      }
      nativeSpectrumState.sampleRate = Math.max(8000, Number(data.sampleRate) || 44100);
      nativeSpectrumState.receivedAt = performance.now();
    } catch (_) {}
  },

  presentation(state) {
    if (!state) return;
    const nextVisible = state.visible !== false;
    const nextDetail = state.detail === true;
    if (presentationState.visible === nextVisible && presentationState.detail === nextDetail) return;
    presentationState.visible = nextVisible;
    presentationState.detail = nextDetail;
    setStageVisible?.(nextVisible && nextDetail);
    syncAudioStream();
    if (nextVisible && nextDetail) {
      lastPushedSec = -1;
      ensureTickLoop();
      signalVisualReadySoon();
    } else if (!nextVisible && !isWallpaperHost && rafHandle) {
      cancelAnimationFrame(rafHandle);
      rafHandle = 0;
    }
  },

  setBackground(data) {
    if (!data) return;
    latestMeta = {
      ...latestMeta,
      ...(data.bgImage !== undefined ? { bgImage: data.bgImage } : {}),
      ...(data.bgOpacity !== undefined ? { bgOpacity: data.bgOpacity } : {}),
      ...(data.wallpaperBgOpacity !== undefined ? { wallpaperBgOpacity: data.wallpaperBgOpacity } : {}),
      ...(data.wallpaperOverallOpacity !== undefined ? { wallpaperOverallOpacity: data.wallpaperOverallOpacity } : {}),
    };
    applyWallpaperCssVars(data);
    startTransition(() => setStageMeta?.({ ...latestMeta }));
  },

  setInsets(insets) {
    if (!insets) return;
    latestMeta = {
      ...latestMeta,
      ...(insets.topInset !== undefined ? { topInset: insets.topInset } : {}),
      ...(insets.bottomInset !== undefined ? { bottomInset: insets.bottomInset } : {}),
    };
    const bottomInset = Number(latestMeta.bottomInset || 0);
    playerBottomBarLiveOffset.set(Math.max(24, bottomInset > 0 ? bottomInset : 168));
    startTransition(() => setStageMeta?.({ ...latestMeta }));
  },

  vocalCancel(state) {
    if (!state) return;
    vocalCancelState.active = !!state.active;
    if (state.vocalGain != null) {
      const g = Number(state.vocalGain);
      if (Number.isFinite(g)) vocalCancelState.vocalGain = Math.max(0, Math.min(1.5, g));
    }
    applyVocalCancelGains();
    syncAudioStream();
  },

  diagnostics() {
    const bgOp = Math.max(0, Math.min(1, latestMeta.bgOpacity != null ? Number(latestMeta.bgOpacity) : 0.78));
    const wpBgOp = Math.max(0, Math.min(1, latestMeta.wallpaperBgOpacity != null ? Number(latestMeta.wallpaperBgOpacity) : 0.42));
    return {
      ready: true,
      engine: 'folia',
      mode: resolveFoliaMode(latestMeta.mode),
      appearance: latestMeta.appearance || 'dark',
      fontFamily: LXMINE_UNIFIED_FONT_STACK,
      lines: latestMeta.lines?.length ?? 0,
      lyricScale: Math.max(0.55, Math.min(1.5, Number(latestMeta.lyricScale) || 1)),
      lyricLineSpacing: Math.max(0.85, Math.min(1.8, Number(latestMeta.lyricLineSpacing) || 1.2)),
      lyricMaxLines: Math.max(0, Math.min(10, Math.round(Number(latestMeta.lyricMaxLines) || 0))),
      lyricColorMode: latestMeta.lyricColorMode || '',
      lyricPrimary: latestMeta.lyricColors?.primary || '',
      lyricSecondary: latestMeta.lyricColors?.secondary || '',
      bgOpacity: bgOp,
      effectiveBgOpacity: isWallpaperHost ? wpBgOp : bgOp,
      hasCustomBg: Boolean(String(latestMeta.bgImage || '').trim()),
      hasAlbumCover: Boolean(String(latestMeta.cover || '').trim()),
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
      viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
      dpr: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
      time: currentTimeMV.get(),
      frames: frameCount,
      visible: presentationState.visible,
      detail: presentationState.detail,
      playing: clockPlaying,
      visualReady: visualReadySignaled,
      errors: runtimeErrors.slice(-8),
    };
  },
};

window.addEventListener('error', (event) => {
  runtimeErrors.push(String(event.message || 'error'));
  console.error('[FoliaStage]', event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  runtimeErrors.push(String(event.reason || 'rejection'));
  console.error('[FoliaStage]', event.reason);
});

// Master animation clock + spectrum pump (pauses rAF completely while hidden)
let rafHandle = 0;
function isTickActive(): boolean {
  return !document.hidden && (presentationState.visible || isWallpaperHost);
}
function ensureTickLoop(): void {
  if (!rafHandle && isTickActive()) {
    rafHandle = requestAnimationFrame(tickLoop);
  }
}
document.addEventListener('visibilitychange', () => {
  if (isTickActive()) ensureTickLoop();
  else if (rafHandle) { cancelAnimationFrame(rafHandle); rafHandle = 0; }
});
function tickLoop(): void {
  rafHandle = 0;
  if (!isTickActive()) return;
  rafHandle = requestAnimationFrame(tickLoop);

  frameCount += 1;
  const leadMs = clockPlaying ? FOLIA_VISUAL_LEAD_MS : 0;
  const nextSec = Math.max(0, currentPositionSec() + (lyricOffsetMs + leadMs) / 1000);
  if (Math.abs(nextSec - lastPushedSec) > 0.0005) {
    lastPushedSec = nextSec;
    currentTimeMV.set(nextSec);
  }

  if (!clockPlaying) {
    decayAudioBands();
    return;
  }

  if (nativeSpectrumState.enabled) {
    if (performance.now() - nativeSpectrumState.receivedAt < 450) {
      updateBandsFromFft(nativeSpectrumState.frequency, nativeSpectrumState.sampleRate);
    } else {
      decayAudioBands();
    }
  } else if (analyserNode && freqScratch && audioCtx && audioCtx.state === 'running') {
    analyserNode.getByteFrequencyData(freqScratch);
    updateBandsFromFft(freqScratch, audioCtx.sampleRate || 44100);
  } else {
    // Gentle rhythmic pulse fallback (0..255 Folia scale, smoothed) when audio analysis isn't active yet
    bandsSettled = false;
    const pulse = (0.20 + 0.11 * Math.sin(nextSec * 3.1) + 0.06 * Math.sin(nextSec * 6.4)) * 255;
    const slew = (prev: number, next: number) => prev + (next - prev) * 0.12;
    smoothedBands.power = slew(smoothedBands.power, Math.max(0, Math.min(255, pulse)));
    smoothedBands.bass = slew(smoothedBands.bass, Math.max(0, Math.min(255, pulse * 1.15)));
    smoothedBands.lowMid = slew(smoothedBands.lowMid, Math.max(0, Math.min(255, pulse * 0.95)));
    smoothedBands.mid = slew(smoothedBands.mid, Math.max(0, Math.min(255, pulse * 0.85)));
    smoothedBands.vocal = slew(smoothedBands.vocal, Math.max(0, Math.min(255, pulse * 0.78)));
    smoothedBands.treble = slew(smoothedBands.treble, Math.max(0, Math.min(255, pulse * 0.62)));
    audioPowerMV.set(smoothedBands.power);
    audioBandsMV.bass.set(smoothedBands.bass);
    audioBandsMV.lowMid.set(smoothedBands.lowMid);
    audioBandsMV.mid.set(smoothedBands.mid);
    audioBandsMV.vocal.set(smoothedBands.vocal);
    audioBandsMV.treble.set(smoothedBands.treble);
  }
}
ensureTickLoop();

const PIXI_INTERNAL_RESIZE_MODES = new Set<FoliaStageModeKey>(['lumiere', 'sonnet', 'tempera']);

function FoliaStageApp() {
  const [meta, setMeta] = useState<StageMetadata>(latestMeta);
  const [stageVisible, setVisible] = useState<boolean>(presentationState.visible && presentationState.detail);
  const [lineIndex, setLineIndex] = useState<number>(-1);
  const [extractedColors, setExtractedColors] = useState<string[]>([]);
  const [, forceWarmTick] = useState(0);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? (window.innerWidth || 1280) : 1280,
    height: typeof window !== 'undefined' ? (window.innerHeight || 720) : 720,
    dpr: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
  }));
  const effectAreaRef = useRef<HTMLDivElement | null>(null);
  const settledSizeRef = useRef({ width: viewport.width, height: viewport.height });
  const modeKeyRef = useRef<FoliaStageModeKey>(resolveFoliaMode(meta.mode));
  const lastPaletteImageRef = useRef<string>('');
  const stageHidden = !stageVisible && !isWallpaperHost;
  const stageHiddenRef = useRef(stageHidden);
  stageHiddenRef.current = stageHidden;

  const hasActiveMode = Boolean(meta.mode && String(meta.mode).trim());
  const modeKey = resolveFoliaMode(meta.mode);
  modeKeyRef.current = modeKey;

  useEffect(() => {
    if (hasActiveMode && !resolvedComponents[modeKey]) {
      const bump = () => forceWarmTick(n => n + 1);
      chunkWarmListeners.push(bump);
      void loadModeModule(modeKey).catch(() => {});
    }
  }, [hasActiveMode, modeKey]);

  useEffect(() => {
    if (stageHidden) return;
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    const dpr = window.devicePixelRatio || 1;
    settledSizeRef.current = { width: w, height: h };
    setViewport(prev => (
      prev.width === w && prev.height === h && prev.dpr === dpr
        ? prev
        : { width: w, height: h, dpr }
    ));
  }, [stageHidden]);

  useEffect(() => {
    let settleTimer: number | null = null;
    let rafId = 0;
    let commitRafId = 0;
    let locked = false;

    const releaseTransformLock = () => {
      const el = effectAreaRef.current;
      if (el && locked) {
        el.style.width = '';
        el.style.height = '';
        el.style.right = '';
        el.style.bottom = '';
        el.style.transformOrigin = '';
        el.style.transform = '';
        el.style.willChange = '';
      }
      locked = false;
    };

    const commitViewportNow = (urgent = false) => {
      commitRafId = 0;
      const finalW = window.innerWidth || 1280;
      const finalH = window.innerHeight || 720;
      const finalDpr = window.devicePixelRatio || 1;
      settledSizeRef.current = { width: finalW, height: finalH };
      releaseTransformLock();
      const apply = () => {
        setViewport(prev => (
          prev.width === finalW && prev.height === finalH && prev.dpr === finalDpr
            ? prev
            : { width: finalW, height: finalH, dpr: finalDpr }
        ));
      };
      if (urgent) apply();
      else startTransition(apply);
    };

    const applyLiveFollow = () => {
      rafId = 0;
      if (stageHiddenRef.current) return;
      const w = window.innerWidth || 1280;
      const h = window.innerHeight || 720;
      const el = effectAreaRef.current;
      if (!el || PIXI_INTERNAL_RESIZE_MODES.has(modeKeyRef.current)) {
        releaseTransformLock();
        return;
      }
      const baseW = Math.max(240, settledSizeRef.current.width || w);
      const baseH = Math.max(240, settledSizeRef.current.height || h);
      if (Math.abs(w - baseW) < 2 && Math.abs(h - baseH) < 2) return;
      if (!locked) {
        locked = true;
        el.style.width = `${baseW}px`;
        el.style.height = `${baseH}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transformOrigin = '0 0';
        el.style.willChange = 'transform';
      }
      const fit = Math.max(0.45, Math.min(2.1, Math.min(w / baseW, h / baseH)));
      const tx = (w - baseW * fit) * 0.5;
      const ty = (h - baseH * fit) * 0.5;
      el.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) scale(${fit.toFixed(4)})`;
    };

    const onResize = () => {
      if (stageHiddenRef.current) return;
      const curW = window.innerWidth || 1280;
      const curH = window.innerHeight || 720;
      const baseW = settledSizeRef.current.width || curW;
      const baseH = settledSizeRef.current.height || curH;
      const orientationFlipped = (curW > curH) !== (baseW > baseH);
      if (orientationFlipped) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        if (settleTimer !== null) { window.clearTimeout(settleTimer); settleTimer = null; }
        releaseTransformLock();
        if (!commitRafId) commitRafId = requestAnimationFrame(() => commitViewportNow(true));
        return;
      }
      if (!rafId) rafId = requestAnimationFrame(applyLiveFollow);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        commitViewportNow(false);
      }, 50);
    };

    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (commitRafId) cancelAnimationFrame(commitRafId);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      releaseTransformLock();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    setStageMeta = setMeta;
    setStageVisible = setVisible;
    notifyHost('ready');
    if (latestMeta.mode) signalVisualReadySoon();
    return () => {
      setStageMeta = null;
      setStageVisible = null;
    };
  }, []);

  const isDaylight = meta.appearance === 'light';
  const coverUrl = useMemo(() => resolveCoverProxyUrl(meta.cover), [meta.cover]);
  const bgImageUrl = useMemo(() => resolveCoverProxyUrl(meta.bgImage), [meta.bgImage]);
  const paletteSource = bgImageUrl || coverUrl;

  const hasHostPalette = Boolean(meta.lyricColors?.primary);

  useEffect(() => {
    // Host already extracts and passes cover/custom lyricColors; skip redundant async image
    // download + canvas decode on song switch to prevent a mid-song second scene rebuild.
    if (hasHostPalette || !paletteSource) {
      lastPaletteImageRef.current = paletteSource;
      setExtractedColors(prev => (prev.length ? [] : prev));
      return;
    }
    const cached = paletteExtractCache.get(paletteSource);
    if (cached) {
      lastPaletteImageRef.current = paletteSource;
      setExtractedColors(cached);
      return;
    }
    if (paletteSource === lastPaletteImageRef.current) return;
    lastPaletteImageRef.current = paletteSource;
    let cancelled = false;
    void extractColors(paletteSource, 5)
      .then((colors) => {
        if (!cancelled && Array.isArray(colors) && colors.length > 0) {
          if (paletteExtractCache.size > 48) paletteExtractCache.clear();
          paletteExtractCache.set(paletteSource, colors);
          setExtractedColors(colors);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [paletteSource, hasHostPalette]);

  const seed = `${meta.id || ''}:${meta.name || ''}:${meta.singer || ''}`;

  const dualTheme: DualTheme = useMemo(() => {
    const fallbackColors: string[] = [];
    if (meta.lyricColors?.primary) fallbackColors.push(meta.lyricColors.primary);
    if (meta.lyricColors?.secondary) fallbackColors.push(meta.lyricColors.secondary);
    const paletteInput = extractedColors.length > 0 ? extractedColors : fallbackColors;
    return generateBuiltinDualTheme({
      coverColors: paletteInput,
      random: seededRandom(seed || 'lxmine-folia'),
    });
  }, [extractedColors, meta.lyricColors?.primary, meta.lyricColors?.secondary, seed]);

  const { activeTheme, subtitleTheme } = useMemo(() => {
    const base = isDaylight ? dualTheme.light : dualTheme.dark;
    const isGradient = String(meta.lyricColorMode || '').includes('gradient');
    const rawPrimary = meta.lyricColors?.primary || base.primaryColor;
    const rawSecondary = meta.lyricColors?.secondary || meta.lyricColors?.highlight || rawPrimary;
    const primaryColor = adaptLyricHex(
      rawPrimary,
      isDaylight,
      isDaylight ? 0.44 : 0.42,
      isDaylight ? '#26303c' : '#7dd3fc',
    );
    const accentColor = isGradient
      ? adaptLyricHex(
          rawSecondary,
          isDaylight,
          isDaylight ? 0.40 : 0.54,
          isDaylight ? '#1d4ed8' : '#a5b4fc',
        )
      : mixHexColor(primaryColor, isDaylight ? '#0f172a' : '#ffffff', 0.34);
    const secondaryColor = isDaylight ? 'rgba(48, 56, 68, 0.66)' : 'rgba(255, 255, 255, 0.62)';

    const main: Theme = {
      ...base,
      primaryColor,
      accentColor,
      secondaryColor,
      fontStyle: 'sans',
      fontFamily: undefined,
      fontFamilyStack: undefined,
      fontWeight: 700,
    };
    const sub: Theme = {
      ...main,
      primaryColor: secondaryColor,
      secondaryColor,
      fontWeight: 500,
    };
    return { activeTheme: main, subtitleTheme: sub };
  }, [
    dualTheme,
    isDaylight,
    meta.lyricColorMode,
    meta.lyricColors?.primary,
    meta.lyricColors?.secondary,
    meta.lyricColors?.highlight,
  ]);

  const lines = useMemo(() => convertLines(meta), [meta.lines, meta.translationLines, meta.duration]);

  useEffect(() => {
    const findIndex = (nowSec: number): number => {
      if (!lines.length) return -1;
      let lo = 0;
      let hi = lines.length - 1;
      let ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lines[mid].startTime <= nowSec + 0.04) {
          ans = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return ans;
    };
    setLineIndex(findIndex(currentTimeMV.get()));
    return currentTimeMV.on('change', (nowSec) => {
      const next = findIndex(nowSec);
      setLineIndex(prev => (prev === next ? prev : next));
    });
  }, [lines]);

  const handleLyricSeek = useCallback((sec: number) => {
    if (!Number.isFinite(sec)) return;
    const ms = Math.max(0, Math.round(sec * 1000 - lyricOffsetMs));
    anchorMs = ms;
    anchorAt = performance.now();
    clockRate = 1;
    clockRateUntil = 0;
    lastPushedSec = -1;
    currentTimeMV.set(Math.max(0, sec));
    try { window.__lxmineNative?.seek?.(ms); } catch (_) {}
  }, []);

  const hasCustomBg = bgImageUrl.length > 0;
  const mediaBgUrl = bgImageUrl || coverUrl;
  const rawBgOpacity = Math.max(0, Math.min(1, meta.bgOpacity != null ? Number(meta.bgOpacity) : 0.78));
  const rawWpBgOpacity = Math.max(0, Math.min(1, meta.wallpaperBgOpacity != null ? Number(meta.wallpaperBgOpacity) : 0.42));
  const effectiveBgOpacity = isWallpaperHost ? rawWpBgOpacity : rawBgOpacity;

  const userLyricScale = Math.max(0.55, Math.min(1.5, Number(meta.lyricScale) || 1));
  const userLineSpacing = Math.max(0.85, Math.min(1.8, Number(meta.lyricLineSpacing) || 1.2));
  const userMaxLines = Math.max(0, Math.min(10, Math.round(Number(meta.lyricMaxLines) || 0)));

  useEffect(() => {
    const rootEl = document.documentElement;
    if (!rootEl) return;
    rootEl.style.setProperty('--user-lyric-scale', String(userLyricScale));
    rootEl.style.setProperty('--lyric-line-spacing', String(userLineSpacing));
    rootEl.style.setProperty('--lyric-primary', activeTheme.primaryColor);
    rootEl.style.setProperty('--lyric-accent', activeTheme.accentColor);
    rootEl.style.setProperty('--lyric-secondary', activeTheme.secondaryColor);
  }, [userLyricScale, userLineSpacing, activeTheme.primaryColor, activeTheme.accentColor, activeTheme.secondaryColor]);

  // Keep visualizers & shaders rendering smoothly at VSync whenever the stage is visible
  // (even while playback is paused), suspending animation loops only when hidden/off-detail.
  const bgMode = defaultBackgroundForMode(modeKey);
  const DirectComponent = resolvedComponents[modeKey];
  const ActiveComponent = modeComponents[modeKey] ?? modeComponents.partita;
  const FallbackComponent = resolvedComponents.classic ?? modeComponents.classic;
  const hasTranslation = useMemo(() => lines.some(l => !!l.translation), [lines]);

  // Keep mobile & foreground high-DPI Pixi & WebGL typography crisp (>300 PPI), while capping total
  // offscreen bloom/filter pixels at <= 2.6 MP (and <= 1.35x in wallpaper mode) and quantizing to
  // coarse 0.25 steps so portrait <-> landscape rotation never perturbs textureResolution.
  const pixelBudgetCap = Math.sqrt(2_600_000 / Math.max(1, viewport.width * viewport.height));
  const rawPixiResolution = isWallpaperHost
    ? Math.min(1.35, Math.max(1.0, viewport.dpr || 1.0))
    : Math.max(1.25, Math.min(2.0, Math.max(1.5, viewport.dpr || 1.5), pixelBudgetCap));
  const crispPixiResolution = Math.round(rawPixiResolution * 4) / 4;
  const sonnetTuning = useMemo(() => ({
    ...DEFAULT_SONNET_TUNING,
    textureResolution: crispPixiResolution,
  }), [crispPixiResolution]);
  const temperaTuning = useMemo(() => ({
    ...DEFAULT_TEMPERA_TUNING,
    textureResolution: crispPixiResolution,
  }), [crispPixiResolution]);
  const cadenzaTuning = useMemo(() => ({
    ...DEFAULT_CADENZA_TUNING,
    fontScale: 1.18 * userLyricScale,
    widthRatio: 0.92,
  }), [userLyricScale]);
  const monetTuning = useMemo(() => ({
    ...DEFAULT_MONET_TUNING,
    fontScale: 1.12,
  }), []);
  const lumiereTuning = useMemo(() => ({
    ...DEFAULT_LUMIERE_TUNING,
    renderQuality: (isWallpaperHost ? 'balanced' : 'full') as 'balanced' | 'full',
    darkField: effectiveBgOpacity <= 0.01 ? 0 : Math.max(0.16, 0.56 - effectiveBgOpacity * 0.34),
  }), [effectiveBgOpacity, isWallpaperHost]);

  const sharedProps: VisualizerSharedProps = useMemo(() => ({
    currentTime: currentTimeMV,
    currentLineIndex: lineIndex,
    lines,
    theme: activeTheme,
    subtitleTheme,
    isDaylight,
    audioPower: audioPowerMV,
    audioBands: audioBandsMV,
    showText: true,
    songTitle: meta.name || '',
    songArtist: meta.singer || '',
    coverUrl: mediaBgUrl || undefined,
    seed,
    paused: stageHidden,
    staticMode: false,
    backgroundStaticMode: false,
    isPreviewMode: false,
    isPlayerChromeHidden: false,
    background: TRANSPARENT_BG,
    lyricsFontScale: userLyricScale,
    lyricLineSpacing: userLineSpacing,
    lyricMaxLines: userMaxLines,
    lyricColorMode: meta.lyricColorMode,
    lyricColors: meta.lyricColors,
    subtitleFontScale: userLyricScale,
    subtitleOverlayBackground: false,
    showSubtitleTranslation: hasTranslation,
    hideTranslationSubtitle: !hasTranslation,
    subtitleContentMode: 'translation',
    onLyricLineSeek: handleLyricSeek,
    cadenzaTuning,
    sonnetTuning,
    temperaTuning,
    monetTuning,
    lumiereTuning,
  }), [
    lineIndex,
    lines,
    activeTheme,
    subtitleTheme,
    isDaylight,
    meta.name,
    meta.singer,
    mediaBgUrl,
    seed,
    stageHidden,
    userLyricScale,
    userLineSpacing,
    userMaxLines,
    meta.lyricColorMode,
    meta.lyricColors,
    hasTranslation,
    handleLyricSeek,
    cadenzaTuning,
    sonnetTuning,
    temperaTuning,
    monetTuning,
    lumiereTuning,
  ]);

  // Blend Folia's reactive shader harmoniously WITH LxMine's album cover / custom background,
  // honoring bgOpacity smoothly from 0% (pure transparent/clean) to 100% (vivid).
  const shaderBlendOpacity = effectiveBgOpacity <= 0.005
    ? 0
    : modeKey === 'monet'
      ? effectiveBgOpacity
      : hasCustomBg
        ? Math.max(0.08, (1 - effectiveBgOpacity * 0.62) * 0.34) * effectiveBgOpacity
        : (isDaylight ? 0.34 : 0.44) * effectiveBgOpacity;

  const scrimAlpha = effectiveBgOpacity <= 0.005
    ? 0
    : hasCustomBg
      ? (isDaylight ? 0.14 : 0.22) * effectiveBgOpacity
      : (isDaylight ? 0.24 : 0.38) * effectiveBgOpacity;

  const bgConfig = useMemo(() => (
    bgMode === 'latent'
      ? { mode: bgMode, latent: { tuning: LATENT_MESH_ONLY_TUNING } }
      : { mode: bgMode }
  ), [bgMode]);

  if (!hasActiveMode) {
    return (
      <div
        id="folia-stage-root"
        data-appearance={isDaylight ? 'light' : 'dark'}
      />
    );
  }

  return (
    <PlayerBottomBarLayoutContext.Provider value={true}>
      <div
        id="folia-stage-root"
        data-mode={modeKey}
        data-appearance={isDaylight ? 'light' : 'dark'}
      >
        {mediaBgUrl && effectiveBgOpacity > 0.005 && (
          <div
            id="folia-media-bg"
            className={hasCustomBg ? 'custom-bg' : 'album-bg'}
            style={{
              backgroundImage: `url("${mediaBgUrl.replace(/"/g, '%22')}")`,
              opacity: modeKey === 'monet' && !hasCustomBg ? effectiveBgOpacity * 0.45 : effectiveBgOpacity,
            }}
          />
        )}
        {shaderBlendOpacity > 0.005 && (
          <div
            id="folia-bg-layer"
            style={{
              opacity: modeKey === 'monet' ? shaderBlendOpacity : shaderBlendOpacity * (isDaylight ? 0.80 : 0.76),
            }}
          >
            <Suspense fallback={null}>
              <VisualizerBackgroundRenderer
                config={bgConfig}
                theme={activeTheme}
                isDaylight={isDaylight}
                coverUrl={mediaBgUrl || undefined}
                audioPower={audioPowerMV}
                audioBands={audioBandsMV}
                paused={stageHidden}
                staticMode={false}
              />
            </Suspense>
          </div>
        )}
        {scrimAlpha > 0.005 && (
          <div
            id="folia-readability-scrim"
            style={{
              background: isDaylight
                ? `rgba(240, 244, 249, ${scrimAlpha.toFixed(3)})`
                : `rgba(8, 10, 16, ${scrimAlpha.toFixed(3)})`,
            }}
          />
        )}
        <div id="effect-area" ref={effectAreaRef} data-mode={modeKey}>
          <ModeErrorBoundary
            modeKey={modeKey}
            fallback={
              <Suspense fallback={null}>
                <FallbackComponent {...sharedProps} />
              </Suspense>
            }
          >
            {DirectComponent ? (
              <DirectComponent {...sharedProps} />
            ) : (
              <Suspense fallback={null}>
                <ActiveComponent {...sharedProps} />
              </Suspense>
            )}
          </ModeErrorBoundary>
        </div>
      </div>
    </PlayerBottomBarLayoutContext.Provider>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<FoliaStageApp />);
}

void rafHandle;
