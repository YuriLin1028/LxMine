var STAGE_LYRIC_MAX_LINES = 1;
var STAGE_LYRIC_DISPLAY_MODES = { single: 1, dual: 1, triple: 1, cinema: 1, custom: 1 };
var STAGE_LYRIC_TRANSLATION_MODES = { off: 1, current: 1, dual: 1, multi: 1 };
var STAGE_LYRIC_MOTION_STYLES = { glass: 1, smooth: 1, float: 1, quick: 1, shine: 1, glitch: 1 };

function normalizeLyricDisplayMode(mode) {
  mode = String(mode || 'single');
  return STAGE_LYRIC_DISPLAY_MODES[mode] ? mode : 'single';
}
function normalizeLyricTranslationMode(mode) {
  mode = String(mode || 'off');
  return STAGE_LYRIC_TRANSLATION_MODES[mode] ? mode : 'off';
}
function lyricCustomLineCountValue() {
  var raw = fx && fx.lyricCustomLineCount != null ? Number(fx.lyricCustomLineCount) : fxDefaults.lyricCustomLineCount;
  if (!isFinite(raw)) raw = fxDefaults.lyricCustomLineCount;
  return clampRange(Math.round(raw), 1, 10);
}
function lyricDisplayLineCountForMode(mode) {
  mode = normalizeLyricDisplayMode(mode);
  if (window.__LXMINE_NATIVE_STAGE && mode === 'cinema') {
    var rowHeight = Math.max(32, Math.min(innerWidth, innerHeight) * 0.10);
    var count = Math.min(31, Math.max(11, Math.ceil(innerHeight / rowHeight) + 4));
    return count % 2 ? count : count + 1;
  }
  if (mode === 'single') return 1;
  if (mode === 'dual') return 2;
  if (mode === 'triple') return 3;
  if (mode === 'cinema') return 5;
  return lyricCustomLineCountValue();
}
function lyricDisplayOffsetsForMode(mode) {
  mode = normalizeLyricDisplayMode(mode);
  if (mode === 'single') return [0];
  if (mode === 'dual') return [0, 1];
  var count = lyricDisplayLineCountForMode(mode);
  var activeSlot = Math.floor(count / 2);
  var offsets = [];
  for (var i = 0; i < count; i++) offsets.push(i - activeSlot);
  return offsets;
}
function normalizeLyricMotionStyle(style) {
  style = String(style || 'float');
  return STAGE_LYRIC_MOTION_STYLES[style] ? style : 'float';
}
function lyricContextOpacityValue() {
  return clampRange(fx && fx.lyricContextOpacity == null ? fxDefaults.lyricContextOpacity : Number(fx && fx.lyricContextOpacity), 0.25, 1);
}
function lyricContextSpreadValue() {
  return clampRange(fx && fx.lyricContextSpread == null ? fxDefaults.lyricContextSpread : Number(fx && fx.lyricContextSpread), 0.60, 2.40);
}
function lyricTranslationGapValue() {
  return clampRange(fx && fx.lyricTranslationGap == null ? fxDefaults.lyricTranslationGap : Number(fx && fx.lyricTranslationGap), 0.28, 2.20);
}
function lyricTranslationVisualGapValue() {
  var gap = lyricTranslationGapValue();
  var scale = lyricTranslationScaleValue();
  // Cozy pairing matching plain-stage.html (margin-top: 3px beneath main lyric).
  return clampRange(0.64 + (gap - 0.28) * 0.24 + Math.max(0, scale - 0.54) * 0.12, 0.58, 1.18);
}
function lyricTranslationLayoutActive() {
  return normalizeLyricTranslationMode(fx && fx.lyricTranslationMode) !== 'off';
}
function lyricPrimarySlotStepValue() {
  if (!lyricTranslationLayoutActive()) return 1;
  return clampRange(lyricTranslationVisualGapValue() + 0.94 + lyricTranslationScaleValue() * 0.08, 1.58, 2.26);
}
var _lyricWrapMeasureCtx = null;
var _lyricWrapCountCache = { key: '', counts: {}, transCounts: {} };
var _lyricWrapWidthCache = { key: '', value: 1280 };

function lyricWrapMeasureContext() {
  if (_lyricWrapMeasureCtx) return _lyricWrapMeasureCtx;
  if (typeof document === 'undefined') return null;
  var c = document.createElement('canvas');
  c.width = 4;
  c.height = 4;
  _lyricWrapMeasureCtx = c.getContext('2d');
  return _lyricWrapMeasureCtx;
}

function lyricWrapMaxLogicalWidth() {
  var w = typeof window !== 'undefined' ? Math.max(1, Number(window.innerWidth) || 1280) : 1280;
  var h = typeof window !== 'undefined' ? Math.max(1, Number(window.innerHeight) || 720) : 720;
  var fovDeg = (typeof camera !== 'undefined' && camera && isFinite(camera.fov)) ? camera.fov : 45;
  var userScale = clampRange(Number(fx && fx.userLyricScale) || 1, 0.55, 1.50);
  var fxScale = clampRange(Number(fx && fx.lyricScale) || 1, 0.35, 1.65);
  var cameraLocked = !!(fx && fx.lyricCameraLock) || (typeof shouldUseWallpaperLyricCameraLock === 'function' && shouldUseWallpaperLyricCameraLock());
  var cacheKey = w + 'x' + h + '|' + fovDeg + '|' + userScale + '|' + fxScale + '|' + (cameraLocked ? 1 : 0);
  if (_lyricWrapWidthCache.key === cacheKey) return _lyricWrapWidthCache.value;
  var aspect = clampRange(w / h, 0.34, 2.8);
  var halfTan = Math.tan(fovDeg * Math.PI / 360);
  var effectiveScale;
  var dist;
  if (cameraLocked) {
    dist = 4.85;
    var isPortrait = aspect < 0.92;
    var targetGroupScale = isPortrait ? clampRange(0.76 + (0.92 - aspect) * 0.14, 0.76, 0.86) : 1.0;
    effectiveScale = targetGroupScale * 0.96 * userScale;
  } else {
    var layoutScale = fxScale * userScale;
    if (aspect < 1) layoutScale *= clampRange(aspect * 1.34, 0.60, 0.92);
    dist = Math.max(3.6, 6.55 - 1.46 * Math.min(1.35, layoutScale));
    effectiveScale = layoutScale * 0.96;
  }
  var visibleW = 2 * halfTan * dist * aspect;
  var safeWorldW = visibleW * 0.88;
  var logicalW = (safeWorldW / Math.max(0.25, effectiveScale)) * (2048 / 6.10);
  var clamped = clampRange(logicalW, 1024, 2496);
  var rounded = Math.max(1024, Math.round(clamped / 64) * 64);
  _lyricWrapWidthCache.key = cacheKey;
  _lyricWrapWidthCache.value = rounded;
  return rounded;
}

function lyricWrapWidthBucket() {
  return lyricWrapMaxLogicalWidth();
}

function tokenizeLyricForWrap(text) {
  var tokens = [];
  var raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return tokens;
  var re = /(\s+|[A-Za-z0-9''\u2019_-]+|.)/g;
  var m;
  var noLineStartRe = /^[，。、！？：；,.!?;:)\]）】》」』”’…·~—–-]+$/;
  var noLineEndRe = /^[(\[（【《「『“‘]+$/;
  while ((m = re.exec(raw)) !== null) {
    var tok = m[0];
    if (/^\s+$/.test(tok)) {
      if (tokens.length && tokens[tokens.length - 1] !== ' ') tokens.push(' ');
      continue;
    }
    if (noLineStartRe.test(tok) && tokens.length && tokens[tokens.length - 1] !== ' ') {
      tokens[tokens.length - 1] += tok;
      continue;
    }
    if (tokens.length && noLineEndRe.test(tokens[tokens.length - 1])) {
      tokens[tokens.length - 1] += tok;
      continue;
    }
    tokens.push(tok);
  }
  return tokens;
}

function wrapSingleLyricParagraph(ctx, text, fontSize, weight, maxLogicalWidth, maxLines) {
  var clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [''];
  maxLines = clampRange(Math.round(Number(maxLines) || 3), 1, 4);
  if (maxLines <= 1 || !ctx || typeof lyricMeasureTextAtSize !== 'function') return [clean];
  var fullWidth = lyricMeasureTextAtSize(ctx, clean, fontSize, weight);
  if (!isFinite(fullWidth) || fullWidth <= maxLogicalWidth * 1.03) return [clean];
  var tokens = tokenizeLyricForWrap(clean);
  if (tokens.length <= 1) return [clean];
  var targetLines = clampRange(Math.ceil(fullWidth / Math.max(1, maxLogicalWidth)), 2, maxLines);
  var idealWidth = Math.min(maxLogicalWidth, (fullWidth / targetLines) * 1.12);
  var lines = [];
  var current = '';
  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];
    if (tok === ' ' && !current) continue;
    var candidate = current ? (current + tok) : tok;
    var trimmedCandidate = candidate.trim();
    var w = lyricMeasureTextAtSize(ctx, trimmedCandidate, fontSize, weight);
    var limit = lines.length < targetLines - 1 ? idealWidth : maxLogicalWidth;
    var isLastAllowed = lines.length >= maxLines - 1;
    if (!isLastAllowed && current && tok !== ' ' && w > limit) {
      var trimmedCurrent = current.trim();
      if (trimmedCurrent) lines.push(trimmedCurrent);
      current = tok;
      continue;
    }
    if (!isLastAllowed && !current && tok !== ' ' && w > maxLogicalWidth && tok.length > 4) {
      var chars = Array.from(tok);
      var chunk = '';
      for (var ci = 0; ci < chars.length; ci++) {
        var nextChunk = chunk + chars[ci];
        if (chunk && lyricMeasureTextAtSize(ctx, nextChunk, fontSize, weight) > maxLogicalWidth && lines.length < maxLines - 1) {
          lines.push(chunk);
          chunk = chars[ci];
        } else {
          chunk = nextChunk;
        }
      }
      current = chunk;
      continue;
    }
    current = candidate;
  }
  var tail = current.trim();
  if (tail) lines.push(tail);
  return lines.length ? lines.slice(0, maxLines) : [clean];
}

function wrapLyricTextLines(ctx, text, fontSize, weight, maxLogicalWidth, maxLines) {
  var raw = String(text || '');
  maxLines = clampRange(Math.round(Number(maxLines) || 3), 1, 4);
  var paragraphs = raw.split(/\r?\n/).map(function (p) { return p.trim(); }).filter(Boolean);
  if (!paragraphs.length) return [''];
  var out = [];
  for (var pi = 0; pi < paragraphs.length && out.length < maxLines; pi++) {
    var remaining = maxLines - out.length;
    var perParaCap = paragraphs.length > 1 && pi === 0 ? Math.max(1, remaining - 1) : remaining;
    var wrapped = wrapSingleLyricParagraph(ctx, paragraphs[pi], fontSize, weight, maxLogicalWidth, perParaCap);
    for (var wi = 0; wi < wrapped.length && out.length < maxLines; wi++) {
      out.push(wrapped[wi]);
    }
  }
  return out.length ? out : [paragraphs[0]];
}

function lyricWrapCountCacheKey() {
  var first = lyricsLines && lyricsLines[0];
  var last = lyricsLines && lyricsLines.length ? lyricsLines[lyricsLines.length - 1] : null;
  return [
    lyricWrapWidthBucket(),
    typeof lyricFontKeyValue === 'function' ? lyricFontKeyValue() : (fx && fx.lyricFont || ''),
    Math.round(lyricTranslationScaleValue() * 100),
    lyricsLines ? lyricsLines.length : 0,
    first ? String(first.text || '').slice(0, 12) : '',
    last ? String(last.text || '').slice(0, 12) : ''
  ].join('|');
}

function ensureLyricWrapCountCache() {
  var key = lyricWrapCountCacheKey();
  if (_lyricWrapCountCache.key !== key) {
    _lyricWrapCountCache = { key: key, counts: {}, transCounts: {} };
  }
  return _lyricWrapCountCache;
}

function lyricLineWrapCountAt(index) {
  var n = Math.round(Number(index) || 0);
  if (n < 0 || !lyricsLines || n >= lyricsLines.length) return 1;
  var cache = ensureLyricWrapCountCache();
  if (cache.counts[n] != null) return cache.counts[n];
  var line = lyricsLines[n];
  var text = line && line.text ? String(line.text).trim() : '';
  if (!text) { cache.counts[n] = 1; return 1; }
  var ctx = lyricWrapMeasureContext();
  if (!ctx) { cache.counts[n] = 1; return 1; }
  var weight = typeof lyricFontWeightValue === 'function' ? lyricFontWeightValue() : 700;
  var wrapped = wrapLyricTextLines(ctx, text, 128, weight, lyricWrapMaxLogicalWidth(), 3);
  var count = Math.max(1, Math.min(3, wrapped.length));
  cache.counts[n] = count;
  return count;
}

function lyricLineHasTranslationAt(index) {
  if (!lyricTranslationLayoutActive()) return false;
  var n = Math.max(0, Math.round(Number(index) || 0));
  return !!lyricLineTranslationTextAt(n);
}
function lyricLineTranslationSubLineCountAt(index) {
  if (!lyricTranslationLayoutActive()) return 0;
  var n = Math.max(0, Math.round(Number(index) || 0));
  var text = lyricLineTranslationTextAt(n);
  if (!text) return 0;
  var cache = ensureLyricWrapCountCache();
  if (cache.transCounts[n] != null) return cache.transCounts[n];
  var ctx = lyricWrapMeasureContext();
  if (!ctx) {
    var fallback = text.indexOf('\n') >= 0 ? 2 : 1;
    cache.transCounts[n] = fallback;
    return fallback;
  }
  var transFontSize = 128 * lyricTranslationScaleValue();
  var weight = typeof lyricFontWeightValue === 'function' ? lyricFontWeightValue() : 600;
  var wrapped = wrapLyricTextLines(ctx, text, transFontSize, weight, lyricWrapMaxLogicalWidth(), 3);
  var count = Math.max(1, Math.min(3, wrapped.length));
  cache.transCounts[n] = count;
  return count;
}
function lyricLineSlotStepValue(index) {
  var n = Math.round(Number(index) || 0);
  var curWrap = n >= 0 ? lyricLineWrapCountAt(n) : 1;
  var nextWrap = n >= 0 ? lyricLineWrapCountAt(n + 1) : 1;
  var wrapExtra = ((curWrap - 1) + (nextWrap - 1)) * 0.44;
  if (!lyricTranslationLayoutActive()) {
    return 1 + wrapExtra;
  }
  var subLines = n >= 0 ? lyricLineTranslationSubLineCountAt(n) : 0;
  var base;
  if (subLines >= 2) {
    base = clampRange(lyricPrimarySlotStepValue() + (subLines - 1) * 0.40, 1.92, 2.95);
  } else {
    var needsTranslationSlot = subLines > 0 || (n >= 0 && lyricLineHasTranslationAt(n + 1));
    base = needsTranslationSlot ? lyricPrimarySlotStepValue() : clampRange(1.04 + (lyricContextSpreadValue() - 1) * 0.10, 0.96, 1.24);
  }
  return base + wrapExtra;
}
var lyricPrimaryVirtualPrefixCache = { key: '', values: [0] };
var _lyricPrefixKeyMemo = {
  transActive: -1, wrapBucket: -1, gap: -1, scale: -1, spread: -1,
  linesRef: null, linesLen: -1, transRef: null, transLen: -1, firstTrans: '', lastTrans: '', key: ''
};
function lyricPrimaryVirtualPrefixKey() {
  var transActive = lyricTranslationLayoutActive() ? 1 : 0;
  var wrapBucket = lyricWrapWidthBucket();
  var gap = Math.round(lyricTranslationGapValue() * 1000);
  var scale = Math.round(lyricTranslationScaleValue() * 1000);
  var spread = Math.round(lyricContextSpreadValue() * 1000);
  var linesLen = lyricsLines ? lyricsLines.length : 0;
  var transLen = lyricsTranslationLines ? lyricsTranslationLines.length : 0;
  var first = linesLen ? lyricsLines[0] : null;
  var last = linesLen ? lyricsLines[linesLen - 1] : null;
  var firstT = first && first.translation ? String(first.translation).slice(0, 12) : '';
  var lastT = last && last.translation ? String(last.translation).slice(0, 12) : '';
  var m = _lyricPrefixKeyMemo;
  if (m.transActive === transActive && m.wrapBucket === wrapBucket && m.gap === gap &&
      m.scale === scale && m.spread === spread && m.linesRef === lyricsLines &&
      m.linesLen === linesLen && m.transRef === lyricsTranslationLines &&
      m.transLen === transLen && m.firstTrans === firstT && m.lastTrans === lastT) {
    return m.key;
  }
  m.transActive = transActive; m.wrapBucket = wrapBucket; m.gap = gap; m.scale = scale; m.spread = spread;
  m.linesRef = lyricsLines; m.linesLen = linesLen; m.transRef = lyricsTranslationLines; m.transLen = transLen;
  m.firstTrans = firstT; m.lastTrans = lastT;
  m.key = transActive + '|' + wrapBucket + '|' + gap + '|' + scale + '|' + spread + '|' + linesLen + '|' + transLen + '|' + firstT + '|' + lastT;
  return m.key;
}
function lyricPrimaryVirtualIndex(index) {
  var n = Math.round(Number(index) || 0);
  if (!isFinite(n) || n === 0) return 0;
  if (n < 0) return n * lyricPrimarySlotStepValue();
  var key = lyricPrimaryVirtualPrefixKey();
  if (!lyricPrimaryVirtualPrefixCache || lyricPrimaryVirtualPrefixCache.key !== key) {
    lyricPrimaryVirtualPrefixCache = { key: key, values: [0] };
  }
  var values = lyricPrimaryVirtualPrefixCache.values;
  for (var i = values.length; i <= n; i++) values[i] = values[i - 1] + lyricLineSlotStepValue(i - 1);
  return values[n] || 0;
}
function lyricTranslationVirtualIndex(parentIndex) {
  return lyricPrimaryVirtualIndex(parentIndex) + lyricTranslationVisualGapValue();
}
function lyricTranslationScaleValue() {
  return clampRange(fx && fx.lyricTranslationScale == null ? fxDefaults.lyricTranslationScale : Number(fx && fx.lyricTranslationScale), 0.46, 1.12);
}
function lyricTranslationOpacityValue() {
  return clampRange(fx && fx.lyricTranslationOpacity == null ? fxDefaults.lyricTranslationOpacity : Number(fx && fx.lyricTranslationOpacity), 0.20, 1);
}
function lyricEdgeFadeValue() {
  return clampRange(fx && fx.lyricEdgeFade == null ? fxDefaults.lyricEdgeFade : Number(fx && fx.lyricEdgeFade), 0, 1);
}
function lyricMotionSoftnessValue() {
  return clampRange(fx && fx.lyricMotionSoftness == null ? fxDefaults.lyricMotionSoftness : Number(fx && fx.lyricMotionSoftness), 0.15, 1.2);
}
function lyricGlitchIntensityValue() {
  return clampRange(fx && fx.lyricGlitchIntensity == null ? fxDefaults.lyricGlitchIntensity : Number(fx && fx.lyricGlitchIntensity), 0, 1.5);
}
function lyricGlitchSliceValue() {
  return clampRange(fx && fx.lyricGlitchSlice == null ? fxDefaults.lyricGlitchSlice : Number(fx && fx.lyricGlitchSlice), 0, 1.4);
}
function lyricGlitchChromaValue() {
  return clampRange(fx && fx.lyricGlitchChroma == null ? fxDefaults.lyricGlitchChroma : Number(fx && fx.lyricGlitchChroma), 0, 1.6);
}
function lyricGlitchRateValue() {
  return clampRange(fx && fx.lyricGlitchRate == null ? fxDefaults.lyricGlitchRate : Number(fx && fx.lyricGlitchRate), 0.45, 2.2);
}
function lyricGlitchJitterValue() {
  return clampRange(fx && fx.lyricGlitchJitter == null ? fxDefaults.lyricGlitchJitter : Number(fx && fx.lyricGlitchJitter), 0, 1.8);
}
var _lyricMotionProfileCache = { key: '', value: null };
function lyricMotionProfile() {
  var style = normalizeLyricMotionStyle(fx && fx.lyricMotionStyle);
  var soft = lyricMotionSoftnessValue();
  var nativeKaraoke = lyricsHasNativeKaraoke ? 1 : 0;
  var glitchKey = style === 'glitch'
    ? (lyricGlitchIntensityValue() + '|' + lyricGlitchSliceValue() + '|' + lyricGlitchChromaValue() + '|' + lyricGlitchRateValue() + '|' + lyricGlitchJitterValue() + '|' + (fx && fx.lyricGlitchCameraBind ? 1 : 0))
    : '';
  var cacheKey = style + '|' + soft + '|' + nativeKaraoke + '|' + glitchKey;
  if (_lyricMotionProfileCache.key === cacheKey && _lyricMotionProfileCache.value) return _lyricMotionProfileCache.value;
  var profile = {
    style: style,
    enter: 0.54,
    exit: 0.46,
    slide: 0.34,
    progressEase: lyricsHasNativeKaraoke ? 0.34 : 0.18,
    contextDrift: 0.060,
    edgeBoost: 1.0,
    sweep: 0.62,
    shimmer: 0.24,
    glitch: 0.0,
    glitchSlice: 0.0,
    glitchChroma: 0.0,
    glitchRate: 1.0,
    glitchJitter: 0.0,
    glitchCameraBind: false,
    glowLift: 1.0,
    floatAmp: 1.0
  };
  if (style === 'smooth') {
    profile.enter = 0.72; profile.exit = 0.62; profile.slide = 0.24; profile.progressEase *= 0.72; profile.contextDrift = 0.030; profile.edgeBoost = 0.62; profile.sweep = 0.18; profile.shimmer = 0.05; profile.glowLift = 0.74; profile.floatAmp = 0.55;
  } else if (style === 'float') {
    profile.enter = 0.86; profile.exit = 0.76; profile.slide = 0.54; profile.progressEase *= 0.66; profile.contextDrift = 0.120; profile.edgeBoost = 1.04; profile.sweep = 0.36; profile.shimmer = 0.14; profile.glowLift = 1.16; profile.floatAmp = 1.45;
  } else if (style === 'shine') {
    profile.enter = 0.50; profile.exit = 0.44; profile.slide = 0.34; profile.progressEase *= 1.02; profile.contextDrift = 0.052; profile.edgeBoost = 1.42; profile.sweep = 1.22; profile.shimmer = 0.34; profile.glowLift = 1.30; profile.floatAmp = 0.82;
  } else if (style === 'glitch') {
    profile.enter = 0.40; profile.exit = 0.36; profile.slide = 0.30; profile.progressEase *= 1.24; profile.contextDrift = 0.035; profile.edgeBoost = 1.18; profile.sweep = 0.54; profile.shimmer = 0.28; profile.glitch = lyricGlitchIntensityValue(); profile.glitchSlice = lyricGlitchSliceValue(); profile.glitchChroma = lyricGlitchChromaValue(); profile.glitchRate = lyricGlitchRateValue(); profile.glitchJitter = lyricGlitchJitterValue(); profile.glitchCameraBind = !!(fx && fx.lyricGlitchCameraBind); profile.glowLift = 1.08 + profile.glitch * 0.10; profile.floatAmp = 0.70;
  } else if (style === 'quick') {
    profile.enter = 0.36; profile.exit = 0.32; profile.slide = 0.22; profile.progressEase *= 1.34; profile.contextDrift = 0.034; profile.edgeBoost = 0.70; profile.sweep = 0.28; profile.shimmer = 0.10; profile.glowLift = 0.86; profile.floatAmp = 0.62;
  } else {
    profile.enter = 0.62; profile.exit = 0.52; profile.slide = 0.38; profile.progressEase *= 0.90; profile.contextDrift = 0.066; profile.edgeBoost = 1.18; profile.sweep = 0.72; profile.shimmer = 0.22; profile.glowLift = 1.0; profile.floatAmp = 1.0;
  }
  profile.enter *= soft;
  profile.exit *= soft;
  profile.slide *= clampRange(0.80 + soft * 0.35, 0.75, 1.28);
  profile.progressEase = clampRange(profile.progressEase / clampRange(soft, 0.35, 1.2), 0.08, 0.72);
  _lyricMotionProfileCache.key = cacheKey;
  _lyricMotionProfileCache.value = profile;
  return profile;
}
