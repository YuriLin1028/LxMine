'use strict';

const { contextBridge, ipcRenderer } = require('electron');

let sceneListener = null;
let clockListener = null;

contextBridge.exposeInMainWorld('lxmineWallpaperHost', {
  onScene(callback) {
    if (sceneListener) {
      ipcRenderer.removeListener('lxmine-wallpaper-scene', sceneListener);
      sceneListener = null;
    }
    if (typeof callback !== 'function') return () => {};
    sceneListener = (_event, payload) => {
      try { callback(payload); } catch (_) {}
    };
    ipcRenderer.on('lxmine-wallpaper-scene', sceneListener);
    return () => {
      if (sceneListener) {
        ipcRenderer.removeListener('lxmine-wallpaper-scene', sceneListener);
        sceneListener = null;
      }
    };
  },
  onClock(callback) {
    if (clockListener) {
      ipcRenderer.removeListener('lxmine-wallpaper-clock', clockListener);
      clockListener = null;
    }
    if (typeof callback !== 'function') return () => {};
    clockListener = (_event, clock) => {
      try { callback(clock); } catch (_) {}
    };
    ipcRenderer.on('lxmine-wallpaper-clock', clockListener);
    return () => {
      if (clockListener) {
        ipcRenderer.removeListener('lxmine-wallpaper-clock', clockListener);
        clockListener = null;
      }
    };
  },
});
