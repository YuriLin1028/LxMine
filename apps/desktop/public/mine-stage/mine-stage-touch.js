(function () {
  'use strict';
  if (typeof renderer === 'undefined' || !renderer) return;
  // Reuse the PC engine's drag, spin, ripple and recenter handlers. Prevent the
  // browser's compatibility mouse events, which otherwise fire a second click.
  var canvas = renderer.domElement;
  var fingers = new Map();
  var primary = null;
  var pinchDistance = 0;
  var pinchStartDistance = 0;
  var lastTap = null;
  var stats = { moves: 0, taps: 0, pinches: 0, cancelled: 0 };
  canvas.style.touchAction = 'none';
  function mouse(type, point, buttons) {
    canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true,
      clientX: point.x, clientY: point.y, button: 0, buttons: buttons }));
  }
  window.lxmineStartStageOrbit = function (pointerId, x, y) {
    var pt = { x: x, y: y };
    fingers.set(pointerId, pt);
    primary = pointerId;
    mouse('mousemove', pt, 0);
    mouse('mousedown', pt, 1);
  };
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
    window.lxmineMultiTouchActive = fingers.size > 1;
    canvas.setPointerCapture(event.pointerId);
    if (fingers.size === 1) {
      primary = event.pointerId;
      window.__lxminePinchActive = false;
      if (!window.lxmineLyricGestureActive || !window.lxmineLyricGestureActive()) {
        mouse('mousemove', fingers.get(primary), 0);
        mouse('mousedown', fingers.get(primary), 1);
      }
    } else {
      clear(); primary = null;
      pinchDistance = distance();
      pinchStartDistance = pinchDistance;
    }
  }, { passive: false });
  canvas.addEventListener('pointermove', function (event) {
    if (!fingers.has(event.pointerId)) return;
    event.preventDefault();
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    window.lxmineMultiTouchActive = fingers.size > 1;
    if (fingers.size > 1) {
      var next = distance();
      if (pinchDistance > 0 && (window.__lxminePinchActive || Math.abs(next - pinchStartDistance) > 12)) {
        window.__lxminePinchActive = true;
        var delta = (pinchDistance - next) * 2.4;
        canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
          clientX: event.clientX, clientY: event.clientY, deltaY: delta }));
        if (window.MineradioSonicWorkshop && typeof MineradioSonicWorkshop.zoom === 'function') {
          MineradioSonicWorkshop.zoom(delta);
        }
        stats.pinches++;
      }
      pinchDistance = next;
    } else if (primary === event.pointerId && (!window.lxmineLyricGestureActive || !window.lxmineLyricGestureActive())) {
      mouse('mousemove', fingers.get(primary), 1); stats.moves++;
    }
  }, { passive: false });
  function end(event, cancelled) {
    if (!fingers.has(event.pointerId)) return;
    event.preventDefault();
    var point = { x: event.clientX, y: event.clientY };
    if (event.lxmineLyricGesture) {
      clear(); stats.taps++;
    } else if (!cancelled && primary === event.pointerId && fingers.size === 1) {
      var tap = !mouseDownAt.hadDrag;
      mouse('mouseup', point, 0);
      if (tap) {
        stats.taps++;
        var workshopTap = window.MineradioSonicWorkshop && typeof MineradioSonicWorkshop.tap === 'function' &&
          MineradioSonicWorkshop.tap(point.x, point.y);
        // The original topography handler emits its own terrain ripple.
        if (!workshopTap && !(window.MineradioSonicTopography && MineradioSonicTopography.isActive(fx)) &&
            particleLocalPointFromNdc(point.x / innerWidth * 2 - 1, 1 - point.y / innerHeight * 2, particlePointerLocalHit)) {
          triggerRipple(particlePointerLocalHit.x, particlePointerLocalHit.y, 1.15);
          rippleActiveCount = Math.max(1, rippleActiveCount);
        }
        if (lastTap && performance.now() - lastTap.at < 320 && Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < 24) {
          mouse('dblclick', point, 0);
          if (window.MineradioSonicWorkshop && typeof MineradioSonicWorkshop.resetView === 'function') {
            MineradioSonicWorkshop.resetView();
          }
          lastTap = null;
        } else lastTap = { x: point.x, y: point.y, at: performance.now() };
      }
    } else { clear(); if (cancelled) stats.cancelled++; }
    fingers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!fingers.size) { primary = null; pinchDistance = 0; clear(); }
    window.lxmineMultiTouchActive = fingers.size > 1;
  }
  canvas.addEventListener('pointerup', function (event) { end(event, false); }, { passive: false });
  canvas.addEventListener('pointercancel', function (event) { end(event, true); }, { passive: false });
  window.addEventListener('blur', function () { fingers.clear(); primary = null; clear(); window.lxmineMultiTouchActive = false; });
  window.lxmineTouchDiagnostics = function () { return Object.assign({ active: fingers.size, dragging: orbit.rotating }, stats); };
})();
