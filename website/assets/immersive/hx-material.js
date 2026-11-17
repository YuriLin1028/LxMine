/*!
 * huawei-immersive-pc / material runtime v1.0.0
 *
 * Independent implementation of a Huawei-style immersive optical surface for
 * Chromium (Electron on Windows). It samples the live page backdrop; it never
 * uses captured screenshots as textures.
 *
 * The calibrated defaults come from LxMine's native EXQUISITE captures:
 *   grid + text backgrounds, capsule / circle / panel / menu / sheet samples.
 * See references/material-model.md and references/acceptance-protocol.md.
 *
 * Browser contract:
 *   Chromium 120+ (Electron 30+), backdrop-filter with SVG filter references.
 * Required markup contract:
 *   <anything class="hx-glass hx-light"> ... </anything>
 *   The runtime appends <span class="hx-glass__skin" aria-hidden="true">.
 *
 * Copyright (c) 2026 林毅.
 * License: MIT. See LICENSE and NOTICE.md.
 */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var DEFAULTS = {
    selector: '.hx-glass',
    defsSelector: '.hx-filter-defs',
    autoInstall: true,
    flushBudgetMs: 4,
    cacheLimit: 96,
    optical: {
      // CSS-pixel units. Fitted jointly to grid and text references.
      sigma: 1.9,
      edgeSigma: 1.9,
      amplitude: 4,
      amplitudeCap: 90,
      decay: 2.5,
      tangentGain: 0.12,
      tangentCap: 8,
      tangentDecay: 2.5,
      resultSigma: 0.75,
      alpha: 0.15,
      color: [10, 12, 14],
      saturation: 1.25,
      envWeight: 1,
      envStart: 0.25,
      envWidth: 2,
      envOffset: 0,
      envLift: 0,
      envSlope: 1,
      tintWidth: 0.75,
      // Profile overrides. "control" uses the base values above.
      menu: { alpha: 0.88, color: [26, 28, 31] },
      sheet: { sigma: 4, alpha: 0.88, color: [26, 28, 31] },
      popup: { sigma: 5, edgeSigma: 5, alpha: 0.71, color: [30, 30, 30], tintWidth: 0.75 }
    }
  };

  var config = clone(DEFAULTS);
  var states = new Map();
  var cache = new Map();
  var pending = new Set();
  var serial = 0;
  var flushFrame = 0;
  var installed = false;
  var generation = 0;
  var sizeObserver = null;
  var mutationObserver = null;
  var defs = null;
  var reduced = null;

  function clone(value) {
    if (Array.isArray(value)) return value.slice();
    if (!value || typeof value !== 'object') return value;
    var out = {};
    Object.keys(value).forEach(function (key) { out[key] = clone(value[key]); });
    return out;
  }

  function merge(target, patch) {
    Object.keys(patch || {}).forEach(function (key) {
      var value = patch[key];
      if (value && typeof value === 'object' && !Array.isArray(value) &&
          target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        target[key] = merge(clone(target[key]), value);
      } else {
        target[key] = clone(value);
      }
    });
    return target;
  }

  function prefersReducedMotion() {
    if (!reduced && root.matchMedia) reduced = root.matchMedia('(prefers-reduced-motion: reduce)');
    return !!(reduced && reduced.matches);
  }

  function ensureDefs() {
    var holder = document.querySelector(config.defsSelector);
    if (holder && holder.querySelector('defs')) {
      defs = holder.querySelector('defs');
      return defs;
    }
    if (!holder) {
      holder = document.createElementNS(NS, 'svg');
      holder.setAttribute('class', 'hx-filter-defs');
      holder.setAttribute('width', '0');
      holder.setAttribute('height', '0');
      holder.setAttribute('aria-hidden', 'true');
      holder.setAttribute('focusable', 'false');
      holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      (document.body || document.documentElement).prepend(holder);
    }
    defs = document.createElementNS(NS, 'defs');
    holder.append(defs);
    return defs;
  }

  function svgElement(name, attributes, parent) {
    var node = document.createElementNS(NS, name);
    Object.keys(attributes).forEach(function (key) { node.setAttribute(key, attributes[key]); });
    parent.append(node);
    return node;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function kindOf(host) {
    var explicit = host.getAttribute('data-hx-material');
    if (explicit === 'control' || explicit === 'menu' || explicit === 'popup' || explicit === 'sheet') return explicit;
    if (host.classList.contains('hx-popup') || host.classList.contains('anchored-menu')) return 'popup';
    if (host.classList.contains('hx-menu') || host.classList.contains('hx-popover') || host.classList.contains('popover')) return 'menu';
    if (host.classList.contains('hx-sheet') || host.classList.contains('hx-modal') || host.classList.contains('modal')) return 'sheet';
    return 'control';
  }

  function profileOf(kind) {
    var base = {};
    Object.keys(config.optical).forEach(function (key) {
      if (key !== 'menu' && key !== 'sheet' && key !== 'popup') base[key] = config.optical[key];
    });
    var override = config.optical[kind] || {};
    Object.keys(override).forEach(function (key) { base[key] = override[key]; });
    return base;
  }

  function neutralDepth(profile, displacementScale, environmentScale) {
    // Byte-exact shortcut: each contribution is already below 1/8 byte in the
    // deep interior, so skipping the math cannot change the encoded pixels.
    function cutoff(decay, gain) { return decay * Math.log(Math.max(1, gain * 8)); }
    return Math.max(
      cutoff(profile.decay, 116),
      cutoff(profile.tangentDecay, profile.tangentCap * 255 / displacementScale),
      cutoff(profile.decay, Math.abs(profile.envOffset) * 116 / environmentScale),
      cutoff(profile.tangentDecay, profile.tangentCap * 255 / environmentScale),
      (profile.envStart || 0) + profile.envWidth,
      profile.tintWidth || 0.75
    );
  }

  function buildLens(width, height, radii, kind) {
    var profile = profileOf(kind);
    // Quantize so a resizing window cannot retain hundreds of GPU filters.
    var w = Math.max(2, Math.round(width / 2) * 2);
    var h = Math.max(2, Math.round(height / 2) * 2);
    var corners = radii.map(function (radius) {
      return Math.round(Math.min(radius, w / 2, h / 2));
    });
    var key = [w, h].concat(corners, [kind, JSON.stringify(profile)]).join(':');
    if (cache.has(key)) return cache.get(key);

    var resolution = Math.min(profile.mapDensity || 1, 2048 / Math.max(w, h));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(w * resolution));
    canvas.height = Math.max(2, Math.round(h * resolution));
    var context = canvas.getContext('2d');
    var pixels = context.createImageData(canvas.width, canvas.height);

    var environmentCanvas = document.createElement('canvas');
    environmentCanvas.width = canvas.width;
    environmentCanvas.height = canvas.height;
    var environmentContext = environmentCanvas.getContext('2d');
    var environmentPixels = environmentContext.createImageData(canvas.width, canvas.height);

    var displacementScale = Math.min(profile.amplitudeCap, h * profile.amplitude);
    var environmentScale = 64;
    var skipDepth = neutralDepth(profile, displacementScale, environmentScale);
    var isPopup = kind === 'popup';

    for (var y = 0; y < canvas.height; y++) {
      for (var x = 0; x < canvas.width; x++) {
        var px = (x + 0.5) / canvas.width * w - w / 2;
        var py = (y + 0.5) / canvas.height * h - h / 2;
        var r = corners[py < 0 ? (px < 0 ? 0 : 1) : (px < 0 ? 3 : 2)];
        var edgeX = w / 2 - Math.abs(px);
        var edgeY = h / 2 - Math.abs(py);
        var i = (y * canvas.width + x) * 4;

        if ((edgeX >= r || edgeY >= r) && Math.min(edgeX, edgeY) > skipDepth) {
          pixels.data[i] = 128;
          pixels.data[i + 1] = 128;
          pixels.data[i + 2] = 0;
          pixels.data[i + 3] = 255;
          environmentPixels.data[i] = 128;
          environmentPixels.data[i + 1] = 128;
          environmentPixels.data[i + 2] = isPopup ? 255 : 128;
          environmentPixels.data[i + 3] = 255;
          continue;
        }

        var qx = Math.abs(px) - (w / 2 - r);
        var qy = Math.abs(py) - (h / 2 - r);
        var ax = Math.max(qx, 0);
        var ay = Math.max(qy, 0);
        var len = Math.hypot(ax, ay);
        var distance = r - (len + Math.min(Math.max(qx, qy), 0));
        var nx = 0;
        var ny = 0;
        if (len > 0.001) {
          nx = ax / len * Math.sign(px);
          ny = ay / len * Math.sign(py);
        } else if (qx > qy) {
          nx = Math.sign(px);
        } else {
          ny = Math.sign(py);
        }

        // Measured convex shoulder: refraction decays before readable content.
        // No noise or animated turbulence is used.
        var bend = Math.exp(-Math.max(0, distance) / profile.decay);
        // Straight shoulders also contract toward the control centre. Without
        // this measured tangential field, capsule top/bottom edges stay
        // ruler-straight instead of bowing like the native surface.
        var tangentBend = Math.exp(-Math.max(0, distance) / profile.tangentDecay);
        var sideCapX = clamp((w - 2 * r) / Math.max(r, 1), 0, 1);
        var sideCapY = clamp((h - 2 * r) / Math.max(r, 1), 0, 1);
        var tx = -clamp(px * profile.tangentGain, -profile.tangentCap, profile.tangentCap) *
          (1 - Math.abs(nx)) * sideCapX * tangentBend;
        var ty = -clamp(py * profile.tangentGain, -profile.tangentCap, profile.tangentCap) *
          (1 - Math.abs(ny)) * sideCapY * tangentBend;

        var edgeT = clamp((distance - (profile.envStart || 0)) / profile.envWidth, 0, 1);
        var clear = 1 - edgeT * edgeT * (3 - 2 * edgeT);

        pixels.data[i] = Math.round(128 - nx * bend * 116 + tx / displacementScale * 255);
        pixels.data[i + 1] = Math.round(128 - ny * bend * 116 + ty / displacementScale * 255);
        pixels.data[i + 2] = Math.round(clear * 255);
        pixels.data[i + 3] = 255;

        environmentPixels.data[i] = Math.round(128 + (tx + nx * bend * 116 / 255 * profile.envOffset) / environmentScale * 255);
        environmentPixels.data[i + 1] = Math.round(128 + (ty + ny * bend * 116 / 255 * profile.envOffset) / environmentScale * 255);
        var tintT = clamp(distance / (profile.tintWidth || 0.75), 0, 1);
        environmentPixels.data[i + 2] = isPopup ? Math.round(tintT * tintT * (3 - 2 * tintT) * 255) : 128;
        environmentPixels.data[i + 3] = 255;
      }
    }

    context.putImageData(pixels, 0, 0);
    environmentContext.putImageData(environmentPixels, 0, 0);

    if (!defs) ensureDefs();
    var id = 'hx-lens-' + (++serial);
    var filter = svgElement('filter', {
      id: id,
      x: '0%', y: '0%', width: '100%', height: '100%',
      'color-interpolation-filters': 'sRGB'
    }, defs);

    svgElement('feImage', {
      href: canvas.toDataURL(), x: 0, y: 0, width: w, height: h,
      preserveAspectRatio: 'none', result: 'lens'
    }, filter);

    // Remove the neutral 128 bias while retaining the eight-bit normal bytes.
    // A small vector-field blur removes contour steps without blurring source.
    var neutral = svgElement('feComponentTransfer', { in: 'lens', result: 'vectors' }, filter);
    ['R', 'G'].forEach(function (channel) {
      svgElement('feFunc' + channel, { type: 'linear', slope: 1, intercept: -1 / 510 }, neutral);
    });

    svgElement('feImage', {
      href: environmentCanvas.toDataURL(), x: 0, y: 0, width: w, height: h,
      preserveAspectRatio: 'none', result: 'environmentLens'
    }, filter);
    var environmentNeutral = svgElement('feComponentTransfer', { in: 'environmentLens', result: 'environmentVectors' }, filter);
    ['R', 'G'].forEach(function (channel) {
      svgElement('feFunc' + channel, { type: 'linear', slope: 1, intercept: -1 / 510 }, environmentNeutral);
    });

    svgElement('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: profile.sigma, result: 'diffuse' }, filter);
    svgElement('feDisplacementMap', {
      in: 'diffuse', in2: 'vectors', scale: displacementScale,
      xChannelSelector: 'R', yChannelSelector: 'G', result: 'refracted'
    }, filter);

    // 8-bit fields produce iso-value contour steps after displacement. Native
    // EXQUISITE has a smoother optical field; this post-displacement blur
    // removes those steps while the rim mask stays independent and sharp.
    var refractedResult = 'refracted';
    if (profile.resultSigma > 0) {
      svgElement('feGaussianBlur', {
        in: 'refracted', stdDeviation: profile.resultSigma, result: 'refractedSmooth'
      }, filter);
      refractedResult = 'refractedSmooth';
    }

    var separateEdge = profile.edgeSigma !== profile.sigma;
    if (separateEdge) {
      svgElement('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: profile.edgeSigma, result: 'edgeDiffuse' }, filter);
    }
    svgElement('feDisplacementMap', {
      in: separateEdge ? 'edgeDiffuse' : 'diffuse',
      in2: 'environmentVectors', scale: environmentScale,
      xChannelSelector: 'R', yChannelSelector: 'G', result: 'environment'
    }, filter);

    var lift = svgElement('feComponentTransfer', { in: 'environment', result: 'lit' }, filter);
    ['R', 'G', 'B'].forEach(function (channel) {
      svgElement('feFunc' + channel, { type: 'linear', slope: profile.envSlope, intercept: profile.envLift }, lift);
    });

    // The lens B channel is the clear/rim mask: opaque at the outline, zero in
    // the interior. The independently displaced environment is mixed only in
    // that narrow band, so readable content never inherits the rim distortion.
    svgElement('feColorMatrix', {
      in: 'lens', type: 'matrix',
      values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 ' + profile.envWeight + ' 0 0',
      result: 'rimMask'
    }, filter);
    svgElement('feComposite', { in: 'lit', in2: 'rimMask', operator: 'in', result: 'litRim' }, filter);
    svgElement('feComposite', { in: refractedResult, in2: 'rimMask', operator: 'out', result: 'inner' }, filter);
    svgElement('feComposite', {
      in: 'inner', in2: 'litRim', operator: 'arithmetic', k2: 1, k3: 1, result: 'optical'
    }, filter);

    var finalResult = svgElement('feColorMatrix', {
      in: 'optical', type: 'saturate', values: profile.saturation, result: 'saturated'
    }, filter);

    if (isPopup) {
      // Native system menus keep the meniscus translucent instead of tinting
      // the rim at the same opacity as the readable centre.
      svgElement('feFlood', {
        'flood-color': 'rgb(' + (profile.color || [26, 28, 31]).join(',') + ')',
        'flood-opacity': profile.alpha,
        result: 'popupTint'
      }, filter);
      svgElement('feColorMatrix', {
        in: 'environmentLens', type: 'matrix',
        values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0',
        result: 'popupTintMask'
      }, filter);
      svgElement('feComposite', {
        in: 'popupTint', in2: 'popupTintMask', operator: 'in', result: 'popupInnerTint'
      }, filter);
      svgElement('feComposite', { in: 'popupInnerTint', in2: 'saturated', operator: 'over' }, filter);
    } else {
      // Keep the final primitive referenced for clarity in DevTools traces.
      finalResult.setAttribute('result', 'final');
    }

    var entry = { id: id, key: key, filter: filter };
    cache.set(key, entry);
    pruneCache(key);
    return entry;
  }

  function pruneCache(protectedKey) {
    if (cache.size <= config.cacheLimit) return;
    var inUse = new Set();
    states.forEach(function (state) { if (state.key) inUse.add(state.key); });
    cache.forEach(function (entry, key) {
      if (cache.size <= Math.max(24, config.cacheLimit - 24)) return;
      if (key === protectedKey || inUse.has(key)) return;
      entry.filter.remove();
      cache.delete(key);
    });
  }

  function measure(host) {
    if (!host.isConnected) return null;
    var w = host.offsetWidth;
    var h = host.offsetHeight;
    if (w < 2 || h < 2) return null;
    var css = getComputedStyle(host);
    // Absolute children normally fill the padding box. The optical skin must
    // cover the border box, including any transparent button border.
    var inset = [css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth]
      .map(function (value) { return -(parseFloat(value) || 0) + 'px'; }).join(' ');
    var radii = [css.borderTopLeftRadius, css.borderTopRightRadius, css.borderBottomRightRadius, css.borderBottomLeftRadius]
      .map(function (raw) {
        return raw.indexOf('%') >= 0 ? Math.min(w, h) * parseFloat(raw) / 100 : (parseFloat(raw) || 0);
      });
    return {
      w: w,
      h: h,
      inset: inset,
      radii: radii,
      kind: kindOf(host),
      borderRadius: css.borderRadius
    };
  }

  function refresh(host, state, measured) {
    measured = measured || measure(host);
    if (!measured) return;
    var profile = profileOf(measured.kind);
    var entry = buildLens(measured.w, measured.h, measured.radii, measured.kind);
    var tint = 'rgba(' + (profile.color || [10, 12, 14]).join(',') + ',' + profile.alpha + ')';
    var signature = [generation, entry.id, measured.inset, measured.borderRadius, tint].join('|');
    if (state.appliedSignature === signature) return;
    state.appliedSignature = signature;
    state.key = entry.key;

    var surface = state.surface;
    surface.style.inset = measured.inset;
    surface.style.borderRadius = measured.borderRadius;
    // Popup tint is produced inside the filter so the rim can stay lighter.
    surface.style.backgroundColor = measured.kind === 'popup' ? 'transparent' : tint;
    surface.style.setProperty('--hx-lens', 'url(#' + entry.id + ')');
    surface.style.setProperty('--hx-tint', tint);

    // Hosts need the variable for modal/popup fallbacks and for debugging.
    host.style.setProperty('--hx-lens', 'url(#' + entry.id + ')');
    host.style.setProperty('--hx-tint', tint);
    host.setAttribute('data-hx-material', measured.kind);
    host.setAttribute('data-hx-glass', 'ready');
  }

  function flushSkins() {
    flushFrame = 0;
    if (!pending.size) return;
    // Snapshot all geometry before any write. Interleaved reads and writes
    // force a new layout for every control during resize.
    var updates = [];
    pending.forEach(function (host) {
      if (host.isConnected) updates.push({ host: host, state: states.get(host) });
      else cleanup(host);
    });
    pending.clear();

    var started = root.performance ? performance.now() : Date.now();
    for (var i = 0; i < updates.length; i++) {
      var elapsed = (root.performance ? performance.now() : Date.now()) - started;
      if (i > 0 && elapsed >= config.flushBudgetMs) {
        updates.slice(i).forEach(function (update) { pending.add(update.host); });
        break;
      }
      if (updates[i].state) refresh(updates[i].host, updates[i].state);
    }
    if (pending.size) flushFrame = requestFrame(flushSkins);
  }

  function requestFrame(callback) {
    if (root.requestAnimationFrame) return root.requestAnimationFrame(callback);
    return setTimeout(callback, 16);
  }

  function queue(host) {
    pending.add(host);
    if (!flushFrame) flushFrame = requestFrame(flushSkins);
  }

  function cleanup(host) {
    var state = states.get(host);
    if (!state) return;
    if (sizeObserver) sizeObserver.unobserve(host);
    states.delete(host);
  }

  function decorate(host) {
    if (!host || host.nodeType !== 1 || states.has(host)) return;
    var surface = host.querySelector(':scope > .hx-glass__skin');
    if (!surface) {
      surface = document.createElement('span');
      surface.className = 'hx-glass__skin';
      surface.setAttribute('aria-hidden', 'true');
      host.prepend(surface);
    }
    states.set(host, { surface: surface, key: '', appliedSignature: '' });
    if (sizeObserver) sizeObserver.observe(host);
    queue(host);
  }

  function walk(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.matches(config.selector)) decorate(node);
    node.querySelectorAll(config.selector).forEach(decorate);
  }

  function observe() {
    if (installed) return;
    installed = true;
    ensureDefs();
    // Native separators are one physical pixel, not one CSS pixel.
    if (root.devicePixelRatio) {
      document.documentElement.style.setProperty('--hx-hairline', (1 / root.devicePixelRatio) + 'px');
    }
    if (root.ResizeObserver) {
      sizeObserver = new ResizeObserver(function (entries) {
        entries.forEach(function (entry) { queue(entry.target); });
      });
    }
    states.forEach(function (_, host) { if (sizeObserver) sizeObserver.observe(host); });

    mutationObserver = new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) walk(node);
        });
        var state = states.get(record.target);
        if (state && state.surface.parentNode !== record.target) record.target.prepend(state.surface);
        if (record.type === 'attributes' && states.has(record.target)) queue(record.target);
      });
      states.forEach(function (_, host) { if (!host.isConnected) cleanup(host); });
    });
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-hx-material']
    });
  }

  function install(options) {
    if (options) merge(config, options);
    observe();
    walk(document.body || document.documentElement);
    document.documentElement.setAttribute('data-hx-material-ready', '1');
    document.dispatchEvent(new CustomEvent('hxmaterial:ready', { detail: { version: '1.0.0' } }));
    return api;
  }

  function prepare(host) {
    if (!host) return null;
    observe();
    walk(host);
    decorate(host);
    var state = states.get(host);
    if (state) refresh(host, state);
    return state;
  }

  function configure(patch) {
    merge(config, patch);
    generation++;
    states.forEach(function (state) { state.appliedSignature = ''; });
    cache.forEach(function (entry) { entry.filter.remove(); });
    cache.clear();
    states.forEach(function (_, host) { queue(host); });
    return api;
  }

  function destroy() {
    if (mutationObserver) mutationObserver.disconnect();
    if (sizeObserver) sizeObserver.disconnect();
    mutationObserver = null;
    sizeObserver = null;
    installed = false;
    states.forEach(function (state) {
      if (state.surface && state.surface.parentNode) state.surface.remove();
    });
    states.clear();
    pending.clear();
    if (flushFrame) {
      if (root.cancelAnimationFrame) root.cancelAnimationFrame(flushFrame);
      else clearTimeout(flushFrame);
      flushFrame = 0;
    }
    cache.forEach(function (entry) { entry.filter.remove(); });
    cache.clear();
    document.documentElement.removeAttribute('data-hx-material-ready');
  }

  var api = {
    version: '1.0.0',
    install: install,
    prepare: prepare,
    configure: configure,
    destroy: destroy,
    refresh: function (host) {
      var state = states.get(host);
      if (state) { state.appliedSignature = ''; refresh(host, state); }
    },
    refreshAll: function () { states.forEach(function (_, host) { queue(host); }); },
    get options() { return clone(config); },
    get stats() { return { hosts: states.size, filters: cache.size, installed: installed }; }
  };

  root.HxMaterial = api;

  if (config.autoInstall && root.HX_IMMERSIVE_MANUAL !== true) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { install(); }, { once: true });
    } else {
      setTimeout(function () { install(); }, 0);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
