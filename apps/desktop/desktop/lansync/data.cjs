'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { FAVORITE_PORTABLE_ID, normalizeSingleFavorite, sanitizeTrack } = require('../built-in-playlist-library');
const { sourceOf, toMineTrack } = require('../../shared/lxmine-track.cjs');
const FILES = ['lx-sources.json', 'built-in-playlists.json', 'lxmine-sync-settings.json', 'current-fx-autosave.json'];
const JOURNAL = 'lxmine-sync-transaction.json';

function fnvHash32(text, seed) {
  let h = seed >>> 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul((h ^ s.charCodeAt(i)) >>> 0, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function computeSyncDigest(lists) {
  const entries = [];
  for (const list of normalizeSingleFavorite(Array.isArray(lists) ? lists : [])) {
    if (!list || typeof list !== 'object') continue;
    if (list.kind === 'local' || list.kind === 'recent') continue;
    const isFav = list.isFavorite === true;
    const canonId = isFav ? '__fav__' : String(list.portableId || list.id || '').trim();
    if (!canonId) continue;
    const canonName = isFav ? '我的收藏' : String(list.name || '').trim();
    const keySet = new Set();
    for (const song of (Array.isArray(list.songs) ? list.songs : [])) {
      if (!song || song.id == null || String(song.id) === '') continue;
      keySet.add(`${song.source || 'kw'}:${song.id}`);
    }
    const sortedKeys = Array.from(keySet).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const coverStr = typeof list.customCover === 'string' ? list.customCover.trim() : '';
    const coverTag = coverStr ? fnvHash32(coverStr, 0x811c9dc5) : '';
    entries.push(`${canonId}\t${canonName}\t${coverTag}\t${sortedKeys.join(',')}`);
  }
  entries.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const canonical = entries.join('\n');
  return fnvHash32(canonical, 0x811c9dc5) + fnvHash32(canonical, 0x050c5d1f);
}
function atomic(file, text) {
  const temp = file + '.sync-tmp';
  const fd = fs.openSync(temp, 'w');
  try { fs.writeFileSync(fd, text, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}
function read(root, name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
function recoverSyncTransaction(root) {
  const journal = path.join(root, JOURNAL);
  if (!fs.existsSync(journal)) return;
  const previous = JSON.parse(fs.readFileSync(journal, 'utf8'));
  for (const name of FILES) {
    const file = path.join(root, name);
    if (typeof previous[name] === 'string') atomic(file, previous[name]);
    else if (previous[name] === null && fs.existsSync(file)) fs.unlinkSync(file);
  }
  fs.unlinkSync(journal);
}
function portableSong(track) {
  const source = sourceOf(track);
  if (!source) return null;
  const hashes = { ...(track.hashes || {}) };
  for (const [quality, info] of Object.entries(track._types || {})) if (info?.hash) hashes[quality] = info.hash;
  return { source, id: String(track.songmid || track.mid || track.id), name: track.name, singer: track.singer || track.artist || '',
    albumName: track.albumName || track.album || '', albumId: String(track.albumId || track.albumMid || ''),
    durationMs: Number(track.durationMs || track.dt) || Number(track.duration || 0) * 1000,
    coverUrl: track.coverUrl || track.cover || '', qualitys: track.qualitys || Object.keys(hashes), hash: track.hash, hashes };
}
function portableLists(lists) {
  return normalizeSingleFavorite(lists).map(list => {
    const isFav = list.isFavorite === true;
    return {
      id: list.portableId || (isFav ? FAVORITE_PORTABLE_ID : list.id),
      name: isFav && (!list.name || list.name === '我喜欢的') ? '我的收藏' : list.name,
      kind: 'lx',
      customCover: list.customCover || '',
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      isFavorite: isFav,
      songs: list.tracks.map(portableSong).filter(Boolean),
      pcTracks: list.tracks.filter(track => !sourceOf(track)),
    };
  });
}
function incomingSongToTrack(song) {
  if (!song || typeof song !== 'object') return null;
  if (song.source === 'local' || song.provider === 'local') {
    const rawId = String(song.localFileId || song.localKey || song.id || '').trim();
    if (!rawId) return null;
    return {
      id: rawId,
      provider: 'local',
      source: 'local',
      type: 'local',
      localFileId: rawId.replace(/^local:/, ''),
      localKey: rawId,
      name: song.name || song.title || '本地歌曲',
      artist: song.singer || song.artist || '本地文件',
      album: song.albumName || song.album || '',
      cover: song.coverUrl || song.cover || '',
      durationMs: Number(song.durationMs || song.dt) || 0,
    };
  }
  return toMineTrack(song);
}
function incomingLists(lists) {
  if (!Array.isArray(lists) || lists.length > 100) throw new Error('同步歌单数量无效');
  const seen = new Set();
  const parsed = lists.map(list => {
    if (!list || typeof list.id !== 'string' || typeof list.name !== 'string') throw new Error('同步歌单缺少标识或名称');
    const id = /^[a-f0-9]{24}$/.test(list.id) ? list.id : crypto.createHash('sha256').update(list.id).digest('hex').slice(0, 24);
    if (seen.has(id)) throw new Error('同步歌单标识重复'); seen.add(id);
    if (list.songs !== undefined && !Array.isArray(list.songs)) throw new Error('同步歌曲列表无效');
    const tracks = Array.isArray(list.tracks) ? list.tracks.slice() : (list.songs || []).map(incomingSongToTrack).filter(Boolean);
    tracks.push(...(Array.isArray(list.pcTracks) ? list.pcTracks : []));
    if (tracks.length > 5000) throw new Error('同步歌曲数量超出限制');
    const cleaned = tracks.map(sanitizeTrack);
    if (cleaned.some(track => !track)) throw new Error('同步数据含无效歌曲');
    const isFav = list.isFavorite === true;
    const customCoverRaw = typeof list.customCover === 'string' ? list.customCover.trim() : '';
    const customCover = customCoverRaw && (customCoverRaw.startsWith('data:image/') || /^https?:\/\//i.test(customCoverRaw) || customCoverRaw.startsWith('file://'))
      ? customCoverRaw.slice(0, 600000)
      : '';
    const normalizedName = isFav && (!list.name || list.name === '我喜欢的') ? '我的收藏' : list.name.slice(0, 80);
    return { id, portableId: list.id.slice(0, 128), name: normalizedName, customCover, createdAt: Number(list.createdAt) || Date.now(), updatedAt: Number(list.updatedAt) || Date.now(),
      isFavorite: isFav, tracks: [...new Map(cleaned.map(track => [track.builtInIdentity, track])).values()] };
  });
  return normalizeSingleFavorite(parsed);
}
function incomingSources(values) {
  if (!Array.isArray(values) || values.length > 100) throw new Error('同步音源列表无效');
  const used = new Map(), sources = [];
  for (const [index, value] of values.entries()) {
    if (!value || typeof value.script !== 'string' || typeof value.name !== 'string') throw new Error(`第 ${index + 1} 个同步音源缺少名称或脚本`);
    const scriptHash = crypto.createHash('sha256').update(value.script).digest('hex');
    const base = typeof value.id === 'string' && value.id ? value.id : 'source-' + scriptHash;
    let id = base;
    if (used.get(id) === scriptHash) continue;
    if (used.has(id)) id = base + '-' + scriptHash;
    let suffix = 1;
    while (used.has(id) && used.get(id) !== scriptHash) id = base + '-' + scriptHash + '-' + suffix++;
    if (used.has(id)) continue;
    used.set(id, scriptHash);
    sources.push({ ...value, id, scriptHash });
  }
  return sources;
}
class LanSyncData {
  constructor({ root, library, sourceManager, getFx }) {
    this.root = root; this.library = library; this.sourceManager = sourceManager; this.getFx = getFx;
    recoverSyncTransaction(root);
  }
  snapshot() {
    const stored = read(this.root, 'lx-sources.json', { sources: [], activeId: '' });
    const settings = read(this.root, 'lxmine-sync-settings.json', {});
    const fx = this.getFx?.() || read(this.root, 'current-fx-autosave.json', null);
    if (fx) { settings.lxmine_pc_visuals = fx; if (Number.isInteger(fx.preset)) settings.lxlia_native_style = 'mine-' + fx.preset; }
    return { sources: stored.sources, activeSourceId: stored.activeId || '', settings, playlists: portableLists(this.library.playlists) };
  }
  async apply(bundle) {
    const lists = incomingLists(bundle.playlists || []);
    const sources = incomingSources(Array.isArray(bundle.sources) ? bundle.sources : []);
    const ids = new Set(sources.map(source => source.id));
    const settings = bundle.settings == null ? {} : bundle.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('同步设置格式无效');
    const activeId = ids.has(bundle.activeSourceId) ? bundle.activeSourceId : null;
    const updates = { 'lx-sources.json': { sources, activeId },
      'built-in-playlists.json': { version: 1, updatedAt: Date.now(), playlists: lists }, 'lxmine-sync-settings.json': settings };
    const previousFx = read(this.root, 'current-fx-autosave.json', {});
    const incomingFx = settings.lxmine_pc_visuals && typeof settings.lxmine_pc_visuals === 'object' ? settings.lxmine_pc_visuals : previousFx;
    const nativeStyle = /^mine-(\d+)$/.exec(settings.lxlia_native_style || '');
    if (Object.keys(incomingFx).length || nativeStyle) updates['current-fx-autosave.json'] = { ...incomingFx,
      ...(nativeStyle ? { preset: Math.min(12, Number(nativeStyle[1])) } : {}) };
    // Wait for previous playlist edits, then commit synchronously: no renderer
    // mutation can interleave the four files between the journal and commit.
    await this.library.mutation;
    const previous = {};
    for (const name of FILES) {
      const file = path.join(this.root, name);
      previous[name] = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    }
    atomic(path.join(this.root, JOURNAL), JSON.stringify(previous));
    try {
      for (const [name, value] of Object.entries(updates)) atomic(path.join(this.root, name), JSON.stringify(value));
      fs.unlinkSync(path.join(this.root, JOURNAL));
    } catch (error) { recoverSyncTransaction(this.root); throw error; }
    this.library.loadIndex(); this.sourceManager.reload();
    return { playlistsCount: lists.length, sourcesCount: sources.length, settingsCount: Object.keys(settings).length };
  }
  getSyncDigest() {
    return computeSyncDigest(portableLists(this.library.playlists));
  }
  async mergePlaylists(rawLists) {
    const incoming = incomingLists(rawLists || []);
    await this.library.mutation;
    const current = normalizeSingleFavorite(this.library.playlists.map(list => ({ ...list, tracks: list.tracks.slice() })));
    const merged = current.slice();
    let changed = false;
    for (const item of incoming) {
      const itemFav = item.isFavorite === true;
      const index = merged.findIndex(existing => {
        const existingFav = existing.isFavorite === true;
        if (itemFav || existingFav) return itemFav && existingFav;
        return existing.id === item.id ||
          (item.portableId && existing.portableId === item.portableId);
      });
      if (index < 0) {
        if (merged.length < 100) { merged.push({ ...item, isFavorite: itemFav }); changed = true; }
        continue;
      }
      const existing = merged[index];
      if (itemFav) {
        // Favorites: never let an empty list wipe a non-empty one; union-merge so neither device loses likes during auto-sync.
        const incomingTracks = Array.isArray(item.tracks) ? item.tracks : [];
        const existingTracks = Array.isArray(existing.tracks) ? existing.tracks : [];
        if (!incomingTracks.length && existingTracks.length) continue;
        const primary = (Number(item.updatedAt) || 0) >= (Number(existing.updatedAt) || 0) ? incomingTracks : existingTracks;
        const secondary = primary === incomingTracks ? existingTracks : incomingTracks;
        const combinedMap = new Map();
        for (const t of primary) if (t && t.builtInIdentity) combinedMap.set(t.builtInIdentity, t);
        for (const t of secondary) if (t && t.builtInIdentity && !combinedMap.has(t.builtInIdentity)) combinedMap.set(t.builtInIdentity, t);
        const combined = [...combinedMap.values()];
        const prevSig = existingTracks.map(t => t.builtInIdentity).join('|');
        const nextSig = combined.map(t => t.builtInIdentity).join('|');
        const nextCover = item.customCover || existing.customCover || '';
        if (prevSig !== nextSig || !existing.isFavorite || nextCover !== (existing.customCover || '')) {
          merged[index] = {
            ...existing,
            name: (item.name && item.name !== '我喜欢的' ? item.name : (existing.name && existing.name !== '我喜欢的' ? existing.name : '我的收藏')),
            isFavorite: true,
            portableId: existing.portableId || item.portableId || 'lxmine-favorite',
            customCover: nextCover,
            updatedAt: Math.max(Number(existing.updatedAt) || 0, Number(item.updatedAt) || 0),
            tracks: combined,
          };
          changed = true;
        }
        continue;
      }
      const remoteTs = Number(item.updatedAt) || 0;
      const localTs = Number(existing.updatedAt) || 0;
      if (remoteTs > localTs) {
        merged[index] = { ...item, id: existing.id, portableId: existing.portableId || item.portableId, customCover: item.customCover || existing.customCover || '' };
        changed = true;
      } else if (remoteTs === localTs) {
        const combinedMap = new Map();
        for (const t of (existing.tracks || [])) if (t && t.builtInIdentity) combinedMap.set(t.builtInIdentity, t);
        let addedAny = false;
        for (const t of (item.tracks || [])) {
          if (t && t.builtInIdentity && !combinedMap.has(t.builtInIdentity)) {
            combinedMap.set(t.builtInIdentity, t);
            addedAny = true;
          }
        }
        const nextCover = existing.customCover || item.customCover || '';
        if (addedAny || nextCover !== (existing.customCover || '')) {
          merged[index] = { ...existing, customCover: nextCover, tracks: [...combinedMap.values()] };
          changed = true;
        }
      } else if (!existing.customCover && item.customCover) {
        merged[index] = { ...existing, customCover: item.customCover };
        changed = true;
      }
    }
    if (changed) {
      atomic(path.join(this.root, 'built-in-playlists.json'), JSON.stringify({ version: 1, updatedAt: Date.now(), playlists: merged }));
      this.library.loadIndex();
    }
    const portable = portableLists(this.library.playlists);
    return { changed, playlistsCount: merged.length, syncDigest: computeSyncDigest(portable), playlists: portable };
  }
}
module.exports = { LanSyncData, recoverSyncTransaction, incomingLists, incomingSources, portableLists, portableSong, computeSyncDigest };
