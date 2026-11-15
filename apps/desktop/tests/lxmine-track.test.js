const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { toMineTrack, toLxRequest } = require('../shared/lxmine-track.cjs');
const { BuiltInPlaylistLibrary } = require('../desktop/built-in-playlist-library');
function removeScratch(dir) {
  const target=path.resolve(dir), parent=path.resolve(os.tmpdir())+path.sep;
  if (!target.startsWith(parent) || !path.basename(target).startsWith('lxmine-')) throw Error('Invalid scratch directory');
  fs.rmSync(target, {recursive:true,force:true});
}
const { createLxManager } = require('../desktop/lx/manager.cjs');

test('Kugou source requests retain per-quality hashes after MineRadio playlist persistence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lxmine-track-'));
  try {
    const library = new BuiltInPlaylistLibrary({ userDataPath: dir });
    const song = toMineTrack({ id: 'LOW', name: 'Hash track', singer: 'Artist', durationMs: 210000, hashes: { '128k': 'LOW', '320k': 'HIGH', flac: 'LOSSLESS' } }, 'kg');
    await library.importLists([{ name: 'Mixed', tracks: [song, song, toMineTrack({ id: 'LOW', name: 'Different platform' }, 'kw')] }]);
    const restored = new BuiltInPlaylistLibrary({ userDataPath: dir });
    assert.equal(restored.playlists[0].tracks.length, 2);
    const request = toLxRequest(restored.playlists[0].tracks[0], 'lossless');
    assert.equal(request.source, 'kg'); assert.equal(request.type, 'flac');
    assert.equal(request.musicInfo.hash, 'LOSSLESS');
    assert.equal(request.musicInfo._types['320k'].hash, 'HIGH');
    assert.equal(request.musicInfo.interval, 210);
  } finally { removeScratch(dir); }
});

test('multi-playlist import is atomic if one list cannot be stored', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lxmine-import-'));
  try {
    const library = new BuiltInPlaylistLibrary({ userDataPath: dir });
    await library.create('Existing');
    await assert.rejects(async () => library.importLists([{ name: 'Valid', tracks: [toMineTrack({ id: '1', name: 'One' }, 'wy')] }, { name: 'Invalid', tracks: [{}] }]));
    assert.deepEqual(new BuiltInPlaylistLibrary({ userDataPath: dir }).playlists.map(list => list.name), ['Existing']);
  } finally { removeScratch(dir); }
});

test('source bridge executes LX request protocol with actual song identity and quality', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lxmine-source-'));
  const manager = createLxManager({ filePath: path.join(dir, 'lx-sources.json') });
  try {
    manager.importScript(`/*\n * @name Test source\n */
      lx.on(lx.EVENT_NAMES.request, ({source, action, info}) => {
        if (source !== 'tx' || info.type !== '320k' || info.musicInfo.songmid !== 'QQ-MID') throw Error('Wrong metadata');
        return action === 'musicUrl' ? 'https://example.test/song.mp3' : {lyric:'[00:00]Line'};
      });
      lx.send(lx.EVENT_NAMES.inited, {status:true, sources:{tx:{name:'QQ',type:'music',actions:['musicUrl'],qualitys:['128k','320k']}}});`);
    const request = toLxRequest(toMineTrack({ id: 'QQ-MID', name: 'Track' }, 'tx'), 'exhigh');
    assert.equal(await manager.getMusicUrl(request), 'https://example.test/song.mp3');
    assert.equal((await manager.getLyric(request)).lyric, '[00:00]Line');
  } finally { manager.dispose(); removeScratch(dir); }
});


test('parallel playback and download share the same source runtime initialization', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lxmine-runtime-'));
  const manager = createLxManager({ filePath: path.join(dir, 'lx-sources.json') });
  try {
    const entry = manager.importScript('/*\n * @name Concurrent source\n */\nconst instance=Math.random();lx.on(lx.EVENT_NAMES.request,()=>"https://example.test/"+instance);setTimeout(()=>lx.send(lx.EVENT_NAMES.inited,{status:true,sources:{kw:{type:"music",actions:["musicUrl"],qualitys:["128k"]}}}),20);');
    manager.setActive(entry.id);
    const urls = await Promise.all(Array.from({ length: 8 }, () => manager.getMusicUrl({ source: 'kw', type: '128k', musicInfo: { id: '1' } })));
    assert.equal(new Set(urls).size, 1);
  } finally { manager.dispose(); removeScratch(dir); }
});
