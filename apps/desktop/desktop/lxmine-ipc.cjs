'use strict';

const fs = require('node:fs');
const { ipcMain, dialog, shell } = require('electron');
const { createLxManager, defaultLxSourcesPath } = require('./lx/manager.cjs');
const { searchKuwo } = require('./lx/kw.cjs');
const { searchKugou } = require('./lx/kg.cjs');
const { searchNetease } = require('./lx/wy.cjs');
const { searchQQ } = require('./lx/tx.cjs');
const { importPlaylist, resolveImportedSong, songAssets } = require('./lx/playlist.cjs');
const { hasLyrics } = require('../shared/lx-song-assets.cjs');
const { toMineTrack, toLxRequest } = require('../shared/lxmine-track.cjs');
const { searchEntities, entityTracks, discovery } = require('./lx/catalogue.cjs');
const path = require('node:path');
const { app } = require('electron');
const { MusicDownloads } = require('./downloads.cjs');
const { decodePlaylistFile, MAX_PLAYLIST_BYTES } = require('../shared/lx-playlist-file.cjs');
const { importSourceFiles } = require('./lx/import-files.cjs');

function registerLxMineIpc({ userDataPath, trusted, library }) {
  const sourcesPath = defaultLxSourcesPath(userDataPath);
  const manager = createLxManager({ filePath: sourcesPath });
  const searches = { kw: searchKuwo, kg: searchKugou, wy: searchNetease, tx: searchQQ };
  const downloads = new MusicDownloads({ userDataPath, onChange: jobs => {
    for (const window of require('electron').BrowserWindow.getAllWindows()) window.webContents.send('lxmine-downloads-changed', jobs);
  } });
  handle('downloads', () => downloads.snapshot());
  handle('cancel-download', id => downloads.cancel(String(id)));
  handle('reveal-download', id => {
    const job = downloads.snapshot().find(item => item.id === id && item.state === 'complete');
    if (!job || !fs.existsSync(job.filePath)) throw new Error('下载文件已被移动或删除');
    shell.showItemInFolder(job.filePath);
  });
  handle('download', async (song, quality = '128k') => {
    const info = toLxRequest(await resolveImportedSong({ ...song, source: song.lxSource || song.source,
      singer: song.singer || song.artist }, await manager.supportedSources('musicUrl')), quality);
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
    const result = await dialog.showOpenDialog({ title: '批量导入 LX 音源', properties: ['openFile', 'multiSelections'], filters: [{ name: 'LX 音源脚本', extensions: ['js', 'txt'] }] });
    if (result.canceled || !result.filePaths.length) return null;
    return importSourceFiles(manager, result.filePaths);
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
    const portable = song.lxSource === 'qishui' || song.provider === 'qishui' ? { ...song, source: 'qishui', singer: song.singer || song.artist } : song;
    const info = toLxRequest(await resolveImportedSong(portable, portable.source === 'qishui' ? await manager.supportedSources('musicUrl') : undefined), quality);
    const url = await manager.getMusicUrl(info);
    if (!url) throw new Error('自定义源没有返回播放地址，请切换音源或音质');
    return { url, provider: song.provider, source: info.source, level: quality || 'standard', lxSource: true };
  });
  handle('song-assets', song => songAssets({ ...song, source: song.lxSource || song.source || toLxRequest(song).source, singer: song.singer || song.artist, coverUrl: song.coverUrl || song.cover }));
  handle('lyric', async (song, quality) => {
    const portable = { ...song, source: song.lxSource || song.source || toLxRequest(song).source, singer: song.singer || song.artist, coverUrl: song.coverUrl || song.cover };
    const [custom, publicData] = await Promise.allSettled([
      resolveImportedSong(portable).then(resolved => manager.getLyric(toLxRequest(resolved, quality))), songAssets(portable)
    ]);
    const provided = custom.status === 'fulfilled' ? custom.value : {};
    const data = typeof provided === 'string' ? { lyric: provided } : (provided || {});
    const fallback = publicData.status === 'fulfilled' ? publicData.value : {};
    if (!fallback.coverUrl) {
      try {
        const resolved = await resolveImportedSong(portable);
        if ((await manager.supportedSources('pic')).includes(resolved.source)) {
          const picture = await manager.getPic(toLxRequest(resolved, quality));
          const url = typeof picture === 'string' ? picture : picture?.url;
          if (/^https?:\/\//i.test(url || '')) fallback.coverUrl = url.replace(/^http:/i, 'https:');
        }
      } catch (_) {}
    }
    const customLyric = data.lxlyric || data.lyric || '';
    return { ...fallback, ...data, lyric: hasLyrics(customLyric) ? customLyric : fallback.lyric || customLyric,
      tlyric: data.tlyric || fallback.tlyric || '', romalrc: data.romalrc || data.rlyric || fallback.romalrc || '' };
  });
  handle('import-playlist', async (input, source) => {
    const portable = await importPlaylist(String(input || ''), source);
    const result = library.importLists(portable.map(list => ({ name: list.name, tracks: list.songs.map(song => toMineTrack(song, song.source)) })));
    return { ...result, warnings: portable.map(list => list.warning).filter(Boolean) };
  });
  handle('import-playlist-file', async () => {
    const selected = await dialog.showOpenDialog({ title: '导入歌单文件', properties: ['openFile'],
      filters: [{ name: 'LX 歌单备份', extensions: ['lxmc', 'json'] }, { name: '所有文件', extensions: ['*'] }] });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const filePath = selected.filePaths[0];
    if (fs.statSync(filePath).size > MAX_PLAYLIST_BYTES) throw new Error('歌单文件超过 32 MB');
    const text = await decodePlaylistFile(await fs.promises.readFile(filePath));
    const portable = await importPlaylist(text);
    const result = library.importLists(portable.map(list => ({ name: list.name, tracks: list.songs.map(song => toMineTrack(song, song.source)) })));
    return { ...result, warnings: portable.map(list => list.warning).filter(Boolean) };
  });
  return { ...manager, dispose() { downloads.dispose(); manager.dispose(); } };
}

module.exports = { registerLxMineIpc };
