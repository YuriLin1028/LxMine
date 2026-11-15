const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BuiltInPlaylistLibrary } = require('../desktop/built-in-playlist-library');
const { LanSyncData, recoverSyncTransaction } = require('../desktop/lansync/data.cjs');
const { createLanSyncTransport, PROTOCOL } = require('../desktop/lansync/transport.cjs');
function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lxmine-sync-'));
  t.after(() => { assert.ok(fs.realpathSync(root).startsWith(fs.realpathSync(os.tmpdir()) + path.sep)); assert.ok(path.basename(root).startsWith('lxmine-sync-')); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}
function data(root) {
  const library = new BuiltInPlaylistLibrary({ userDataPath: root });
  return new LanSyncData({ root, library, sourceManager: { reload() {} } });
}
function fixture() {
  return { sources: [{ id: 'source-1', name: 'Source', script: '/* @name Source */', importedAt: 1 }], activeSourceId: 'source-1', settings: { lxlia_native_style: 'mine-5' },
    playlists: [{ id: 'harmony-favorite', name: 'Favorites', isFavorite: true, songs: [
      { source: 'kw', id: '123', name: 'KW track', singer: 'A', durationMs: 90000 },
      { source: 'kg', id: 'LOW', name: 'KG track', singer: 'B', hash: 'LOW', hashes: { flac: 'LOSSLESS' } }
    ], pcTracks: [{ source: 'local', provider: 'local', id: 'local:xyz', localFileId: 'xyz', name: 'Local file' }] }] };
}
test('Harmony to PC to Harmony preserves identities, quality hashes, favorites and local references', async t => {
  const root = scratch(t), store = data(root); await store.apply(fixture());
  const restored = data(root).snapshot();
  assert.equal(restored.playlists[0].id, 'harmony-favorite');
  assert.equal(restored.playlists[0].isFavorite, true);
  assert.equal(restored.playlists[0].songs[0].singer, 'A');
  assert.equal(restored.playlists[0].songs[1].hashes.flac, 'LOSSLESS');
  assert.equal(restored.playlists[0].pcTracks[0].localFileId, 'xyz');
  const another = data(scratch(t)); await another.apply(restored);
  assert.deepEqual(another.snapshot().playlists, restored.playlists);
  assert.equal(another.snapshot().activeSourceId, 'source-1');
});
test('a partial disk failure rolls back sources, playlists and settings before reporting failure', async t => {
  const root = scratch(t), store = data(root); await store.apply(fixture());
  const before = store.snapshot(), next = fixture(); next.sources[0].name = 'Changed'; next.playlists[0].name = 'Changed';
  const rename = fs.renameSync; let injected = false;
  fs.renameSync = (from, to) => { if (!injected && to === path.join(root, 'built-in-playlists.json')) { injected = true; throw Error('disk full'); } return rename(from, to); };
  try { await assert.rejects(store.apply(next), /disk full/); } finally { fs.renameSync = rename; }
  assert.deepEqual(data(root).snapshot(), before);
  assert.equal(fs.existsSync(path.join(root, 'lxmine-sync-transaction.json')), false);
});
test('startup restores the last committed files after an interrupted transaction', t => {
  const root = scratch(t);
  fs.writeFileSync(path.join(root, 'lx-sources.json'), '{"sources":["partial"]}');
  fs.writeFileSync(path.join(root, 'lxmine-sync-transaction.json'), JSON.stringify({ 'lx-sources.json': '{"sources":[]}', 'built-in-playlists.json': null, 'lxmine-sync-settings.json': null, 'current-fx-autosave.json': null }));
  recoverSyncTransaction(root);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'lx-sources.json'))), { sources: [] });
});
async function waitFor(check) { for (let i = 0; i < 100; i++) { const value = check(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 10)); } throw Error('timed out'); }
test('HTTP acknowledgement waits for persistence; failed persistence remains retryable', async t => {
  let release, applied = false;
  const saving = new Promise(resolve => { release = resolve; });
  const node = createLanSyncTransport({ deviceId: 'receiver', deviceName: 'Tablet', platform: 'harmony', discoveryPort: 42000 + Math.floor(Math.random() * 1000), onAccept: async () => { await saving; applied = true; } });
  t.after(() => node.stop()); await node.start();
  const bundle = { protocol: PROTOCOL, version: 1, device: { id: 'sender', name: 'PC', platform: 'win32' }, ...fixture() };
  let completed = false;
  const response = fetch('http://127.0.0.1:' + node.getPort() + '/lxlia-sync/push', { method: 'POST', body: JSON.stringify(bundle) }).then(result => { completed = true; return result.json(); });
  const pending = await waitFor(() => node.listPending()[0]);
  const accepting = node.respond(pending.pendingId, true);
  await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(completed, false); assert.equal(applied, false);
  release(); assert.equal(await accepting, true); assert.equal((await response).accepted, true); assert.equal(applied, true);
  let failSave = true;
  const failing = createLanSyncTransport({ deviceId: 'receiver-2', deviceName: 'PC', platform: 'win32', discoveryPort: 43000 + Math.floor(Math.random() * 1000), onAccept: async () => { if (failSave) throw Error('cannot persist'); } });
  t.after(() => failing.stop()); await failing.start();
  const rejected = fetch('http://127.0.0.1:' + failing.getPort() + '/lxlia-sync/push', { method: 'POST', body: JSON.stringify(bundle) }).then(result => result.json());
  const entry = await waitFor(() => failing.listPending()[0]); assert.equal(await failing.respond(entry.pendingId, true), false);
  assert.equal(failing.listPending()[0].lastError, 'cannot persist');
  assert.equal(failing.listPending()[0].pendingId, entry.pendingId);
  failSave = false;
  assert.equal(await failing.respond(entry.pendingId, true), true);
  assert.equal((await rejected).accepted, true);
  assert.equal(failing.listPending().length, 0);
});

test('legacy ID collisions preserve distinct scripts and remain stable across a round trip', async t => {
  const bundle = fixture();
  bundle.sources.push({ ...bundle.sources[0], script: '/* another script */' });
  bundle.sources.push({ ...bundle.sources[0] });
  const receiver = data(scratch(t));
  await receiver.apply(bundle);
  const saved = receiver.snapshot();
  assert.equal(saved.sources.length, 2);
  assert.equal(new Set(saved.sources.map(source => source.id)).size, 2);
  assert.equal(saved.activeSourceId, 'source-1');
  const another = data(scratch(t));
  await another.apply(saved);
  assert.deepEqual(another.snapshot().sources, saved.sources);
});
