'use strict';

const fs = require('node:fs');
const { ipcMain, dialog, shell } = require('electron');
const { createLxManager, defaultLxSourcesPath } = require('./lx/manager.cjs');
const { searchKuwo } = require('./lx/kw.cjs');
const { searchKugou } = require('./lx/kg.cjs');
const { searchNetease } = require('./lx/wy.cjs');
const { searchQQ } = require('./lx/tx.cjs');
const { importPlaylist, resolveImportedSong, songAssets, songCovers, platformCandidates } = require('./lx/playlist.cjs');
const { hasLyrics } = require('../shared/lx-song-assets.cjs');
const { sourceOf, toMineTrack, toLxRequest } = require('../shared/lxmine-track.cjs');
const { searchEntities, entityTracks, discovery } = require('./lx/catalogue.cjs');
const path = require('node:path');
const { app } = require('electron');
const { MusicDownloads } = require('./downloads.cjs');
const { decodePlaylistFile, MAX_PLAYLIST_BYTES } = require('../shared/lx-playlist-file.cjs');
const { importSourceFiles } = require('./lx/import-files.cjs');
const updater = require('./updater.cjs');

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
  handle('download-batch', async (songs, quality = '128k') => {
    const list = (Array.isArray(songs) ? songs : []).filter(item => item && item.provider !== 'local' && item.source !== 'local');
    if (!list.length) return { canceled: false, started: 0, skipped: 0, failed: 0 };
    const picked = await dialog.showOpenDialog({
      title: `选择批量下载保存目录（共 ${list.length} 首）`,
      defaultPath: app.getPath('downloads'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (picked.canceled || !picked.filePaths?.[0]) return { canceled: true, started: 0, skipped: 0, failed: 0 };
    const folder = picked.filePaths[0];
    const supported = await manager.supportedSources('musicUrl');
    let started = 0, skipped = 0, failed = 0;
    const usedNames = new Set();
    for (const song of list) {
      try {
        const info = toLxRequest(await resolveImportedSong({ ...song, source: song.lxSource || song.source,
          singer: song.singer || song.artist }, supported), quality);
        const url = await manager.getMusicUrl(info);
        if (!url) { failed += 1; continue; }
        const extension = /flac/i.test(info.type) ? 'flac' : 'mp3';
        const baseName = `${song.artist || song.singer || ''} - ${song.name}`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\s*-\s*/, '').slice(0, 160) || 'song';
        let fileName = `${baseName}.${extension}`;
        let suffix = 1;
        while (usedNames.has(fileName.toLowerCase()) || fs.existsSync(path.join(folder, fileName))) {
          if (fs.existsSync(path.join(folder, `${baseName}.${extension}`)) && suffix === 1) {
            skipped += 1;
            fileName = '';
            break;
          }
          fileName = `${baseName} (${++suffix}).${extension}`;
        }
        if (!fileName) continue;
        usedNames.add(fileName.toLowerCase());
        downloads.start({ url, song, quality, filePath: path.join(folder, fileName) });
        started += 1;
      } catch (_) {
        failed += 1;
      }
    }
    return { canceled: false, started, skipped, failed, folder };
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
  handle('resolve', async (song, quality, options) => {
    const opts = options && typeof options === 'object' ? options : {};
    const portable = song.lxSource === 'qishui' || song.provider === 'qishui'
      ? { ...song, source: 'qishui', singer: song.singer || song.artist }
      : song;
    const expectedDurationMs = Number(song.durationMs || song.duration || 0) || 0;
    const baseTrack = await resolveImportedSong(portable, portable.source === 'qishui' ? await manager.supportedSources('musicUrl') : undefined);
    const info = toLxRequest(baseTrack, quality);
    if (!opts.preferCrossPlatform) {
      try {
        const hit = await manager.raceMusicUrl(info, {
          expectedDurationMs,
          excludeSourceIds: opts.excludeSourceIds,
          raceAll: opts.raceAll === true,
        });
        if (hit && hit.url) {
          return {
            url: hit.url,
            provider: song.provider,
            source: info.source,
            level: hit.type || quality || 'standard',
            lxSource: true,
            sourceId: hit.sourceId,
            sourceName: hit.sourceName,
            switched: !!hit.switched,
          };
        }
      } catch (_) {}
    }
    // 跨平台同曲目无感兜底：当原平台全部源失败或仅返回 30s VIP 试听时，自动跨平台并行竞速完整音源。
    const origSource = info.source || '';
    const altPlatforms = ['wy', 'tx', 'kg', 'kw'].filter(p => p !== origSource);
    try {
      const cands = await platformCandidates({
        name: song.name || '',
        singer: song.singer || song.artist || '',
        source: origSource,
        id: song.id || '',
        durationMs: expectedDurationMs,
      }, altPlatforms);
      for (const cand of (cands || []).slice(0, 3)) {
        try {
          const candInfo = toLxRequest(cand, quality);
          const candDur = Number(cand.durationMs || expectedDurationMs) || expectedDurationMs;
          const hit = await manager.raceMusicUrl(candInfo, { expectedDurationMs: candDur, raceAll: true });
          if (hit && hit.url) {
            return {
              url: hit.url,
              provider: song.provider,
              source: candInfo.source,
              level: hit.type || quality || 'standard',
              lxSource: true,
              sourceId: hit.sourceId,
              sourceName: hit.sourceName,
              switched: true,
              switchedPlatform: candInfo.source,
            };
          }
        } catch (_) {}
      }
    } catch (_) {}
    throw new Error('暂未找到可用完整音源，请检查网络或导入更多音源');
  });
  handle('song-assets', song => {
    const safeSong = song && typeof song === 'object' ? song : {};
    const src = sourceOf(safeSong) || String(safeSong.lxSource || safeSong.source || '').trim();
    return songAssets({
      ...safeSong,
      source: src,
      singer: safeSong.singer || safeSong.artist || '',
      coverUrl: safeSong.coverUrl || safeSong.cover || '',
    });
  });
  handle('song-covers', songs => songCovers(Array.isArray(songs) ? songs : []));
  handle('platform-candidates', async (song, sources) => {
    const list = await platformCandidates(song || {}, sources);
    return list.map(cand => {
      try {
        return toMineTrack(cand, cand.source);
      } catch (_) {
        return null;
      }
    }).filter(Boolean);
  });
  handle('replace-playlist-track', async ({ playlistId, index, track } = {}) => {
    if (!library || typeof library.replaceTrackAt !== 'function') {
      return { ok: false, error: 'BUILT_IN_PLAYLIST_LIBRARY_UNAVAILABLE' };
    }
    try {
      return await library.replaceTrackAt(playlistId, index, track);
    } catch (error) {
      return { ok: false, error: error && (error.code || error.message) || 'BUILT_IN_PLAYLIST_MUTATION_FAILED' };
    }
  });
  handle('lyric', async (song, quality) => {
    const safeSong = song && typeof song === 'object' ? song : {};
    const src = sourceOf(safeSong) || String(safeSong.lxSource || safeSong.source || '').trim();
    const portable = {
      ...safeSong,
      source: src,
      singer: safeSong.singer || safeSong.artist || '',
      coverUrl: safeSong.coverUrl || safeSong.cover || '',
    };
    const canCustom = Boolean(sourceOf(portable));
    const [custom, publicData] = await Promise.allSettled([
      canCustom
        ? resolveImportedSong(portable).then(resolved => manager.getLyric(toLxRequest(resolved, quality)))
        : Promise.resolve({}),
      songAssets(portable),
    ]);
    const provided = custom.status === 'fulfilled' ? custom.value : {};
    const data = typeof provided === 'string' ? { lyric: provided } : (provided || {});
    const fallback = publicData.status === 'fulfilled' ? (publicData.value || {}) : {};
    if (!fallback.coverUrl && canCustom) {
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
    return {
      ...fallback,
      ...data,
      coverUrl: data.coverUrl || fallback.coverUrl || portable.coverUrl || '',
      lyric: hasLyrics(customLyric) ? customLyric : (fallback.lyric || customLyric || ''),
      tlyric: data.tlyric || fallback.tlyric || '',
      romalrc: data.romalrc || data.rlyric || fallback.romalrc || '',
      instrumental: Boolean(fallback.instrumental),
    };
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
  handle('check-update', async () => {
    const version = typeof app?.getVersion === 'function' ? app.getVersion() : '1.1.0';
    return updater.checkForUpdate(version);
  });
  handle('start-update', async (asset) => {
    const sendProgress = (payload) => {
      for (const win of require('electron').BrowserWindow.getAllWindows()) {
        try { win.webContents.send('lxmine-update-progress', payload); } catch (_) {}
      }
    };
    return updater.downloadAndLaunchInstaller(asset, sendProgress, app);
  });
  handle('cancel-update', () => updater.cancelActiveDownload());
  return { ...manager, dispose() { updater.cancelActiveDownload(); downloads.dispose(); manager.dispose(); } };
}

module.exports = { registerLxMineIpc };
