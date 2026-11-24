// ============================================================
var scene = new THREE.Scene();
scene.background = null;
var camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
var RENDER_DPR_CAP = window.__LXMINE_NATIVE_STAGE ? 2.15 : 1.35;
var RENDER_PIXEL_BUDGET = window.__LXMINE_NATIVE_STAGE ? 1950000 : 2200000;
var RENDER_MIN_DPR = window.__LXMINE_NATIVE_STAGE ? 1.15 : 0.80;
// 0 = display vsync. Foreground visible motion must keep VSync cadence.
var RENDER_VISIBLE_VSYNC = true;
var RENDER_IDLE_FPS = 72;
var RENDER_IDLE_LARGE_FPS = 60;
var RENDER_IDLE_HUGE_FPS = 48;
var RENDER_ACTIVE_FPS = 90;
var RENDER_LARGE_FPS = 75;
var RENDER_HUGE_FPS = 60;
var RENDER_INTERACTION_FPS = 0;
var RENDER_INTERACTION_LARGE_FPS = 90;
var RENDER_INTERACTION_HUGE_FPS = 75;
var RENDER_INTERACTION_HOLD_MS = 900;
var renderInteractionBoostUntil = 0;
var renderInteractionReason = '';
var renderRefreshState = {
  lastRafAt: 0,
  hz: 60,
  stableHz: 60,
  samples: []
};
var adaptiveFrameLoadState = {
  avgMs: 0,
  lastCostMs: 0,
  lastTargetFps: 0,
  pressure: 0,
  level: 0,
  resolutionScale: 1,
  lastResolutionAt: 0
};
function roundRenderNumber(value, digits) {
  var scale = Math.pow(10, digits || 0);
  return Math.round((Number(value) || 0) * scale) / scale;
}
function sampleDisplayRefreshHz(now) {
  now = Number(now) || performance.now();
  var last = renderRefreshState.lastRafAt || 0;
  renderRefreshState.lastRafAt = now;
  if (!last) return renderRefreshState.stableHz || renderRefreshState.hz || 60;
  var gap = now - last;
  if (gap < 4 || gap > 40) return renderRefreshState.stableHz || renderRefreshState.hz || 60;
  renderRefreshState.samples.push(gap);
  if (renderRefreshState.samples.length > 36) renderRefreshState.samples.shift();
  var sorted = renderRefreshState.samples.slice().sort(function (a, b) { return a - b; });
  var median = sorted[Math.floor(sorted.length / 2)] || gap;
  var hz = Math.max(48, Math.min(240, 1000 / Math.max(1, median)));
  renderRefreshState.hz = hz;
  var stable = renderRefreshState.stableHz || hz;
  renderRefreshState.stableHz = Math.abs(stable - hz) > 18 ? hz : stable * 0.90 + hz * 0.10;
  return renderRefreshState.stableHz;
}
function estimatedDisplayRefreshHz() {
  return Math.max(48, Math.min(240, renderRefreshState.stableHz || renderRefreshState.hz || 60));
}
function adaptiveLoadPressureLevel() {
  return adaptiveFrameLoadState.level || 0;
}
function sampleAdaptiveFrameCost(costMs, targetFps) {
  var cost = Number(costMs);
  if (!isFinite(cost) || cost < 0) return adaptiveFrameLoadSnapshot();
  var fps = Math.max(1, Number(targetFps) || estimatedDisplayRefreshHz());
  var budget = (1000 / fps) * 0.78;
  adaptiveFrameLoadState.lastCostMs = cost;
  adaptiveFrameLoadState.lastTargetFps = fps;
  adaptiveFrameLoadState.avgMs = adaptiveFrameLoadState.avgMs
    ? adaptiveFrameLoadState.avgMs * 0.92 + cost * 0.08
    : cost;
  if (adaptiveFrameLoadState.avgMs > budget) {
    adaptiveFrameLoadState.pressure = Math.min(8, adaptiveFrameLoadState.pressure + 0.70);
  } else if (adaptiveFrameLoadState.avgMs < budget * 0.62) {
    adaptiveFrameLoadState.pressure = Math.max(0, adaptiveFrameLoadState.pressure - 0.30);
  } else {
    adaptiveFrameLoadState.pressure = Math.max(0, adaptiveFrameLoadState.pressure - 0.10);
  }
  adaptiveFrameLoadState.level = adaptiveFrameLoadState.pressure >= 4 ? 2 : (adaptiveFrameLoadState.pressure >= 2 ? 1 : 0);
  var now = performance.now();
  var foregroundStage = !window.__lxmineStagePresentation || window.__lxmineStagePresentation.detail;
  if (foregroundStage && now > 5000) {
    var scale = adaptiveFrameLoadState.resolutionScale;
    var elapsed = now - adaptiveFrameLoadState.lastResolutionAt;
    var minResScale = window.__LXMINE_NATIVE_STAGE ? 0.85 : 0.72;
    if (adaptiveFrameLoadState.level >= 2 && elapsed > 2000) scale = Math.max(minResScale, scale * (window.__LXMINE_NATIVE_STAGE ? 0.92 : 0.88));
    else if (adaptiveFrameLoadState.level === 0 && adaptiveFrameLoadState.avgMs < budget * 0.45 && elapsed > 10000) scale = Math.min(1, scale * 1.05);
    if (Math.abs(scale - adaptiveFrameLoadState.resolutionScale) > 0.001) {
      adaptiveFrameLoadState.resolutionScale = scale;
      adaptiveFrameLoadState.lastResolutionAt = now;
      if (typeof applyRendererPowerMode === 'function') applyRendererPowerMode();
    }
  }
  return adaptiveFrameLoadSnapshot();
}
function adaptiveFrameLoadSnapshot() {
  return {
    avgMs: roundRenderNumber(adaptiveFrameLoadState.avgMs, 3),
    lastCostMs: roundRenderNumber(adaptiveFrameLoadState.lastCostMs, 3),
    lastTargetFps: roundRenderNumber(adaptiveFrameLoadState.lastTargetFps, 1),
    pressure: roundRenderNumber(adaptiveFrameLoadState.pressure, 2),
    level: adaptiveFrameLoadState.level || 0,
    resolutionScale: adaptiveFrameLoadState.resolutionScale
  };
}
function clampAdaptiveCadenceDivisor(displayHz, divisor, minFps) {
  divisor = Math.max(1, Math.round(Number(divisor) || 1));
  minFps = Math.max(1, Number(minFps) || 60);
  while (divisor > 1 && displayHz / divisor < minFps) divisor--;
  return divisor;
}
function selectAdaptiveRenderCadence(kind, tier) {
  var displayHz = estimatedDisplayRefreshHz();
  var pressure = adaptiveLoadPressureLevel();
  var budgetLevel = (typeof runtimePerfBudgetLevel === 'function') ? runtimePerfBudgetLevel() : 2;
  var divisor = 1;
  kind = kind || 'playback';
  tier = Math.max(0, Number(tier) || 0);
  if (kind === 'idle') {
    divisor = (displayHz >= 144 && (tier >= 1 || budgetLevel <= 0)) ? 2 : 1;
  } else if (kind === 'playback') {
    divisor = (displayHz >= 190 && (tier >= 2 || pressure >= 1)) ? 2 : 1;
  } else if (kind === 'interaction') {
    divisor = 1;
  }
  if (kind !== 'interaction') {
    if (budgetLevel <= 0 && pressure >= 2 && displayHz >= 118) divisor = Math.max(divisor, 2);
    else if (budgetLevel === 1 && pressure >= 2 && displayHz >= 144) divisor = Math.max(divisor, 2);
    if (pressure >= 3 && displayHz >= 180) divisor = Math.max(divisor, 3);
  }
  divisor = clampAdaptiveCadenceDivisor(displayHz, divisor, kind === 'idle' ? 48 : 60);
  return {
    fps: Math.max(1, Math.round(displayHz / divisor)),
    divisor: divisor,
    displayHz: roundRenderNumber(displayHz, 1),
    kind: kind,
    tier: tier,
    pressure: pressure
  };
}
function renderQualityProfile() {
  var quality = normalizePerformanceQuality(fx && fx.performanceQuality);
  var profile = (typeof runtimeHardwareProfile !== 'undefined' && runtimeHardwareProfile) ? runtimeHardwareProfile : null;
  var lowSpec = profile && profile.lowSpec;
  if (typeof window !== 'undefined' && window.__LXMINE_NATIVE_STAGE && quality === 'eco') return { cap: 1.55, min: 1.00, budget: 1200000 };
  if (typeof window !== 'undefined' && window.__LXMINE_NATIVE_STAGE && quality === 'balanced') return { cap: 2.15, min: 1.35, budget: 1850000 };
  if (quality === 'eco') return { cap: lowSpec ? 0.95 : 1.05, min: 0.65, budget: lowSpec ? 1500000 : 1850000 };
  if (quality === 'balanced') return { cap: lowSpec ? 1.05 : 1.25, min: 0.75, budget: lowSpec ? 1900000 : 2400000 };
  if (quality === 'ultra') return { cap: 2.50, min: 1.45, budget: 4800000 };
  return { cap: lowSpec ? 1.50 : RENDER_DPR_CAP, min: lowSpec ? 1.00 : RENDER_MIN_DPR, budget: lowSpec ? 1850000 : RENDER_PIXEL_BUDGET };
}
function getRenderPixelRatio() {
  var device = window.devicePixelRatio || 1;
  if (isDeepBackgroundMode()) return Math.min(device, 0.30);
  var cssPixels = Math.max(1, innerWidth * innerHeight);
  if (window.__lxmineStagePresentation && !window.__lxmineStagePresentation.detail) {
    return Math.min(device, 0.48, Math.sqrt(260000 / cssPixels));
  }
  var quality = renderQualityProfile();
  var budgetCap = Math.sqrt(quality.budget / cssPixels);
  var cap = Math.min(quality.cap, budgetCap);
  return Math.max(0.4, Math.max(quality.min, Math.min(device, cap)) * adaptiveFrameLoadState.resolutionScale);
}
function getRenderPixelLoad() {
  var ratio = getRenderPixelRatio();
  return Math.max(1, innerWidth * innerHeight) * ratio * ratio;
}
function markRenderInteraction(reason, holdMs) {
  if (isDeepBackgroundMode()) return;
  var now = performance.now();
  renderInteractionBoostUntil = Math.max(renderInteractionBoostUntil, now + (holdMs || RENDER_INTERACTION_HOLD_MS));
  renderInteractionReason = reason || renderInteractionReason || 'interaction';
  // VSync/adaptive modes may render immediately for interaction.  A fixed
  // foreground cap must keep its cadence phase, otherwise a drag loop that
  // refreshes the interaction hold every rAF silently bypasses 45/60/etc.
  var foregroundMode = (typeof normalizeForegroundFpsMode === 'function')
    ? normalizeForegroundFpsMode(fx && fx.foregroundFpsMode)
    : 'vsync';
  var fixedForegroundFps = (typeof foregroundFixedFpsForMode === 'function')
    ? foregroundFixedFpsForMode(foregroundMode)
    : null;
  if (
    typeof renderPerfState !== 'undefined' && renderPerfState &&
    (fixedForegroundFps == null || fixedForegroundFps === 0)
  ) renderPerfState.lastRenderAt = 0;
}
function isRenderInteractionActive(now) {
  return (now || performance.now()) < renderInteractionBoostUntil;
}
function getRenderLoadTier() {
  var cssPixels = Math.max(1, innerWidth * innerHeight);
  var renderPixels = (typeof getRenderPixelLoad === 'function') ? getRenderPixelLoad() : cssPixels;
  if (cssPixels >= 7200000 || renderPixels >= 5000000) return 2;
  if (cssPixels >= 3200000 || renderPixels >= 3600000) return 1;
  return 0;
}
var renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'default' });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(getRenderPixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.style.background = 'transparent';
renderer.domElement.style.display = 'block';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.tabIndex = 0;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// ============================================================
//  相机系统 v7.1 — 分离 user offset / cinema offset
//   - userOrbit: 用户拖拽的目标 (永久保留, 不会被电影模式覆盖)
//   - cinemaOffset: 电影模式的微偏移 (始终叠加, 即使用户在拖)
//   - 最终 theta = userOrbit.theta + cinemaOffset.theta
//   - 回正按钮 / 双击屏幕: 让 userOrbit 缓慢归零
