import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { EventEmitter } from 'node:events';

// Run pure ArkTS services with the platform boundary replaced by deterministic test doubles.
function load(name, bindings, exports) {
  let text = fs.readFileSync(new URL(`../entry/src/main/ets/services/${name}.ets`, import.meta.url), 'utf8');
  text = text.replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g,'');
  const source = stripTypeScriptTypes(text, { mode:'transform' });
  return vm.runInNewContext(`${source}\n;({${exports.join(',')}})`, { console, setTimeout, clearTimeout, Date, Uint8Array, ArrayBuffer, ...bindings });
}
const bundle = () => ({ protocol:'lxlia-lansync/1', version:1, device:{id:'other',name:'测试设备',platform:'win32'}, settings:{}, sources:[], playlists:[] });
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
  const udp=new EventEmitter(),sent=[]; udp.bind=async()=>{};udp.setExtraOptions=async()=>{};udp.send=async info=>{sent.push(info);};udp.close=()=>{};
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
  assert.equal(created,1); assert.deepEqual(events,['reset','https://a.test/1','reset','https://a.test/2']); await service.release();
});
