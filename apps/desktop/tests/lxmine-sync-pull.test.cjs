const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const { EventEmitter } = require('node:events');
const { createLanSyncTransport, PROTOCOL } = require('../desktop/lansync/transport.cjs');

test('a container retrieves its addressed bundle and the sender waits for the receipt', async t => {
  const messages = [];
  const udp = new EventEmitter();
  udp.bind = (...args) => args.at(-1)();
  udp.setBroadcast = () => {};
  udp.send = bytes => messages.push(JSON.parse(bytes.toString()));
  udp.close = () => {};
  const createSocket = dgram.createSocket;
  dgram.createSocket = () => udp;
  const sender = createLanSyncTransport({ deviceId: 'sender', deviceName: 'Windows', platform: 'win32' });
  t.after(() => sender.stop());
  try { await sender.start(); } finally { dgram.createSocket = createSocket; }
  udp.emit('message', Buffer.from(JSON.stringify({ protocol: PROTOCOL, type: 'announce', id: 'container',
    name: 'Android container', platform: 'android', port: 9, receiveMode: 'pull' })), { address: '127.0.0.1' });
  assert.equal(sender.listDevices()[0].receiveMode, 'pull');
  const bundle = { protocol: PROTOCOL, version: 1, device: { id: 'sender', platform: 'win32' },
    sources: [{ id: 'source', script: '私有脚本' }], playlists: [], settings: {} };
  const base = 'http://127.0.0.1:' + sender.getPort() + '/lxlia-sync/';
  for (const accepted of [true, false]) {
    let settled = false;
    const confirmation = sender.send('container', bundle).then(result => { settled = true; return result; });
    const offer = messages.at(-1).pullRequests[0];
    assert.equal(offer.receiverId, 'container');
    assert(!JSON.stringify(messages.at(-1)).includes('私有脚本'), 'Discovery broadcasts only transfer metadata');
    assert.equal((await fetch(base + 'pull/' + offer.id + '/other-device')).status, 404);
    const response = await fetch(base + 'pull/' + offer.id + '/container');
    assert.deepEqual((await response.json()).bundle, bundle);
    assert.equal(settled, false, 'Retrieval must not acknowledge an unconfirmed transfer');
    const wrong = await fetch(base + 'receipt/' + offer.id, { method: 'POST',
      body: JSON.stringify({ receiverId: 'other-device', accepted: true }) });
    assert.equal(wrong.status, 404);
    assert.equal(settled, false);
    const receipt = await fetch(base + 'receipt/' + offer.id, { method: 'POST',
      body: JSON.stringify({ receiverId: 'container', accepted }) });
    assert.equal(receipt.status, 200);
    assert.equal((await confirmation).accepted, accepted);
    assert.equal((await fetch(base + 'pull/' + offer.id + '/container')).status, 404);
  }
  const pending = sender.send('container', bundle);
  const stopped = assert.rejects(pending, /server stopped/);
  sender.stop();
  await stopped;
});
