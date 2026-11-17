'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('the workshop follows unbounded native orbits while retaining idle auto-rotation', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/mine-stage/sonic-workshop-preset.js'), 'utf8');
  let now = 10000;
  const context = {
    global: { __LXMINE_NATIVE_STAGE: true, orbit: { userTheta: 7 * Math.PI, userPhi: .3, baselinePhi: .08 } },
    state: { cameraStartedAt: 0, cameraAngleX: 150, nativeTheta: null, nativePhi: null }, nowMs: () => now,
    WORKSHOP_DEFAULT_PROPERTIES: { cameraAngleX: 150, cameraAngleY: 30, autoRotateSpeed: 7, autoRotateEnabled: true },
    workshopPaletteHexesFromCover: () => [], normalizeWorkshopTheme: () => 'custom',
    workshopRegionsFromFx: () => ({ primary: '#ffffff' }), normalizeHex: (value, fallback) => value || fallback,
    workshopCustomThemeForRegions: () => ({}), hexToSchemeColor: value => value, workshopThemeForColor: () => 'custom',
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function deriveProperties('), source.indexOf('function pushProperties(')), context);
  const first = context.deriveProperties({});
  assert.equal(first.cameraAngleX, 1480);
  assert.equal(first.autoRotateEnabled, true);
  assert(first.cameraAngleY > 40 && first.cameraAngleY < 44);
  now = 20000;
  assert.equal(context.deriveProperties({}).cameraAngleX, first.cameraAngleX);
  context.global.orbit.userTheta += Math.PI;
  assert.equal(context.deriveProperties({}).cameraAngleX, 1730);
});

test('startup starts asynchronous scene assets even when the player is already visible', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/mine-stage/mine-stage-bridge.js'), 'utf8');
  let skullLoads = 0, workshopLoads = 0;
  const workshop = { prewarm() { workshopLoads++; return Promise.resolve(); } };
  const context = { loadSkullParticleAsset() { skullLoads++; return Promise.resolve(null); },
    window: { MineradioSonicWorkshop: workshop }, MineradioSonicWorkshop: workshop,
    presentation: { visible: true }, console, Promise };
  vm.runInNewContext(source.slice(source.indexOf('var skullWarmup ='), source.indexOf('var warmTasks =')), context);
  await Promise.resolve();
  assert.equal(skullLoads, 1);
  assert.equal(workshopLoads, 1);
});

test('the workshop reads native playback state, position and duration without a WebView decoder', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/mine-stage/sonic-workshop-preset.js'), 'utf8');
  const context = {
    global: { playing: true, audio: { paused: true, currentTime: 0, duration: NaN },
      isAnalysisPlaybackActive: () => true, analysisPlaybackTime: () => 23.5 },
    currentSong: () => ({ name: 'Native PCM', durationMs: 182000 }), cssColorToHex: (_color, fallback) => fallback,
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function buildMediaState()'), source.indexOf('function postMessage(')), context);
  const media = context.buildMediaState();
  assert.equal(media.isPlaying, true);
  assert.equal(media.position, 23.5);
  assert.equal(media.duration, 182);
});

test('cooperative lyric layout batches cheap work within the existing frame budget', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/mine-stage/js/modules/02-visual/13-lyrics-mesh-build.js'), 'utf8');
  let elapsed = 0, measured = 0;
  const context = {
    performance: { now: () => elapsed },
    stepLyricMaskLayoutMetricsBuild(state) { measured++; elapsed++; state.completedPhases++; return false; },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function stepCooperativeLyricMeshBuild'), source.indexOf('function finishCooperativeLyricMeshBuild')), context);
  context.stepCooperativeLyricMeshBuild({ initPhase: 0, layoutState: { completedPhases: 0 } }, 32, 4.2);
  assert.equal(measured, 5);
  assert(elapsed < 6);
});

test('native PCM analysis uses the native clock while the WebView media element stays paused', () => {
  const core = fs.readFileSync(path.join(__dirname, '../public/mine-stage/js/modules/00-state/00-core-stores.js'), 'utf8');
  const context = {
    window: { lxmineNativeAnalysis: { enabled: true, active: true, sampleRate: 48000 }, lxmineNativeTime: () => 12.5 },
    audio: { paused: true, currentTime: 0 }, audioCtx: null,
  };
  vm.createContext(context);
  vm.runInContext(core.slice(core.indexOf('function isAnalysisPlaybackActive'), core.indexOf('var uiSfxCtx')), context);
  assert.equal(context.isAnalysisPlaybackActive(), true);
  assert.equal(context.analysisPlaybackTime(), 12.5);
  assert.equal(context.getAnalysisSampleRate(), 48000);
  context.window.lxmineNativeAnalysis.active = false;
  assert.equal(context.isAnalysisPlaybackActive(), false);
  context.window.lxmineNativeAnalysis.enabled = false;
  context.audio = { paused: false, currentTime: 4 };
  context.audioCtx = { sampleRate: 44100 };
  assert.equal(context.isAnalysisPlaybackActive(), true);
  assert.equal(context.analysisPlaybackTime(), 4);
  assert.equal(context.getAnalysisSampleRate(), 44100);
});

test('native PCM presentation changes never start a second audio stream', () => {
  const bridge = fs.readFileSync(path.join(__dirname, '../public/mine-stage/mine-stage-bridge.js'), 'utf8');
  const context = {
    nativeAnalysis: { enabled: true, active: false, frequency: new Uint8Array([255]), waveform: new Uint8Array([255]) },
    presentation: { visible: true, detail: true }, nativeClock: { playing: true },
    audio: new Proxy({}, { get() { throw new Error('Unexpected WebView audio access'); } }),
  };
  vm.createContext(context);
  vm.runInContext(bridge.slice(bridge.indexOf('function syncAudio()'), bridge.indexOf("audio.addEventListener('loadedmetadata'")), context);
  context.syncAudio();
  assert.equal(context.nativeAnalysis.active, true);
  context.presentation.visible = false;
  context.syncAudio();
  assert.equal(context.nativeAnalysis.active, false);
  assert.equal(context.nativeAnalysis.frequency[0], 0);
  assert.equal(context.nativeAnalysis.waveform[0], 128);
});

test('unavailable WebGL reports degradation before allocating audio or accessing the renderer', () => {
  const messages = [];
  let degraded = 0;
  const window = { __lxmineNative: { degraded() { degraded++; } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/mine-stage/mine-stage-bridge.js'), 'utf8'), {
    window, parent: { postMessage(message, origin) { messages.push({ type: message.type, origin }); } }, location: { origin: 'http://127.0.0.1' }
  });
  assert.equal(degraded, 1);
  assert.equal(window.__lxmineStageUnavailable, true);
  assert.deepEqual(messages, [{ type: 'lxmine-stage-degraded', origin: 'http://127.0.0.1' }]);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/mine-stage/mine-stage-touch.js'), 'utf8'), {});
});

test('native immersive gestures work in portrait and remove hidden control hit targets', () => {
  const android = fs.readFileSync(path.join(__dirname, '../../android/app/src/main/java/com/lxlia/player/ui/AppViewModel.kt'), 'utf8');
  const harmony = fs.readFileSync(path.join(__dirname, '../../harmony/entry/src/main/ets/pages/Index.ets'), 'utf8');
  for (const source of [android, harmony]) {
    const method = source.slice(source.indexOf('toggleStageControls(show:'), source.indexOf('toggleStageControls(show:') + 340);
    assert(!method.includes('!landscape') && !method.includes('!this.landscape'));
  }
  const screen = fs.readFileSync(path.join(__dirname, '../../android/app/src/main/java/com/lxlia/player/ui/AppScreen.kt'), 'utf8');
  const overlay = fs.readFileSync(path.join(__dirname, '../../android/app/src/main/java/com/lxlia/player/ui/PlayerOverlay.kt'), 'utf8');
  assert(screen.includes('val playerControlsVisible = !showPlayer || viewModel.stageControlsVisible'));
  assert(screen.includes('.playerChromeVisibility(playerControlsVisible, playerControlsReveal, 24.dp)'));
  assert(overlay.includes('.blockHiddenPlayerChrome(controlsVisible)'));
  assert(harmony.includes('.enabled(this.showPlayer && this.stageControlsVisible)'));
});

test('the cached workshop suspends animation and shrinks buffers while hidden', () => {
  const scheduled = new Map();
  let sequence = 0, frames = 0;
  let loaded;
  const canvas = { width: 1200, height: 800 };
  const window = {
    requestAnimationFrame(callback) { const id = ++sequence; scheduled.set(id, callback); return id; },
    cancelAnimationFrame(id) { scheduled.delete(id); },
    addEventListener(type, callback) { if (type === 'load') loaded = callback; }, dispatchEvent() {},
  };
  const document = { querySelectorAll: () => [canvas], addEventListener() {} };
  const source = fs.readFileSync(path.join(__dirname, '../public/mine-stage/vendor/sonic-workshop/mineradio-power.js'), 'utf8');
  vm.runInNewContext(source, { window, document, Map, Event: class Event {} });
  window.requestAnimationFrame(() => frames++);
  window.__mineradioSetPresentation(false);
  loaded();
  for (let frame = 0; frame < 4; frame++) {
    const callbacks = [...scheduled.values()]; scheduled.clear(); callbacks.forEach(callback => callback(frame * 16));
  }
  assert.equal(scheduled.size, 0);
  assert.equal(frames, 1);
  assert.equal(canvas.width * canvas.height, 1);
  window.requestAnimationFrame(() => frames++);
  window.__mineradioSetPresentation(true);
  assert.equal(canvas.width, 1200);
  assert.equal(canvas.height, 800);
  const callback = scheduled.values().next().value;
  scheduled.clear(); callback(16);
  assert.equal(frames, 2);
  window.__mineradioSetPresentation(false);
  const cancelled = window.requestAnimationFrame(() => frames++);
  window.cancelAnimationFrame(cancelled);
  window.__mineradioSetPresentation(true);
  assert.equal(scheduled.size, 0);
});

function eventSurface() {
  const listeners = new Map();
  return {
    style: {}, scrollTop: 240,
    setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {},
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
    scrollTo({ top }) { this.scrollTop = top; },
    fire(type, value = {}) {
      const event = { type, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...value };
      for (const callback of listeners.get(type) || []) { callback(event); if (event.stopped) break; }
      return event;
    }
  };
}

test('plain lyrics retain single-finger scrolling and reserve two fingers for immersive controls', () => {
  const element = eventSurface(), requests = [];
  const window = { ...eventSurface(), __lxmineNative: { immersive: show => requests.push(show) } };
  const document = { ...eventSurface(), hidden: false };
  const source = fs.readFileSync(path.join(__dirname, '../public/mine-stage/mine-stage-gestures.js'), 'utf8');
  vm.runInNewContext(source, { window, document });
  window.LxMineGestures.bind(element, true);
  const finger = y => ({ clientY: y });
  assert.equal(element.fire('touchstart', { touches: [finger(200)] }).prevented, false);
  assert.equal(element.fire('touchmove', { touches: [finger(100)] }).prevented, false);
  assert(element.fire('touchstart', { touches: [finger(200), finger(220)] }).prevented);
  assert(element.fire('touchmove', { touches: [finger(300), finger(320)] }).prevented);
  element.scrollTop = 400; element.fire('scroll'); assert.equal(element.scrollTop, 240);
  element.fire('touchend', { touches: [finger(300)] });
  element.fire('touchend', { touches: [] });
  assert.deepEqual(requests, ['0']);
  assert(element.fire('click').prevented);
  element.fire('pointerdown', { isPrimary: true });
  assert.equal(element.fire('click').prevented, false);
  element.fire('touchstart', { touches: [finger(300), finger(320)] });
  element.fire('touchmove', { touches: [finger(200), finger(220)] });
  element.fire('touchend', { touches: [] });
  assert.deepEqual(requests, ['0', '1']);
  element.fire('touchstart', { touches: [finger(200), finger(220)] });
  element.fire('touchmove', { touches: [finger(300), finger(320)] });
  element.fire('touchcancel', { touches: [finger(300)] });
  element.fire('touchend', { touches: [] });
  assert.deepEqual(requests, ['0', '1'], 'Cancellation cannot finish a later immersive gesture');
  element.fire('touchstart', { touches: [finger(200), finger(220)] });
  element.fire('touchmove', { touches: [finger(300), finger(320)] });
  window.fire('lxmine-stage-hidden');
  element.fire('touchend', { touches: [] });
  assert.deepEqual(requests, ['0', '1'], 'A hidden stage cannot hide controls in a later page');
});

test('Harmony native gesture fallback never commits canceled or background gestures', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../harmony/entry/src/main/ets/pages/Index.ets'), 'utf8');
  const method = source.slice(source.indexOf('private stageGestureTouch('), source.indexOf('private foregroundChanged('));
  const calls = [], TouchType = { Down: 0, Move: 1, Up: 2, Cancel: 3 };
  const context = { TouchType, Math };
  vm.runInNewContext('var gesture = function(event) ' + method.slice(method.indexOf('{'), method.lastIndexOf('}') + 1), context);
  const state = { showPlayer: true, foreground: true, commentsOpen: false, twoFingerActive: false, toggleStageControls: show => calls.push(show) };
  const fire = (type, y) => context.gesture.call(state, { type, touches: y === undefined ? [] : [{ y }, { y: y + 10 }] });
  fire(TouchType.Down, 100); fire(TouchType.Move, 220); fire(TouchType.Cancel);
  assert.equal(state.twoFingerActive, false); assert.deepEqual(calls, []);
  fire(TouchType.Down, 100); fire(TouchType.Move, 220); state.foreground = false; fire(TouchType.Up);
  assert.equal(state.twoFingerActive, false); assert.deepEqual(calls, []);
  state.foreground = true; fire(TouchType.Down, 100); fire(TouchType.Move, 220); fire(TouchType.Up);
  assert.deepEqual(calls, [false]);
});

test('native lyrics scroll and tap while leaving outside rotation and two-finger gestures available', () => {
  const canvas = eventSurface(), seeks = [], track = {};
  let hit = true;
  const mask = { width: 4, height: 4, getContext: () => ({ getImageData: () => ({ width: 4, height: 4, data: new Uint8Array(64).fill(255) }) }) };
  const window = { __LXMINE_NATIVE_STAGE: true, lxmineStage: { seek: seconds => seeks.push(seconds) }, addEventListener() {} };
  const context = { window, renderer: { domElement: canvas }, fx: { particleLyrics: true }, lyricsLines: [{ t: 12, text: '歌词' }, { t: 24, text: '第二行' }, { t: 36, text: '第三行' }],
    stageLyrics: { currentIdx: 0, group: { updateMatrixWorld() {} }, current: { userData: { lyric: { rowLayers: [{ mesh: { get visible() { return hit; }, geometry: { parameters: { width: 1, height: 1 } }, localToWorld: point => point }, lineIndex: 0, lineMask: { texture: { image: mask }, width: 100, height: 100, fontSize: 10, lineY0: 53.6, textWidth: 100 } }] } } } },
    THREE: { Raycaster: class { setFromCamera() {} intersectObject() { return hit ? [{ uv: { x: .5, y: .5 }, distance: 1 }] : []; } }, Vector2: class { set() {} }, Vector3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } project() { return this; } } },
    document: { createElement: () => ({ style: {} }), getElementById: () => ({ appendChild() {} }) },
    innerWidth: 400, innerHeight: 800, camera: {}, audio: { paused: false }, playing: true, orbit: {}, particlePointerSpin: {},
    currentCoverSong: () => track, isPointerOverUi: () => false, mouseDownAt: { hadDrag: false },
    setTimeout: () => 1, clearTimeout() {}, markRenderInteraction() {}, formatProgramTime: value => String(value) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/mine-stage/js/modules/lxmine-lyric-seek.js'), 'utf8'), context);
  const point = { button: 0, isPrimary: true, pointerId: 1, clientX: 100, clientY: 400 };
  hit = false; assert.equal(canvas.fire('pointerdown', point).prevented, false);
  assert.equal(window.lxmineLyricGestureActive(), false);
  hit = true; assert(canvas.fire('pointerdown', point).prevented);
  assert.equal(window.lxmineLyricHitTest(80, 430), 0, 'The gap beside/between glyphs belongs to the lyric column');
  assert.equal(window.lxmineLyricHitTest(20, 400), -1, 'The outer scene retains its rotation area');
  assert.equal(window.lxmineLyricGestureActive(), true);
  canvas.fire('pointermove', { ...point, clientY: 280 });
  canvas.fire('pointerup', { ...point, clientY: 280 }); assert.equal(seeks.length, 0);
  assert.equal(window.lxmineLyricPreviewTime(), 36);
  canvas.fire('pointerdown', point); assert(canvas.fire('pointerup', point).lxmineLyricGesture);
  assert.deepEqual(seeks, [12]);
  canvas.fire('pointerdown', point); canvas.fire('pointerdown', { ...point, pointerId: 2, isPrimary: false });
  canvas.fire('pointerup', point); assert.equal(seeks.length, 1);
});
