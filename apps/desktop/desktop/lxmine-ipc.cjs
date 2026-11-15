'use strict';

const fs = require('node:fs');
const { ipcMain, dialog } = require('electron');
const { createLxManager, defaultLxSourcesPath } = require('./lx/manager.cjs');
const { searchKuwo } = require('./lx/kw.cjs');
const { searchKugou } = require('./lx/kg.cjs');
const { searchNetease } = require('./lx/wy.cjs');
const { searchQQ } = require('./lx/tx.cjs');
const { importPlaylist } = require('./lx/playlist.cjs');
const { seedDefaultSourcesIfMissing } = require('./lx/seed.cjs');
const { toMineTrack, toLxRequest } = require('../shared/lxmine-track.cjs');
const { searchEntities, entityTracks, discovery } = require('./lx/catalogue.cjs');
const path = require('node:path');
const { app } = require('electron');
const { MusicDownloads } = require('./downloads.cjs');

function registerLxMineIpc({ userDataPath, trusted, library }) {
  const sourcesPath = defaultLxSourcesPath(userDataPath);
  // 种子必须先于下方的 音源/ 目录自动导入：否则自动导入会抢先写盘、种子被跳过，
  // 用户原来的启用音源（activeId）也会丢失。
  seedDefaultSourcesIfMissing(sourcesPath);
  const manager = createLxManager({ filePath: sourcesPath });
  // Mirror the tablet build's bundled sources; duplicates are rejected by the store.
  try {
    const roots = [path.join(__dirname, '..', '..', '..', '音源'), path.join(app.getAppPath(), '音源'), path.join(process.cwd(), '音源')];
    const bundled = roots.find(root => { try { return fs.existsSync(root) && fs.statSync(root).isDirectory(); } catch (_) { return false; } });
    if (bundled) {
      for (const file of fs.readdirSync(bundled)) {
        if (!/\.js$/i.test(file)) continue;
        try { manager.importScript(fs.readFileSync(path.join(bundled, file), 'utf8')); } catch (_) {}
      }
    }
  } catch (_) {}
  const searches = { kw: searchKuwo, kg: searchKugou, wy: searchNetease, tx: searchQQ };
  const downloads = new MusicDownloads({ userDataPath, onChange: jobs => {
    for (const window of require('electron').BrowserWindow.getAllWindows()) window.webContents.send('lxmine-downloads-changed', jobs);
  } });
  handle('downloads', () => downloads.snapshot());
  handle('cancel-download', id => downloads.cancel(String(id)));
  handle('download', async (song, quality = '128k') => {
    const info = toLxRequest(song, quality);
    const url = await manager.getMusicUrl(info);
    if (!url) throw new Error('音源未返回可下载地址');
    const extension = /flac/i.test(info.type) ? 'flac' : 'mp3';
    const name = `${song.artist || song.singer || ''} - ${song.name}`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 170);
    const save = await dialog.showSaveDialog({ title: '下载歌曲', defaultPath: path.join(app.getPath('downloads'), name + '.' + extension),
      filters: [{ name: '音频文件', extensions: [extension] }] });
    if (save.canceled || !save.filePath) return null;
    return downloads.start({ url, song, quality, filePath: save.filePath });
  });
  function handle(name, fn) {
    ipcMain.handle('lxmine-' + name, (event, ...args) => {
      if (!trusted(event)) throw new Error('不受信任的调用页面');
      return fn(...args);
    });
  }
  handle('sources', () => ({ sources: manager.list(), activeId: manager.getActiveId() }));
  handle('home', async source=>{const feed=await discovery.home(source);for(const s of feed.sections)if(s.kind==='song')s.items=s.items.map(song=>toMineTrack(song,source));feed.newSongs=feed.sections.find(s=>s.id==='newSongs').items;return feed;});
  handle('home-lite', async source=>{
    const feed=await discovery.homeLite(source);
    if(feed.newSongs.length)feed.newSongs=feed.newSongs.map(song=>toMineTrack(song,source));
    return feed;
  });
  handle('home-section', params=>discovery.section(params));
  handle('feed-tracks', async item=>{const r=await discovery.tracks(item);return {...r,items:r.items.map(song=>toMineTrack(song,song.source||item.source))};});
  handle('import-source', script => manager.importScript(String(script || '')));
  handle('import-source-file', async () => {
    const result = await dialog.showOpenDialog({ title: '导入 LX 自定义源', properties: ['openFile'], filters: [{ name: 'LX 音源脚本', extensions: ['js', 'txt'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    return manager.importScript(fs.readFileSync(result.filePaths[0], 'utf8'));
  });
  handle('activate-source', id => manager.setActive(String(id)));
  handle('remove-source', id => manager.remove(String(id)));
  handle('search', async ({ query, source = 'kw', page = 1, limit = 24, type = 'music' } = {}) => {
    if (!searches[source]) throw new Error('不支持的搜索平台');
    query = String(query || '').trim();
    page = Math.max(1, Math.floor(Number(page) || 1)); limit = Math.min(50, Math.max(1, Math.floor(Number(limit) || 24)));
    if (!query) return { items: [], total: 0, page, limit, source };
    if (type !== 'music') return searchEntities({ query, source, type, page, limit });
    const result = await searches[source]({ query, page, limit });
    return { ...result, source, items: result.items.map(track => toMineTrack(track, source)) };
  });
  handle('entity-tracks', async params => {
    const result=await entityTracks({...params,all:true});
    return {...result,items:result.items.map(track=>toMineTrack(track,track.source||params.source))};
  });
  handle('resolve', async (song, quality) => {
    const info = toLxRequest(song, quality);
    const url = await manager.getMusicUrl(info);
    if (!url) throw new Error('自定义源没有返回播放地址，请切换音源或音质');
    return { url, provider: song.provider, source: info.source, level: quality || 'standard', lxSource: true };
  });
  handle('lyric', async (song, quality) => manager.getLyric(toLxRequest(song, quality)));
  handle('import-playlist', async (input, source) => {
    const portable = await importPlaylist(String(input || ''), source);
    return library.importLists(portable.map(list => ({ name: list.name, tracks: list.songs.map(song => toMineTrack(song, song.source)) })));
  });
  return { ...manager, dispose() { downloads.dispose(); manager.dispose(); } };
}

module.exports = { registerLxMineIpc };
