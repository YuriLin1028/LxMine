(function () {
  'use strict';
  var drag = null;
  var previewSeconds = null;
  var ray = new THREE.Raycaster();
  var ndc = new THREE.Vector2();
  var commits = 0;
  var hitMasks = new WeakMap();
  function hitsVisibleInk(row, hit) {
    var canvas = row.lineMask && row.lineMask.texture && row.lineMask.texture.image;
    if (!canvas || !hit.uv || !canvas.getContext) return false;
    var mask = hitMasks.get(canvas);
    if (!mask || mask.width !== canvas.width || mask.height !== canvas.height) {
      try { mask = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height); }
      catch (_) { return false; }
      hitMasks.set(canvas, mask);
    }
    var x = Math.round(hit.uv.x * (mask.width - 1));
    var y = Math.round((1 - hit.uv.y) * (mask.height - 1));
    // A little tolerance around the visible letters, without claiming the
    // transparent area of the entire 3D text plane as a lyric gesture.
    var radius = Math.max(3, Math.round(mask.height * 0.045));
    for (var dy = -radius; dy <= radius; dy += 2) for (var dx = -radius; dx <= radius; dx += 2) {
      var sx = x + dx, sy = y + dy;
      if (sx >= 0 && sy >= 0 && sx < mask.width && sy < mask.height && mask.data[(sy * mask.width + sx) * 4 + 3] > 32) return true;
    }
    return false;
  }
  var hud = document.createElement('div');
  hud.id = 'lxmine-lyric-seek-preview';
  hud.style.cssText = 'display:none;position:fixed;left:50%;top:62%;transform:translateX(-50%);max-width:84%;padding:10px 18px;border-radius:24px;background:rgba(0,0,0,.58);color:white;font:14px/1.5 sans-serif;text-align:center;pointer-events:none;z-index:5;backdrop-filter:blur(14px)';
  document.getElementById('canvas-container').appendChild(hud);
  function hitLine(x, y) {
    if (!fx.particleLyrics || !stageLyrics.current || !lyricsLines.length) return -1;
    var data = stageLyrics.current.userData.lyric;
    var rows = data && data.rowLayers;
    if (!rows) return -1;
    stageLyrics.group.updateMatrixWorld(true);
    ndc.set(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2);
    ray.setFromCamera(ndc, camera);
    var best = null;
    rows.forEach(function (row) {
      if (!row.mesh || !row.mesh.visible || row.isTranslation || row.mat &&
          (row.mat.uniforms && row.mat.uniforms.uOpacity ? row.mat.uniforms.uOpacity.value : row.mat.opacity) < 0.05) return;
      var index = Number(row.lineIndex);
      if (!Number.isFinite(index) || !lyricsLines[index]) return;
      var intersections = ray.intersectObject(row.mesh, false);
      if (intersections.length && hitsVisibleInk(row, intersections[0]) && (!best || intersections[0].distance < best.distance)) best = { index: index, distance: intersections[0].distance };
    });
    return best ? best.index : -1;
  }
  function show(index) {
    index = Math.max(0, Math.min(lyricsLines.length - 1, index));
    drag.index = index;
    previewSeconds = Math.max(0, Number(lyricsLines[index].t) || 0);
    hud.textContent = formatProgramTime(previewSeconds) + '  ·  ' + lyricsLines[index].text;
    hud.style.display = 'block';
    markRenderInteraction('lyric-drag', 600);
  }
  window.lxmineLyricPreviewTime = function () { return previewSeconds; };
  window.lxmineLyricHitTest = hitLine;
  window.lxmineLyricSeekDiagnostics = function () { return { dragging: !!drag, index: drag ? drag.index : -1, preview: previewSeconds, commits: commits }; };
  var canvas = renderer.domElement;
  ['mousedown', 'mousemove', 'mouseup'].forEach(function (type) {
    canvas.addEventListener(type, function (event) { if (drag) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  });
  canvas.addEventListener('pointerdown', function (event) {
    if (event.button !== 0 || drag || isPointerOverUi(event)) return;
    var index = hitLine(event.clientX, event.clientY);
    if (index < 0) return;
    event.preventDefault(); event.stopImmediatePropagation();
    drag = { id: event.pointerId, startY: event.clientY, startX: event.clientX, startIndex: index, index: index, moved: false,
      track: currentCoverSong(), media: audio, wasPlaying: playing && audio && !audio.paused };
    orbit.rotating = false; particlePointerSpin.active = false;
    canvas.setPointerCapture(event.pointerId);
  }, true);
  canvas.addEventListener('pointermove', function (event) {
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 7) drag.moved = true;
    if (drag.moved) show(drag.startIndex + Math.round((drag.startY - event.clientY) / 54));
  }, true);
  function finish(event, cancel) {
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    var state = drag;
    if (!cancel && state.moved && state.track === currentCoverSong() && state.media === audio) {
      var target = Math.max(0, Number(lyricsLines[state.index].t) || 0);
      if (window.__LXMINE_NATIVE_STAGE) {
        if (window.lxmineStage) window.lxmineStage.seek(target);
      } else if (audio && getPlaybackDurationSeconds()) {
        progressDragState.media = audio; progressDragState.mediaSrc = audio.currentSrc || audio.src || '';
        progressDragState.previewDuration = getPlaybackDurationSeconds();
        commitProgressSeek(target, state.wasPlaying);
        progressDragState.media = null; progressDragState.mediaSrc = '';
      }
      commits++;
    }
    drag = null; previewSeconds = null; hud.style.display = 'none';
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener('pointerup', function (event) { finish(event, false); }, true);
  canvas.addEventListener('pointercancel', function (event) { finish(event, true); }, true);
  canvas.addEventListener('lostpointercapture', function (event) { finish(event, true); }, true);
  window.addEventListener('blur', function () { drag = null; previewSeconds = null; hud.style.display = 'none'; });
})();
