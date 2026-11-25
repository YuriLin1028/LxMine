'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BuiltInPlaylistLibrary } = require('../desktop/built-in-playlist-library');
const { LanSyncData, incomingLists } = require('../desktop/lansync/data.cjs');

test('BuiltInPlaylistLibrary supports favorite mirror, single/batch track removal, rename, and custom track reorder', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'lxmine-playlist-edit-'));
  try {
    const library = new BuiltInPlaylistLibrary({ userDataPath });
    const s1 = { source: 'wy', id: '101', name: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269 };
    const s2 = { source: 'tx', id: '202', name: '江南', artist: '林俊杰', album: '第二天堂', duration: 267 };
    const s3 = { source: 'kw', id: '303', name: '泡沫', artist: '邓紫棋', album: 'Xposed', duration: 258 };

    // Favorite playlist mirror (#27)
    const favRes = await library.setFavoriteTracks([s1, s2]);
    assert.equal(favRes.playlist.isFavorite, true);
    assert.equal(favRes.playlist.trackCount, 2);

    // Create + add + rename (#23) + single/batch remove (#5, #11, #13) + reorder (#25)
    const created = (await library.create('通勤歌单')).playlist;
    await library.addTrack(created.id, s1);
    await library.addTrack(created.id, s2);
    await library.addTrack(created.id, s3);

    const renamed = await library.rename(created.id, '深夜通勤');
    assert.equal(renamed.playlist.name, '深夜通勤');

    const removed = await library.removeTracks(created.id, [1]);
    assert.equal(removed.removedCount, 1);
    assert.deepEqual(library.playlists.find(p => p.id === created.id).tracks.map(t => String(t.id)), ['303', '101']);

    await library.replaceTracks(created.id, [s1, s3]);
    assert.deepEqual(library.playlists.find(p => p.id === created.id).tracks.map(t => String(t.id)), ['101', '303']);
  } finally {
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});

test('LAN sync accepts mobile playlists containing local tracks and merges auto-sync playlists by updatedAt', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'lxmine-lansync-merge-'));
  try {
    const library = new BuiltInPlaylistLibrary({ userDataPath });
    const s1 = { source: 'wy', id: '101', name: '晴天', artist: '周杰伦', duration: 269 };
    await library.setFavoriteTracks([]);
    library.playlists[0].updatedAt = 1000;
    const plLocal = (await library.create('电脑较新歌单')).playlist;
    await library.addTrack(plLocal.id, s1);
    const targetPl = library.playlists.find(p => p.id === plLocal.id);
    targetPl.portableId = 'shared-pl';
    targetPl.updatedAt = 5000;

    const lists = incomingLists([
      {
        id: 'mobile-fav',
        name: '我喜欢的',
        kind: 'lx',
        isFavorite: true,
        updatedAt: 2500,
        songs: [
          { source: 'wy', id: '101', name: '晴天', singer: '周杰伦', durationMs: 269000 },
          { source: 'local', id: 'loc-1', name: '本地录音', singer: '我', durationMs: 120000 }
        ]
      }
    ]);
    assert.equal(lists.length, 1);
    assert.equal(lists[0].isFavorite, true);
    assert.equal(lists[0].tracks.length, 2);
    assert.equal(lists[0].tracks[1].provider, 'local');

    const syncData = new LanSyncData({
      root: userDataPath,
      library,
      sourceManager: { list: () => ({ sources: [], activeId: '' }), reload() {} }
    });
    const res = await syncData.mergePlaylists([
      {
        id: 'mobile-fav',
        name: '我喜欢的',
        kind: 'lx',
        isFavorite: true,
        updatedAt: 2500,
        songs: [
          { source: 'wy', id: '101', name: '晴天', singer: '周杰伦', durationMs: 269000 },
          { source: 'local', id: 'loc-1', name: '本地录音', singer: '我', durationMs: 120000 }
        ]
      },
      {
        id: 'shared-pl',
        name: '手机较旧版本',
        kind: 'lx',
        isFavorite: false,
        updatedAt: 1500,
        songs: []
      },
      {
        id: 'mobile-new-pl',
        name: '手机新建歌单',
        kind: 'lx',
        isFavorite: false,
        updatedAt: 3000,
        songs: [{ source: 'tx', id: '202', name: '江南', singer: '林俊杰', durationMs: 267000 }]
      }
    ]);
    assert.equal(res.changed, true);
    const fav = library.playlists.find(p => p.isFavorite);
    assert.equal(fav.tracks.length, 2, 'newer mobile favorites win');
    assert.equal(library.playlists.find(p => p.id === plLocal.id).name, '电脑较新歌单', 'newer local playlist wins');
    assert.ok(library.playlists.some(p => p.name === '手机新建歌单'), 'new incoming playlist is appended');
  } finally {
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});

test('Redesigned 120fps startup.html has zero gold colors and high-refresh WebGL pipeline', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/mine-stage/startup.html'), 'utf8');
  assert.doesNotMatch(html, /#(f4d28a|886020|d3b66f|d8b36a|e5c07b|d8bd78|d8c486|9a6f2c)/i);
  assert.match(html, /desynchronized:\s*true/);
  assert.match(html, /powerPreference:\s*'high-performance'/);
  assert.match(html, /__lxStartup/);
  assert.match(html, /window\.dismissSplash\s*=/);
});

test('Importing favorite-named .lxmc playlists stays independent (Option B), survives reload, heals 1.3.0 duplicates, and syncs separately', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'lxmine-import-fav-optionb-'));
  try {
    const library = new BuiltInPlaylistLibrary({ userDataPath });
    const s1 = { source: 'wy', id: '101', name: '晴天', artist: '周杰伦', duration: 269 };
    const s2 = { source: 'tx', id: '202', name: '江南', artist: '林俊杰', duration: 267 };

    // 1) Import a .lxmc playlist named "我的收藏" BEFORE built-in favorite exists
    await library.importLists([{ name: '我的收藏', tracks: [s2] }]);
    assert.equal(library.playlists.length, 1);
    assert.equal(library.playlists[0].isFavorite, false);
    assert.equal(library.playlists[0].name, '我的收藏');

    // 2) Setting built-in favorites must NOT hijack the imported "我的收藏" playlist
    await library.setFavoriteTracks([s1]);
    assert.equal(library.playlists.length, 2);
    assert.equal(library.playlists.filter(p => p.isFavorite).length, 1);
    const builtInFav = library.playlists.find(p => p.isFavorite);
    const importedList = library.playlists.find(p => !p.isFavorite);
    assert.equal(builtInFav.tracks.length, 1);
    assert.equal(String(builtInFav.tracks[0].id), '101');
    assert.equal(importedList.name, '我的收藏');
    assert.equal(importedList.tracks.length, 1);
    assert.equal(String(importedList.tracks[0].id), '202');

    // 3) Reloading from disk preserves both separately
    const reloaded = new BuiltInPlaylistLibrary({ userDataPath });
    assert.equal(reloaded.playlists.length, 2);
    assert.equal(reloaded.playlists.filter(p => p.isFavorite).length, 1);
    assert.equal(reloaded.playlists.filter(p => !p.isFavorite && p.name === '我的收藏').length, 1);

    // 4) Auto-heal a 1.3.0-damaged file containing two isFavorite=true playlists
    const damagedPath = path.join(userDataPath, 'built-in-playlists.json');
    const raw = JSON.parse(fs.readFileSync(damagedPath, 'utf8'));
    raw.playlists.forEach(p => { p.isFavorite = true; p.portableId = 'lxmine-favorite'; });
    fs.writeFileSync(damagedPath, JSON.stringify(raw), 'utf8');
    const healed = new BuiltInPlaylistLibrary({ userDataPath });
    assert.equal(healed.playlists.length, 2);
    assert.equal(healed.playlists.filter(p => p.isFavorite).length, 1);
    const healedImported = healed.playlists.find(p => !p.isFavorite);
    assert.ok(healedImported);
    assert.equal(healedImported.name, '我的收藏');
    assert.equal(String(healedImported.tracks[0].id), '202');
    assert.notEqual(healedImported.portableId, 'lxmine-favorite');

    // 5) LAN sync snapshot + merge keep built-in favorite and imported "我的收藏" separate
    const syncData = new LanSyncData({
      root: userDataPath,
      library: healed,
      sourceManager: { list: () => ({ sources: [], activeId: '' }), reload() {} },
    });
    const snap = syncData.snapshot();
    assert.equal(snap.playlists.length, 2);
    assert.equal(snap.playlists.filter(p => p.isFavorite).length, 1);
    assert.equal(snap.playlists.filter(p => !p.isFavorite && p.name === '我的收藏').length, 1);
  } finally {
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});
