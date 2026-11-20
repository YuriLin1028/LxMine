const { contextBridge, ipcRenderer, clipboard, webUtils } = require('electron');

contextBridge.exposeInMainWorld('lxMusic', {
  home: source=>ipcRenderer.invoke('lxmine-home',source),
  homeLite: source=>ipcRenderer.invoke('lxmine-home-lite',source),
  homeSection: params=>ipcRenderer.invoke('lxmine-home-section',params),
  feedTracks: item=>ipcRenderer.invoke('lxmine-feed-tracks',item),
  syncStatus: () => ipcRenderer.invoke('lansync-status'),
  syncDevices: () => ipcRenderer.invoke('lansync-devices'),
  syncPending: () => ipcRenderer.invoke('lansync-pending'),
  syncSend: id => ipcRenderer.invoke('lansync-send', id),
  syncSendDirect: target => ipcRenderer.invoke('lansync-send-direct', String(target || '')),
  syncSetAuto: enabled => ipcRenderer.invoke('lansync-auto-sync', Boolean(enabled)),
  syncTriggerAuto: () => ipcRenderer.invoke('lansync-trigger-auto'),
  syncRespond: (id, accepted) => ipcRenderer.invoke('lansync-respond', id, accepted),
  onSyncEvent: (name, callback) => { if (!['devices-changed','incoming','applied'].includes(name)) throw Error('Invalid sync event'); const channel='lansync-'+name; const listener=(_event,data)=>callback(data); ipcRenderer.on(channel,listener); return ()=>ipcRenderer.removeListener(channel,listener); },
  downloads: () => ipcRenderer.invoke('lxmine-downloads'),
  download: (song, quality) => ipcRenderer.invoke('lxmine-download', song, quality),
  downloadBatch: (songs, quality) => ipcRenderer.invoke('lxmine-download-batch', songs, quality),
  cancelDownload: id => ipcRenderer.invoke('lxmine-cancel-download', id),
  removeDownload: id => ipcRenderer.invoke('lxmine-remove-download', id),
  revealDownload: id => ipcRenderer.invoke('lxmine-reveal-download', id),
  onDownloadsChanged: callback => { const listener = (event, jobs) => callback(jobs); ipcRenderer.on('lxmine-downloads-changed', listener); return () => ipcRenderer.removeListener('lxmine-downloads-changed', listener); },
  sources: () => ipcRenderer.invoke('lxmine-sources'),
  importSource: script => ipcRenderer.invoke('lxmine-import-source', script),
  importSourceFile: () => ipcRenderer.invoke('lxmine-import-source-file'),
  activateSource: id => ipcRenderer.invoke('lxmine-activate-source', id),
  removeSource: id => ipcRenderer.invoke('lxmine-remove-source', id),
  search: payload => ipcRenderer.invoke('lxmine-search', payload),
  entityTracks: payload => ipcRenderer.invoke('lxmine-entity-tracks', payload),
  resolve: (song, quality, options) => ipcRenderer.invoke('lxmine-resolve', song, quality, options),
  lyric: (song, quality) => ipcRenderer.invoke('lxmine-lyric', song, quality),
  songAssets: song => ipcRenderer.invoke('lxmine-song-assets', song),
  songCovers: songs => ipcRenderer.invoke('lxmine-song-covers', Array.isArray(songs) ? songs : []),
  platformCandidates: (song, sources) => ipcRenderer.invoke('lxmine-platform-candidates', song, sources),
  replacePlaylistTrack: payload => ipcRenderer.invoke('lxmine-replace-playlist-track', payload || {}),
  importPlaylist: (input, source) => ipcRenderer.invoke('lxmine-import-playlist', input, source),
  importPlaylistFile: () => ipcRenderer.invoke('lxmine-import-playlist-file'),
  checkUpdate: () => ipcRenderer.invoke('lxmine-check-update'),
  startUpdate: asset => ipcRenderer.invoke('lxmine-start-update', asset),
  cancelUpdate: () => ipcRenderer.invoke('lxmine-cancel-update'),
  onUpdateProgress: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('lxmine-update-progress', listener);
    return () => ipcRenderer.removeListener('lxmine-update-progress', listener);
  },
});

contextBridge.exposeInMainWorld('desktopWindow', {
  isDesktop: true,
  minimize: () => ipcRenderer.invoke('desktop-window-minimize'),
  restore: () => ipcRenderer.invoke('desktop-window-restore'),
  toggleMaximize: () => ipcRenderer.invoke('desktop-window-toggle-maximize'),
  toggleFullscreen: () => ipcRenderer.invoke('desktop-window-toggle-fullscreen'),
  exitFullscreenWindowed: () => ipcRenderer.invoke('desktop-window-exit-fullscreen-windowed'),
  getState: () => ipcRenderer.invoke('desktop-window-get-state'),
  getGpuDiagnostics: () => ipcRenderer.invoke('mineradio-get-gpu-diagnostics'),
  getMemorySnapshot: () => ipcRenderer.invoke('mineradio-memory-get-snapshot'),
  configureMemoryReduct: (payload) => ipcRenderer.invoke('mineradio-memory-configure-auto', payload || {}),
  trimAppMemory: (payload) => ipcRenderer.invoke('mineradio-memory-trim-app', payload || {}),
  purgeSystemMemory: (payload) => ipcRenderer.invoke('mineradio-memory-purge-system', payload || {}),
  getCacheSettings: () => ipcRenderer.invoke('mineradio-cache-get-settings'),
  chooseCacheDirectory: () => ipcRenderer.invoke('mineradio-cache-choose-directory'),
  setCacheSettings: (payload) => ipcRenderer.invoke('mineradio-cache-set-settings', payload || {}),
  listWallpaperEngineProjects: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-list', payload || {}),
  getWallpaperEngineProjectDetails: (id) => ipcRenderer.invoke('mineradio-wallpaper-engine-project-details', String(id || '')),
  openWallpaperEngineProjectDetails: (id, target) => ipcRenderer.invoke('mineradio-wallpaper-engine-open-project-details', {
    id: String(id || ''),
    target: target === 'workshop' ? 'workshop' : 'we',
  }),
  chooseWallpaperEngineDirectory: () => ipcRenderer.invoke('mineradio-wallpaper-engine-choose-directory'),
  chooseWallpaperEngineProjectFile: () => ipcRenderer.invoke('mineradio-wallpaper-engine-choose-project-file'),
  removeWallpaperEngineDirectory: (rootId) => ipcRenderer.invoke('mineradio-wallpaper-engine-remove-directory', String(rootId || '')),
  getWallpaperEngineRuntimeStatus: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-runtime-status', payload || {}),
  startWallpaperEngineScene: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-start-scene', payload || {}),
  reportWallpaperEngineCaptureResult: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-capture-result', payload || {}),
  prepareWallpaperEngineGlassCapture: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-prepare-glass-capture', payload || {}),
  activateWallpaperEngineDwmSurface: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-activate-dwm-surface', payload || {}),
  updateWallpaperEngineGlassSurface: (payload) => ipcRenderer.send('mineradio-wallpaper-engine-glass-surface', payload || {}),
  updateWallpaperEngineVisualSettings: (payload) => ipcRenderer.send('mineradio-wallpaper-engine-visual-settings', payload || {}),
  reportWallpaperEnginePointerActivity: (payload) => ipcRenderer.send('mineradio-wallpaper-engine-pointer-activity', payload || {}),
  stopWallpaperEngineScene: (payload) => ipcRenderer.invoke('mineradio-wallpaper-engine-stop-scene', payload || {}),
  onWallpaperEngineHostBoundsChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-wallpaper-engine-host-bounds-changed', listener);
    return () => ipcRenderer.removeListener('mineradio-wallpaper-engine-host-bounds-changed', listener);
  },
  listLocalMusicLibrary: () => ipcRenderer.invoke('mineradio-local-library-list'),
  scanLocalMusic: () => ipcRenderer.invoke('mineradio-local-library-scan'),
  importLocalMusicPaths: async (paths) => {
    const entries = Array.from(paths || []).map((value) => {
      const filePath = String(value || '');
      return { path: filePath, relativePath: filePath.split(/[\\/]/).pop() || '' };
    });
    if (!entries.length) return { ok: false, count: 0, tracks: [], error: 'NO_AUTHORIZED_LOCAL_AUDIO' };
    const authorization = await ipcRenderer.invoke('mineradio-local-library-authorize', { files: entries });
    if (!authorization || authorization.ok !== true || !authorization.token) return authorization;
    return ipcRenderer.invoke('mineradio-local-library-import', { token: authorization.token });
  },
  readLocalMusicLyric: (localFileId) => ipcRenderer.invoke('mineradio-local-library-lyric', String(localFileId || '')),
  listBuiltInPlaylists: () => ipcRenderer.invoke('mineradio-built-in-playlists-list'),
  readBuiltInPlaylist: (id, options) => ipcRenderer.invoke('mineradio-built-in-playlist-page', String(id || ''), options || {}),
  createBuiltInPlaylist: (name) => ipcRenderer.invoke('mineradio-built-in-playlist-create', String(name || '')),
  renameBuiltInPlaylist: (id, name) => ipcRenderer.invoke('mineradio-built-in-playlist-rename', String(id || ''), String(name || '')),
  deleteBuiltInPlaylist: (id) => ipcRenderer.invoke('mineradio-built-in-playlist-delete', String(id || '')),
  addBuiltInPlaylistTrack: (id, track) => ipcRenderer.invoke('mineradio-built-in-playlist-add-track', String(id || ''), track || {}),
  removeBuiltInPlaylistTrack: (id, index) => ipcRenderer.invoke('mineradio-built-in-playlist-remove-track', String(id || ''), Number(index)),
  removeBuiltInPlaylistTracks: (id, indices) => ipcRenderer.invoke('mineradio-built-in-playlist-remove-tracks', String(id || ''), Array.isArray(indices) ? indices : []),
  replaceBuiltInPlaylistTracks: (id, tracks) => ipcRenderer.invoke('mineradio-built-in-playlist-replace-tracks', String(id || ''), Array.isArray(tracks) ? tracks : []),
  syncFavoriteTracks: (tracks) => ipcRenderer.invoke('mineradio-built-in-playlist-sync-favorites', Array.isArray(tracks) ? tracks : []),
  reorderBuiltInPlaylistTrack: (id, fromIndex, toIndex) => ipcRenderer.invoke('mineradio-built-in-playlist-reorder-track', String(id || ''), Number(fromIndex), Number(toIndex)),
  importLocalMusicFiles: async (files) => {
    const entries = [];
    for (const file of Array.from(files || [])) {
      let filePath = '';
      try {
        filePath = webUtils && typeof webUtils.getPathForFile === 'function' ? webUtils.getPathForFile(file) : '';
      } catch (_) {}
      if (!filePath) continue;
      entries.push({
        path: filePath,
        relativePath: String(file && (file.webkitRelativePath || file.name) || ''),
      });
    }
    if (!entries.length) return { ok: false, count: 0, tracks: [], error: 'NO_AUTHORIZED_LOCAL_AUDIO' };
    const authorization = await ipcRenderer.invoke('mineradio-local-library-authorize', { files: entries });
    if (!authorization || authorization.ok !== true || !authorization.token) return authorization;
    return ipcRenderer.invoke('mineradio-local-library-import', { token: authorization.token });
  },
  readLyricCache: (key) => ipcRenderer.invoke('mineradio-cache-read-lyric', key || ''),
  writeLyricCache: (key, payload) => ipcRenderer.invoke('mineradio-cache-write-lyric', key || '', payload || {}),
  close: (behavior) => ipcRenderer.invoke('desktop-window-close', behavior),
  getCloseBehavior: () => ipcRenderer.invoke('desktop-window-get-close-behavior'),
  setCloseBehavior: (behavior) => ipcRenderer.invoke('desktop-window-set-close-behavior', behavior),
  getLaunchAtStartup: () => ipcRenderer.invoke('desktop-window-get-launch-at-startup'),
  setLaunchAtStartup: (enabled) => ipcRenderer.invoke('desktop-window-set-launch-at-startup', enabled === true),
  openUpdatePage: (url) => ipcRenderer.invoke('mineradio-open-update-page', String(url || '')),
  restartApp: () => ipcRenderer.invoke('mineradio-restart-app'),
  configureGlobalHotkeys: (bindings) => ipcRenderer.invoke('mineradio-hotkeys-configure-global', bindings || []),
  copyText: (text) => {
    clipboard.writeText(String(text || ''));
    return { ok: true };
  },
  readText: () => ({ ok: true, text: clipboard.readText() || '' }),
  exportJsonFile: (payload) => ipcRenderer.invoke('mineradio-export-json-file', payload || {}),
  importJsonFile: () => ipcRenderer.invoke('mineradio-import-json-file'),
  readCurrentFxAutosaveSync: () => ipcRenderer.sendSync('mineradio-current-fx-autosave-read-sync'),
  saveCurrentFxAutosaveSync: (payload) => ipcRenderer.sendSync('mineradio-current-fx-autosave-save-sync', payload || {}),
  saveCurrentFxAutosave: (payload) => ipcRenderer.invoke('mineradio-current-fx-autosave-save', payload || {}),
  onGlobalHotkey: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-global-hotkey', listener);
    return () => ipcRenderer.removeListener('mineradio-global-hotkey', listener);
  },
  setDesktopLyricsEnabled: (enabled, payload) => ipcRenderer.invoke('mineradio-desktop-lyrics-set-enabled', !!enabled, payload || {}),
  updateDesktopLyrics: (payload) => ipcRenderer.invoke('mineradio-desktop-lyrics-update', payload || {}),
  setDesktopLyricsLocked: (locked) => ipcRenderer.invoke('mineradio-desktop-lyrics-set-lock-state',!!locked),
  onDesktopLyricsAction: (callback) => {const listener=(_event,action)=>callback(action);ipcRenderer.on('mineradio-desktop-lyrics-action',listener);return ()=>ipcRenderer.removeListener('mineradio-desktop-lyrics-action',listener);},
  onDesktopLyricsLockState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-desktop-lyrics-lock-state', listener);
    return () => ipcRenderer.removeListener('mineradio-desktop-lyrics-lock-state', listener);
  },
  onDesktopLyricsEnabledState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-desktop-lyrics-enabled-state', listener);
    return () => ipcRenderer.removeListener('mineradio-desktop-lyrics-enabled-state', listener);
  },
  setWallpaperMode: (enabled, payload) => ipcRenderer.invoke('mineradio-wallpaper-set-enabled', !!enabled, payload || {}),
  updateWallpaperMode: (payload) => ipcRenderer.invoke('mineradio-wallpaper-update', payload || {}),
  getWallpaperModeStatus: () => ipcRenderer.invoke('mineradio-wallpaper-get-status'),
  requestGestureCameraPermission: () => ipcRenderer.invoke('mineradio-gesture-camera-request-permission'),
  updateDesktopIconShields: (payload) => ipcRenderer.send('mineradio-full-desktop-icon-shields', payload || {}),
  setDesktopSoftwareLocked: (locked) => ipcRenderer.invoke('mineradio-full-desktop-set-software-lock', locked === true),
  setDesktopIconsVisible: (visible) => ipcRenderer.invoke('mineradio-full-desktop-set-icons-visible', visible !== false),
  requestDesktopKeyboardFocus: (reason) => ipcRenderer.invoke(
    'mineradio-full-desktop-request-keyboard-focus',
    String(reason || 'renderer-pointerdown').slice(0, 80)
  ),
  updateDesktopPointerRoute: (payload) => ipcRenderer.send('mineradio-full-desktop-pointer-route', {
    overSoftwareUi: payload && payload.overSoftwareUi === true,
    overDesktopControls: payload && payload.overDesktopControls === true,
  }),
  onWallpaperModeState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-wallpaper-runtime-state', listener);
    return () => ipcRenderer.removeListener('mineradio-wallpaper-runtime-state', listener);
  },
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop-window-state', listener);
    return () => ipcRenderer.removeListener('desktop-window-state', listener);
  },
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('desktop-shell-root');
  document.body.classList.add('desktop-shell');
});
