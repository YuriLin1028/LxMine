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
  var songCover = '';
  var songId = '';
  var resetCameraOnSong = true;
  var customBgImage = '';
  var customBgOpacity = null;
  var wpBgOpacity = 0.42;
  var wpOverallOpacity = 0.95;
  var bgOverrideStyle = null;
  function isPlaceholderLyricLine(text) {
    var s = String(text || '').trim();
    return !s || /^[\/\\\-—–_~·•\s]+$/.test(s);
  }
  function applyWallpaperOpacity() {
    var rootEl = document.documentElement;
    if (!rootEl) return;
    rootEl.style.setProperty('--wp-bg-opacity', String(Math.max(0, Math.min(1, Number(wpBgOpacity)))));
    rootEl.style.setProperty('--wp-overall-opacity', String(Math.max(0.2, Math.min(1, Number(wpOverallOpacity)))));
  }
  applyWallpaperOpacity();
  function syncEffectiveVisualCover() {
    var effective = customBgImage || songCover || '';
    if (effective !== cover) {
      cover = effective;
      loadCoverFromUrl(cover, { trackToken: trackSwitchToken });
    }
  }
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
      if (effOp > 0.005) {
        rules.push('#sonic-workshop-layer { mix-blend-mode: screen !important; }');
      }
    } else {
      if (customBg) {
        customBg.style.removeProperty('--custom-bg-image');
        customBg.style.setProperty('--custom-bg-image-opacity', '0');
      }
      if (op !== null) {
        rules.push('#album-bg.visible, #album-bg-next.visible { opacity: ' + op.toFixed(3) + ' !important; }');
        if (op > 0.005) {
          rules.push('#sonic-workshop-layer { mix-blend-mode: screen !important; }');
        }
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
  // Never show legacy MineRadio upstream source-fallback popups or loading chips inside LxMine stage.
  window.showSourceFallbackNotice = function () {};
  window.showToast = function () {};
  (function hideLegacyLoadingBoxes() {
    if (document.getElementById('lxmine-no-loading-chips')) return;
    var s = document.createElement('style');
    s.id = 'lxmine-no-loading-chips';
    s.textContent = '#loading-overlay,#ai-depth-chip,#beat-chip,#trial-banner,#source-fallback-notice{display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;}';
    document.head.appendChild(s);
  })();
  fx.lyricSize = Math.min(Number(fx.lyricSize) || 1, 1);
  fx.userLyricScale = 1;
  function enforceUprightStageLyrics() {
    if (typeof fx === 'undefined') return;
    // Keep lyrics in 3D world space (lyricCameraLock = false) so 360° orbit rotates both visuals and lyrics together,
    // while keeping zero tilt/offset at rest so lines stay straight and centered.
    fx.lyricCameraLock = false;
    fx.lyricTiltX = 0;
    fx.lyricTiltY = 0;
    fx.lyricOffsetX = 0;
  }
  function resetStageCameraView() {
    try {
      if (typeof orbit !== 'undefined' && orbit) {
        orbit.rotating = false;
        if (typeof defaultOrbitStateForPreset === 'function' && typeof fx !== 'undefined' && fx) {
          var base = defaultOrbitStateForPreset(fx.preset);
          if (base) {
            orbit.baselineTheta = Number.isFinite(base.theta) ? base.theta : 0;
            orbit.baselinePhi = typeof clampRange === 'function' ? clampRange(base.phi, orbit.minPhi, orbit.maxPhi) : (Number.isFinite(base.phi) ? base.phi : 0.08);
            orbit.baselineRadius = typeof clampRange === 'function' ? clampRange(base.radius, orbit.minRadius, orbit.maxRadius) : (Number.isFinite(base.radius) ? base.radius : 6.6);
          }
        }
      }
      if (typeof particlePointerSpin !== 'undefined' && particlePointerSpin) {
        particlePointerSpin.active = false;
      }
      if (typeof freeCamera !== 'undefined' && freeCamera && (freeCamera.active || freeCamera.locked) && typeof resetFreeCameraToDefault === 'function') {
        resetFreeCameraToDefault();
      }
      if (typeof recenterCamera === 'function') {
        recenterCamera();
      }
      if (window.MineradioSonicWorkshop && typeof MineradioSonicWorkshop.resetView === 'function') {
        MineradioSonicWorkshop.resetView();
      }
      if (typeof markRenderInteraction === 'function') {
        markRenderInteraction('track-camera-reset', 1200);
      }
    } catch (_) {}
  }
  enforceUprightStageLyrics();
  var isNativeMobileStage = typeof navigator !== 'undefined' && /Android|HarmonyOS|OpenHarmony|OHOS|Mobile|iPhone|iPad/i.test(navigator.userAgent || '');
  if (isNativeMobileStage) {
    fx.foregroundFpsMode = 'vsync';
    fx.performanceQuality = 'balanced';
    RENDER_DPR_CAP = 1.25;
    RENDER_PIXEL_BUDGET = 950000;
    if (typeof applyRendererPowerMode === 'function') applyRendererPowerMode();
  } else {
    fx.foregroundFpsMode = 'adaptive';
    RENDER_DPR_CAP = 1.35;
    RENDER_PIXEL_BUDGET = 1850000;
    if (typeof applyRendererPowerMode === 'function') applyRendererPowerMode();
  }
  audio = new Audio(); audio.crossOrigin = 'anonymous'; audio.preload = 'auto';
  playQueue = [{ id: 'native', name: 'LxMine', artist: '', type: 'song' }]; currentIdx = 0;
  uniforms.uAlpha.value = 1;
  var nativeClockRate = 1;
  var nativeClockRateUntil = 0;
  function position() {
    var now = performance.now();
    if (nativeClock.playing) {
      if (nativeClockRate !== 1 && nativeClockRateUntil > 0 && now >= nativeClockRateUntil) {
        nativeClock.position = nativeClock.position + ((nativeClockRateUntil - nativeClock.at) / 1000) * nativeClockRate;
        nativeClock.at = nativeClockRateUntil;
        nativeClockRate = 1;
        nativeClockRateUntil = 0;
      }
      return Math.max(0, nativeClock.position + ((now - nativeClock.at) / 1000) * nativeClockRate);
    }
    return Math.max(0, nativeClock.position);
  }
  function applyNativeClockSample(inMs, nextPlaying, snapImmediate) {
    var now = performance.now();
    var curSec = position();
    var inSec = Math.max(0, Number(inMs) || 0) / 1000;
    var diffSec = inSec - curSec;
    if (!snapImmediate && nativeClock.playing && nextPlaying) {
      if (Math.abs(diffSec) > 0.45 || nativeClock.at <= 0) {
        nativeClock.position = inSec;
        nativeClock.at = now;
        nativeClockRate = 1;
        nativeClockRateUntil = 0;
      } else if (Math.abs(diffSec) < 0.018) {
        nativeClock.position = curSec;
        nativeClock.at = now;
        nativeClockRate = 1;
        nativeClockRateUntil = 0;
      } else {
        var catchupMs = Math.min(850, Math.max(220, Math.abs(diffSec) * 2400));
        var rate = Math.max(0.90, Math.min(1.10, 1 + (diffSec * 1000) / catchupMs));
        var windowMs = Math.abs(rate - 1) > 0.0005 ? Math.min(1200, Math.abs((diffSec * 1000) / (rate - 1))) : 0;
        nativeClock.position = curSec;
        nativeClock.at = now;
        nativeClockRate = rate;
        nativeClockRateUntil = windowMs > 0 ? now + windowMs : 0;
      }
    } else if (!snapImmediate && nativeClock.playing && !nextPlaying && Math.abs(diffSec) < 0.40) {
      nativeClock.position = curSec;
      nativeClock.at = now;
      nativeClockRate = 1;
      nativeClockRateUntil = 0;
    } else {
      nativeClock.position = inSec;
      nativeClock.at = now;
      nativeClockRate = 1;
      nativeClockRateUntil = 0;
    }
    nativeClock.playing = !!nextPlaying;
    playing = nativeClock.playing;
  }
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

  var vocalCancelState = { active: false, vocalGain: 1.0 };
  var vocalCancelNodes = null;
  function makeSoftClipCurve(knee, ceiling) {
    var n = 4096, curve = new Float32Array(n), span = ceiling - knee;
    for (var i = 0; i < n; i += 1) {
      var x = (i * 2) / (n - 1) - 1;
      var ax = Math.abs(x);
      if (ax <= knee) curve[i] = x;
      else {
        var y = knee + span * Math.tanh((ax - knee) / span);
        curve[i] = x < 0 ? -y : y;
      }
    }
    return curve;
  }
  function applyVocalCancelGains() {
    if (!vocalCancelNodes || !audioCtx) return;
    var now = audioCtx.currentTime;
    var active = !!vocalCancelState.active;
    var v = Math.max(0, Math.min(1.5, Number(vocalCancelState.vocalGain)));
    if (!isFinite(v)) v = 1.0;
    var suppress = Math.max(0, 1 - Math.min(1, v));
    var boost = Math.max(0, (v - 1.0) * 2.0);
    var midDirect = v <= 1.0 ? (v * v) : 1.0;
    var lowKeep = suppress * (1 + suppress * 0.12);
    var midBoostDb = boost * 5.2;
    var sideNotchDb = suppress > 0 ? (-7.5 * suppress) : (-2.2 * boost);
    var sideGain = suppress > 0 ? (1.0 + suppress * 0.42) : (1.0 - boost * 0.34);
    var trim = 1.0 / (1.0 + boost * 0.24);
    vocalCancelNodes.midVocalDirect.gain.setTargetAtTime(midDirect, now, 0.025);
    vocalCancelNodes.midLowPreserve.gain.setTargetAtTime(lowKeep, now, 0.025);
    vocalCancelNodes.midVocalBoostEq.gain.setTargetAtTime(midBoostDb, now, 0.025);
    vocalCancelNodes.sideVocalNotch.gain.setTargetAtTime(sideNotchDb, now, 0.025);
    vocalCancelNodes.sidePreserve.gain.setTargetAtTime(sideGain, now, 0.025);
    vocalCancelNodes.outGain.gain.setTargetAtTime(active ? trim : 0.0, now, 0.025);
  }
  function ensureVocalCancelChain() {
    if (vocalCancelNodes || !audioCtx || !source) return;
    try {
      // Lazy 4th-Order Sub-Bass (105Hz) + Mid-Side Vocal Suppressor / Zero-Clip Vocal Booster:
      // Only constructed when ear-monitor / vocal-cancel is actually enabled so normal playback incurs zero DSP cost.
      var vcSplit = audioCtx.createChannelSplitter(2);
      var vcMerge = audioCtx.createChannelMerger(2);
      var lToMid = audioCtx.createGain(); lToMid.gain.value = 0.5;
      var rToMid = audioCtx.createGain(); rToMid.gain.value = 0.5;
      var lToSide = audioCtx.createGain(); lToSide.gain.value = 0.5;
      var rToSide = audioCtx.createGain(); rToSide.gain.value = -0.5;
      var midBus = audioCtx.createGain(); midBus.gain.value = 1.0;
      var sideBus = audioCtx.createGain(); sideBus.gain.value = 1.0;
      var midVocalDirect = audioCtx.createGain(); midVocalDirect.gain.value = 1.0;
      var midLowLp1 = audioCtx.createBiquadFilter(); midLowLp1.type = 'lowpass'; midLowLp1.frequency.value = 105; midLowLp1.Q.value = 0.7071;
      var midLowLp2 = audioCtx.createBiquadFilter(); midLowLp2.type = 'lowpass'; midLowLp2.frequency.value = 105; midLowLp2.Q.value = 0.7071;
      var midLowPreserve = audioCtx.createGain(); midLowPreserve.gain.value = 0.0;
      var midVocalBoostEq = audioCtx.createBiquadFilter(); midVocalBoostEq.type = 'peaking'; midVocalBoostEq.frequency.value = 1850; midVocalBoostEq.Q.value = 0.65; midVocalBoostEq.gain.value = 0.0;
      var midOut = audioCtx.createGain(); midOut.gain.value = 1.0;
      var sideVocalNotch = audioCtx.createBiquadFilter(); sideVocalNotch.type = 'peaking'; sideVocalNotch.frequency.value = 1550; sideVocalNotch.Q.value = 0.52; sideVocalNotch.gain.value = 0.0;
      var sidePreserve = audioCtx.createGain(); sidePreserve.gain.value = 1.0;
      var sideInvert = audioCtx.createGain(); sideInvert.gain.value = -1.0;
      var outGain = audioCtx.createGain(); outGain.gain.value = 0.0;
      var shaper = audioCtx.createWaveShaper(); shaper.curve = makeSoftClipCurve(0.72, 0.94); shaper.oversample = '2x';
      var limiter = audioCtx.createDynamicsCompressor();
      limiter.threshold.value = -10; limiter.knee.value = 14; limiter.ratio.value = 6; limiter.attack.value = 0.002; limiter.release.value = 0.08;
      source.connect(vcSplit);
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
      vocalCancelNodes = { midVocalDirect: midVocalDirect, midLowPreserve: midLowPreserve, midVocalBoostEq: midVocalBoostEq, sideVocalNotch: sideVocalNotch, sidePreserve: sidePreserve, outGain: outGain };
    } catch (error) { console.warn('[LxMineStage] vocal-cancel chain unavailable', error.message); }
  }
  function readyGraph() {
    if (graphReady) {
      if (vocalCancelState.active) { ensureVocalCancelChain(); applyVocalCancelGains(); }
      return;
    }
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      source = audioCtx.createMediaElementSource(audio);
      audioSourceMedia = audio;
      analyser = audioCtx.createAnalyser(); analyser.fftSize = FFT_SIZE; analyser.smoothingTimeConstant = 0.58;
      beatAnalyser = audioCtx.createAnalyser(); beatAnalyser.fftSize = BEAT_FFT_SIZE;
      gainNode = audioCtx.createGain(); gainNode.gain.value = 0.000001;
      source.connect(analyser); source.connect(beatAnalyser); analyser.connect(gainNode); gainNode.connect(audioCtx.destination);
      if (vocalCancelState.active) {
        ensureVocalCancelChain();
        applyVocalCancelGains();
      }
      audioReady = true; graphReady = true;
    } catch (error) { console.warn('[LxMineStage] analysis unavailable', error.message); }
  }
  function syncAudio() {
    if (nativeAnalysis.enabled && !vocalCancelState.active) {
      nativeAnalysis.active = presentation.visible && presentation.detail && nativeClock.playing;
      if (!nativeAnalysis.active) {
        nativeAnalysis.receivedAt = 0;
        nativeAnalysis.frequency.fill(0);
        nativeAnalysis.waveform.fill(128);
      }
      return;
    }
    var needStream = vocalCancelState.active
      ? (!!sourceUrl && nativeClock.playing)
      : (presentation.visible && presentation.detail && !!sourceUrl && nativeClock.playing);
    if (!needStream) {
      audio.pause();
      if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(function () {});
      if (!vocalCancelState.active && (!presentation.visible || !presentation.detail) && audio.getAttribute('src')) {
        audio.removeAttribute('src'); audio.load();
      }
      return;
    }
    if (audio.getAttribute('src') !== sourceUrl) { audio.src = sourceUrl; audio.load(); }
    readyGraph();
    applyVocalCancelGains();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
    var driftLimit = vocalCancelState.active ? 0.30 : 0.45;
    if (Math.abs((audio.currentTime || 0) - position()) > driftLimit && audio.readyState >= 1) {
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
    if (palette && palette.primary) {
      window.__lxminePalette = {
        primary: palette.primary,
        secondary: palette.secondary || palette.primary,
        highlight: palette.highlight || palette.glow || palette.primary
      };
    } else if (typeof stageLyrics !== 'undefined' && stageLyrics && stageLyrics.coverPalette && stageLyrics.coverPalette.primary) {
      window.__lxminePalette = stageLyrics.coverPalette;
    }
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
      if (presentation.visible && presentation.detail && typeof refreshMainRendererViewport === 'function') {
        if (window.__lxmineViewportDirty && typeof flushPendingMainRendererViewport === 'function') {
          flushPendingMainRendererViewport();
        }
        refreshMainRendererViewport('sync', false);
      } else {
        applyRendererPowerMode();
      }
      if (window.MineradioSonicWorkshop) MineradioSonicWorkshop.presentation(presentation.visible && presentation.detail);
      syncAudio();
      if (presentation.visible && presentation.detail) markRenderInteraction('native-presentation', 500);
      wakeMainLoopFromBackground();
      visualReady();
    },
    setInsets: function (insets) {
      if (!insets) return;
      window.__lxmineStageInsets = {
        topInset: Math.max(0, Number(insets.topInset) || 0),
        bottomInset: Math.max(0, Number(insets.bottomInset) || 0)
      };
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
      if (typeof data.resetCameraOnSong === 'boolean') resetCameraOnSong = data.resetCameraOnSong;
      var hadPrevSong = Boolean(songId);
      var songChanged = songId !== data.id;
      if (songChanged) {
        nativeAnalysis.receivedAt = 0;
        nativeAnalysis.frequency.fill(0);
        nativeAnalysis.waveform.fill(128);
        if (data.positionMs !== undefined && data.positionMs !== null && isFinite(Number(data.positionMs))) {
          applyNativeClockSample(Number(data.positionMs), data.playing === true, true);
        } else {
          nativeClock.position = 0;
          nativeClock.at = performance.now();
          nativeClockRate = 1;
          nativeClockRateUntil = 0;
          nativeClock.playing = data.playing === true;
          playing = nativeClock.playing;
        }
        lyricKey = '';
        if (typeof clearStageLyrics === 'function') clearStageLyrics();
        if (typeof stageLyrics !== 'undefined' && stageLyrics) stageLyrics.currentIdx = -1;
        songId = data.id; sourceUrl = ''; audio.pause(); audio.removeAttribute('src'); audio.load();
        document.body.classList.remove('home-wallpaper-preview');
        if (typeof homeWallpaperPrewarmStarted !== 'undefined') homeWallpaperPrewarmStarted = true;
        if (typeof switchPlaybackVisualToEmily === 'function') switchPlaybackVisualToEmily();
        if (typeof markRenderInteraction === 'function') markRenderInteraction('track-switch', 1400);
      } else if (data.positionMs !== undefined && data.positionMs !== null && isFinite(Number(data.positionMs))) {
        applyNativeClockSample(Number(data.positionMs), data.playing !== undefined ? data.playing === true : nativeClock.playing, false);
      }
      var song = { id: data.id || data.name, name: data.name, artist: data.singer, cover: data.cover, durationMs: data.duration };
      playQueue[0] = song; currentIdx = 0;
      var preset = Math.max(0, Math.min(presetMeta.length - 1, Number(String(data.mode || 'mine-0').replace('mine-', '')) || 0));
      if (fx.preset !== preset) setPreset(preset, { silent: true, noSave: true, skipTransition: wakingPreset, preserveCamera: songChanged && hadPrevSong && !resetCameraOnSong });
      if (songChanged && hadPrevSong && resetCameraOnSong) resetStageCameraView();
      enforceUprightStageLyrics();
      wakingPreset = false;
      songCover = data.cover || '';
      if (typeof data.bgImage === 'string' && data.bgImage !== customBgImage) { customBgImage = data.bgImage; }
      if (data.bgOpacity !== undefined && data.bgOpacity !== null && isFinite(Number(data.bgOpacity))) {
        customBgOpacity = Math.max(0, Math.min(1, Number(data.bgOpacity)));
      }
      if (data.wallpaperBgOpacity !== undefined && data.wallpaperBgOpacity !== null && isFinite(Number(data.wallpaperBgOpacity))) {
        wpBgOpacity = Math.max(0, Math.min(1, Number(data.wallpaperBgOpacity)));
        applyWallpaperOpacity();
      }
      if (data.wallpaperOverallOpacity !== undefined && data.wallpaperOverallOpacity !== null && isFinite(Number(data.wallpaperOverallOpacity))) {
        wpOverallOpacity = Math.max(0.2, Math.min(1, Number(data.wallpaperOverallOpacity)));
        applyWallpaperOpacity();
      }
      syncEffectiveVisualCover();
      applyStageBackground();
      var userScale = Math.max(0.55, Math.min(1.5, Number(data.lyricScale) || 1));
      var userLineSpacing = Math.max(0.85, Math.min(1.8, Number(data.lyricLineSpacing) || 1.2));
      var userMaxLines = Math.max(0, Math.min(10, Math.round(Number(data.lyricMaxLines) || 0)));
      if (typeof fx !== 'undefined') {
        fx.userLyricScale = userScale;
        fx.lyricLineHeight = Math.max(0.85, Math.min(1.5, userLineSpacing));
        fx.lyricContextSpread = Math.max(0.75, Math.min(2.0, 1.24 * (userLineSpacing / 1.2)));
        // Pin translation/romaji scale & opacity to match plain-stage.html visual size & #ffffff8f tone regardless of saved localStorage/preset state.
        fx.lyricTranslationScale = 0.48;
        fx.lyricTranslationOpacity = 0.58;
        fx.lyricTranslationGap = Math.max(0.28, Math.min(1.2, 0.40 * (0.78 + userLineSpacing * 0.18)));
        if (userMaxLines > 0) {
          fx.lyricDisplayMode = userMaxLines === 1 ? 'single' : 'custom';
          fx.lyricCustomLineCount = userMaxLines;
        } else {
          fx.lyricDisplayMode = 'cinema';
        }
      }
      var wrapBucket = typeof lyricWrapWidthBucket === 'function' ? lyricWrapWidthBucket() : 0;
      var rawLines = Array.isArray(data.lines) ? data.lines : [];
      var rawTrans = Array.isArray(data.translationLines) ? data.translationLines : [];
      var firstL = rawLines[0], midL = rawLines[rawLines.length >> 1], lastL = rawLines[rawLines.length - 1];
      var firstT = rawTrans[0], lastT = rawTrans[rawTrans.length - 1];
      var nextLyrics = [
        data.id || '', rawLines.length, rawTrans.length, Number(data.lyricOffset) || 0,
        userLineSpacing, userMaxLines, wrapBucket,
        firstL ? (firstL.timeMs + ':' + (firstL.text || '').slice(0, 16) + ':' + (firstL.words ? firstL.words.length : 0)) : '',
        midL ? (midL.timeMs + ':' + (midL.text || '').slice(0, 12)) : '',
        lastL ? (lastL.timeMs + ':' + (lastL.text || '').slice(0, 16)) : '',
        firstT ? (firstT.timeMs + ':' + (firstT.text || '').slice(0, 12)) : '',
        lastT ? (lastT.timeMs + ':' + (lastT.text || '').slice(0, 12)) : ''
      ].join('|');
      if (nextLyrics !== lyricKey) {
        lyricKey = nextLyrics;
        var lines = LxMineLyrics.stageLines(data.lines || [], data.duration);
        var translations = (data.translationLines || []).map(function (line, index, all) {
          var cleanText = String(line.text || '').trim();
          return { t: line.timeMs / 1000, text: isPlaceholderLyricLine(cleanText) ? '' : cleanText, duration: Math.max(0.1, ((all[index + 1] ? all[index + 1].timeMs : data.duration || line.timeMs + 4800) - line.timeMs) / 1000) };
        }).filter(function (line) { return line.text; });
        // Attach matched translation/romaji directly onto each stage lyric line so dynamic 3D lyrics render it identically to plain mode.
        if (translations.length && lines.length) {
          for (var li = 0; li < lines.length; li++) {
            if (lines[li].translation) continue;
            var bestText = '';
            var bestDiff = 0.68;
            for (var ti = 0; ti < translations.length; ti++) {
              var diff = Math.abs(translations[ti].t - lines[li].t);
              if (diff <= bestDiff) {
                bestDiff = diff;
                bestText = translations[ti].text;
              }
            }
            if (bestText) lines[li].translation = bestText;
          }
        }
        var hasAnyTranslation = translations.length > 0 || lines.some(function (line) { return !!line.translation; });
        if (typeof fx !== 'undefined') fx.lyricTranslationMode = hasAnyTranslation ? 'multi' : 'off';
        setOriginalLyricsState(lines, lines.some(function (line) { return line.words.length; }), 'native-clock', translations, hasAnyTranslation ? 'lxmine-settings' : 'none');
        if (typeof applyOriginalLyricsState === 'function') applyOriginalLyricsState({ immediate: true, rebuild: true });
        else applyPreferredLyricsForCurrent(false);
        if (lines.length) {
          var index = Math.max(0, findStageLyricIndexAtTime(position() + nativeOffset));
          var initial = buildStageLyricDisplayPayload(index, { lightweightTrack: true });
          if (initial) {
            clearStageLyricWarmup();
            if (showStageLine(initial, true)) stageLyrics.currentIdx = index;
          }
        } else {
          // Switching to a new track whose lyrics are still fetching or instrumental:
          // always clear the previous track's 3D lyric meshes immediately so stale lyrics never linger.
          if (typeof clearStageLyrics === 'function') clearStageLyrics();
          if (typeof stageLyrics !== 'undefined' && stageLyrics) stageLyrics.currentIdx = -1;
        }
      } else if (typeof fx !== 'undefined') {
        var existingTrans = (lyricsTranslationLines && lyricsTranslationLines.length > 0) || (lyricsLines && lyricsLines.some(function (line) { return !!line.translation; }));
        fx.lyricTranslationMode = existingTrans ? 'multi' : 'off';
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
      syncEffectiveVisualCover();
      applyStageBackground();
    },
    clock: function (data) {
      applyNativeClockSample(Number(data && data.positionMs) || 0, !!(data && data.playing), false);
      syncAudio();
    },
    vocalCancel: function (cfg) {
      cfg = cfg || {};
      var nextActive = cfg.active === true;
      var nextGain = Number(cfg.vocalGain);
      if (!isFinite(nextGain)) nextGain = 1.0;
      vocalCancelState.active = nextActive;
      vocalCancelState.vocalGain = Math.max(0, Math.min(1.5, nextGain));
      if (nextActive && graphReady) ensureVocalCancelChain();
      applyVocalCancelGains();
      syncAudio();
    },
    diagnostics: function () { var probe = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(1); if (analyser) analyser.getByteFrequencyData(probe); return { error: lastStageError, build: window.__LXMINE_STAGE_REVISION, visible: presentation.visible, detail: presentation.detail, hidden: document.hidden, deep: isDeepBackgroundMode(), renderedFrames: renderer.info.render.frame, renderPixels: renderer.domElement.width * renderer.domElement.height, capturedAt: Date.now(), prewarmed: prewarmComplete, directPeak: Math.max.apply(null, probe), nativePlaying: nativeClock.playing, sourceMatches: audio.src === sourceUrl, ready: true, preset: fx.preset, playing: playing, position: position(), analyser: !!analyser, audioContext: audioCtx && audioCtx.state, nativeAnalysis: nativeAnalysis.enabled, nativeSpectrumAge: nativeAnalysis.receivedAt ? performance.now() - nativeAnalysis.receivedAt : -1, audioError: audio.error ? audio.error.code : 0, frequencyPeak: Math.max.apply(null, frequencyData), bass: smoothBass, beat: beatPulse, particleLyrics: fx.particleLyrics, lyricGroup: !!stageLyrics.group, lyricText: stageLyrics.currentText, lyricIndex: stageLyrics.currentIdx, lyricMesh: !!stageLyrics.current, camera: camera.position.toArray(), signal: smoothEnergy, audioTime: audio.currentTime, audioPaused: audio.paused, lyrics: lyricsLines.length, width: innerWidth, height: innerHeight, lyricSeek: window.lxmineLyricSeekDiagnostics ? window.lxmineLyricSeekDiagnostics() : null, touch: window.lxmineTouchDiagnostics ? window.lxmineTouchDiagnostics() : null, perf: window.__mineradioRenderPerf }; }
  };
  // Compile base scene cheaply; on mobile keep heavy optional presets (skull 1MB asset,
  // sonic-workshop nested WebGL iframe, sonic-topography instanced grid) lazy on demand
  // to save RAM and startup time, while prewarming them dormant on desktop for <1s switching.
  var skullWarmup = !isNativeMobileStage ? loadSkullParticleAsset() : null;
  var workshopWarmup = !isNativeMobileStage ? Promise.resolve().then(function () {
    if (window.MineradioSonicWorkshop) return MineradioSonicWorkshop.prewarm();
  }).catch(function (error) { console.warn('[LxMineStage] workshop warmup', error.message); }) : null;
  var warmTasks = [
    function () { renderer.compile(scene, camera); }
  ];
  if (!isNativeMobileStage) {
    warmTasks.push(function () {
      if (window.MineradioSonicTopography) MineradioSonicTopography.prewarm(scene, fx, renderer, camera);
    });
    warmTasks.push(function () {
      return skullWarmup.then(function (data) {
        if (!data) return;
        warmTasks.unshift(function () {
          var skull = createSkullParticleLayer();
          if (!skull) return;
          skull.visible = true;
          try { renderer.compile(scene, camera); } finally { skull.visible = fx.preset === SKULL_PRESET_INDEX; }
        });
      });
    });
    warmTasks.push(function () { return workshopWarmup; });
  }
  function warmNext() {
    if (!warmTasks.length) { prewarmComplete = true; return; }
    if (presentation.visible || presentation.detail) { setTimeout(warmNext, 1600); return; }
    Promise.resolve().then(warmTasks.shift()).catch(function (error) { console.warn('[LxMineStage] warmup', error.message); })
      .then(function () { setTimeout(warmNext, 120); });
  }
  applyRendererPowerMode();
  setTimeout(warmNext, 0);
  if (window.__lxmineNative && typeof window.__lxmineNative.ready === 'function') window.__lxmineNative.ready();
  if (parent !== window) parent.postMessage({ type: 'lxmine-stage-ready' }, location.origin);
})();
