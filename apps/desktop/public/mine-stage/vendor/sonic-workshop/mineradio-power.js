(function () {
  'use strict';
  const isMobileNative = (() => {
    try { return !!(window.parent && window.parent !== window && window.parent.__LXMINE_NATIVE_STAGE); } catch (_) { return false; }
  })();
  if (isMobileNative) {
    try {
      const realDpr = Math.max(1, Number(window.devicePixelRatio) || 1);
      // Never set DPR < 1.0: Three.js/R3F viewport scaling breaks when DPR < 1.
      const cappedDpr = Math.min(realDpr, 1.0);
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => cappedDpr });
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
  const pending = new Map();
  const sizes = new Map();
  let sequence = 0;
  let visible = false;
  let warmFrames = 3;
  let warmHandle = 0;
  let frames = 0;
  let lastFrameAt = 0;
  const minFrameGapMs = 0;

  function schedule(id, item) {
    item.handle = nativeRequest(time => {
      if (minFrameGapMs > 0 && visible && lastFrameAt > 0 && time - lastFrameAt < minFrameGapMs) {
        schedule(id, item);
        return;
      }
      lastFrameAt = time;
      pending.delete(id);
      frames++;
      item.callback(time);
    });
  }

  function resizeBuffers(active) {
    document.querySelectorAll('canvas').forEach(canvas => {
      if (active) {
        const saved = sizes.get(canvas);
        if (saved) {
          canvas.width = saved.width;
          canvas.height = saved.height;
        }
      } else {
        if (canvas.width > 1 && canvas.height > 1) {
          sizes.set(canvas, { width: canvas.width, height: canvas.height });
        }
        canvas.width = 1;
        canvas.height = 1;
      }
    });
    if (active) {
      try { window.dispatchEvent(new Event('resize')); } catch (_) {}
      const root = document.getElementById('root');
      if (root) {
        root.style.width = 'calc(100% - 1px)';
        void root.offsetWidth;
        nativeRequest(() => {
          root.style.width = '100%';
          try { window.dispatchEvent(new Event('resize')); } catch (_) {}
        });
      }
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
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.__mineradioSetPresentation(false); });
})();
