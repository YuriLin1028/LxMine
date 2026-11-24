import React, { Suspense, lazy, startTransition, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { AudioBands, Line, Theme } from '../types';
import type { VisualizerSharedProps } from '../components/visualizer/definition';
import { BUILTIN_VISUALIZER_MODES } from '../types/visualizerModes';
import VisualizerBackgroundRenderer from '../components/visualizer/backgrounds/VisualizerBackgroundRenderer';
import { PlayerBottomBarLayoutContext } from '../components/floating-player/PlayerBottomBarLayoutContext';
import { playerBottomBarLiveOffset } from '../stores/motionSignals';
import '../index.css';
import './stage.css';

void i18next.use(initReactI18next).init({ lng: 'zh-CN', fallbackLng: 'zh-CN', resources: { 'zh-CN': { translation: { ui: { noLyrics: '暂无歌词', lyricsNotFound: '暂无歌词' } } } }, interpolation: { escapeValue: false } });
const loaders = {
  classic: () => import('../components/visualizer/classic/Visualizer'),
  cadenza: () => import('../components/visualizer/cadenza/VisualizerCadenza'),
  partita: () => import('../components/visualizer/partita/VisualizerPartita'),
  cappella: () => import('../components/visualizer/cappella/VisualizerCappella'),
  claddagh: () => import('../components/visualizer/claddagh/VisualizerCladdagh'),
  diorama: () => import('../components/visualizer/diorama/VisualizerDiorama'),
  fume: () => import('../components/visualizer/fume/VisualizerFume'),
  lumiere: () => import('../components/visualizer/lumiere/VisualizerLumiere'),
  monet: () => import('../components/visualizer/monet/VisualizerMonet'),
  pendolo: () => import('../components/visualizer/pendolo/VisualizerPendolo'),
  sonnet: () => import('../components/visualizer/sonnet/VisualizerSonnet'),
  still: () => import('../components/visualizer/still/VisualizerStill'),
  tempera: () => import('../components/visualizer/tempera/VisualizerTempera'),
  tilt: () => import('../components/visualizer/tilt/VisualizerTilt'),
};
const modes = Object.fromEntries(Object.entries(loaders).map(([id, load]) => [id, lazy(load as () => Promise<{ default: React.ComponentType<VisualizerSharedProps> }>)])) as Record<keyof typeof loaders, React.LazyExoticComponent<React.ComponentType<VisualizerSharedProps>>>;
if (BUILTIN_VISUALIZER_MODES.some(mode => !(mode in modes))) throw Error('Harmony stage is missing a Folia mode');
interface NativeWord { text: string; timeMs: number; durationMs: number }
interface NativeLine { text: string; timeMs: number; words: NativeWord[] }
interface StageMetadata { mode: string; lines: NativeLine[]; name: string; singer: string; cover: string; duration: number; lyricOffset: number; topInset?: number; bottomInset?: number }
interface StageClock { positionMs: number; playing: boolean }
declare global { interface Window { lxliaStage: { metadata: (data: StageMetadata) => void; clock: (data: StageClock) => void; diagnostics: () => { mode: string; lines: number; time: number; frames: number; errors: string[] } } } }
const time = motionValue(0), power = motionValue(0);
const bands: AudioBands = { bass: motionValue(0), lowMid: motionValue(0), mid: motionValue(0), vocal: motionValue(0), treble: motionValue(0) };
const theme: Theme = { name: 'Lxlia', backgroundColor: '#0C0E14', primaryColor: '#F2F1F7', accentColor: '#B8C8FF', secondaryColor: '#9DA6C0', fontStyle: 'sans', animationIntensity: 'normal' };
let anchor = 0, received = performance.now(), playing = false, offset = 0, duration = 0, frames = 0;
const errors: string[] = [];
window.addEventListener('error', e => { errors.push(e.message); console.error('[FoliaStage]', e.message); });
window.addEventListener('unhandledrejection', e => { errors.push(String(e.reason)); console.error('[FoliaStage]', e.reason); });
let setMetadata: ((data: StageMetadata) => void) | null = null;
let setPlaying: ((playing: boolean) => void) | null = null;
let latest: StageMetadata = { mode: 'classic', lines: [], name: '', singer: '', cover: '', duration: 0, lyricOffset: 0 };
let metadataRevision = 0;
window.lxliaStage = {
  metadata(data) {
    const revision = ++metadataRevision;
    const commit = () => {
      if (revision !== metadataRevision) return;
      latest = data; offset = data.lyricOffset; duration = data.duration;
      playerBottomBarLiveOffset.set(Math.max(32, (data.bottomInset ?? 112) - 64));
      startTransition(() => setMetadata?.(data));
    };
    // 切换时保留现有效果与背景，等新模块就绪再交接，不显示空白 fallback。
    if (data.mode !== latest.mode) void (loaders[data.mode as keyof typeof loaders] ?? loaders.classic)().then(commit);
    else commit();
  },
  clock(data) { anchor = data.positionMs; received = performance.now(); if (playing !== data.playing) setPlaying?.(data.playing); playing = data.playing; },
  diagnostics: () => ({ mode: latest.mode, lines: latest.lines.length, time: time.get(), frames, errors }),
};
function tick() {
  frames++;
  if (!document.hidden) time.set((Math.min(duration || Infinity, anchor + (playing ? performance.now() - received : 0)) + offset) / 1000);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
// 在空闲片段逐个解析其余引擎，避免用户点菜单时集中下载、解析大块模块。
const warmQueue = Object.values(loaders);
const warmNext = () => {
  const load = warmQueue.shift();
  if (load) void load().catch(() => {}).finally(() => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(warmNext, { timeout: 1800 });
    else setTimeout(warmNext, 200);
  });
};
setTimeout(warmNext, 1200);
function convertLines(data: StageMetadata): Line[] {
  return data.lines.map((line, i) => {
    const endTime = Math.max(line.timeMs + 100, data.lines[i + 1]?.timeMs ?? data.duration ?? line.timeMs + 4000) / 1000;
    return { id: String(i), startTime: line.timeMs / 1000, endTime, fullText: line.text,
      // 普通 LRC 保留整句时间，不伪造逐字边界。
      words: line.words.length ? line.words.map(w => ({ text: w.text, startTime: w.timeMs / 1000, endTime: (w.timeMs + w.durationMs) / 1000 })) :
        [{ text: line.text, startTime: line.timeMs / 1000, endTime }] };
  });
}
function Stage() {
  const [data, update] = useState(latest);
  const [isPlaying, updatePlaying] = useState(playing);
  const [lineIndex, setLineIndex] = useState(-1);
  useEffect(() => { setMetadata = update; setPlaying = updatePlaying; return () => { setMetadata = null; setPlaying = null; }; }, []);
  const lines = useMemo(() => convertLines(data), [data]);
  useEffect(() => time.on('change', current => {
    let low = 0, high = lines.length - 1, answer = -1;
    while (low <= high) { const mid = (low + high) >> 1; if (lines[mid].startTime <= current) { answer = mid; low = mid + 1; } else high = mid - 1; }
    if (answer >= 0 && current > lines[answer].endTime) answer = -1;
    setLineIndex(previous => previous === answer ? previous : answer);
  }), [lines]);
  const Component = modes[data.mode as keyof typeof modes] ?? modes.classic;
  const props: VisualizerSharedProps = { currentTime: time, currentLineIndex: lineIndex, lines, theme, audioPower: power, audioBands: bands,
    songTitle: data.name, songArtist: data.singer, coverUrl: data.cover, seed: `${data.name}:${data.singer}`, paused: !isPlaying,
    isPreviewMode: true, isPlayerChromeHidden: false, background: { transparent: true }, lyricsFontScale: 0.85, subtitleFontScale: 0.8 };
  return <PlayerBottomBarLayoutContext.Provider value={true}>
    <Suspense fallback={null}><VisualizerBackgroundRenderer config={{ mode: 'latent' }} theme={theme} isDaylight={false} coverUrl={data.cover} audioPower={power} audioBands={bands} paused={!isPlaying} staticMode={false} /></Suspense>
    <div id="effect-area" data-mode={data.mode}><Suspense fallback={null}><Component {...props} /></Suspense></div>
  </PlayerBottomBarLayoutContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Stage />);
