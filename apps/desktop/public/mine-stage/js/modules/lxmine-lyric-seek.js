(function () {
  'use strict';
  var drag = null;
  var previewSeconds = null;
  var browseTimer = 0;
  var browseTrack = null;
  var ray = new THREE.Raycaster();
  var ndc = new THREE.Vector2();
  var commits = 0;
  var hitMasks = new WeakMap();
  function currentTrack() {
    var song = currentCoverSong();
    return window.__LXMINE_NATIVE_STAGE ? song && song.id : song;
  }
  function hitsVisibleInk(row, hit) {
    var canvas = row.lineMask && row.lineMask.texture && row.lineMask.texture.image;
    if (!canvas || !hit.uv || !canvas.getContext) return false;
    if (window.__LXMINE_NATIVE_STAGE && row.lineMask.fontSize) {
      var layout = row.lineMask;
      var halfWidth = ((layout.activeTextWidth || layout.textWidth) / 2 + layout.fontSize * 0.2) / layout.width;
      var centerY = (layout.lineY0 - layout.fontSize * 0.36) / layout.height;
      return Math.abs(hit.uv.x - 0.5) <= halfWidth && Math.abs(1 - hit.uv.y - centerY) <= layout.fontSize * 0.68 / layout.height;
    }
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
    if (window.__LXMINE_NATIVE_STAGE) {
      // Reserve top player header safe zone so tapping top-right controls never clicks lyrics.
      if (y < 84) return -1;
      // Leave generous side margins for 3D stage orbit even on narrow phones; horizontal drags
      // over lyrics also hand off directly to stage orbit in pointermove.
      var sceneEdge = Math.max(32, Math.min(68, innerWidth * .13));
      if (x < sceneEdge || x > innerWidth - sceneEdge) return -1;
      var nearest = null;
      var step = scrollStep();
      rows.forEach(function (row) {
        if (!row.mesh || !row.mesh.visible || row.isTranslation || !lyricsLines[row.lineIndex]) return;
        var opacity = row.mat && (row.mat.uniforms && row.mat.uniforms.uOpacity ? row.mat.uniforms.uOpacity.value : row.mat.opacity);
        if (opacity < .05) return;
        var layout = row.lineMask, geometry = row.mesh.geometry.parameters;
        if (!layout || !geometry) return;
        var halfWidth = geometry.width * Math.min(1, (layout.activeTextWidth || layout.textWidth) / layout.width) / 2;
        var centerY = (.5 - (layout.lineY0 - layout.fontSize * .36) / layout.height) * geometry.height;
        var halfHeight = geometry.height * layout.fontSize * .68 / layout.height;
        var left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        [-1, 1].forEach(function (dx) { [-1, 1].forEach(function (dy) {
          var point = row.mesh.localToWorld(new THREE.Vector3(dx * halfWidth, centerY + dy * halfHeight, 0)).project(camera);
          var px = (point.x + 1) * innerWidth / 2, py = (1 - point.y) * innerHeight / 2;
          left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
        }); });
        var centerX = (left + right) / 2, middleY = (top + bottom) / 2;
        var halfColumn = Math.max((right - left) / 2 + 24, innerWidth * (innerWidth < 700 ? .31 : .22));
        halfColumn = Math.min(innerWidth * .38, halfColumn);
        var vertical = Math.max((bottom - top) / 2 + 12, step * .56);
        var distance = Math.abs(y - middleY);
        if (Math.abs(x - centerX) <= halfColumn && distance <= vertical && (!nearest || distance < nearest.distance)) nearest = { index: row.lineIndex, distance: distance };
      });
      return nearest ? nearest.index : -1;
    }
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
    hud.style.display = window.__LXMINE_NATIVE_STAGE ? 'none' : 'block';
    markRenderInteraction('lyric-drag', 600);
  }
  function resumeFollowing() {
    clearTimeout(browseTimer);
    browseTimer = setTimeout(function () {
      if (window.lxmineMultiTouchActive || drag) { resumeFollowing(); return; }
      previewSeconds = null; browseTrack = null;
    }, 3500);
  }
  window.lxmineLyricPreviewTime = function () {
    if (browseTrack && browseTrack !== currentTrack()) { previewSeconds = null; browseTrack = null; }
    return previewSeconds;
  };
  window.lxmineLyricGestureActive = function () { return !!drag; };
  window.lxmineLyricHitTest = hitLine;
  window.lxmineLyricSeekDiagnostics = function () { return { dragging: !!drag, index: drag ? drag.index : -1, preview: previewSeconds, commits: commits }; };
  var canvas = renderer.domElement;
  function consume(event) {
    event.preventDefault();
    if (!window.__LXMINE_NATIVE_STAGE) event.stopImmediatePropagation();
  }
  function scrollStep() {
    var rows = stageLyrics.current && stageLyrics.current.userData.lyric && stageLyrics.current.userData.lyric.rowLayers;
    if (!rows || !THREE.Vector3) return 54;
    var first = rows.find(function (row) { return !row.isTranslation && row.mesh && row.mesh.visible; });
    var next = first && rows.find(function (row) { return !row.isTranslation && row.mesh && row.mesh.visible && row.lineIndex === first.lineIndex + 1; });
    if (!next) return 54;
    var firstPoint = first.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
    var nextPoint = next.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
    return Math.max(24, Math.min(innerHeight / 4, Math.abs(firstPoint.y - nextPoint.y) * innerHeight / 2));
  }
  // 多指属于系统手势（如双指唤起/隐藏沉浸控件），歌词拖动只认单指。
  function multiTouchActive() { return window.lxmineMultiTouchActive === true; }
  function cancelDrag(event) {
    var state = drag;
    drag = null; hud.style.display = 'none';
    if (state && canvas.hasPointerCapture(state.id)) canvas.releasePointerCapture(state.id);
    if (window.__LXMINE_NATIVE_STAGE && previewSeconds != null) resumeFollowing();
    else previewSeconds = null;
    if (event) consume(event);
  }
  ['mousedown', 'mousemove', 'mouseup'].forEach(function (type) {
    canvas.addEventListener(type, function (event) { if (drag) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  });
  canvas.addEventListener('pointerdown', function (event) {
    if (event.isPrimary === false || multiTouchActive()) { if (drag) cancelDrag(event); return; }
    if (event.button !== 0 || drag || isPointerOverUi(event)) return;
    var index = hitLine(event.clientX, event.clientY);
    if (index < 0) return;
    consume(event); clearTimeout(browseTimer);
    var origin = window.__LXMINE_NATIVE_STAGE ? Math.max(0, stageLyrics.currentIdx) : index;
    drag = { id: event.pointerId, startY: event.clientY, startX: event.clientX, startIndex: origin, clickIndex: index, index: index, step: scrollStep(), moved: false, axis: 'pending',
      track: currentTrack(), media: audio, wasPlaying: playing && audio && !audio.paused };
    browseTrack = currentTrack();
    orbit.rotating = false; particlePointerSpin.active = false;
    canvas.setPointerCapture(event.pointerId);
  }, true);
  canvas.addEventListener('pointermove', function (event) {
    if (!drag || drag.id !== event.pointerId) return;
    if (event.isPrimary === false || multiTouchActive()) { cancelDrag(event); return; }
    var dx = event.clientX - drag.startX;
    var dy = event.clientY - drag.startY;
    if (drag.axis === 'pending' && Math.hypot(dx, dy) > 8) {
      if (window.__LXMINE_NATIVE_STAGE && Math.abs(dx) > Math.abs(dy) * 1.1) {
        // Horizontal drag over lyrics hands off smoothly to 3D stage orbit on narrow phones.
        var pid = drag.id;
        drag = null; hud.style.display = 'none'; previewSeconds = null;
        if (canvas.hasPointerCapture(pid)) canvas.releasePointerCapture(pid);
        if (typeof window.lxmineStartStageOrbit === 'function') {
          window.lxmineStartStageOrbit(pid, event.clientX, event.clientY);
        }
        return;
      }
      drag.axis = 'lyric';
      drag.moved = true;
    }
    consume(event);
    if (drag.moved) show(drag.startIndex + Math.round((drag.startY - event.clientY) / drag.step));
  }, true);
  function finish(event, cancel) {
    if (!drag || drag.id !== event.pointerId) return;
    consume(event); event.lxmineLyricGesture = true; mouseDownAt.hadDrag = true;
    var state = drag;
    if (!cancel && state.track === currentTrack() && state.media === audio && (window.__LXMINE_NATIVE_STAGE || state.moved)) {
      var target = Math.max(0, Number(lyricsLines[state.moved ? state.index : state.clickIndex].t) || 0);
      if (window.__LXMINE_NATIVE_STAGE) {
        if (!state.moved && window.lxmineStage) { window.lxmineStage.seek(target); commits++; }
      } else if (audio && getPlaybackDurationSeconds()) {
        progressDragState.media = audio; progressDragState.mediaSrc = audio.currentSrc || audio.src || '';
        progressDragState.previewDuration = getPlaybackDurationSeconds();
        commitProgressSeek(target, state.wasPlaying);
        progressDragState.media = null; progressDragState.mediaSrc = '';
      }
      if (!window.__LXMINE_NATIVE_STAGE) commits++;
    }
    drag = null; hud.style.display = 'none';
    if (window.__LXMINE_NATIVE_STAGE && state.moved && !cancel) resumeFollowing();
    else { previewSeconds = null; browseTrack = null; }
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener('pointerup', function (event) { finish(event, false); }, true);
  canvas.addEventListener('pointercancel', function (event) { finish(event, true); }, true);
  canvas.addEventListener('lostpointercapture', function (event) { finish(event, true); }, true);
  window.addEventListener('blur', function () { clearTimeout(browseTimer); drag = null; previewSeconds = null; browseTrack = null; hud.style.display = 'none'; });
})();
