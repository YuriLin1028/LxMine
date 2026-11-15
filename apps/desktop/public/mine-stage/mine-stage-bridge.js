(function () {
  'use strict';
  var nativeClock = { position: 0, at: performance.now(), playing: false };
  var sourceUrl = '';
  var lyricKey = '';
  var cover = '';
  var songId = '';
  var graphReady = false;
  var nativeOffset = 0;
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
  // LxMine uses its native queue; the stage must never create an interactive shelf.
  if (typeof shelfManager !== 'undefined' && shelfManager) {
    var originalShelfMode = shelfManager.setMode.bind(shelfManager);
    shelfManager.setMode = function () { fx.shelf = 'off'; originalShelfMode('off'); };
    shelfManager.setMode('off');
  }
  fx.lyricSize = Math.min(Number(fx.lyricSize) || 1, 1);
  RENDER_DPR_CAP = 1.3;
  RENDER_PIXEL_BUDGET = 2800000;
  audio = new Audio(); audio.crossOrigin = 'anonymous'; audio.preload = 'auto';
  playQueue = [{ id: 'native', name: 'LxMine', artist: '', type: 'song' }]; currentIdx = 0;
  uniforms.uAlpha.value = 1;
  function position() { return Math.max(0, nativeClock.position + (nativeClock.playing ? (performance.now() - nativeClock.at) / 1000 : 0)); }
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
    if (!sourceUrl || !nativeClock.playing) { audio.pause(); return; }
    readyGraph();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
    if (Math.abs((audio.currentTime || 0) - position()) > 0.45 && audio.readyState >= 1) {
      try { audio.currentTime = position(); } catch (_) {}
    }
    if (audio.paused) audio.play().catch(function (error) { console.warn('[LxMineStage] analysis stream', error.message); });
  }
  audio.addEventListener('loadedmetadata', syncAudio);
  function applyLyricPaletteFromMetadata(data) {
    if (!data) return;
    var palette = data.lyricColors;
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
    seek: function (seconds) {
      if (!window.__lxmineNative || typeof window.__lxmineNative.seek !== 'function') return false;
      window.__lxmineNative.seek(Math.round(Math.max(0, Number(seconds) || 0) * 1000));
      nativeClock.position = Math.max(0, Number(seconds) || 0); nativeClock.at = performance.now(); syncAudio(); return true;
    },
    metadata: function (data) {
      applyLyricPaletteFromMetadata(data);
      nativeOffset = Number(data.lyricOffset || 0) / 1000;
      if (songId !== data.id) {
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
      if (fx.preset !== preset) setPreset(preset, { silent: true, noSave: true, skipTransition: false });
      if (data.cover !== cover) { cover = data.cover; loadCoverFromUrl(cover || '', { trackToken: trackSwitchToken }); }
      var nextLyrics = JSON.stringify([data.id, data.lines, data.translationLines, data.lyricOffset]);
      if (nextLyrics !== lyricKey) {
        lyricKey = nextLyrics;
        var lines = (data.lines || []).map(function (line, index, all) {
          var charOffset = 0;
          var words = (line.words || []).map(function (word) { var begin = charOffset; charOffset += word.text.length; return { text: word.text, t: word.timeMs / 1000, d: Math.max(0.06, word.durationMs / 1000), c0: begin, c1: charOffset }; });
          return { t: line.timeMs / 1000, text: line.text, duration: Math.max(0.1, ((all[index + 1] ? all[index + 1].timeMs : data.duration || line.timeMs + 4800) - line.timeMs) / 1000), words: words, charCount: Array.from(line.text || '').length };
        });
        var translations = (data.translationLines || []).map(function (line, index, all) {
          return { t: line.timeMs / 1000, text: line.text, duration: Math.max(0.1, ((all[index + 1] ? all[index + 1].timeMs : data.duration || line.timeMs + 4800) - line.timeMs) / 1000) };
        }).filter(function (line) { return line.text; });
        if (typeof fx !== 'undefined') fx.lyricTranslationMode = translations.length ? 'multi' : 'off';
        setOriginalLyricsState(lines, lines.some(function (line) { return line.words.length; }), 'native-clock', translations, 'lxmine-settings');
        applyPreferredLyricsForCurrent(true);
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
        sourceUrl = data.audioUrl; audio.pause(); audio.src = sourceUrl; audio.load();
      }
      syncAudio();
    },
    clock: function (data) {
      nativeClock.position = Math.max(0, Number(data.positionMs) || 0) / 1000;
      nativeClock.at = performance.now(); nativeClock.playing = data.playing === true;
      playing = nativeClock.playing;
      syncAudio();
    },
    diagnostics: function () { var probe = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(1); if (analyser) analyser.getByteFrequencyData(probe); return { directPeak: Math.max.apply(null, probe), nativePlaying: nativeClock.playing, sourceMatches: audio.src === sourceUrl, ready: true, preset: fx.preset, playing: playing, position: position(), analyser: !!analyser, audioContext: audioCtx && audioCtx.state, audioError: audio.error ? audio.error.code : 0, frequencyPeak: Math.max.apply(null, frequencyData), bass: smoothBass, beat: beatPulse, particleLyrics: fx.particleLyrics, lyricGroup: !!stageLyrics.group, lyricText: stageLyrics.currentText, lyricIndex: stageLyrics.currentIdx, lyricMesh: !!stageLyrics.current, camera: camera.position.toArray(), signal: smoothEnergy, audioTime: audio.currentTime, audioPaused: audio.paused, lyrics: lyricsLines.length, width: innerWidth, height: innerHeight, lyricSeek: window.lxmineLyricSeekDiagnostics ? window.lxmineLyricSeekDiagnostics() : null, touch: window.lxmineTouchDiagnostics ? window.lxmineTouchDiagnostics() : null, perf: window.__mineradioRenderPerf }; }
  };
})();
