/*!
 * huawei-immersive-pc / interaction runtime v1.0.0
 *
 * Pointer light + press/drag deformation for optical surfaces.
 *
 * Contract:
 *   - Only .hx-glass__skin is transformed. Text, icons, hit areas and the host
 *     itself never move, so labels stay pixel-stable while the material bends.
 *   - .hx-light receives a pointer-tracked radial light. The light is cleared
 *     when the pointer leaves the control or the window.
 *   - Native inputs, textareas, selects and editable regions are excluded.
 *   - Pointer capture is deliberately not used: native sliders and text
 *     selection keep working. Window-level release cleans up stale state.
 *
 * Copyright (c) 2026 林毅.
 * License: MIT.
 */
(function (root) {
  'use strict';

  var config = {
    pressSelector: '.hx-glass',
    lightSelector: '.hx-light',
    excludedSelector: 'input,textarea,select,[contenteditable="true"],[data-hx-no-press]',
    stiffness: 380,
    damping: 32,
    press: [0, 0, 0.997, 0.967],
    dragX: 0.025,
    dragY: 0.025,
    dragMaxX: 100,
    dragMaxY: 70,
    autoInstall: true
  };

  var states = new Map();
  var pointer = null;
  var frame = 0;
  var lastTime = 0;
  var installed = false;
  var reduced = null;

  function prefersReducedMotion() {
    if (!reduced && root.matchMedia) reduced = root.matchMedia('(prefers-reduced-motion: reduce)');
    return !!(reduced && reduced.matches);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function surfaceOf(host) {
    return host.querySelector(':scope > .hx-glass__skin');
  }

  function stateOf(host) {
    var state = states.get(host);
    if (!state) {
      state = {
        surface: surfaceOf(host),
        x: 0, y: 0, sx: 1, sy: 1,
        vx: 0, vy: 0, vsx: 0, vsy: 0,
        target: [0, 0, 1, 1]
      };
      states.set(host, state);
    }
    if (!state.surface || !state.surface.isConnected) state.surface = surfaceOf(host);
    return state;
  }

  function settle(state) {
    state.x = state.target[0];
    state.y = state.target[1];
    state.sx = state.target[2];
    state.sy = state.target[3];
    state.vx = state.vy = state.vsx = state.vsy = 0;
    if (state.surface) state.surface.style.transform = '';
  }

  function setTarget(state, values) {
    state.target = values;
    if (prefersReducedMotion()) { settle(state); return; }
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function tick(time) {
    frame = 0;
    var dt = Math.min(0.032, Math.max(0.001, (time - (lastTime || time - 16)) / 1000));
    lastTime = time;
    var moving = false;

    states.forEach(function (state) {
      var keys = ['x', 'y', 'sx', 'sy'];
      var velocities = ['vx', 'vy', 'vsx', 'vsy'];
      keys.forEach(function (key, index) {
        var velocityKey = velocities[index];
        var delta = state.target[index] - state[key];
        state[velocityKey] += (config.stiffness * delta - config.damping * state[velocityKey]) * dt;
        state[key] += state[velocityKey] * dt;
        if (Math.abs(delta) < 0.00015 && Math.abs(state[velocityKey]) < 0.001) {
          state[key] = state.target[index];
          state[velocityKey] = 0;
        } else {
          moving = true;
        }
      });
      if (state.surface && state.surface.isConnected) {
        state.surface.style.transform =
          'translate(' + state.x + 'px,' + state.y + 'px) scale(' + state.sx + ',' + state.sy + ')';
      }
    });

    if (moving) frame = requestAnimationFrame(tick);
    else lastTime = 0;
  }

  function light(host, event) {
    var rect = host.getBoundingClientRect();
    host.style.setProperty('--hx-mx', (event.clientX - rect.left) + 'px');
    host.style.setProperty('--hx-my', (event.clientY - rect.top) + 'px');
  }

  function resetLight(host) {
    if (!host) return;
    host.style.removeProperty('--hx-mx');
    host.style.removeProperty('--hx-my');
  }

  function clearVisuals() {
    document.querySelectorAll('.hx-pressed,.hx-light-active').forEach(function (host) {
      host.classList.remove('hx-pressed', 'hx-light-active');
    });
    states.forEach(function (state) { setTarget(state, [0, 0, 1, 1]); });
    pointer = null;
  }

  function release(event) {
    // Synthetic blur, pointer-capture changes and window switches can all
    // bypass the pointer id that started the press. Always clear stale visuals;
    // only the owning pointer may drive the spring target of its host.
    if (!pointer) { clearVisuals(); return; }
    if (event && event.pointerId != null && event.pointerId !== pointer.id) {
      clearVisuals();
      return;
    }
    var host = pointer.host;
    var state = states.get(host);
    host.classList.remove('hx-pressed', 'hx-light-active');
    if (state) setTarget(state, [0, 0, 1, 1]);
    pointer = null;
  }

  function onPointerDown(event) {
    if (event.button !== 0 || event.isPrimary === false) return;
    if (!event.target || !event.target.closest) return;
    if (event.target.closest(config.excludedSelector)) return;
    var host = event.target.closest(config.pressSelector);
    if (!host || host.getAttribute('data-hx-press') === 'none') return;
    if (!surfaceOf(host)) return;

    release();
    var state = stateOf(host);
    pointer = { id: event.pointerId, host: host, x: event.clientX, y: event.clientY };
    light(host, event);
    host.classList.add('hx-pressed', 'hx-light-active');
    setTarget(state, config.press.slice());
  }

  function onPointerMove(event) {
    if (event.target && event.target.closest) {
      var hover = event.target.closest(config.lightSelector);
      if (hover) light(hover, event);
    }
    if (!pointer || pointer.id !== event.pointerId) return;
    light(pointer.host, event);
    var dx = clamp(event.clientX - pointer.x, -config.dragMaxX, config.dragMaxX);
    var dy = clamp(event.clientY - pointer.y, -config.dragMaxY, config.dragMaxY);
    var state = states.get(pointer.host);
    if (!state) return;
    setTarget(state, [
      dx * config.dragX,
      dy * config.dragY,
      0.997 + Math.abs(dx) * 0.00003,
      0.967 + Math.abs(dy) * 0.00012
    ]);
  }

  function onPointerOut(event) {
    if (!event.target || !event.target.closest) return;
    var host = event.target.closest(config.lightSelector);
    if (!host) return;
    var next = event.relatedTarget;
    if (next && host.contains(next)) return;
    resetLight(host);
  }

  function bind() {
    if (installed) return api;
    installed = true;
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerout', onPointerOut, { passive: true });
    root.addEventListener('pointerup', release, { passive: true });
    root.addEventListener('pointercancel', release, { passive: true });
    root.addEventListener('blur', function () { release(); });
    root.addEventListener('pointerleave', function () {
      document.querySelectorAll(config.lightSelector).forEach(resetLight);
    }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) release();
    });
    return api;
  }

  function install(options) {
    if (options) Object.assign(config, options);
    bind();
    return api;
  }

  function releaseAll() {
    clearVisuals();
  }

  var api = {
    version: '1.0.0',
    install: install,
    releaseAll: releaseAll,
    refresh: function (host) {
      var state = states.get(host);
      if (state) state.surface = surfaceOf(host);
    },
    get options() { return Object.assign({}, config); }
  };

  root.HxInteractions = api;

  if (config.autoInstall && root.HX_IMMERSIVE_MANUAL !== true) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { install(); }, { once: true });
    } else {
      setTimeout(function () { install(); }, 0);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
