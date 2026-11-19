(function () {
  'use strict';
  window.LxMineGestures = {
    bind: function (element, scrollable) {
      var multiple = false, committed = false, startY = 0, lastY = 0, startDist = 0, lastDist = 0, scrollTop = 0;
      function reset() { multiple = false; committed = false; startY = lastY = startDist = lastDist = 0; }
      function active() { var state = window.__lxmineStagePresentation; return !document.hidden && (!state || (state.visible && state.detail)); }
      function centerY(touches) { return (touches[0].clientY + touches[1].clientY) / 2; }
      function touchDist(touches) { return Math.hypot((touches[0].clientX || 0) - (touches[1].clientX || 0), (touches[0].clientY || 0) - (touches[1].clientY || 0)); }
      element.addEventListener('touchstart', function (event) {
        if (!active()) { reset(); return; }
        if (event.touches.length >= 2 && !multiple) {
          multiple = true; committed = false;
          startY = lastY = centerY(event.touches);
          startDist = lastDist = touchDist(event.touches);
          scrollTop = element.scrollTop;
          if (scrollable) element.scrollTo({ top: scrollTop, behavior: 'instant' });
        }
        if (multiple) event.preventDefault();
      }, { passive: false, capture: true });
      element.addEventListener('touchmove', function (event) {
        if (!multiple) return;
        event.preventDefault();
        if (event.touches.length >= 2) {
          lastY = centerY(event.touches);
          lastDist = touchDist(event.touches);
        }
      }, { passive: false, capture: true });
      function finish(event) {
        if (event.type === 'touchcancel' || !active()) { reset(); return; }
        if (!multiple) return;
        event.preventDefault();
        if (!committed && event.touches.length < 2 && event.type !== 'touchcancel') {
          committed = true;
          var pinched = Math.abs(lastDist - startDist) > 18 || window.__lxminePinchActive === true;
          if (!pinched && Math.abs(lastY - startY) > 36 && window.__lxmineNative && typeof window.__lxmineNative.immersive === 'function') {
            window.__lxmineNative.immersive(lastY < startY ? '1' : '0');
          }
        }
        if (!event.touches.length) multiple = false;
      }
      element.addEventListener('touchend', finish, { passive: false, capture: true });
      element.addEventListener('touchcancel', finish, { passive: false, capture: true });
      element.addEventListener('click', function (event) {
        if (multiple || committed) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
      if (scrollable) element.addEventListener('scroll', function () {
        if (multiple && element.scrollTop !== scrollTop) element.scrollTop = scrollTop;
      }, { passive: true });
      element.addEventListener('pointerdown', function (event) { if (event.isPrimary) committed = false; }, true);
      window.addEventListener('lxmine-stage-hidden', reset);
      window.addEventListener('blur', reset);
      document.addEventListener('visibilitychange', function () { if (document.hidden) reset(); });
      return { reset: reset };
    }
  };
})();
