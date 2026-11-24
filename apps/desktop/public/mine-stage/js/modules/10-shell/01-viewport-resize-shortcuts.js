// ============================================================
var _viewportSettleTimer = 0;
var _lastLyricWrapBucket = 0;
window.__lxmineViewportDirty = false;
function flushPendingMainRendererViewport() {
  if (!window.__lxmineViewportDirty) return false;
  if (typeof isDeepBackgroundMode === 'function' && isDeepBackgroundMode()) return false;
  window.__lxmineViewportDirty = false;
  if (typeof camera !== 'undefined' && camera) {
    camera.aspect = Math.max(1, innerWidth) / Math.max(1, innerHeight);
    camera.updateProjectionMatrix();
  }
  applyRendererPowerMode();
  if (typeof requestStageLyricCameraSnap === 'function') {
    requestStageLyricCameraSnap(6);
  }
  if (typeof renderRefreshState !== 'undefined' && renderRefreshState) {
    renderRefreshState.converged = false;
    renderRefreshState.tickCount = 0;
  }
  return true;
}
window.flushPendingMainRendererViewport = flushPendingMainRendererViewport;
function refreshMainRendererViewport(reason, deferBufferResize) {
  if (typeof isDeepBackgroundMode === 'function' && isDeepBackgroundMode()) {
    window.__lxmineViewportDirty = true;
    return;
  }
  if (reason === 'resize-settled') {
    if (window.__lxmineViewportDirty) flushPendingMainRendererViewport();
  } else {
    window.__lxmineViewportDirty = true;
    if (!deferBufferResize && typeof wakeMainLoopFromBackground === 'function') {
      wakeMainLoopFromBackground();
    }
  }
  if ((reason === 'resize-settled' || reason === 'sync') && typeof lyricWrapWidthBucket === 'function') {
    var nextWrapBucket = lyricWrapWidthBucket();
    if (_lastLyricWrapBucket && nextWrapBucket !== _lastLyricWrapBucket && typeof refreshCurrentLyricStyle === 'function' && typeof stageLyrics !== 'undefined' && stageLyrics && stageLyrics.current) {
      _lastLyricWrapBucket = nextWrapBucket;
      refreshCurrentLyricStyle();
    } else {
      _lastLyricWrapBucket = nextWrapBucket;
    }
  }
}
function scheduleMainRendererViewportRefresh(reason) {
  window.__lxmineViewportDirty = true;
  if (typeof isDeepBackgroundMode === 'function' && isDeepBackgroundMode()) return;
  if (typeof markRenderInteraction === 'function') markRenderInteraction('viewport-resize', 280);
  if (typeof wakeMainLoopFromBackground === 'function') wakeMainLoopFromBackground();
  if (reason === 'resize') {
    if (_viewportSettleTimer) clearTimeout(_viewportSettleTimer);
    _viewportSettleTimer = setTimeout(function () {
      _viewportSettleTimer = 0;
      refreshMainRendererViewport('resize-settled', false);
    }, 90);
    return;
  }
  if (_viewportSettleTimer) {
    clearTimeout(_viewportSettleTimer);
    _viewportSettleTimer = 0;
  }
  refreshMainRendererViewport(reason || 'sync', false);
  _viewportSettleTimer = setTimeout(function () {
    _viewportSettleTimer = 0;
    refreshMainRendererViewport(reason || 'sync', false);
  }, 120);
}
window.addEventListener('resize', function () {
  scheduleMainRendererViewportRefresh('resize');
  if (desktopRuntimeState.fullscreen || desktopFullscreenActive || document.fullscreenElement || document.body.classList.contains('desktop-fullscreen')) layoutFullscreenDiyZone();
}, { passive: true });
document.addEventListener('keydown', function (e) {
  if (isTypingTarget(e.target)) return;
  if (handleConfiguredLocalHotkey(e)) return;
  if (shouldSuppressDefaultConfiguredHotkey(e)) return;
  if (e.code === 'Space') {
    e.preventDefault();
    e.stopPropagation();
    if (freeCamera && freeCamera.active) return;
    if (e.repeat) return;
    togglePlay();
  }
  else if (e.code === 'Home') { e.preventDefault(); goHome(); }
  else if (e.code === 'ArrowUp') { e.preventDefault(); adjustVolumeByKeyboard(0.05); }
  else if (e.code === 'ArrowDown') { e.preventDefault(); adjustVolumeByKeyboard(-0.05); }
  else if (e.code === 'ArrowRight') nextTrack(true);
  else if (e.code === 'ArrowLeft') prevTrack(true);
  else if (e.code === 'Escape') {
    if (immersiveMode) {
      e.preventDefault();
      setImmersiveMode(false);
      return;
    }
    if (window.desktopWindow && window.desktopWindow.isDesktop && desktopFullscreenActive && !document.fullscreenElement && window.desktopWindow.exitFullscreenWindowed) {
      e.preventDefault();
      window.desktopWindow.exitFullscreenWindowed();
      return;
    }
    if (document.fullscreenElement) {
      e.preventDefault();
      document.exitFullscreen();
      return;
    }
    var localBeatModal = document.getElementById('local-beat-modal');
    if (localBeatModal && localBeatModal.classList.contains('show')) {
      e.preventDefault();
      if (localBeatAnalysis.active) cancelLocalBeatAnalysis();
      else closeLocalBeatModal();
      return;
    }
    var customLyricModal = document.getElementById('custom-lyric-modal');
    if (customLyricModal && customLyricModal.classList.contains('show')) {
      e.preventDefault();
      closeCustomLyricModal();
      return;
    }
    var trackDetailModal = document.getElementById('track-detail-modal');
    if (trackDetailModal && trackDetailModal.classList.contains('show')) {
      e.preventDefault();
      closeTrackDetailModal();
      return;
    }
    if (miniQueueOpen) { closeMiniQueue(); return; }
    if (shelfManager && shelfManager.hasOpenContent()) { safeShelfCloseContent('escape-key'); return; }
    closeLoginModal(); closeUserModal(); toggleFxPanel(false); togglePlaylistPanel(false);
  }
  else if (e.code === 'KeyL') { if (!immersiveMode) toggleLyricsPanel(); }
  else if (e.code === 'KeyP') {
    if (!immersiveMode && diyPlayerMode) toggleFxPanel();
    else if (!immersiveMode) showToast('开启 DIY 玩家模式后可打开视觉控制台');
  }
  else if (e.code === 'KeyI') toggleImmersiveMode();
  else if (e.code === 'KeyF') toggleFullscreen();
});

// ============================================================
//  UI 半隐藏 v8 — 三个面板的触发/隐藏体验完全统一
//   - 搜索栏 (顶部): y < 80 进入, y > 96 离开
//   - 控制台 (右侧): x > w-48 进入, x < w-380 离开
//   - 歌单 (左侧): x < 48 进入, x > 380 离开
//   - 进入立即显示, 离开延迟 500ms (统一)
