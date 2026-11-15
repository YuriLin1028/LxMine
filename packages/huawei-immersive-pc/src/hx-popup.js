/*!
 * huawei-immersive-pc / anchored popup runtime v1.0.0
 *
 * Anchored Huawei-style menu + generic popup. The entry table is the measured
 * native system-menu curve (740 ms); dismissal is a 150 ms collapse.
 *
 * Public API:
 *   HxPopup.openMenu(anchor, items, options) -> session
 *   HxPopup.openPanel(anchor, node, options) -> session
 *   HxPopup.close(options)
 *   HxPopup.motion.open(node) / HxPopup.motion.close(node)
 *
 * Menu item shape:
 *   { label, checked?, disabled?, action?, hint?, separator? }
 *
 * Copyright (c) 2026 林毅.
 * License: MIT.
 */
(function (root) {
  'use strict';

  var ENTRY_DURATION = 740;
  var CLOSE_DURATION = 150;

  // Measured from a native system Select/Menu recording. Columns:
  // time(ms), uniform scale, width-relative x, CSS-pixel y, opacity.
  var ENTRY = [
    [0, 0.2, 0, -8, 0],
    [24.576, 0.38, -0.00286, -3.9871, 0.1687],
    [41.249, 0.47, -0.00995, -1.9431, 0.3793],
    [57.922, 0.57, -0.01291, -0.9337, 0.5834],
    [74.596, 0.66, -0.01754, -0.572, 0.695],
    [91.269, 0.74, -0.02138, -0.4374, 0.7685],
    [107.942, 0.81, -0.02443, -0.5299, 0.783],
    [124.615, 0.87, -0.02916, -0.8496, 0.7899],
    [141.288, 0.91, -0.03478, -0.3617, 0.7899],
    [157.962, 0.95, -0.03793, -0.2944, 0.8204],
    [174.635, 0.97, -0.04443, 0.5804, 0.8267],
    [191.308, 0.99, -0.04847, 1.0346, 0.8613],
    [207.981, 1.01, -0.04512, 1.0683, 0.8802],
    [224.654, 1.01, -0.04759, 1.4889, 0.91],
    [241.328, 1.02, -0.04345, 1.716, 0.942],
    [258.001, 1.02, -0.04099, 2.1366, 0.9577],
    [274.674, 1.02, -0.03852, 2.1366, 0.9737],
    [291.347, 1.02, -0.0336, 2.1366, 0.9762],
    [308.02, 1.02, -0.02867, 1.716, 0.9762],
    [324.694, 1.01, -0.03034, 1.9094, 0.9762],
    [341.367, 1.01, -0.02296, 1.9094, 0.9762],
    [358.04, 1.01, -0.02049, 1.4889, 0.9762],
    [374.713, 1, -0.0197, 1.6823, 0.9762],
    [391.386, 1, -0.01724, 1.6823, 0.9762],
    [408.06, 1, -0.01232, 1.2617, 0.9762],
    [424.733, 1, -0.00985, 1.2617, 0.9762],
    [441.406, 1, -0.00739, 0.8412, 0.9762],
    [458.079, 1, -0.00493, 0.8412, 0.9762],
    [474.752, 1, -0.00493, 0.8412, 0.9762],
    [491.426, 1, -0.00246, 0.4206, 0.9762],
    [508.099, 1, -0.00246, 0.4206, 0.9762],
    [524.772, 1, -0.00246, 0.4206, 0.9762],
    [541.445, 1, 0, 0.4206, 0.9762],
    [558.119, 1, 0, 0, 0.9922],
    [574.792, 1, 0, 0, 0.9922],
    [591.465, 1, 0, 0, 0.9922],
    [608.138, 1, 0, 0, 0.9922],
    [624.811, 1, 0, 0, 0.9922],
    [641.485, 1, 0, 0, 0.9922],
    [658.158, 1, 0, 0, 0.9922],
    [674.831, 1, 0, 0, 0.9922],
    [691.504, 1, 0, 0, 0.9922],
    [740, 1, 0, 0, 1]
  ];

  var CLOSE = [
    [0, 1, 1], [16.67, 0.98, 0.94], [33.33, 0.92, 0.8],
    [50, 0.86, 0.6], [66.67, 0.79, 0.35], [83.33, 0.73, 0.13],
    [100, 0.69, 0.03], [150, 0.6, 0]
  ];

  var current = null;
  var uid = 0;
  var reduced = null;

  function prefersReducedMotion() {
    if (!reduced && root.matchMedia) reduced = root.matchMedia('(prefers-reduced-motion: reduce)');
    return !!(reduced && reduced.matches);
  }

  function motionOpen(node) {
    if (prefersReducedMotion()) return null;
    var width = node.offsetWidth;
    var up = node.classList.contains('is-above') ? -1 : 1;
    var side = Number(node.dataset.hxOriginX) < 0.5 ? -1 : 1;
    var frames = ENTRY.map(function (frame) {
      return {
        offset: frame[0] / ENTRY_DURATION,
        transform: 'translate(' + frame[2] * width * side + 'px,' + frame[3] * up + 'px) scale(' + frame[1] + ')',
        opacity: frame[4]
      };
    });
    var animation = node.animate(frames, {
      duration: ENTRY_DURATION,
      easing: 'linear',
      fill: 'both'
    });
    // After settling, drop the WAAPI fill so CSS owns the final state.
    animation.finished.then(function () {
      if (node.isConnected) animation.cancel();
    }).catch(function () {});
    return animation;
  }

  function motionClose(node) {
    var computed = getComputedStyle(node);
    var matrix = new DOMMatrixReadOnly(computed.transform === 'none' ? undefined : computed.transform);
    var initialScale = Math.hypot(matrix.a, matrix.b);
    var initialOpacity = Number(computed.opacity);
    var x = matrix.e;
    var y = matrix.f;
    var previous = node.getAnimations();
    previous.forEach(function (animation) { animation.cancel(); });
    if (prefersReducedMotion()) return Promise.resolve();

    var frames = CLOSE.map(function (frame) {
      var progress = frame[0] / CLOSE_DURATION;
      return {
        offset: progress,
        transform: 'translate(' + x * (1 - progress) + 'px,' + y * (1 - progress) + 'px) scale(' +
          frame[1] * initialScale + ')',
        opacity: frame[2] * initialOpacity
      };
    });
    return node.animate(frames, {
      duration: CLOSE_DURATION,
      easing: 'linear',
      fill: 'forwards'
    }).finished.catch(function () {});
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rowsOf(menu) {
    return Array.prototype.slice.call(menu.querySelectorAll('.hx-popup__row:not([aria-disabled="true"])'));
  }

  function activate(row) {
    if (!row) return;
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: root }));
  }

  function onMenuKeydown(event) {
    var menu = event.currentTarget;
    var rows = rowsOf(menu);
    if (!rows.length) return;
    var index = rows.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      rows[(index + 1 + rows.length) % rows.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      rows[(index - 1 + rows.length) % rows.length].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      rows[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      rows[rows.length - 1].focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(document.activeElement && document.activeElement.classList.contains('hx-popup__row')
        ? document.activeElement : rows[0]);
    } else if (event.key === 'Tab') {
      // Native menus dismiss on Tab instead of moving focus behind the popup.
      event.preventDefault();
      close({ restoreFocus: true });
    }
  }

  function position(menu, anchor, options) {
    var rect = anchor.getBoundingClientRect();
    var width = menu.offsetWidth;
    var height = menu.offsetHeight;
    var vw = root.innerWidth;
    var vh = root.innerHeight;
    var margin = options.margin == null ? 16 : options.margin;
    var gap = options.gap == null ? 8 : options.gap;
    var bottomMargin = options.bottomMargin == null ? 12 : options.bottomMargin;
    var align = options.align || 'start';
    var above = false;
    var top = rect.bottom + gap;

    if (top + height > vh - bottomMargin) {
      above = true;
      top = Math.max(12, rect.top - gap - height);
    }

    var left = rect.left;
    if (align === 'end') left = rect.right - width;
    else if (align === 'center') left = rect.left + rect.width / 2 - width / 2;
    left = clamp(left, margin, Math.max(margin, vw - margin - width));

    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    menu.style.right = 'auto';
    menu.classList.toggle('is-above', above);

    // The popup grows from the trigger's centre, not from its own corner.
    var originX = rect.left + rect.width / 2 - left;
    var originY = rect.top + rect.height / 2 - top;
    menu.style.transformOrigin = originX + 'px ' + originY + 'px';
    menu.dataset.hxOriginX = String(originX / Math.max(1, width));
    menu.dataset.hxOriginY = String(originY / Math.max(1, height));
  }

  function buildMenu(items, options) {
    var menu = element('div', 'hx-popup hx-glass' + (options.className ? ' ' + options.className : ''));
    menu.dataset.hxMaterial = 'popup';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', options.ariaLabel || '菜单');
    menu.tabIndex = -1;
    menu.id = 'hx-popup-' + (++uid);

    items.forEach(function (item) {
      if (!item || item.separator) {
        var separator = element('div', 'hx-popup__separator');
        separator.setAttribute('role', 'separator');
        menu.appendChild(separator);
        return;
      }
      var selectable = item.checked !== undefined;
      var row = element('div', 'hx-popup__row' + (item.checked ? ' is-checked' : '') +
        (item.disabled ? ' is-disabled' : ''));
      row.setAttribute('role', options.rowRole || (selectable ? 'menuitemradio' : 'menuitem'));
      if (selectable) row.setAttribute('aria-checked', String(!!item.checked));
      if (item.disabled) row.setAttribute('aria-disabled', 'true');
      row.tabIndex = -1;
      row.appendChild(element('span', 'hx-popup__label', item.label));
      if (item.hint) row.appendChild(element('span', 'hx-popup__hint', item.hint));
      row.addEventListener('click', function () {
        if (item.disabled) return;
        close({ restoreFocus: true });
        if (item.action) item.action(item);
      });
      menu.appendChild(row);
    });

    menu.addEventListener('keydown', onMenuKeydown);
    return menu;
  }

  function onGlobalKeydown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close({ restoreFocus: true });
  }

  function onWindowBlur() { close({ restoreFocus: false }); }
  function onResize() { close({ restoreFocus: false }); }
  function onScroll(event) {
    if (current && current.menu.contains(event.target)) return;
    close({ restoreFocus: false });
  }

  function show(menu, anchor, options) {
    close({ restoreFocus: false });
    var backdrop = element('div', 'hx-menu-backdrop');
    backdrop.addEventListener('click', function () { close({ restoreFocus: true }); });
    backdrop.addEventListener('contextmenu', function (event) { event.preventDefault(); });

    menu.style.visibility = 'hidden';
    document.body.append(backdrop, menu);

    // Chromium rounds fractional borders to physical pixels. Keep each edge's
    // border + padding at the declared padding so row heights stay exact.
    var computed = getComputedStyle(menu);
    var borderTop = parseFloat(computed.borderTopWidth) || 0;
    var padding = parseFloat(computed.paddingTop);
    if (isFinite(padding)) menu.style.paddingBlock = 'calc(' + padding + 'px - ' + borderTop + 'px)';

    if (root.HxMaterial) root.HxMaterial.prepare(menu);
    position(menu, anchor, options);
    menu.style.visibility = '';

    var hadExpanded = anchor.hasAttribute('aria-expanded');
    anchor.setAttribute('aria-expanded', 'true');
    anchor.setAttribute('aria-haspopup', options.haspopup || 'menu');
    anchor.setAttribute('aria-controls', menu.id);

    var session = {
      menu: menu,
      backdrop: backdrop,
      anchor: anchor,
      options: options,
      close: function (opts) { return close(opts); }
    };
    current = session;

    document.addEventListener('keydown', onGlobalKeydown, true);
    root.addEventListener('blur', onWindowBlur);
    root.addEventListener('resize', onResize);
    document.addEventListener('scroll', onScroll, true);

    if (!prefersReducedMotion()) motionOpen(menu); else menu.style.opacity = '1';

    if (options.focus !== false) {
      var rows = rowsOf(menu);
      var target = rows.filter(function (row) { return row.getAttribute('aria-checked') === 'true'; })[0] || rows[0];
      requestAnimationFrame(function () {
        (target || menu).focus({ preventScroll: true });
      });
    }

    if (options.onOpen) options.onOpen(session);
    return session;
  }

  function close(options) {
    options = options || {};
    if (!current) return Promise.resolve();
    var session = current;
    current = null;

    document.removeEventListener('keydown', onGlobalKeydown, true);
    root.removeEventListener('blur', onWindowBlur);
    root.removeEventListener('resize', onResize);
    document.removeEventListener('scroll', onScroll, true);

    if (session.anchor && session.anchor.isConnected) {
      var active = document.activeElement;
      var focusIsElsewhere = active && active !== document.body &&
        active !== session.anchor && !session.menu.contains(active);
      if (options.restoreFocus !== false && !focusIsElsewhere) {
        try { session.anchor.focus({ preventScroll: true }); } catch (_) {}
      }
      session.anchor.setAttribute('aria-expanded', 'false');
    }

    return Promise.resolve(motionClose(session.menu)).then(function () {
      if (session.menu.parentNode) session.menu.remove();
      if (session.backdrop.parentNode) session.backdrop.remove();
      if (session.options.onClose) session.options.onClose();
    });
  }

  function openMenu(anchor, items, options) {
    options = Object.assign({
      ariaLabel: '菜单',
      align: 'start',
      gap: 8,
      margin: 16,
      bottomMargin: 12,
      focus: true,
      restoreFocus: true
    }, options || {});
    var menu = buildMenu(items || [], options);
    return show(menu, anchor, options);
  }

  function openPanel(anchor, content, options) {
    options = Object.assign({
      ariaLabel: '弹层',
      role: 'dialog',
      className: '',
      align: 'start',
      gap: 8,
      margin: 16,
      haspopup: 'dialog',
      focus: true,
      restoreFocus: true
    }, options || {});
    var panel = element('div', 'hx-popup hx-panel hx-glass' + (options.className ? ' ' + options.className : ''));
    panel.dataset.hxMaterial = 'popup';
    panel.setAttribute('role', options.role);
    panel.setAttribute('aria-label', options.ariaLabel);
    panel.tabIndex = -1;
    panel.id = 'hx-popup-' + (++uid);
    if (typeof content === 'string') panel.textContent = content;
    else panel.appendChild(content);
    return show(panel, anchor, options);
  }

  root.HxPopup = {
    version: '1.0.0',
    openMenu: openMenu,
    openPanel: openPanel,
    close: close,
    get current() { return current; },
    motion: { open: motionOpen, close: motionClose }
  };
})(typeof window !== 'undefined' ? window : globalThis);
