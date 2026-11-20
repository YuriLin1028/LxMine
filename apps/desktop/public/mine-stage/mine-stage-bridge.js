(function () {
  'use strict';
  if (typeof renderer === 'undefined' || !renderer) {
    window.__lxmineStageUnavailable = true;
    if (window.__lxmineNative && typeof window.__lxmineNative.degraded === 'function') window.__lxmineNative.degraded();
    if (parent !== window) parent.postMessage({ type: 'lxmine-stage-degraded' }, location.origin);
    return;
  }
  var nativeClock = { position: 0, at: performance.now(), playing: false };
  var sourceUrl = '';
  var lyricKey = '';
  var cover = '';
  var songId = '';
  var customBgImage = '';
  var customBgOpacity = null;
  var bgOverrideStyle = null;
  function applyStageBackground() {
    var hasOp = customBgOpacity !== null && isFinite(customBgOpacity);
    var op = hasOp ? Math.max(0, Math.min(1, Number(customBgOpacity))) : null;
    if (!bgOverrideStyle) {
      bgOverrideStyle = document.getElementById('lxmine-bg-override');
      if (!bgOverrideStyle) {
        bgOverrideStyle = document.createElement('style');
        bgOverrideStyle.id = 'lxmine-bg-override';
        document.head.appendChild(bgOverrideStyle);
      }
    }
    var customBg = document.getElementById('custom-bg');
    var rules = [];
    if (customBgImage) {
      var safeUrl = String(customBgImage).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      var effOp = op !== null ? op : 0.78;
      if (customBg) {
        customBg.style.setProperty('--custom-bg-image', 'url("' + safeUrl + '")');
        customBg.style.setProperty('--custom-bg-image-opacity', effOp.toFixed(3));
        customBg.style.setProperty('--custom-bg-base-opacity', '0');
        customBg.style.setProperty('--custom-bg-overlay-opacity', '0');
      }
      rules.push('#album-bg, #album-bg-next { opacity: 0 !important; }');
      rules.push('#custom-bg { opacity: 1 !important; display: block !important; z-index: 0 !important; }');
      rules.push('#custom-bg::before { opacity: ' + effOp.toFixed(3) + ' !important; background-size: cover !important; filter: none !important; }');
    } else {
      if (customBg) {
        customBg.style.removeProperty('--custom-bg-image');
        customBg.style.setProperty('--custom-bg-image-opacity', '0');
      }
      if (op !== null) {
        rules.push('#album-bg.visible, #album-bg-next.visible { opacity: ' + op.toFixed(3) + ' !important; }');
      }
    }
    bgOverrideStyle.textContent = rules.join('\n');
  }
  var graphReady = false;
  var nativeAnalysis = window.lxmineNativeAnalysis = {
    enabled: false, active: false, sampleRate: 44100, receivedAt: 0,
    frequency: new Uint8Array(1024), waveform: new Uint8Array(2048)
  };
  nativeAnalysis.waveform.fill(128);
  var visualReadyPending = false;
  var wakingPreset = true;
  var prewarmComplete = false;
  var lastStageError = '';
  window.addEventListener('error', function (event) {
    if (event.message) lastStageError = String(event.message).slice(0, 300);
  });
  var nativeOffset = 0;
  var presentation = window.__lxmineStagePresentation = window.__lxmineStagePresentation || { visible: true, detail: true };
  window.lxmineNativeOffset = function () { return nativeOffset; };
  targetVolume = 0; audioFadeEnvelope = 0;
  splashAnimating = false;
  reduceSplashMotion = true;
  document.body.classList.remove('splash-active', 'empty-home-active', 'startup-fast-skip-revealing');
  document.documentElement.classList.remove('startup-fast-skip-preload');
  emptyHomeActive = false;
  homeForcedOpen = false;
  homeSuppressed = true;
  firstPlayDone = true;
  fx.shelf = 'off';
  fx.lyricDisplayMode = 'cinema';
  // LxMine uses its native queue; the stage must never create an interactive shelf.
  if (typeof shelfManager !== 'undefined' && shelfManager) {
    var originalShelfMode = shelfManager.setMode.bind(shelfManager);
    shelfManager.setMode = function () { fx.shelf = 'off'; originalShelfMode('off'); };
    shelfManager.setMode('off');
  }
  fx.lyricSize = Math.min(Number(fx.lyricSize) || 1, 1);
  fx.userLyricScale = 1;
  var isNativeMobileStage = typeof window.__lxmineNative !== 'undefined';
  if (isNativeMobileStage) {
    fx.foregroundFpsMode = '60';
    fx.performanceQuality = 'eco';
    RENDER_DPR_CAP = 0.78;
    RENDER_PIXEL_BUDGET = 540000;
  } else {
    RENDER_DPR_CAP = 1.3;
    RENDER_PIXEL_BUDGET = 2400000;
  }
  audio = new Audio(); audio.crossOrigin = 'anonymous'; audio.preload = 'auto';
  playQueue = [{ id: 'native', name: 'LxMine', artist: '', type: 'song' }]; currentIdx = 0;
  uniforms.uAlpha.value = 1;
  function position() { return Math.max(0, nativeClock.position + (nativeClock.playing ? (performance.now() - nativeClock.at) / 1000 : 0)); }
  function visualReady() {
    if (visualReadyPending || !presentation.visible || !presentation.detail) return;
    if (lyricsLines.length && fx.particleLyrics && (!stageLyrics.current || stageLyrics.currentIdx === -1)) {
      setTimeout(visualReady, 16); return;
    }
    if (window.MineradioSonicWorkshop && MineradioSonicWorkshop.isActive(fx) && !MineradioSonicWorkshop.isReady()) {
      setTimeout(visualReady, 16); return;
    }
    visualReadyPending = true;
    var frame = renderer.info.render.frame;
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      visualReadyPending = false;
      if (!presentation.visible || !presentation.detail) return;
      if (renderer.info.render.frame <= frame) { setTimeout(visualReady, 16); return; }
      if (window.__lxmineNative && typeof window.__lxmineNative.visualReady === 'function') window.__lxmineNative.visualReady();
      if (parent !== window) parent.postMessage({ type: 'lxmine-stage-visual-ready' }, location.origin);
    }); });
  }
  window.lxmineNativeTime = position;

  function readyGraph() {
    if (graphReady) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      source = audioCtx.createMediaElementSource(audio);
      audioSourceMedia = audio;
      analyser = audioCtx.createAnalyser(); analyser.fftSize = FFT_SIZE; analyser.smoothingTimeConstant = 0.58;
      beatAnalyser = audioCtx.createAnalyser(); beatAnalyser.fftSize = BEAT_FFT_SIZE;
      gainNode = audioCtx.createGain(); gainNode.gain.value = 0.000001;
      source.connect(analyser); source.connect(beatAnalyser); analyser.connect(gainNode); gainNode.connect(audioCtx.destination);
      audioReady = true; graphReady = true;
    } catch (error) { console.warn('[LxMineStage] analysis unavailable', error.message); }
  }
  function syncAudio() {
    if (nativeAnalysis.enabled) {
      nativeAnalysis.active = presentation.visible && presentation.detail && nativeClock.playing;
      if (!nativeAnalysis.active) {
        nativeAnalysis.receivedAt = 0;
        nativeAnalysis.frequency.fill(0);
        nativeAnalysis.waveform.fill(128);
      }
      return;
    }
    if (!presentation.visible || !presentation.detail || !sourceUrl || !nativeClock.playing) {
      audio.pause();
      if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(function () {});
      if ((!presentation.visible || !presentation.detail) && audio.getAttribute('src')) {
        audio.removeAttribute('src'); audio.load();
      }
      return;
    }
    if (audio.getAttribute('src') !== sourceUrl) { audio.src = sourceUrl; audio.load(); }
    readyGraph();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
    if (Math.abs((audio.currentTime || 0) - position()) > 0.45 && audio.readyState >= 1) {
      try { audio.currentTime = position(); } catch (_) {}
    }
    if (audio.paused) audio.play().catch(function (error) { console.warn('[LxMineStage] analysis stream', error.message); });
  }
  audio.addEventListener('loadedmetadata', syncAudio);
  function nativeAnalyser() {
    return {
      fftSize: 2048, frequencyBinCount: 1024, smoothingTimeConstant: 0,
      getByteFrequencyData: function (target) {
        if (!nativeAnalysis.active || performance.now() - nativeAnalysis.receivedAt > 400) target.fill(0);
        else target.set(nativeAnalysis.frequency.subarray(0, target.length));
      },
      getByteTimeDomainData: function (target) {
        if (!nativeAnalysis.active || performance.now() - nativeAnalysis.receivedAt > 400) target.fill(128);
        else target.set(nativeAnalysis.waveform.subarray(0, target.length));
      },
      disconnect: function () {}
    };
  }
  function decodeSpectrum(encoded, target) {
    var bytes = atob(encoded || '');
    if (bytes.length !== target.length) return false;
    for (var index = 0; index < bytes.length; index++) target[index] = bytes.charCodeAt(index);
    return true;
  }
  function applyLyricPaletteFromMetadata(data) {
    if (!data) return;
    LxMineAppearance.apply(data.appearance);
    var palette = LxMineAppearance.colors(data.lyricColors);
    var mode = String(data.lyricColorMode || '');
    if (!palette || !mode) return;
    if (typeof fx === 'undefined' || typeof setStageLyricPalette !== 'function') return;
    if (mode.indexOf('custom') === 0) {
      fx.lyricColorMode = 'custom';
      fx.lyricColor = palette.primary || fx.lyricColor;
      setStageLyricPalette({
        primary: palette.primary,
        secondary: palette.secondary || palette.primary,
        highlight: palette.highlight || palette.primary,
        glow: palette.glow || palette.secondary || palette.primary,
        glowColor: palette.glow || palette.secondary || palette.primary,
        shadow: 'rgba(2,8,12,0.42)'
      }, { immediate: true, durationMs: 1, reason: 'lxmine-lyric-color' });
    } else {
      fx.lyricColorMode = 'auto';
      setStageLyricPalette(typeof stageLyrics !== 'undefined' && stageLyrics.coverPalette ? stageLyrics.coverPalette : null, {
        immediate: true, durationMs: 1, reason: 'lxmine-lyric-cover-color'
      });
    }
  }
  window.lxmineStage = {
    spectrum: function (data) {
      if (!nativeAnalysis.enabled || !nativeAnalysis.active) return;
      if (Math.abs(Number(data.positionMs) / 1000 - position()) > 0.5) return;
      if (!decodeSpectrum(data.frequency, nativeAnalysis.frequency) || !decodeSpectrum(data.waveform, nativeAnalysis.waveform)) return;
      nativeAnalysis.sampleRate = Math.max(8000, Number(data.sampleRate) || 44100);
      nativeAnalysis.receivedAt = performance.now();
    },
    presentation: function (state) {
      if (presentation.visible === (state.visible !== false) && presentation.detail === (state.detail === true)) return;
      presentation.visible = state.visible !== false;
      presentation.detail = state.detail === true;
      if (!presentation.visible || !presentation.detail) window.dispatchEvent(new Event('lxmine-stage-hidden'));
      if (!presentation.visible) wakingPreset = true;
      updateRenderPowerClasses();
      applyRendererPowerMode();
      if (window.MineradioSonicWorkshop) MineradioSonicWorkshop.presentation(presentation.visible && presentation.detail);
      syncAudio();
      if (presentation.visible && presentation.detail) markRenderInteraction('native-presentation', 500);
      wakeMainLoopFromBackground();
      visualReady();
    },
    seek: function (seconds) {
      if (!window.__lxmineNative || typeof window.__lxmineNative.seek !== 'function') return false;
      var timeMs = window.LxMineLyrics.seekTime((Number(seconds) || 0) * 1000);
      window.__lxmineNative.seek(Math.round(timeMs));
      nativeClock.position = timeMs / 1000; nativeClock.at = performance.now(); syncAudio(); return true;
    },
    anchor: function () {
      var rows = stageLyrics.current && stageLyrics.current.userData.lyric && stageLyrics.current.userData.lyric.rowLayers;
      var row = rows && rows.find(function (candidate) { return !candidate.isTranslation && candidate.lineIndex === stageLyrics.currentIdx && candidate.mesh && candidate.mesh.visible; });
      if (!row) return 0.5;
      stageLyrics.group.updateMatrixWorld(true);
      var point = new THREE.Vector3(); row.mesh.getWorldPosition(point); point.project(camera);
      return (1 - point.y) / 2;
    },
    metadata: function (data) {
      if (data.nativeSpectrum === true && !nativeAnalysis.enabled) {
        audio.pause(); audio.removeAttribute('src'); audio.load();
        if (audioCtx) audioCtx.close().catch(function () {});
        audioCtx = null;
        nativeAnalysis.enabled = true;
        analyser = nativeAnalyser(); beatAnalyser = nativeAnalyser();
        audioReady = true;
      }
      applyLyricPaletteFromMetadata(data);
      nativeOffset = Number(data.lyricOffset || 0) / 1000;
      if (songId !== data.id) {
        nativeAnalysis.receivedAt = 0;
        nativeAnalysis.frequency.fill(0);
        nativeAnalysis.waveform.fill(128);
        songId = data.id; sourceUrl = ''; audio.pause(); audio.removeAttribute('src'); audio.load();
        // A paused native track still belongs on the playback stage; never let
        // the empty-home wallpaper replace it between tracks.
        document.body.classList.remove('home-wallpaper-preview');
        if (typeof homeWallpaperPrewarmStarted !== 'undefined') homeWallpaperPrewarmStarted = true;
        if (typeof switchPlaybackVisualToEmily === 'function') switchPlaybackVisualToEmily();
      }
      var song = { id: data.id || data.name, name: data.name, artist: data.singer, cover: data.cover, durationMs: data.duration };
      playQueue[0] = song; currentIdx = 0;
      var preset = Math.max(0, Math.min(presetMeta.length - 1, Number(String(data.mode || 'mine-0').replace('mine-', '')) || 0));
      if (fx.preset !== preset) setPreset(preset, { silent: true, noSave: true, skipTransition: wakingPreset });
      wakingPreset = false;
      if (data.cover !== cover) { cover = data.cover; loadCoverFromUrl(cover || '', { trackToken: trackSwitchToken }); }
      if (typeof data.bgImage === 'string' && data.bgImage !== customBgImage) { customBgImage = data.bgImage; }
      if (data.bgOpacity !== undefined && data.bgOpacity !== null && isFinite(Number(data.bgOpacity))) {
        customBgOpacity = Math.max(0, Math.min(1, Number(data.bgOpacity)));
      }
      applyStageBackground();
      var userScale = Math.max(0.75, Math.min(1.4, Number(data.lyricScale) || 1));
      if (typeof fx !== 'undefined') fx.userLyricScale = userScale;
      var nextLyrics = JSON.stringify([data.id, data.lines, data.translationLines, data.lyricOffset]);
      if (nextLyrics !== lyricKey) {
        lyricKey = nextLyrics;
        var lines = LxMineLyrics.stageLines(data.lines || [], data.duration);
        var translations = (data.translationLines || []).map(function (line, index, all) {
          return { t: line.timeMs / 1000, text: line.text, duration: Math.max(0.1, ((all[index + 1] ? all[index + 1].timeMs : data.duration || line.timeMs + 4800) - line.timeMs) / 1000) };
        }).filter(function (line) { return line.text; });
        if (typeof fx !== 'undefined') fx.lyricTranslationMode = translations.length ? 'multi' : 'off';
        setOriginalLyricsState(lines, lines.some(function (line) { return line.words.length; }), 'native-clock', translations, translations.length ? 'lxmine-settings' : 'none');
        if (typeof applyOriginalLyricsState === 'function') applyOriginalLyricsState({ immediate: true, rebuild: true });
        else applyPreferredLyricsForCurrent(false);
        if (lines.length && !stageLyrics.current) {
          var index = Math.max(0, findStageLyricIndexAtTime(position() + nativeOffset));
          var initial = buildStageLyricDisplayPayload(index, { lightweightTrack: true });
          if (initial) {
            clearStageLyricWarmup();
            if (showStageLine(initial, true)) stageLyrics.currentIdx = index;
          }
        }
      }
      if (data.audioUrl && data.audioUrl !== sourceUrl) {
        sourceUrl = data.audioUrl; audio.pause();
      }
      syncAudio();
      if (presentation.visible && presentation.detail) {
        markRenderInteraction('native-metadata', 500);
        wakeMainLoopFromBackground();
      }
      visualReady();
    },
    setBackground: function (opts) {
      opts = opts || {};
      if (typeof opts.bgImage === 'string') customBgImage = opts.bgImage;
      if (opts.bgOpacity !== undefined && opts.bgOpacity !== null && isFinite(Number(opts.bgOpacity))) {
        customBgOpacity = Math.max(0, Math.min(1, Number(opts.bgOpacity)));
      }
      applyStageBackground();
    },
    clock: function (data) {
      nativeClock.position = Math.max(0, Number(data.positionMs) || 0) / 1000;
      nativeClock.at = performance.now(); nativeClock.playing = data.playing === true;
      playing = nativeClock.playing;
      syncAudio();
    },
    diagnostics: function () { var probe = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(1); if (analyser) analyser.getByteFrequencyData(probe); return { error: lastStageError, build: window.__LXMINE_STAGE_REVISION, visible: presentation.visible, detail: presentation.detail, hidden: document.hidden, deep: isDeepBackgroundMode(), renderedFrames: renderer.info.render.frame, renderPixels: renderer.domElement.width * renderer.domElement.height, capturedAt: Date.now(), prewarmed: prewarmComplete, directPeak: Math.max.apply(null, probe), nativePlaying: nativeClock.playing, sourceMatches: audio.src === sourceUrl, ready: true, preset: fx.preset, playing: playing, position: position(), analyser: !!analyser, audioContext: audioCtx && audioCtx.state, nativeAnalysis: nativeAnalysis.enabled, nativeSpectrumAge: nativeAnalysis.receivedAt ? performance.now() - nativeAnalysis.receivedAt : -1, audioError: audio.error ? audio.error.code : 0, frequencyPeak: Math.max.apply(null, frequencyData), bass: smoothBass, beat: beatPulse, particleLyrics: fx.particleLyrics, lyricGroup: !!stageLyrics.group, lyricText: stageLyrics.currentText, lyricIndex: stageLyrics.currentIdx, lyricMesh: !!stageLyrics.current, camera: camera.position.toArray(), signal: smoothEnergy, audioTime: audio.currentTime, audioPaused: audio.paused, lyrics: lyricsLines.length, width: innerWidth, height: innerHeight, lyricSeek: window.lxmineLyricSeekDiagnostics ? window.lxmineLyricSeekDiagnostics() : null, touch: window.lxmineTouchDiagnostics ? window.lxmineTouchDiagnostics() : null, perf: window.__mineradioRenderPerf }; }
  };
  // Start asynchronous assets immediately, including when the player opens during startup.
  var skullWarmup = loadSkullParticleAsset();
  var workshopWarmup = Promise.resolve().then(function () {
    if (window.MineradioSonicWorkshop) return MineradioSonicWorkshop.prewarm();
  }).catch(function (error) { console.warn('[LxMineStage] workshop warmup', error.message); });
  var warmTasks = [
    function () { renderer.compile(scene, camera); },
    function () { if (window.MineradioSonicTopography) MineradioSonicTopography.prewarm(scene, fx, renderer, camera); },
    function () { return skullWarmup.then(function (data) {
      if (!data) return;
      warmTasks.unshift(function () {
        var skull = createSkullParticleLayer();
        if (!skull) return;
        skull.visible = true;
        try { renderer.compile(scene, camera); } finally { skull.visible = fx.preset === SKULL_PRESET_INDEX; }
      });
    }); },
    function () { return workshopWarmup; }
  ];
  function warmNext() {
    if (!warmTasks.length) { prewarmComplete = true; return; }
    if (presentation.visible) { setTimeout(warmNext, 1000); return; }
    Promise.resolve().then(warmTasks.shift()).catch(function (error) { console.warn('[LxMineStage] warmup', error.message); })
      .then(function () { setTimeout(warmNext, 100); });
  }
  applyRendererPowerMode();
  setTimeout(warmNext, 0);
  if (window.__lxmineNative && typeof window.__lxmineNative.ready === 'function') window.__lxmineNative.ready();
  if (parent !== window) parent.postMessage({ type: 'lxmine-stage-ready' }, location.origin);
})();
