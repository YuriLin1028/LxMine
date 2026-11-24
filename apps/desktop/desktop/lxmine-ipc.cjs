'use strict';

const fs = require('node:fs');
const { ipcMain, dialog, shell } = require('electron');
const { createLxManager, defaultLxSourcesPath } = require('./lx/manager.cjs');
const { searchKuwo } = require('./lx/kw.cjs');
const { searchKugou } = require('./lx/kg.cjs');
const { searchNetease } = require('./lx/wy.cjs');
const { searchQQ } = require('./lx/tx.cjs');
const { importPlaylist, resolveImportedSong, songAssets, songCovers, platformCandidates } = require('./lx/playlist.cjs');
const { hasLyrics, isLyricConsistentWithSong, lyricsContentMatches } = require('../shared/lx-song-assets.cjs');
const { sourceOf, toMineTrack, toLxRequest } = require('../shared/lxmine-track.cjs');
const { searchEntities, entityTracks, discovery } = require('./lx/catalogue.cjs');
const path = require('node:path');
const { app } = require('electron');
const { MusicDownloads } = require('./downloads.cjs');
const { decodePlaylistFile, MAX_PLAYLIST_BYTES } = require('../shared/lx-playlist-file.cjs');
const { importSourceFiles } = require('./lx/import-files.cjs');
const updater = require('./updater.cjs');

function registerLxMineIpc({ userDataPath, trusted, library, localMusicLibrary }) {
  const sourcesPath = defaultLxSourcesPath(userDataPath);
  const manager = createLxManager({ filePath: sourcesPath });
  const searches = { kw: searchKuwo, kg: searchKugou, wy: searchNetease, tx: searchQQ };
  const downloads = new MusicDownloads({ userDataPath, onChange: jobs => {
    for (const window of require('electron').BrowserWindow.getAllWindows()) window.webContents.send('lxmine-downloads-changed', jobs);
  } });
  async function pruneDeletedLocalTracks(deletedPaths) {
    if (!localMusicLibrary || !Array.isArray(deletedPaths) || !deletedPaths.length) return;
    try {
      const deletedNorms = new Set(deletedPaths.map(p => path.resolve(String(p || '')).toLowerCase()));
      const snap = localMusicLibrary.listTracksSync();
      const matchedIds = (snap && Array.isArray(snap.tracks) ? snap.tracks : [])
        .filter(t => t && t.filePath && deletedNorms.has(path.resolve(String(t.filePath)).toLowerCase()))
        .map(t => t.id);
      if (matchedIds.length) await localMusicLibrary.removeTracks(matchedIds);
    } catch (_) {}
  }
  const trashFallback = targetPath => shell.trashItem(targetPath);
  handle('downloads', () => downloads.snapshot());
  handle('cancel-download', id => downloads.cancel(String(id)));
  handle('remove-download', async (id, opts) => {
    const res = await downloads.remove(String(id), { ...(opts || {}), trashFallback });
    if (res && res.deletedPaths && res.deletedPaths.length) await pruneDeletedLocalTracks(res.deletedPaths);
    return res;
  });
  handle('remove-downloads-batch', async (ids, opts) => {
    const res = await downloads.removeBatch(Array.isArray(ids) ? ids.map(String) : [], { ...(opts || {}), trashFallback });
    if (res && res.deletedPaths && res.deletedPaths.length) await pruneDeletedLocalTracks(res.deletedPaths);
    return res;
  });
  handle('reveal-download', id => {
    const job = downloads.snapshot().find(item => item.id === id && item.state === 'complete');
    if (!job || !fs.existsSync(job.filePath)) throw new Error('下载文件已被移动或删除');
    shell.showItemInFolder(job.filePath);
  });
  handle('save-download-as', async id => {
    const job = downloads.snapshot().find(item => item.id === String(id) && item.state === 'complete');
    if (!job || !job.filePath || !fs.existsSync(job.filePath)) throw new Error('下载源文件不存在或已被移动');
    const ext = path.extname(job.filePath).replace(/^\./, '').toLowerCase() || (/flac/i.test(job.quality || '') ? 'flac' : 'mp3');
    const base = `${job.artist || ''} - ${job.name || ''}`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\s*-\s*/, '').slice(0, 170) || 'song';
    const win = ownerWindow();
    const saveOpts = {
      title: '另存为音频文件',
      defaultPath: path.join(app.getPath('downloads'), `${base}.${ext}`),
      filters: [{ name: '音频文件', extensions: [ext] }],
    };
    const save = win ? await dialog.showSaveDialog(win, saveOpts) : await dialog.showSaveDialog(saveOpts);
    if (save.canceled || !save.filePath) return { canceled: true };
    if (path.resolve(save.filePath) !== path.resolve(job.filePath)) {
      await fs.promises.mkdir(path.dirname(save.filePath), { recursive: true });
      await fs.promises.copyFile(job.filePath, save.filePath);
      downloads.recordExportedPath(job.id, save.filePath);
    }
    return { canceled: false, filePath: save.filePath };
  });
  handle('save-downloads-batch-as', async ids => {
    const idSet = new Set((Array.isArray(ids) ? ids : []).map(String));
    const jobs = downloads.snapshot().filter(item => idSet.has(String(item.id)) && item.state === 'complete' && item.filePath && fs.existsSync(item.filePath));
    if (!jobs.length) throw new Error('所选任务中没有可另存的已完成文件');
    const win = ownerWindow();
    if (jobs.length === 1) {
      const job = jobs[0];
      const ext = path.extname(job.filePath).replace(/^\./, '').toLowerCase() || (/flac/i.test(job.quality || '') ? 'flac' : 'mp3');
      const base = `${job.artist || ''} - ${job.name || ''}`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\s*-\s*/, '').slice(0, 170) || 'song';
      const saveOpts = {
        title: '另存为音频文件',
        defaultPath: path.join(app.getPath('downloads'), `${base}.${ext}`),
        filters: [{ name: '音频文件', extensions: [ext] }],
      };
      const save = win ? await dialog.showSaveDialog(win, saveOpts) : await dialog.showSaveDialog(saveOpts);
      if (save.canceled || !save.filePath) return { canceled: true, saved: 0 };
      if (path.resolve(save.filePath) !== path.resolve(job.filePath)) {
        await fs.promises.mkdir(path.dirname(save.filePath), { recursive: true });
        await fs.promises.copyFile(job.filePath, save.filePath);
        downloads.recordExportedPath(job.id, save.filePath);
      }
      return { canceled: false, saved: 1 };
    }
    const openOpts = {
      title: '选择批量另存为目录',
      defaultPath: app.getPath('downloads'),
      properties: ['openDirectory', 'createDirectory'],
    };
    const picked = win ? await dialog.showOpenDialog(win, openOpts) : await dialog.showOpenDialog(openOpts);
    if (picked.canceled || !picked.filePaths || !picked.filePaths[0]) return { canceled: true, saved: 0 };
    const folder = picked.filePaths[0];
    const usedNames = new Set();
    let saved = 0;
    for (const job of jobs) {
      try {
        const ext = path.extname(job.filePath).replace(/^\./, '').toLowerCase() || (/flac/i.test(job.quality || '') ? 'flac' : 'mp3');
        const base = `${job.artist || ''} - ${job.name || ''}`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\s*-\s*/, '').slice(0, 160) || 'song';
        let fileName = `${base}.${ext}`;
        let seq = 2;
        while (usedNames.has(fileName.toLowerCase()) || (fs.existsSync(path.join(folder, fileName)) && path.resolve(path.join(folder, fileName)) !== path.resolve(job.filePath))) {
          fileName = `${base} (${seq++}).${ext}`;
        }
        usedNames.add(fileName.toLowerCase());
        const dest = path.join(folder, fileName);
        if (path.resolve(dest) !== path.resolve(job.filePath)) {
          await fs.promises.copyFile(job.filePath, dest);
          downloads.recordExportedPath(job.id, dest);
        }
        saved += 1;
      } catch (_) {}
    }
    return { canceled: false, saved };
  });
  async function resolveDownloadTrack(song, quality = '128k', opts = {}) {
    const portable = song.lxSource === 'qishui' || song.provider === 'qishui'
      ? { ...song, source: 'qishui', singer: song.singer || song.artist }
      : { ...song, source: song.lxSource || song.source, singer: song.singer || song.artist };
    const expectedDurationMs = Number(song.durationMs || song.duration || 0) || 0;
    const supported = await manager.supportedSources('musicUrl').catch(() => ['wy', 'tx', 'kg', 'kw']);
    const baseTrack = await resolveImportedSong(portable, supported.length ? supported : ['wy', 'tx', 'kg', 'kw']);
    const info = toLxRequest(baseTrack, quality);
    try {
      const hit = await manager.raceMusicUrl(info, { expectedDurationMs, raceAll: true });
      if (hit && hit.url) return { url: hit.url, type: hit.type || info.type || quality };
    } catch (_) {}
    const origSource = info.source || '';
    const altPlatforms = ['wy', 'tx', 'kg', 'kw'].filter(p => p !== origSource);
    try {
      const cands = await platformCandidates({
        name: song.name || '',
        singer: song.singer || song.artist || '',
        albumName: song.albumName || song.album || '',
        source: origSource,
        id: song.id || '',
        durationMs: expectedDurationMs,
      }, altPlatforms);
      const validCands = (cands || []).filter(cand => (
        expectedDurationMs > 0
          ? (cand.durationMs > 0 && Math.abs(cand.durationMs - expectedDurationMs) <= 5500)
          : true
      )).slice(0, 5);
      for (const cand of validCands) {
        try {
          const candInfo = toLxRequest(cand, quality);
          const candDur = Number(cand.durationMs || expectedDurationMs) || expectedDurationMs;
          const hit = await manager.raceMusicUrl(candInfo, {
            expectedDurationMs: candDur,
            excludeSourceIds: opts.excludeSourceIds,
            excludeUrls: opts.excludeUrls,
            forceResolve: opts.forceResolve === true,
            raceAll: true,
          });
          if (hit && hit.url) return { url: hit.url, type: hit.type || candInfo.type || quality };
        } catch (_) {}
      }
    } catch (_) {}
    throw new Error('音源未返回可下载地址');
  }
  function ownerWindow() {
    const { BrowserWindow } = require('electron');
    return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows().find(w => !w.isDestroyed()) || undefined;
  }
  handle('download', async (song, quality = '128k') => {
    const resolved = await resolveDownloadTrack(song, quality);
    const extension = /flac/i.test(resolved.type) ? 'flac' : 'mp3';
    const name = `${song.artist || song.singer || ''} - ${song.name}`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\s*-\s*/, '').slice(0, 170) || 'song';
    const win = ownerWindow();
    const saveOpts = { title: '下载歌曲', defaultPath: path.join(app.getPath('downloads'), name + '.' + extension),
      filters: [{ name: '音频文件', extensions: [extension] }] };
    const save = win ? await dialog.showSaveDialog(win, saveOpts) : await dialog.showSaveDialog(saveOpts);
    if (save.canceled || !save.filePath) return null;
    return downloads.start({ url: resolved.url, song, quality: resolved.type || quality, filePath: save.filePath });
  });
  handle('download-batch', async (songs, quality = '128k') => {
    const list = (Array.isArray(songs) ? songs : []).filter(item => item && item.provider !== 'local' && item.source !== 'local');
    if (!list.length) return { canceled: false, started: 0, skipped: 0, failed: 0 };
    const win = ownerWindow();
    const openOpts = {
      title: `选择批量下载保存目录（共 ${list.length} 首）`,
      defaultPath: app.getPath('downloads'),
      properties: ['openDirectory', 'createDirectory'],
    };
    const picked = win ? await dialog.showOpenDialog(win, openOpts) : await dialog.showOpenDialog(openOpts);
    if (picked.canceled || !picked.filePaths?.[0]) return { canceled: true, started: 0, skipped: 0, failed: 0 };
    const folder = picked.filePaths[0];
    let started = 0, skipped = 0, failed = 0;
    const usedNames = new Set();
    for (const song of list) {
      try {
        const resolved = await resolveDownloadTrack(song, quality);
        const extension = /flac/i.test(resolved.type) ? 'flac' : 'mp3';
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
        downloads.start({ url: resolved.url, song, quality: resolved.type || quality, filePath: path.join(folder, fileName) });
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
  handle('sources', () => {
    try { manager.warmUp(); } catch (_) {}
    return { sources: manager.list(), activeId: manager.getActiveId() };
  });
  handle('home', async source=>{const feed=await discovery.home(source);for(const s of feed.sections)if(s.kind==='song')s.items=s.items.map(song=>toMineTrack(song,source));feed.newSongs=feed.sections.find(s=>s.id==='newSongs').items;return feed;});
  handle('home-lite', async source=>{
    const feed=await discovery.homeLite(source);
    if(feed.newSongs.length)feed.newSongs=feed.newSongs.map(song=>toMineTrack(song,source));
    return feed;
  });
  handle('home-section', params=>discovery.section(params));
  handle('feed-tracks', async item=>{const r=await discovery.tracks(item);return {...r,items:r.items.map(song=>toMineTrack(song,song.source||item.source))};});
  handle('similar-songs', async song=>{
    const safeSong = song && typeof song === 'object' ? song : {};
    const r = await discovery.similarSongs({
      ...safeSong,
      source: sourceOf(safeSong) || String(safeSong.lxSource || safeSong.source || 'wy'),
      singer: safeSong.singer || safeSong.artist || '',
    });
    return { ...r, items: (r.items || []).map(item => toMineTrack(item, item.source || 'wy')) };
  });
  handle('personalized-mix', async ({ seeds, excludeKeys } = {}) => {
    const safeSeeds = (Array.isArray(seeds) ? seeds : []).map(s => ({
      ...s,
      source: sourceOf(s) || String(s?.lxSource || s?.source || 'wy'),
      singer: s?.singer || s?.artist || '',
    }));
    const r = await discovery.personalizedMix(safeSeeds, Array.isArray(excludeKeys) ? excludeKeys : []);
    return {
      ...r,
      items: (r.items || []).map(item => Object.assign(toMineTrack(item, item.source || 'wy'), item.recommendationReason ? { recommendationReason: item.recommendationReason } : {})),
    };
  });
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
    const qishuiSupported = portable.source === 'qishui'
      ? await manager.supportedSources('musicUrl').catch(() => ['wy', 'tx', 'kg', 'kw'])
      : undefined;
    const baseTrack = await resolveImportedSong(portable, qishuiSupported && qishuiSupported.length ? qishuiSupported : (portable.source === 'qishui' ? ['wy', 'tx', 'kg', 'kw'] : undefined));
    const info = toLxRequest(baseTrack, quality);
    if (!opts.preferCrossPlatform) {
      try {
        const hit = await manager.raceMusicUrl(info, {
          expectedDurationMs,
          excludeSourceIds: opts.excludeSourceIds,
          excludeUrls: opts.excludeUrls,
          forceResolve: opts.forceResolve === true,
          raceAll: true,
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
    // 跨平台同曲目竞速兜底：严格先跑时长误差 <=3.0s 的同一录音室母带候选，未命中再试 <=5.5s 候选，杜绝同名异曲/不同编曲/翻唱抢跑。
    const origSource = info.source || '';
    const altPlatforms = ['wy', 'tx', 'kg', 'kw'].filter(p => p !== origSource);
    try {
      const cands = await platformCandidates({
        name: song.name || '',
        singer: song.singer || song.artist || '',
        albumName: song.albumName || song.album || '',
        source: origSource,
        id: song.id || '',
        durationMs: expectedDurationMs,
      }, altPlatforms);
      const validCands = (cands || []).filter(cand => (
        expectedDurationMs > 0
          ? (cand.durationMs > 0 && Math.abs(cand.durationMs - expectedDurationMs) <= 5500)
          : true
      ));
      const tierA = (expectedDurationMs > 0
        ? validCands.filter(cand => Math.abs(cand.durationMs - expectedDurationMs) <= 3000)
        : validCands).slice(0, 3);
      const tierB = (expectedDurationMs > 0
        ? validCands.filter(cand => Math.abs(cand.durationMs - expectedDurationMs) > 3000)
        : []).slice(0, 2);
      const raceTier = async (tierList) => {
        if (!tierList.length) return null;
        return Promise.any(tierList.map(async cand => {
          const candInfo = toLxRequest(cand, quality);
          const candDur = Number(cand.durationMs || expectedDurationMs) || expectedDurationMs;
          const hit = await manager.raceMusicUrl(candInfo, {
            expectedDurationMs: candDur,
            excludeSourceIds: opts.excludeSourceIds,
            excludeUrls: opts.excludeUrls,
            forceResolve: opts.forceResolve === true,
            raceAll: true,
          });
          if (!hit || !hit.url) throw new Error('no_url');
          return { candInfo, hit };
        })).catch(() => null);
      };
      const winner = (await raceTier(tierA)) || (await raceTier(tierB));
      if (winner && winner.hit && winner.hit.url) {
        return {
          url: winner.hit.url,
          provider: song.provider,
          source: winner.candInfo.source,
          level: winner.hit.type || quality || 'standard',
          lxSource: true,
          sourceId: winner.hit.sourceId,
          sourceName: winner.hit.sourceName,
          switched: true,
          switchedPlatform: winner.candInfo.source,
        };
      }
    } catch (_) {}
    if (opts.preferCrossPlatform) {
      try {
        const fallbackHit = await manager.raceMusicUrl(info, {
          expectedDurationMs,
          excludeSourceIds: opts.excludeSourceIds,
          excludeUrls: opts.excludeUrls,
          forceResolve: true,
          raceAll: true,
        });
        if (fallbackHit && fallbackHit.url) {
          return {
            url: fallbackHit.url,
            provider: song.provider,
            source: info.source,
            level: fallbackHit.type || quality || 'standard',
            lxSource: true,
            sourceId: fallbackHit.sourceId,
            sourceName: fallbackHit.sourceName,
            switched: !!fallbackHit.switched,
          };
        }
      } catch (_) {}
    }
    throw new Error('暂未找到可用完整音源');
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
  handle('download-update-cover', (id, coverUrl) => downloads.updateCover(id, coverUrl));
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
    let canCustomLyric = false;
    if (canCustom) {
      try {
        const supported = await manager.supportedSources('lyric');
        canCustomLyric = Array.isArray(supported) && supported.length > 0;
      } catch (_) {
        canCustomLyric = true;
      }
    }
    const publicPromise = songAssets(portable).catch(() => ({}));
    let customTimer = null;
    const customPromise = canCustomLyric
      ? Promise.race([
          resolveImportedSong(portable)
            .then(resolved => manager.getLyric(toLxRequest(resolved, quality)))
            .catch(() => ({}))
            .finally(() => { if (customTimer) { clearTimeout(customTimer); customTimer = null; } }),
          new Promise(resolve => { customTimer = setTimeout(() => { customTimer = null; resolve({}); }, 2800); }),
        ])
      : Promise.resolve({});
    const hasWordTiming = value => /[<(]\d+,\d+(?:,\d+)?[>)]|<\d{1,3}:\d{2}/.test(String(value || ''));
    const fallback = (await publicPromise) || {};
    let provided = {};
    if (canCustomLyric) {
      const publicComplete = Boolean(fallback.exactIdMatch && hasLyrics(fallback.lyric) && hasWordTiming(fallback.lyric) && fallback.tlyric);
      if (publicComplete) {
        if (customTimer) { clearTimeout(customTimer); customTimer = null; }
      } else {
        provided = (await customPromise) || {};
      }
    }
    const data = typeof provided === 'string' ? { lyric: provided } : (provided || {});
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
    const rawCustomLyric = data.lxlyric || data.lyric || '';
    const customConsistent = hasLyrics(rawCustomLyric) && isLyricConsistentWithSong(rawCustomLyric, portable);
    const customLyric = customConsistent ? rawCustomLyric : '';
    let chosenLyric = '';
    let chosenExact = Boolean(fallback.exactIdMatch && hasLyrics(fallback.lyric));
    if (chosenExact) {
      if (customLyric && hasWordTiming(customLyric) && !hasWordTiming(fallback.lyric) && lyricsContentMatches(fallback.lyric, customLyric)) {
        chosenLyric = customLyric;
      } else {
        chosenLyric = fallback.lyric;
      }
    } else {
      chosenLyric = hasLyrics(fallback.lyric) ? fallback.lyric : (customLyric || '');
    }
    const chosenTlyric = chosenExact
      ? (fallback.tlyric || (customConsistent && lyricsContentMatches(fallback.lyric, customLyric || fallback.lyric) ? data.tlyric : '') || '')
      : (fallback.tlyric || (customConsistent ? data.tlyric : '') || '');
    const chosenRoma = chosenExact
      ? (fallback.romalrc || (customConsistent && lyricsContentMatches(fallback.lyric, customLyric || fallback.lyric) ? (data.romalrc || data.rlyric) : '') || '')
      : (fallback.romalrc || (customConsistent ? (data.romalrc || data.rlyric) : '') || '');
    return {
      ...fallback,
      ...data,
      coverUrl: fallback.coverUrl || data.coverUrl || portable.coverUrl || '',
      lyric: chosenLyric,
      tlyric: chosenTlyric,
      romalrc: chosenRoma,
      instrumental: Boolean(fallback.instrumental),
      exactIdMatch: chosenExact,
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
  handle('version', () => (typeof app?.getVersion === 'function' ? app.getVersion() : '1.3.0'));
  handle('check-update', async () => {
    const version = typeof app?.getVersion === 'function' ? app.getVersion() : '1.3.0';
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
