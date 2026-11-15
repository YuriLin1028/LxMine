(function () {
  'use strict';
  // Reuse the PC engine's drag, spin, ripple and recenter handlers. Prevent the
  // browser's compatibility mouse events, which otherwise fire a second click.
  var canvas = renderer.domElement;
  var fingers = new Map();
  var primary = null;
  var pinchDistance = 0;
  var lastTap = null;
  var stats = { moves: 0, taps: 0, pinches: 0, cancelled: 0 };
  canvas.style.touchAction = 'none';
  function mouse(type, point, buttons) {
    canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true,
      clientX: point.x, clientY: point.y, button: 0, buttons: buttons }));
  }
  function distance() {
    var p = Array.from(fingers.values());
    return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }
  function clear() {
    orbit.rotating = false; particlePointerSpin.active = false;
    mouseDownAt.hadDrag = true;
    idleGuidePointerUp(); idleGuidePointerLeave();
    mouseActive = false; particlePointerFrame.dirty = false;
    mouseWorld.set(-999, -999, 0);
  }
  canvas.addEventListener('pointerdown', function (event) {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    event.preventDefault();
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    if (fingers.size === 1) {
      primary = event.pointerId;
      mouse('mousemove', fingers.get(primary), 0);
      mouse('mousedown', fingers.get(primary), 1);
    } else { clear(); primary = null; pinchDistance = distance(); }
  }, { passive: false });
  canvas.addEventListener('pointermove', function (event) {
    if (!fingers.has(event.pointerId)) return;
    event.preventDefault();
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (fingers.size > 1) {
      var next = distance();
      if (pinchDistance > 0) {
        canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
          clientX: event.clientX, clientY: event.clientY, deltaY: (pinchDistance - next) * 2 }));
        stats.pinches++;
      }
      pinchDistance = next;
    } else if (primary === event.pointerId) {
      mouse('mousemove', fingers.get(primary), 1); stats.moves++;
    }
  }, { passive: false });
  function end(event, cancelled) {
    if (!fingers.has(event.pointerId)) return;
    event.preventDefault();
    var point = { x: event.clientX, y: event.clientY };
    if (!cancelled && primary === event.pointerId && fingers.size === 1) {
      var tap = !mouseDownAt.hadDrag;
      mouse('mouseup', point, 0);
      if (tap) {
        stats.taps++;
        // The original topography handler emits its own terrain ripple.
        if (!(window.MineradioSonicTopography && MineradioSonicTopography.isActive(fx)) &&
            particleLocalPointFromNdc(point.x / innerWidth * 2 - 1, 1 - point.y / innerHeight * 2, particlePointerLocalHit)) {
          triggerRipple(particlePointerLocalHit.x, particlePointerLocalHit.y, 1.15);
          rippleActiveCount = Math.max(1, rippleActiveCount);
        }
        if (lastTap && performance.now() - lastTap.at < 320 && Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < 24) {
          mouse('dblclick', point, 0); lastTap = null;
        } else lastTap = { x: point.x, y: point.y, at: performance.now() };
      }
    } else { clear(); if (cancelled) stats.cancelled++; }
    fingers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!fingers.size) { primary = null; pinchDistance = 0; clear(); }
  }
  canvas.addEventListener('pointerup', function (event) { end(event, false); }, { passive: false });
  canvas.addEventListener('pointercancel', function (event) { end(event, true); }, { passive: false });
  window.addEventListener('blur', function () { fingers.clear(); primary = null; clear(); });
  window.lxmineTouchDiagnostics = function () { return Object.assign({ active: fingers.size, dragging: orbit.rotating }, stats); };
})();
