(function () {
  'use strict';
  const isMobileNative = (() => {
    try { return !!(window.parent && window.parent !== window && window.parent.__LXMINE_NATIVE_STAGE); } catch (_) { return false; }
  })();
  const MOBILE_MAX_PIXELS = 380000;
  function effectiveMobileScale(cssW, cssH) {
    if (!isMobileNative) return Math.min(Math.max(1, Number(window.devicePixelRatio) || 1), 1.25);
    const area = Math.max(1, cssW * cssH);
    if (area <= MOBILE_MAX_PIXELS) return 1.0;
    return Math.max(0.50, Math.sqrt(MOBILE_MAX_PIXELS / area));
  }
  if (isMobileNative) {
    try {
      // Dynamically match effectiveMobileScale so React Three Fiber's ResizeObserver
      // and EffectComposer render targets stay within the 560k pixel budget on 2.8K tablets.
      Object.defineProperty(window, 'devicePixelRatio', {
        configurable: true,
        get: () => effectiveMobileScale(
          Math.max(1, Number(window.innerWidth) || 1280),
          Math.max(1, Number(window.innerHeight) || 720)
        )
      });
    } catch (_) {}
  } else {
    try {
      const realDpr = Math.max(1, Number(window.devicePixelRatio) || 1);
      const cappedDpr = Math.min(realDpr, 1.25);
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => cappedDpr });
    } catch (_) {}
  }
  const nativeRequest = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  const glContexts = new WeakMap();
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    let nextAttrs = attrs;
    if (isMobileNative && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
      nextAttrs = Object.assign({}, attrs || {}, {
        antialias: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
      });
    }
    const ctx = nativeGetContext.call(this, type, nextAttrs);
    if (ctx && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
      glContexts.set(this, ctx);
    }
    return ctx;
  };
  const pending = new Map();
  let sequence = 0;
  let visible = false;
  let warmFrames = 3;
  let warmHandle = 0;
  let wakeTimer = 0;
  let frames = 0;
  let lastFrameAt = 0;
  // 解除人为 35fps 锁帧：靠精简网格(96x96) + 关闭 MSAA + 380k 像素预算让移动端稳定跑满 60/120Hz 原生满帧。
  const minFrameGapMs = 0;

  function schedule(id, item) {
    item.handle = nativeRequest(time => {
      if (minFrameGapMs > 0 && visible && lastFrameAt > 0 && time > lastFrameAt && time - lastFrameAt < minFrameGapMs) {
        schedule(id, item);
        return;
      }
      lastFrameAt = time;
      pending.delete(id);
      frames++;
      item.callback(time);
    });
  }

  function clearWakeTimer() {
    if (wakeTimer) {
      clearTimeout(wakeTimer);
      wakeTimer = 0;
    }
  }

  function syncCanvasToViewport() {
    const cssW = Math.max(1, Math.round(window.innerWidth || document.documentElement.clientWidth || 0));
    const cssH = Math.max(1, Math.round(window.innerHeight || document.documentElement.clientHeight || 0));
    if (cssW < 10 || cssH < 10) return false;
    const scale = effectiveMobileScale(cssW, cssH);
    const bufW = Math.max(1, Math.round(cssW * scale));
    const bufH = Math.max(1, Math.round(cssH * scale));
    document.querySelectorAll('canvas').forEach(canvas => {
      if (canvas.width !== bufW) canvas.width = bufW;
      if (canvas.height !== bufH) canvas.height = bufH;
      const gl = glContexts.get(canvas);
      if (gl && typeof gl.viewport === 'function') {
        try {
          gl.viewport(0, 0, bufW, bufH);
          if (typeof gl.scissor === 'function') gl.scissor(0, 0, bufW, bufH);
        } catch (_) {}
      }
    });
    return true;
  }

  function kickResizeObserver(attempt) {
    clearWakeTimer();
    if (!visible) return;
    const root = document.getElementById('root');
    const cssW = Math.round(window.innerWidth || document.documentElement.clientWidth || 0);
    const cssH = Math.round(window.innerHeight || document.documentElement.clientHeight || 0);
    if (cssW < 10 || cssH < 10) {
      if ((attempt || 0) < 12) {
        wakeTimer = setTimeout(() => kickResizeObserver((attempt || 0) + 1), 60);
      }
      return;
    }
    syncCanvasToViewport();
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    if (!root) return;
    // Force a real, non-coalesced ResizeObserver cycle so React Three Fiber's
    // react-use-measure calls gl.setSize(), updates camera.aspect/projectionMatrix,
    // and resizes EffectComposer render targets cleanly on every wake-up.
    root.style.width = Math.max(1, cssW - 1) + 'px';
    root.style.height = Math.max(1, cssH - 1) + 'px';
    void root.offsetWidth;
    wakeTimer = setTimeout(() => {
      wakeTimer = 0;
      root.style.width = '100%';
      root.style.height = '100%';
      if (!visible) return;
      void root.offsetWidth;
      syncCanvasToViewport();
      try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    }, 80);
  }

  function resizeBuffers(active) {
    clearWakeTimer();
    const root = document.getElementById('root');
    if (root) {
      root.style.width = '100%';
      root.style.height = '100%';
    }
    if (active) {
      kickResizeObserver(0);
    } else {
      document.querySelectorAll('canvas').forEach(canvas => {
        canvas.width = 1;
        canvas.height = 1;
      });
    }
  }

  window.requestAnimationFrame = callback => {
    const id = ++sequence;
    const item = { callback, handle: 0 };
    pending.set(id, item);
    if (visible || warmFrames > 0) schedule(id, item);
    return id;
  };
  window.cancelAnimationFrame = id => {
    const item = pending.get(id);
    if (item?.handle) nativeCancel(item.handle);
    pending.delete(id);
  };

  window.__mineradioSetPresentation = active => {
    active = active === true;
    if (!visible && !active && warmFrames > 0) { resizeBuffers(false); return; }
    if (visible === active && (active || warmFrames === 0)) return;
    visible = active;
    warmFrames = 0;
    if (warmHandle) nativeCancel(warmHandle);
    warmHandle = 0;
    pending.forEach((item, id) => {
      if (item.handle) nativeCancel(item.handle);
      item.handle = 0;
      if (active) schedule(id, item);
    });
    resizeBuffers(active);
    if (active) window.dispatchEvent(new Event('resize'));
  };
  window.__mineradioPowerDiagnostics = () => ({ visible, warmFrames, frames, pending: pending.size,
    pixels: Array.from(document.querySelectorAll('canvas')).reduce((total, canvas) => total + canvas.width * canvas.height, 0) });

  function finishWarmFrame() {
    if (visible || warmFrames === 0) return;
    resizeBuffers(false);
    warmFrames--;
    if (warmFrames > 0) warmHandle = nativeRequest(finishWarmFrame);
    else {
      pending.forEach(item => { if (item.handle) nativeCancel(item.handle); item.handle = 0; });
      warmHandle = 0;
    }
  }
  // The bridge starts at 1 px, uploads its shared shaders, then keeps callbacks dormant.
  window.addEventListener('load', () => { if (!visible) warmHandle = nativeRequest(finishWarmFrame); }, { once: true });
  let resizeSyncRaf = 0;
  window.addEventListener('resize', () => {
    if (!visible || resizeSyncRaf) return;
    resizeSyncRaf = nativeRequest(() => {
      resizeSyncRaf = 0;
      if (visible) syncCanvasToViewport();
    });
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.__mineradioSetPresentation(false); });
})();
