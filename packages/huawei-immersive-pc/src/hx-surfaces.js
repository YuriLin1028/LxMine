/*!
 * huawei-immersive-pc / surfaces runtime v1.0.0
 *
 * Modal/sheet lifecycle and the one-node geometry morph used by search and
 * other "pill becomes panel" transitions.
 *
 * Public API:
 *   HxSurfaces.openModal({ content, sheet, ... }) -> session
 *   HxSurfaces.openSheet({ content, ... })        -> session
 *   HxSurfaces.morph(node, fromRect, options)      -> Animation | null
 *
 * Copyright (c) 2026 林毅.
 * License: MIT.
 */
(function (root) {
  'use strict';

  var reduced = null;

  function prefersReducedMotion() {
    if (!reduced && root.matchMedia) reduced = root.matchMedia('(prefers-reduced-motion: reduce)');
    return !!(reduced && reduced.matches);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * Morph a single node between two rectangles. The caller owns the node's
   * final layout; this only supplies a temporary WAAPI transform. Using one
   * node (not two cross-fading nodes) is what keeps the material continuous.
   */
  function morph(node, fromRect, options) {
    if (!node || !fromRect || prefersReducedMotion()) return null;
    options = Object.assign({
      duration: 460,
      direction: 'open',
      radiusFrom: '22px',
      radiusTo: '29px',
      fromOpacity: 0.55,
      toOpacity: 1
    }, options || {});

    var toRect = options.toRect || node.getBoundingClientRect();
    if (!toRect.width || !toRect.height || !fromRect.width || !fromRect.height) return null;

    var dx = fromRect.left - toRect.left;
    var dy = fromRect.top - toRect.top;
    var sx = clamp(fromRect.width / toRect.width, 0.05, 1);
    var sy = clamp(fromRect.height / toRect.height, 0.05, 1);
    var opening = options.direction !== 'close';
    var origin = 'top left';
    var displaced = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';

    var from = opening
      ? { transformOrigin: origin, transform: displaced, borderRadius: options.radiusFrom, opacity: options.fromOpacity }
      : { transformOrigin: origin, transform: 'none', borderRadius: options.radiusFrom, opacity: options.toOpacity };
    var to = opening
      ? { transformOrigin: origin, transform: 'none', borderRadius: options.radiusTo, opacity: options.toOpacity }
      : { transformOrigin: origin, transform: displaced, borderRadius: options.radiusTo, opacity: options.fromOpacity };

    try {
      return node.animate([from, to], {
        duration: options.duration,
        easing: opening ? 'cubic-bezier(.22,1.08,.32,1)' : 'cubic-bezier(.4,0,.6,1)',
        fill: opening ? 'none' : 'forwards'
      });
    } catch (_) {
      return null;
    }
  }

  function focusables(node) {
    return Array.prototype.slice.call(node.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter(function (item) { return item.offsetParent !== null; });
  }

  function openModal(options) {
    options = Object.assign({
      content: '',
      sheet: false,
      ariaLabel: '对话框',
      className: '',
      width: '',
      closeOnBackdrop: true,
      restoreFocus: true
    }, options || {});

    var previousFocus = document.activeElement;
    var backdrop = element('div', 'hx-modal-backdrop' + (options.sheet ? ' is-sheet' : ''));
    var box = element('div', (options.sheet ? 'hx-sheet' : 'hx-modal') + ' hx-glass' +
      (options.className ? ' ' + options.className : ''));
    box.dataset.hxMaterial = 'sheet';
    box.setAttribute('role', options.role || 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', options.ariaLabel);
    if (options.width) box.style.width = options.width;

    if (typeof options.content === 'string') box.innerHTML = options.content;
    else if (options.content) box.appendChild(options.content);

    if (options.sheet) {
      var grip = element('span', 'hx-sheet__grip');
      grip.setAttribute('aria-hidden', 'true');
      box.prepend(grip);
    }

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    if (root.HxMaterial) root.HxMaterial.prepare(box);

    var closed = false;

    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        session.close();
        return;
      }
      if (event.key !== 'Tab') return;
      var items = focusables(box);
      if (!items.length) { event.preventDefault(); box.focus(); return; }
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === box)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }

    function onBackdrop(event) {
      if (options.closeOnBackdrop && event.target === backdrop) session.close();
    }

    var session = {
      node: box,
      backdrop: backdrop,
      close: function () {
        if (closed) return Promise.resolve();
        closed = true;
        document.removeEventListener('keydown', onKeydown, true);
        backdrop.classList.add('is-closing');
        var duration = prefersReducedMotion() ? 0 : (options.sheet ? 240 : 220);
        return new Promise(function (resolve) {
          setTimeout(function () {
            if (backdrop.parentNode) backdrop.remove();
            var active = document.activeElement;
            var focusIsElsewhere = active && active !== document.body &&
              active !== box && !box.contains(active) && active !== previousFocus;
            if (options.restoreFocus && previousFocus && previousFocus.isConnected && !focusIsElsewhere) {
              try { previousFocus.focus({ preventScroll: true }); } catch (_) {}
            }
            if (options.onClose) options.onClose();
            resolve();
          }, duration);
        });
      }
    };

    backdrop.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKeydown, true);
    box.tabIndex = -1;

    requestAnimationFrame(function () {
      var items = focusables(box);
      (items[0] || box).focus({ preventScroll: true });
    });

    if (options.onOpen) options.onOpen(session);
    return session;
  }

  function openSheet(options) {
    return openModal(Object.assign({}, options || {}, { sheet: true }));
  }

  root.HxSurfaces = {
    version: '1.0.0',
    morph: morph,
    openModal: openModal,
    openSheet: openSheet
  };
})(typeof window !== 'undefined' ? window : globalThis);
