import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { EventEmitter } from 'node:events';

test('entering and leaving playback preserves the material theme and resets immersive controls', () => {
  const index = fs.readFileSync(new URL('../entry/src/main/ets/pages/Index.ets', import.meta.url), 'utf8');
  const start = index.indexOf('  private playerVisibilityChanged():');
  const end = index.indexOf('  private visualStyleChanged():', start);
  const source = stripTypeScriptTypes('class Controller {\n' + index.slice(start, end) + '\n}', { mode: 'transform' });
  const Controller = vm.runInNewContext(source + ';Controller', { curves: { springMotion: () => null } });
  const controller = new Controller(), orientations = [];
  let themeReloads = 0, bars = 0, mounts = 0;
  Object.assign(controller, { showPlayer: true, stageControlsVisible: false, twoFingerActive: true,
    twoFingerStartY: 100, twoFingerLastY: 250, livePositionMs: 12400, positionMs: 500,
    applyAppearance: () => themeReloads++, updateSystemBars: () => bars++, mountPlaybackStage: () => mounts++,
    applyOrientation: visible => orientations.push(visible), syncStageControls() {},
    getUIContext: () => ({ animateTo: (_, update) => update() }) });
  controller.playerVisibilityChanged();
  assert.equal(controller.stageControlsVisible, true);
  assert.equal(controller.twoFingerActive, false);
  assert.equal(controller.twoFingerStartY, -1);
  assert.equal(controller.twoFingerLastY, -1);
  assert.equal(controller.positionMs, 12400);
  assert.equal(controller.playerReveal, 1);
  controller.showPlayer = false; controller.stageControlsVisible = false;
  controller.playerVisibilityChanged();
  assert.equal(controller.stageControlsVisible, true);
  assert.equal(controller.playerReveal, 0);
  assert.deepEqual(orientations, [true, false]);
  assert.equal(mounts, 1); assert.equal(bars, 2);
  assert.equal(themeReloads, 0, 'Reloading an unchanged color mode recreates native title materials');
});

// Run pure ArkTS services with the platform boundary replaced by deterministic test doubles.
function load(name, bindings, exports) {
  let text = fs.readFileSync(new URL(`../entry/src/main/ets/services/${name}.ets`, import.meta.url), 'utf8');
  text = text.replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g,'');
  const source = stripTypeScriptTypes(text, { mode:'transform' });
  return vm.runInNewContext(`${source}\n;({${exports.join(',')}})`, { console, setTimeout, clearTimeout, Date, Uint8Array, ArrayBuffer, ...bindings });
}
const bundle = () => ({ protocol:'lxlia-lansync/1', version:1, device:{id:'other',name:'测试设备',platform:'win32'}, settings:{}, sources:[], playlists:[] });

test('source batch skips existing and intra-selection duplicates while preserving later files and metadata', () => {
  const { SourceImportBatch } = load('SourceImports', {}, ['SourceImportBatch']);
  const script = name => `/*\n * @name ${name}\n * @version 2.0\n * @author Test\n */\nconst name = '${name}';`;
  const existing = { id: 'active', script: script('Existing') };
  const batch = new SourceImportBatch([existing]);
  batch.add('duplicate.js', script('Existing'));
  batch.add('invalid.txt', 'invalid');
  batch.add('first.js', '\uFEFF' + script('First'));
  batch.add('repeat.js', script('First'));
  batch.fail('unreadable.js', '无法读取文件');
  batch.add('last.js', script('Last'));
  assert.deepEqual(Array.from(batch.imported, item => item.name), ['First', 'Last']);
  assert.equal(batch.skipped, 2);
  assert.equal(batch.failures.length, 2);
  assert.equal(batch.imported[0].version, '2.0');
  assert.equal(batch.imported[0].author, 'Test');
  assert.notEqual(batch.imported[0].id, batch.imported[1].id);
  assert.equal(existing.id, 'active');
  assert.match(batch.report(), /unreadable.js：无法读取文件/);
});

test('restoring a paused snapshot waits for metadata readiness and hydrates without starting audio', () => {
  const index = fs.readFileSync(new URL('../entry/src/main/ets/pages/Index.ets', import.meta.url), 'utf8');
  const start = index.indexOf('  private restorePlaybackIfReady():');
  const end = index.indexOf('  private async openCast()', start);
  const source = stripTypeScriptTypes('class Controller {\n' + index.slice(start, end) + '\n}', { mode: 'transform' });
  const Controller = vm.runInNewContext(source + ';Controller', {});
  const song = { id: 'paused-song', source: 'kg' }, saved = { song, queue: [song], positionMs: 42000, playing: false };
  const assets = [], audio = [];
  const controller = Object.assign(new Controller(), { intro: false, storeReady: true, disposed: false,
    pendingPlayback: saved, resumeOnStartup: false, hostReady: false, sourceReady: false, playToken: 3, downloads: { offline: () => '' },
    songInfo: value => value, loadLyrics: (...values) => assets.push(values), playSong: (...values) => audio.push(values) });
  controller.restorePlaybackIfReady();
  assert.equal(controller.pendingPlayback, saved); assert.equal(assets.length, 0);
  controller.hostReady = true; controller.restorePlaybackIfReady();
  assert.equal(controller.pendingPlayback, null); assert.equal(controller.playing, false);
  assert.equal(assets.length, 1); assert.equal(assets[0][1], song); assert.equal(assets[0][2], 3); assert.equal(audio.length, 0);
  controller.pendingPlayback = { ...saved, playing: true }; controller.resumeOnStartup = true;
  controller.restorePlaybackIfReady(); assert.equal(audio.length, 0);
  controller.sourceReady = true; controller.restorePlaybackIfReady();
  assert.equal(audio.length, 1); assert.equal(audio[0][2], 42000); assert.equal(audio[0][3], true);
});
test('lazy rows notify when a reorder keeps the first item and count unchanged', () => {
  const { ArrayDataSource } = load('ArrayDataSource', {}, ['ArrayDataSource']);
  const first = {}, second = {}, third = {};
  const source = new ArrayDataSource([first, second, third]);
  let reloads = 0;
  source.registerDataChangeListener({ onDataReloaded() { reloads++; } });
  source.reset([first, third, second]);
  assert.equal(reloads, 1);
  assert.equal(source.getData(1), third);
  source.reset([first, third, second]);
  assert.equal(reloads, 1);
});

test('progressive lazy results retain existing rows during append and sorted insertion', () => {
  const { ArrayDataSource } = load('ArrayDataSource', {}, ['ArrayDataSource']);
  const a = {}, b = {}, c = {}, d = {};
  const source = new ArrayDataSource([a, c]);
  const added = [];
  let reloads = 0;
  source.registerDataChangeListener({ onDataReloaded() { reloads++; }, onDataAdd(index) { added.push(index); } });
  source.reset([a, c, d]);
  source.reset([a, b, c, d]);
  source.reset([a, b, c, d]);
  assert.deepEqual(added, [2, 1]);
  assert.equal(reloads, 0);
  assert.equal(source.getData(2), c);
});

test('copied catalogue props update rows by identity while appending without a full reload', () => {
  const { ArrayDataSource } = load('ArrayDataSource', {}, ['ArrayDataSource']);
  const source = new ArrayDataSource([{ id: 'a', title: 'old' }], item => item.id);
  const added = [], changed = [];
  let reloads = 0;
  source.registerDataChangeListener({ onDataReloaded() { reloads++; },
    onDataAdd(index) { added.push(index); }, onDataChange(index) { changed.push(index); } });
  source.reset([{ id: 'a', title: 'new' }, { id: 'b', title: 'next' }]);
  assert.equal(reloads, 0);
  assert.deepEqual(added, [1]); assert.deepEqual(changed, [0]);
  assert.equal(source.getData(0).title, 'new');
});

test('LAN devices retain their reported Android, HarmonyOS and desktop platform names', () => {
  const { devicePlatformName } = load('../components/Theme', { $r: value => value }, ['devicePlatformName']);
  assert.equal(devicePlatformName('android'), 'Android');
  assert.equal(devicePlatformName('harmony'), 'HarmonyOS');
  assert.equal(devicePlatformName('win32'), 'Windows');
  assert.equal(devicePlatformName('windows'), 'Windows');
  assert.equal(devicePlatformName('darwin'), 'macOS');
  assert.equal(devicePlatformName('linux'), 'Linux');
  assert.equal(devicePlatformName('container'), 'container');
});

test('large playlist import renews its idle deadline after successful pages and resolves once', async () => {
  let now = 0, sequence = 0;
  const timers = new Map();
  const { LxHost } = load('LxRuntime', {
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  }, ['LxHost']);
  const host = new LxHost();
  host.attach({ runJavaScript: () => Promise.resolve() });
  const importing = host.importPlaylist('42', 'wy');
  const advance = ms => {
    now += ms;
    for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); }
  };
  advance(119000);
  host.onResult('1', JSON.stringify({ progress: true }));
  advance(119000);
  host.onResult('1', JSON.stringify({ progress: true }));
  advance(119000);
  host.onResult('1', JSON.stringify({ ok: true, data: [{ songs: [] }] }));
  assert.equal(await importing, '[{"songs":[]}]');
  advance(200000);
  assert.equal(timers.size, 0);
});

test('aggregated native search appends delayed provider pages without inserting before displayed results', async () => {
  const source = fs.readFileSync(new URL('../entry/src/main/ets/services/SearchApi.ets', import.meta.url), 'utf8');
  const fn = stripTypeScriptTypes(source.slice(source.indexOf('export async function searchAllLx')).replace('export ', ''), { mode: 'transform' });
  const search = vm.runInNewContext(fn + ';searchAllLx', { searchLx: async (platform, _, page) => {
    await new Promise(resolve => setTimeout(resolve, platform === 'kw' ? 8 : 1));
    return { items: [{ source: platform, id: String(page) }], total: 100, hasMore: page < 2 };
  } });
  let previous = [];
  const result = await search('all', '歌曲', items => {
    assert.deepEqual(Array.from(items.slice(0, previous.length), item => item.source + item.id), previous);
    previous = Array.from(items, item => item.source + item.id);
  });
  assert.equal(result.items.length, 8);
  assert.deepEqual(Array.from(result.items, item => item.source + item.id), previous);
});

test('frequent playback persistence migrates legacy data and avoids rewriting the source store', async () => {
  const stores = new Map(), flushed = [];
  const preferences = { getPreferences: async (_, name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const values = stores.get(name);
    return { get: async (key, fallback) => values.get(key) ?? fallback,
      put: async (key, value) => values.set(key, value), flush: async () => flushed.push(name) };
  } };
  stores.set('lxlia', new Map([['playbackSnapshot', 'legacy'], ['appData', '{"sourcesJson":"preserved"}']]));
  const store = load('Store', { preferences }, ['initStore', 'loadPlaybackSnapshot', 'savePlaybackSnapshot', 'loadAppData']);
  await store.initStore({});
  assert.equal(await store.loadPlaybackSnapshot(), 'legacy');
  await store.savePlaybackSnapshot('current');
  assert.equal(await store.loadPlaybackSnapshot(), 'current');
  assert.equal((await store.loadAppData()).sourcesJson, 'preserved');
  assert.deepEqual(flushed, ['lxmine-runtime', 'lxmine-runtime']);
});
class Connection extends EventEmitter {
  constructor(id=1) { super(); this.clientId=id; this.sent=[]; }
  async send({data}) { this.sent.push(data); }
  async close() { this.emit('close'); }
  receive(bytes) { this.emit('message',{message:Uint8Array.from(bytes).buffer}); }
}
function serverFixture() {
  const tcp=new EventEmitter(); tcp.listen=async()=>{}; tcp.close=async()=>{};
  const {LanSyncServer} = load('LanSyncServer',{socket:{constructTCPSocketServerInstance:()=>tcp},buffer:Buffer},['LanSyncServer']);
  const server=new LanSyncServer(); server.setIdentity('self','Lxlia');
  return {server,tcp};
}
function httpBytes(payload,head='') {
  const body=JSON.stringify(payload);
  return Buffer.from(`POST /lxlia-sync/push HTTP/1.1\r\nContent-Length: ${Buffer.byteLength(body)}\r\n${head}\r\n${body}`);
}

test('a container transfer is addressed, fetched, and acknowledged after confirmation', async () => {
  const { server, tcp } = serverFixture();
  await server.start();
  let settled = false;
  const confirmation = server.offerPush('container', JSON.stringify(bundle())).then(value => { settled = true; return value; });
  const offer = server.pullRequests()[0];
  assert.equal(offer.receiverId, 'container');
  const wrong = new Connection(40); tcp.emit('connect', wrong);
  wrong.receive(Buffer.from(`GET /lxlia-sync/pull/${offer.id}/other HTTP/1.1\r\n\r\n`));
  assert.match(wrong.sent[0], /404/);
  const fetch = new Connection(41); tcp.emit('connect', fetch);
  fetch.receive(Buffer.from(`GET /lxlia-sync/pull/${offer.id}/container HTTP/1.1\r\n\r\n`));
  assert.equal(JSON.parse(fetch.sent[0].split('\r\n\r\n')[1]).bundle.device.id, bundle().device.id);
  assert.equal(settled, false);
  const receipt = new Connection(42); tcp.emit('connect', receipt);
  const body = JSON.stringify({ receiverId: 'container', accepted: true });
  receipt.receive(Buffer.from(`POST /lxlia-sync/receipt/${offer.id} HTTP/1.1\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`));
  assert.equal(await confirmation, true);
  assert.equal(server.pullRequests().length, 0);
  assert.match(receipt.sent[0], /"confirmed":true/);
  await server.stop();
});
test('native receiver reassembles UTF-8 across arbitrary TCP fragments and waits for confirmation',async()=>{
  const {server,tcp}=serverFixture(); await server.start(); const conn=new Connection(); tcp.emit('connect',conn);
  const bytes=httpBytes(bundle());
  for(let start=0;start<bytes.length;start+=7) conn.receive(bytes.subarray(start,start+7));
  assert.equal(conn.sent.length,0,'must not report success before user confirmation');
  assert.equal(server.pollIncoming().peerName,'测试设备');
  await server.respond(server.pollIncoming().id,true);
  assert.equal(server.pollIncoming(),null); assert.equal(conn.sent.length,1); assert.match(conn.sent[0],/"accepted":true/);
  await server.stop();
});
test('reject, disconnect and invalid protocol never apply a native sync',async()=>{
  const {server,tcp}=serverFixture(); await server.start();
  const rejected=new Connection(1); tcp.emit('connect',rejected); rejected.receive(httpBytes(bundle()));
  await server.respond(server.pollIncoming().id,false); assert.match(rejected.sent[0],/"accepted":false/);
  const gone=new Connection(2); tcp.emit('connect',gone); gone.receive(httpBytes(bundle())); await gone.close(); assert.equal(server.pollIncoming(),null);
  const invalid=new Connection(3); tcp.emit('connect',invalid); invalid.receive(httpBytes({...bundle(),version:999}));
  await new Promise(resolve=>setTimeout(resolve,0)); assert.match(invalid.sent[0],/400/); assert.equal(server.pollIncoming(),null);
  await server.stop();
});
test('native receiver rejects oversized body declarations before buffering the payload',async()=>{
  const {server,tcp}=serverFixture(); await server.start(); const conn=new Connection(); tcp.emit('connect',conn);
  conn.receive(Buffer.from('POST /lxlia-sync/push HTTP/1.1\r\nContent-Length: 999999999\r\n\r\n'));
  await new Promise(resolve=>setTimeout(resolve,0)); assert.match(conn.sent[0],/400/); await server.stop();
});
test('native LRC handles repeated timestamps, offset, enhanced words and empty gap lines',()=>{
  const {parseLrc,findLyricIndex}=load('LyricParser',{},['parseLrc','findLyricIndex']);
  const lines=parseLrc('[offset:-100]\n[00:01.20][00:03.20]hello\n[00:05.000]<00:05.000>你<00:05.500>好\n[00:07.00]\n[8000,900]<0,400>再<400,500>见');
  assert.equal(lines[0].timeMs,1100); assert.equal(lines[1].timeMs,3100); assert.equal(lines[2].words[1].timeMs,5400);
  assert.equal(lines[3].text,''); assert.equal(lines[4].words[1].timeMs,8300);
  assert.equal(findLyricIndex(lines,100),-1); assert.equal(findLyricIndex(lines,6900),3);
});
test('native LX relative words and Netease absolute YRC retain actual word timing',()=>{
  const {parseLrc}=load('LyricParser',{},['parseLrc']);
  const relative=parseLrc('[00:05.000]<0,500>你<500,600>好');
  assert.equal(relative[0].text,'你好'); assert.equal(relative[0].words[1].timeMs,5500);
  const yrc=parseLrc('[5000,1100](5000,500,0)你(5500,600,0)好');
  assert.equal(yrc[0].text,'你好'); assert.equal(yrc[0].words[1].timeMs,5500);
});
test('native grip uses system events, settles changes and unsubscribes on stop',async()=>{
  let registered,removed,scheduled; const received=[];
  const motion={HoldingHandStatus:{LEFT_HAND_HELD:1,RIGHT_HAND_HELD:2},on:(event,cb)=>{assert.equal(event,'holdingHandChanged');registered=cb;},off:(event,cb)=>{removed=cb;}};
  const {GripService}=load('GripService',{motion,canIUse:()=>true,abilityAccessCtrl:{createAtManager:()=>({requestPermissionsFromUser:async()=>({authResults:[0]})})},
    setTimeout:fn=>{scheduled=fn;return 1;},clearTimeout:()=>{scheduled=null;}},['GripService']);
  const grip=new GripService(); assert.equal(await grip.start({},side=>received.push(side)),true);
  registered(1); registered(2); scheduled(); assert.deepEqual(received,['right']);
  registered(3); scheduled(); assert.deepEqual(received,['right','center']);
  grip.stop(); assert.equal(removed,registered); assert.equal(scheduled,null);
});
test('native grip does not subscribe after backgrounding during the permission prompt',async()=>{
  let resolvePermission,subscribed=false;
  const {GripService}=load('GripService',{motion:{on:()=>{subscribed=true;}},canIUse:()=>true,
    abilityAccessCtrl:{createAtManager:()=>({requestPermissionsFromUser:()=>new Promise(resolve=>{resolvePermission=resolve;})})}},['GripService']);
  const grip=new GripService(); const start=grip.start({},()=>{}); grip.stop(); resolvePermission({authResults:[0]});
  assert.equal(await start,null); assert.equal(subscribed,false);
});
test('native discovery broadcasts to the actual subnet and replies to a new peer',async()=>{
  const udp=new EventEmitter(),sent=[]; udp.bind=async()=>{};udp.setExtraOptions=async()=>{};udp.send=async info=>{sent.push(info);};udp.close=async()=>{};
  const {LanDiscovery}=load('LanDiscovery',{socket:{constructUDPSocketInstance:()=>udp},connection:{getAllNets:async()=>[{}],getConnectionProperties:async()=>({linkAddresses:[{address:{address:'192.168.0.108'},prefixLength:24}]})},
    setInterval:()=>1,clearInterval:()=>{},buffer:Buffer},['LanDiscovery']);
  const discovery=new LanDiscovery('self','tablet');discovery.setPort(41300);await discovery.start();
  assert.ok(sent.some(info=>info.address.address==='192.168.0.255'));
  udp.emit('message',{message:Buffer.from(JSON.stringify({protocol:'lxlia-lansync/1',type:'announce',id:'pc',port:40000})),remoteInfo:{address:'192.168.0.2'}});
  assert.ok(sent.some(info=>info.address.address==='192.168.0.2')); discovery.stop();
});
test('native source sends the actual platform, quality and Kugou hashes in musicInfo',async()=>{
  const {LxHost}=load('LxRuntime',{},['LxHost']);
  const host=new LxHost(); let payload;
  host.attach({runJavaScript:async script=>{
    if(script.startsWith('window.__lxRunSource')) host.onInited(JSON.stringify({sources:{kg:{actions:['musicUrl'],qualitys:['flac','128k']}}}));
    else {
      const sandbox={window:{__lxRequest:(id,json)=>{payload=JSON.parse(json); host.onResult(id,JSON.stringify({ok:true,data:'https://example.com/a.flac'}));}}};
      vm.runInNewContext(script,sandbox);
    }
  }});
  await host.loadSource('test',{});
  assert.equal(host.quality('kg','320k'),'flac');
  await host.requestMusicUrl({source:'kg',songmid:'hash',hash:'hash',_types:{flac:{hash:'hq'}},type:'flac'});
  assert.equal(payload.source,'kg'); assert.equal(payload.info.type,'flac'); assert.equal(payload.info.musicInfo._types.flac.hash,'hq');
  await assert.rejects(host.requestMusicUrl({source:'wy'}),/不支持/); host.dispose();
});
test('native AVPlayer resets before each URL and reuses one player under concurrent switches',async()=>{
  const events=[]; let created=0;
  const player=new EventEmitter(); player.state='idle'; player.reset=async()=>{events.push('reset');player.state='idle';};
  Object.defineProperty(player,'url',{set(url){assert.equal(player.state,'idle');events.push(url);player.state='initialized';}});
  player.release=async()=>{events.push('release');};
  const {PlayerService}=load('PlayerService',{media:{createAVPlayer:async()=>{created++;return player;}}},['PlayerService']);
  const service=new PlayerService(); await Promise.all([service.playUrl('https://a.test/1',{}),service.playUrl('https://a.test/2',{})]);
  assert.equal(created,1); assert.deepEqual(events,['reset','https://a.test/2']); await service.release();
});

function playbackFixture() {
  const player = new EventEmitter();
  const played = [], seeks = [];
  player.state = 'idle'; player.duration = 10000;
  player.reset = async () => { player.state = 'idle'; player.emit('stateChange', 'idle'); };
  player.prepare = async () => {};
  player.play = async () => { played.push(player.fdSrc); player.state = 'playing'; player.emit('stateChange', 'playing'); };
  player.pause = async () => { player.state = 'paused'; player.emit('stateChange', 'paused'); };
  player.seek = position => seeks.push(position);
  player.release = async () => {};
  const { PlayerService } = load('PlayerService', {
    media: { createAVPlayer: async () => player, SeekMode: { SEEK_CLOSEST: 0 } },
    fileIo: { openSync: () => ({ fd: 1 }), closeSync() {}, statSync: () => ({ size: 1024 }), OpenMode: { READ_ONLY: 0 } },
  }, ['PlayerService']);
  const service = new PlayerService();
  return { player, service, played, seeks };
}

test('native local switches restore autoplay and requested position after a pause', async () => {
  const { player, service, played, seeks } = playbackFixture();
  await service.ensurePlayer(); service.context = { filesDir: '/files' };
  await service.pause();
  await service.playFile('/files/song.mp3', {}, 1250);
  player.emit('stateChange', 'prepared');
  assert.equal(played.length, 1); assert.deepEqual(seeks, [1250]);
  await service.release();
});

test('system pause during native prepare wins over the pending autoplay request', async () => {
  const { player, service, played } = playbackFixture();
  await service.ensurePlayer(); service.context = { filesDir: '/files' };
  await service.playFile('/files/song.mp3', {});
  await service.pause();
  player.emit('stateChange', 'prepared');
  assert.equal(played.length, 0);
  await service.release();
});

test('system pause during URL resolution survives the later source assignment', async () => {
  const { player, service, played } = playbackFixture();
  await service.ensurePlayer();
  const intent = service.beginSwitch(true);
  await service.pauseForSwitch();
  await service.pause();
  await service.playUrl('https://a.test/new.mp3', {}, 0, true, intent);
  player.emit('stateChange', 'prepared');
  assert.equal(played.length, 0);
  await service.release();
});

test('system resume while switching records intent without resuming the previous source', async () => {
  const { player, service, played } = playbackFixture();
  await service.ensurePlayer(); player.state = 'paused';
  const intent = service.beginSwitch(false);
  await service.resume();
  assert.equal(played.length, 0);
  await service.playUrl('https://a.test/new.mp3', {}, 0, false, intent);
  player.emit('stateChange', 'prepared');
  assert.equal(played.length, 1);
  await service.release();
});

test('native metadata replaces missing artwork and clears the previous lyrics', async () => {
  const artwork = { release: async () => {} }, remote = { release: async () => {} }, updates = [];
  const { PlayerService } = load('PlayerService', {
    $r: () => ({ id: 1 }),
    http: { createHttp: () => ({ request: async () => ({ responseCode: 200, result: new Uint8Array([2]).buffer }), destroy() {} }), RequestMethod: { GET: 0 }, HttpDataType: { ARRAY_BUFFER: 0 } },
    image: { createImageSource: bytes => ({ createPixelMap: async () => new Uint8Array(bytes)[0] === 2 ? remote : artwork, release: async () => {} }) },
  }, ['PlayerService']);
  const service = new PlayerService();
  service.context = { resourceManager: { getMediaContent: async () => new Uint8Array([1]) } };
  service.session = { setAVMetadata: async metadata => updates.push(metadata), destroy: async () => {} };
  service.current = { source: 'kw', id: 'old', name: 'Old', coverUrl: 'https://a.test/cover.jpg' };
  service.lyricText = 'Old lyrics'; service.updateMetadata(); await service.metadataChain;
  assert.equal(updates.at(-1).mediaImage, remote, 'a real remote cover must remain album artwork');
  service.current = { source: 'kw', id: 'new', name: 'New', coverUrl: '' };
  service.lyricText = ''; service.updateMetadata(); await service.metadataChain;
  assert.equal(updates.at(-1).assetId, 'kw:new');
  assert.equal(updates.at(-1).mediaImage, artwork);
  assert.equal(updates.at(-1).lyric, '');
  await service.release();
});

test('native local artwork decodes the own-file cover and rejects an outdated cover update', async () => {
  const artwork = { release: async () => {} }, updates = [], opened = [];
  const { PlayerService } = load('PlayerService', {
    fileIo: { openSync: path => { opened.push(path); return { fd: 9 }; }, closeSync() {}, OpenMode: { READ_ONLY: 0 } },
    image: { createImageSource: fd => { assert.equal(fd, 9); return { createPixelMap: async () => artwork, release: async () => {} }; } },
  }, ['PlayerService']);
  const service = new PlayerService();
  service.context = { filesDir: '/files' };
  service.session = { setAVMetadata: async metadata => updates.push(metadata), destroy: async () => {} };
  service.current = { source: 'local', id: 'local', name: 'Local', coverUrl: 'file:///files/LocalMusic/cover.jpg' };
  service.updateMetadata(); await service.metadataChain;
  assert.equal(updates.at(-1).mediaImage, artwork);
  assert.deepEqual(opened, ['/files/LocalMusic/cover.jpg']);
  service.setArtwork({ source: 'local', id: 'old', coverUrl: 'file:///files/wrong.jpg' });
  assert.equal(updates.length, 1);
  await service.release();
});
