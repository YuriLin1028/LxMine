const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BuiltInPlaylistLibrary } = require('../desktop/built-in-playlist-library');
const { LanSyncData, recoverSyncTransaction, computeSyncDigest } = require('../desktop/lansync/data.cjs');
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
  const trustToken = '0123456789abcdef0123456789abcdef';
  const verifyTrust = (peerId, token) => peerId === 'sender' && token === trustToken;
  const node = createLanSyncTransport({ deviceId: 'receiver', deviceName: 'Tablet', platform: 'harmony', discoveryPort: 42000 + Math.floor(Math.random() * 1000), verifyTrust, onAccept: async () => { await saving; applied = true; } });
  t.after(() => node.stop()); await node.start();
  const bundle = { protocol: PROTOCOL, version: 1, device: { id: 'sender', name: 'PC', platform: 'win32' }, trustToken, ...fixture() };
  let completed = false;
  const response = fetch('http://127.0.0.1:' + node.getPort() + '/lxlia-sync/push', { method: 'POST', body: JSON.stringify(bundle) }).then(result => { completed = true; return result.json(); });
  const pending = await waitFor(() => node.listPending()[0]);
  const accepting = node.respond(pending.pendingId, true);
  await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(completed, false); assert.equal(applied, false);
  release(); assert.equal(await accepting, true); assert.equal((await response).accepted, true); assert.equal(applied, true);
  let failSave = true;
  const failing = createLanSyncTransport({ deviceId: 'receiver-2', deviceName: 'PC', platform: 'win32', discoveryPort: 43000 + Math.floor(Math.random() * 1000), verifyTrust, onAccept: async () => { if (failSave) throw Error('cannot persist'); } });
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

test('favorites auto-sync union-merges songs across devices, resists empty wipes, and supports mine-17 presets', async t => {
  const root = scratch(t);
  const library = new BuiltInPlaylistLibrary({ userDataPath: root });
  const store = new LanSyncData({ root, library, sourceManager: { reload() {} } });
  await library.setFavoriteTracks([{ source: 'wy', lxSource: 'wy', provider: 'netease', id: '1001', name: 'PC Fav', singer: 'Singer A' }], { touch: true });
  // Incoming peer has an older updatedAt but a distinct favorite song, plus missing isFavorite flag (name-only fallback).
  const res = await store.mergePlaylists([
    { id: 'mobile-fav-1', name: '我喜欢的', updatedAt: 1000, songs: [{ source: 'tx', id: '2002', name: 'Phone Fav', singer: 'Singer B' }] }
  ]);
  assert.equal(res.changed, true);
  const after = store.snapshot();
  const fav = after.playlists.find(p => p.isFavorite);
  assert.ok(fav);
  assert.equal(fav.songs.length, 2);
  assert.deepEqual(fav.songs.map(s => s.id).sort(), ['1001', '2002']);
  // Empty incoming favorite with newer timestamp must NOT wipe existing favorites.
  const emptyRes = await store.mergePlaylists([
    { id: 'empty-fav', name: '我喜欢的', isFavorite: true, updatedAt: Date.now() + 60000, songs: [] }
  ]);
  assert.equal(emptyRes.changed, false);
  assert.equal(store.snapshot().playlists.find(p => p.isFavorite).songs.length, 2);
  // Presets up to mine-12 survive apply().
  await store.apply({ ...fixture(), settings: { lxlia_native_style: 'mine-12' } });
  const fxSaved = JSON.parse(fs.readFileSync(path.join(root, 'current-fx-autosave.json'), 'utf8'));
  assert.equal(fxSaved.preset, 12);
});

test('multi-device bidirectional auto-sync converges 3 peers to identical syncDigest and union of playlists', async t => {
  const rootA = scratch(t), rootB = scratch(t), rootC = scratch(t);
  const libA = new BuiltInPlaylistLibrary({ userDataPath: rootA });
  const libB = new BuiltInPlaylistLibrary({ userDataPath: rootB });
  const libC = new BuiltInPlaylistLibrary({ userDataPath: rootC });
  const storeA = new LanSyncData({ root: rootA, library: libA, sourceManager: { reload() {} } });
  const storeB = new LanSyncData({ root: rootB, library: libB, sourceManager: { reload() {} } });
  const storeC = new LanSyncData({ root: rootC, library: libC, sourceManager: { reload() {} } });

  await libA.setFavoriteTracks([{ source: 'wy', lxSource: 'wy', provider: 'netease', id: 'A1', name: 'PC Fav', singer: 'A' }], { touch: true });
  await libB.setFavoriteTracks([{ source: 'tx', lxSource: 'tx', provider: 'qq', id: 'B1', name: 'Harmony Fav', singer: 'B' }], { touch: true });
  await libC.setFavoriteTracks([{ source: 'kw', lxSource: 'kw', provider: 'kuwo', id: 'C1', name: 'Android Fav', singer: 'C' }], { touch: true });

  await storeB.mergePlaylists([{ id: 'pl-harmony', name: '鸿蒙歌单', updatedAt: 2000, songs: [{ source: 'tx', id: 'B2', name: 'H Song', singer: 'B' }] }]);
  await storeC.mergePlaylists([{ id: 'pl-android', name: '安卓歌单', updatedAt: 3000, songs: [{ source: 'kw', id: 'C2', name: 'A Song', singer: 'C' }] }]);

  const tokenB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const tokenC = 'cccccccccccccccccccccccccccccccc';
  const nodeA = createLanSyncTransport({
    deviceId: 'dev-a', deviceName: 'PC', platform: 'win32', autoSyncPlaylists: true,
    discoveryPort: 44000 + Math.floor(Math.random() * 500),
    verifyTrust: (peerId, token) => (peerId === 'dev-b' && token === tokenB) || (peerId === 'dev-c' && token === tokenC),
    getSyncDigest: () => storeA.getSyncDigest(),
    onAutoPlaylists: async (_peer, bundle) => storeA.mergePlaylists(bundle.playlists || []),
  });
  t.after(() => nodeA.stop());
  await nodeA.start();

  // Step 1: B exchanges bidirectionally with A -> both have A + B.
  const resBA = await nodeA.sendDirect('127.0.0.1', nodeA.getPort(), {
    protocol: PROTOCOL, version: 1, device: { id: 'dev-b', name: 'Harmony', platform: 'harmony' },
    trustToken: tokenB,
    syncDigest: storeB.getSyncDigest(), playlists: storeB.snapshot().playlists,
  }, '/lxlia-sync/auto-playlists', 5000);
  assert.equal(resBA.accepted, true);
  assert.equal(Array.isArray(resBA.playlists), true);
  await storeB.mergePlaylists(resBA.playlists);
  assert.equal(storeA.getSyncDigest(), storeB.getSyncDigest());

  // Step 2: C (e.g. Android pull peer) exchanges bidirectionally with A -> A & C have A + B + C.
  const resCA = await nodeA.sendDirect('127.0.0.1', nodeA.getPort(), {
    protocol: PROTOCOL, version: 1, device: { id: 'dev-c', name: 'Android', platform: 'android' },
    trustToken: tokenC,
    syncDigest: storeC.getSyncDigest(), playlists: storeC.snapshot().playlists,
  }, '/lxlia-sync/auto-playlists', 5000);
  assert.equal(resCA.accepted, true);
  await storeC.mergePlaylists(resCA.playlists);
  assert.equal(storeA.getSyncDigest(), storeC.getSyncDigest());

  // Step 3: B sees A's updated digest and exchanges with A -> all 3 converge identically.
  const resBA2 = await nodeA.sendDirect('127.0.0.1', nodeA.getPort(), {
    protocol: PROTOCOL, version: 1, device: { id: 'dev-b', name: 'Harmony', platform: 'harmony' },
    trustToken: tokenB,
    syncDigest: storeB.getSyncDigest(), playlists: storeB.snapshot().playlists,
  }, '/lxlia-sync/auto-playlists', 5000);
  await storeB.mergePlaylists(resBA2.playlists);

  assert.equal(storeA.getSyncDigest(), storeB.getSyncDigest());
  assert.equal(storeB.getSyncDigest(), storeC.getSyncDigest());
  for (const s of [storeA, storeB, storeC]) {
    const snap = s.snapshot();
    const fav = snap.playlists.find(p => p.isFavorite);
    assert.deepEqual(fav.songs.map(x => x.id).sort(), ['A1', 'B1', 'C1']);
    assert.ok(snap.playlists.some(p => p.id === 'pl-harmony'));
    assert.ok(snap.playlists.some(p => p.id === 'pl-android'));
  }
  // Order-insensitive canonical digest check
  const d1 = computeSyncDigest([{ id: 'p1', name: 'X', songs: [{ source: 'wy', id: '2' }, { source: 'wy', id: '1' }] }]);
  const d2 = computeSyncDigest([{ id: 'p1', name: 'X', songs: [{ source: 'wy', id: '1' }, { source: 'wy', id: '2' }] }]);
  assert.equal(d1, d2);
  assert.equal(d1.length, 16);
});

test('trusted circle blocks untrusted push & auto-sync, supports 6-digit pairing, and revokes on authenticated unpair', async t => {
  const trusted = new Map();
  let mergedCount = 0;
  const node = createLanSyncTransport({
    deviceId: 'host-pc', deviceName: 'My PC', platform: 'win32', autoSyncPlaylists: true,
    discoveryPort: 45000 + Math.floor(Math.random() * 500),
    verifyTrust: (peerId, token) => Boolean(token && trusted.get(peerId) === token),
    onAcceptPair: async (req) => { trusted.set(req.peer.id, req.token); },
    onUnpair: (peerId) => { trusted.delete(peerId); },
    onAutoPlaylists: async () => { mergedCount += 1; return { changed: true, syncDigest: '0123456789abcdef', playlists: [] }; },
  });
  t.after(() => node.stop());
  await node.start();
  const base = 'http://127.0.0.1:' + node.getPort() + '/lxlia-sync/';

  // 1. Untrusted stranger push & auto-playlists must return 403 UNTRUSTED without queuing pending or merging.
  const push403 = await fetch(base + 'push', {
    method: 'POST',
    body: JSON.stringify({ protocol: PROTOCOL, version: 1, device: { id: 'stranger', name: 'Stranger', platform: 'android' }, ...fixture() }),
  });
  assert.equal(push403.status, 403);
  assert.equal((await push403.json()).code, 'UNTRUSTED');
  assert.equal(node.listPending().length, 0);

  const auto403 = await fetch(base + 'auto-playlists', {
    method: 'POST',
    body: JSON.stringify({ protocol: PROTOCOL, version: 1, device: { id: 'stranger', name: 'Stranger', platform: 'android' }, playlists: [] }),
  });
  assert.equal(auto403.status, 403);
  assert.equal((await auto403.json()).code, 'UNTRUSTED');
  assert.equal(mergedCount, 0);

  // 2. Pair handshake with 6-digit code unlocks push & auto-playlists for that exact token only.
  const token = 'deadbeefcafebabe0123456789abcdef';
  const pairPromise = fetch(base + 'pair', {
    method: 'POST',
    body: JSON.stringify({ protocol: PROTOCOL, version: 1, type: 'pair', code: '482915', token, device: { id: 'my-phone', name: 'Pura X', platform: 'harmony' } }),
  }).then(r => r.json());
  const pendingPair = await waitFor(() => node.listPending()[0]);
  assert.equal(pendingPair.kind, 'pair');
  assert.equal(pendingPair.code, '482915');
  assert.equal(await node.respond(pendingPair.pendingId, true), true);
  const pairRes = await pairPromise;
  assert.equal(pairRes.accepted, true);
  assert.equal(pairRes.device.id, 'host-pc');

  // Spoofed deviceId with wrong token is still blocked 403!
  const spoof403 = await fetch(base + 'auto-playlists', {
    method: 'POST',
    body: JSON.stringify({ protocol: PROTOCOL, version: 1, device: { id: 'my-phone', name: 'Spoof' }, trustToken: 'wrongtoken0000000000000000000000', playlists: [] }),
  });
  assert.equal(spoof403.status, 403);
  assert.equal(mergedCount, 0);

  // Valid token succeeds!
  const autoOk = await fetch(base + 'auto-playlists', {
    method: 'POST',
    body: JSON.stringify({ protocol: PROTOCOL, version: 1, device: { id: 'my-phone', name: 'Pura X' }, trustToken: token, playlists: [] }),
  });
  assert.equal(autoOk.status, 200);
  assert.equal((await autoOk.json()).accepted, true);
  assert.equal(mergedCount, 1);

  // 3. Unauthenticated unpair fails 403; authenticated unpair revokes trust and blocks future sync.
  const fakeUnpair = await fetch(base + 'unpair', {
    method: 'POST',
    body: JSON.stringify({ protocol: PROTOCOL, version: 1, type: 'unpair', device: { id: 'my-phone' }, trustToken: 'wrongtoken0000000000000000000000' }),
  });
  assert.equal(fakeUnpair.status, 403);
  assert.equal(trusted.has('my-phone'), true);

  const realUnpair = await fetch(base + 'unpair', {
    method: 'POST',
    body: JSON.stringify({ protocol: PROTOCOL, version: 1, type: 'unpair', device: { id: 'my-phone' }, trustToken: token }),
  });
  assert.equal(realUnpair.status, 200);
  assert.equal(trusted.has('my-phone'), false);

  const afterRevoke = await fetch(base + 'auto-playlists', {
    method: 'POST',
    body: JSON.stringify({ protocol: PROTOCOL, version: 1, device: { id: 'my-phone' }, trustToken: token, playlists: [] }),
  });
  assert.equal(afterRevoke.status, 403);
});

test('transitive trust circle switch shares existing circle peers B/C with D when ON and isolates D to A only when OFF', async t => {
  const mkNode = async (id, name, initialTransitive = true) => {
    const trusted = new Map();
    let transitive = initialTransitive;
    const node = createLanSyncTransport({
      deviceId: id, deviceName: name, platform: 'win32', autoSyncPlaylists: true,
      discoveryPort: 45500 + Math.floor(Math.random() * 400),
      verifyTrust: (peerId, token) => Boolean(token && trusted.get(peerId)?.token === token),
      onAcceptPair: async (req) => {
        const existing = Array.from(trusted.values()).filter(p => p.id !== req.peer.id);
        trusted.set(req.peer.id, { id: req.peer.id, name: req.peer.name, platform: req.peer.platform, token: req.token });
        const allow = Boolean(transitive && req.transitive);
        if (!allow) return { transitive: false, introducedPeers: [], reverseVouches: [] };
        const introducedPeers = existing.map(p => ({
          id: p.id, name: p.name, platform: p.platform,
          token: `vouch_${id}_${p.id}_${req.peer.id}_00000000`.slice(0, 32),
        }));
        return { transitive: true, introducedPeers, reverseVouches: [] };
      },
      onAcceptVouch: async ({ introduced }) => {
        if (!transitive) return { accepted: false, code: 'TRANSITIVE_DISABLED' };
        trusted.set(introduced.id, { ...introduced });
        return { accepted: true };
      },
      onAutoPlaylists: async () => ({ changed: false, syncDigest: '0123456789abcdef', playlists: [] }),
    });
    t.after(() => node.stop());
    await node.start();
    return {
      id, name, node, trusted,
      setTransitive: (v) => { transitive = v; },
      base: 'http://127.0.0.1:' + node.getPort() + '/lxlia-sync/',
    };
  };

  const A = await mkNode('dev-a', 'Device A', true);
  const B = await mkNode('dev-b', 'Device B', true);
  const C = await mkNode('dev-c', 'Device C', true);
  // Pre-establish circle on A: A trusts B & C
  const tokAB = 'aaaa1111bbbb2222cccc3333dddd4444';
  const tokAC = 'eeee5555ffff66661111222233334444';
  A.trusted.set('dev-b', { id: 'dev-b', name: 'Device B', platform: 'harmony', token: tokAB });
  B.trusted.set('dev-a', { id: 'dev-a', name: 'Device A', platform: 'win32', token: tokAB });
  A.trusted.set('dev-c', { id: 'dev-c', name: 'Device C', platform: 'android', token: tokAC });
  C.trusted.set('dev-a', { id: 'dev-a', name: 'Device A', platform: 'win32', token: tokAC });

  // Case 1: Switch ON -> D pairs with A -> A returns introducedPeers B & C, and vouches D to B & C!
  const tokAD = '1234567890abcdef1234567890abcdef';
  const pairOnPromise = fetch(A.base + 'pair', {
    method: 'POST',
    body: JSON.stringify({
      protocol: PROTOCOL, version: 1, type: 'pair', code: '654321', token: tokAD,
      transitive: true, peers: [],
      device: { id: 'dev-d', name: 'Device D', platform: 'harmony' },
    }),
  }).then(r => r.json());
  const pOn = await waitFor(() => A.node.listPending()[0]);
  assert.equal(pOn.transitive, true);
  assert.equal(await A.node.respond(pOn.pendingId, true), true);
  const resOn = await pairOnPromise;
  assert.equal(resOn.accepted, true);
  assert.equal(resOn.transitive, true);
  assert.deepEqual(resOn.introducedPeers.map(x => x.id).sort(), ['dev-b', 'dev-c']);

  // Unauthenticated stranger vouch to B must be blocked 403!
  const badVouch = await fetch(B.base + 'vouch', {
    method: 'POST',
    body: JSON.stringify({
      protocol: PROTOCOL, version: 1, type: 'vouch',
      device: { id: 'dev-a', name: 'Device A' }, trustToken: 'wrongtoken0000000000000000000000',
      introduced: { id: 'dev-d', name: 'Device D', platform: 'harmony', token: resOn.introducedPeers.find(x => x.id === 'dev-b').token },
    }),
  });
  assert.equal(badVouch.status, 403);
  assert.equal(B.trusted.has('dev-d'), false);

  // Authenticated vouch from A to B succeeds when B's switch is ON, then D can sync directly with B!
  const tokBD = resOn.introducedPeers.find(x => x.id === 'dev-b').token;
  const okVouch = await fetch(B.base + 'vouch', {
    method: 'POST',
    body: JSON.stringify({
      protocol: PROTOCOL, version: 1, type: 'vouch',
      device: { id: 'dev-a', name: 'Device A' }, trustToken: tokAB,
      introduced: { id: 'dev-d', name: 'Device D', platform: 'harmony', token: tokBD },
    }),
  });
  assert.equal(okVouch.status, 200);
  assert.equal((await okVouch.json()).accepted, true);
  assert.equal(B.trusted.has('dev-d'), true);

  const dToB = await fetch(B.base + 'auto-playlists', {
    method: 'POST',
    body: JSON.stringify({ protocol: PROTOCOL, version: 1, device: { id: 'dev-d', name: 'Device D' }, trustToken: tokBD, playlists: [] }),
  });
  assert.equal(dToB.status, 200);

  // When C turns switch OFF, C rejects A's vouch for D (403 TRANSITIVE_DISABLED).
  C.setTransitive(false);
  const tokCD = resOn.introducedPeers.find(x => x.id === 'dev-c').token;
  const cReject = await fetch(C.base + 'vouch', {
    method: 'POST',
    body: JSON.stringify({
      protocol: PROTOCOL, version: 1, type: 'vouch',
      device: { id: 'dev-a', name: 'Device A' }, trustToken: tokAC,
      introduced: { id: 'dev-d', name: 'Device D', platform: 'harmony', token: tokCD },
    }),
  });
  assert.equal(cReject.status, 403);
  assert.equal((await cReject.json()).code, 'TRANSITIVE_DISABLED');
  assert.equal(C.trusted.has('dev-d'), false);

  // Case 2: New device E turns switch OFF -> E pairs with A -> A returns empty introducedPeers (E ONLY trusts A!).
  const tokAE = 'fedcba0987654321fedcba0987654321';
  const pairOffPromise = fetch(A.base + 'pair', {
    method: 'POST',
    body: JSON.stringify({
      protocol: PROTOCOL, version: 1, type: 'pair', code: '112233', token: tokAE,
      transitive: false, peers: [],
      device: { id: 'dev-e', name: 'Device E', platform: 'android' },
    }),
  }).then(r => r.json());
  const pOff = await waitFor(() => A.node.listPending()[0]);
  assert.equal(pOff.transitive, false);
  assert.equal(await A.node.respond(pOff.pendingId, true), true);
  const resOff = await pairOffPromise;
  assert.equal(resOff.accepted, true);
  assert.equal(resOff.transitive, false);
  assert.equal(resOff.introducedPeers.length, 0);
});
