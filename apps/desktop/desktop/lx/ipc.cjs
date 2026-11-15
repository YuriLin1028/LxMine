'use strict';

// LX 音源的 IPC 入口：渲染进程只通过这里访问主进程的源存储与自定义源运行时。
// 通道名前缀统一为 lx-，与 LX 桌面版的自定义源概念对应。

const { ipcMain, app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createLxManager, defaultLxSourcesPath } = require('./manager.cjs');
const { seedDefaultSourcesIfMissing } = require('./seed.cjs');
const { searchKuwo } = require('./kw.cjs');
const { searchKugou } = require('./kg.cjs');
const { searchNetease } = require('./wy.cjs');
const { searchQQ } = require('./tx.cjs');
const { importPlaylist } = require('./playlist.cjs');

let manager = null;

function getManager() {
  if (!manager) {
    const filePath = defaultLxSourcesPath(app.getPath('userData'));
    seedDefaultSourcesIfMissing(filePath);
    manager = createLxManager({ filePath });
  }
  return manager;
}

function registerLxIpc() {
  ipcMain.handle('lx-playlist-import', (_event, input, source) => importPlaylist(String(input ?? ''), source));
  ipcMain.handle('lx-search', async (_event, payload = {}) => {
    const query = String(payload.query ?? '').trim();
    const page = Math.max(1, Number(payload.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(payload.limit) || 30));
    const source = ['kw', 'kg', 'wy', 'tx'].includes(payload.source) ? payload.source : 'kw';
    if (!query) return { items: [], total: 0, page, limit, source };
    switch (source) {
      case 'kg':
        return searchKugou({ query, page, limit });
      case 'wy':
        return searchNetease({ query, page, limit });
      case 'tx':
        return searchQQ({ query, page, limit });
      default:
        return searchKuwo({ query, page, limit });
    }
  });

  ipcMain.handle('lx-sources-list', () => getManager().list());
  // 从本机选择 LX 自定义源脚本文件导入。
  ipcMain.handle('lx-sources-import-file', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 LX 自定义源脚本',
      properties: ['openFile'],
      filters: [
        { name: 'LX 自定义源', extensions: ['js', 'txt'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    const filePath = result.filePaths?.[0];
    if (result.canceled || !filePath) return null;
    const script = fs.readFileSync(filePath, 'utf8');
    return getManager().importScript(script);
  });
  // 按路径导入（命令行 / 自动化测试用，不弹文件选择框）。
  ipcMain.handle('lx-sources-import-path', (_event, filePath) => {
    const script = fs.readFileSync(String(filePath), 'utf8');
    return getManager().importScript(script);
  });
  ipcMain.handle('lx-sources-import', (_event, script) => getManager().importScript(String(script ?? '')));
  ipcMain.handle('lx-sources-remove', (_event, ids) => getManager().remove(ids));
  ipcMain.handle('lx-sources-set-active', (_event, id) => getManager().setActive(String(id)));
  ipcMain.handle('lx-source-status', () => ({
    activeId: getManager().getActiveId(),
    active: getManager().getActiveSource(),
  }));
  ipcMain.handle('lx-music-url', async (_event, info) => getManager().getMusicUrl(info ?? {}));
  ipcMain.handle('lx-lyric', async (_event, info) => getManager().getLyric(info ?? {}));
  ipcMain.handle('lx-pic', async (_event, info) => getManager().getPic(info ?? {}));
}

function disposeLxManager() {
  if (manager) {
    manager.dispose();
    manager = null;
  }
}

module.exports = {
  registerLxIpc,
  disposeLxManager,
  reloadLxManager: () => manager?.reload(),
};
