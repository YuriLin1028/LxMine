(function () {
  'use strict';
  const nativeRequest = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const pending = new Map();
  const sizes = new Map();
  let sequence = 0;
  let visible = false;
  let warmFrames = 3;
  let warmHandle = 0;
  let frames = 0;

  function schedule(id, item) {
    item.handle = nativeRequest(time => {
      pending.delete(id);
      frames++;
      item.callback(time);
    });
  }

  function resizeBuffers(active) {
    document.querySelectorAll('canvas').forEach(canvas => {
      if (active) {
        const size = sizes.get(canvas);
        if (size) { canvas.width = size.width; canvas.height = size.height; sizes.delete(canvas); }
      } else if (canvas.width > 1 || canvas.height > 1) {
        sizes.set(canvas, { width: canvas.width, height: canvas.height });
        canvas.width = 1;
        canvas.height = 1;
      }
    });
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
