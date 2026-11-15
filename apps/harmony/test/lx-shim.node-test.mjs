import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.resolve(here, '../entry/src/main/resources/rawfile/lx-runtime');

function createRuntime(t) {
  const results = new Map();
  const events = { inited: null };
  let nextId = 0;

  const native = {
    onResult(id, json) {
      const parsed = JSON.parse(json);
      results.set(id, parsed);
      const waiter = waiters.get(id);
      if (waiter) waiter(parsed);
    },
    onInited(json) {
      events.inited = JSON.parse(json);
    },
    httpRequest(id, payloadJson) {
      const payload = JSON.parse(payloadJson);
      fetch(payload.url, {
        method: (payload.method || 'get').toUpperCase(),
        headers: payload.headers,
      }).then(async response => {
        const text = await response.text();
        let body = text;
        try { body = JSON.parse(text); } catch { /* 非 JSON 保留原文 */ }
        context.__lxHttpResult(id, JSON.stringify({
          response: { statusCode: response.status, headers: {}, body },
        }));
      }).catch(error => {
        context.__lxHttpResult(id, JSON.stringify({ error: error.message }));
      });
    },
  };

  const waiters = new Map();
  const context = {
    console,
    TextEncoder,
    TextDecoder,
    btoa,
    atob,
    crypto: webcrypto,
    Promise,
    setTimeout,
    clearTimeout,
    JSON,
    __lxNative: native,
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);

  for (const file of ['vendor/crypto-js.min.js', 'vendor/pako.min.js', 'lx-shim.js']) {
    const source = fs.readFileSync(path.join(rawDir, file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }

  const request = (payload) => new Promise(resolve => {
    const id = String(++nextId);
    waiters.set(id, resolve);
    context.__lxRequest(id, JSON.stringify(payload));
  });
  t.after(() => results.clear());
  return { context, events, request };
}

test('shim exposes the LX API surface', (t) => {
  const { context } = createRuntime(t);
  assert.equal(typeof context.lx.on, 'function');
  assert.equal(typeof context.lx.request, 'function');
  assert.equal(typeof context.lx.utils.crypto.aesEncrypt, 'function');
  assert.equal(context.lx.version, '2.0.0');
});

test('runs a source and returns musicUrl', async (t) => {
  const { context, events, request } = createRuntime(t);
  vm.runInContext(`
    lx.on(lx.EVENT_NAMES.request, ({ action }) => {
      if (action === 'musicUrl') return 'https://cdn.example.com/track.mp3'
      return null
    })
    lx.send(lx.EVENT_NAMES.inited, { sources: { kw: { type: 'music', actions: ['musicUrl'], qualitys: ['128k'] } } })
  `, context);
  assert.deepEqual(events.inited.sources.kw.type, 'music');

  const result = await request({ source: 'kw', action: 'musicUrl', info: { songmid: '1' } });
  assert.equal(result.ok, true);
  assert.equal(result.data, 'https://cdn.example.com/track.mp3');
});

test('lx.request goes through the native HTTP bridge', async (t) => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ url: 'https://cdn.example.com/bridged.mp3' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  t.after(() => server.close());

  const { context, request } = createRuntime(t);
  vm.runInContext(`
    lx.on(lx.EVENT_NAMES.request, ({ action }) => new Promise((resolve, reject) => {
      lx.request('http://127.0.0.1:${port}/url', { method: 'get' }, (err, resp) => {
        if (err) return reject(err)
        resolve(resp.body.url)
      })
    }))
    lx.send(lx.EVENT_NAMES.inited, { sources: {} })
  `, context);

  const result = await request({ source: 'kw', action: 'musicUrl', info: {} });
  assert.equal(result.ok, true);
  assert.equal(result.data, 'https://cdn.example.com/bridged.mp3');
});

test('crypto helpers behave like the desktop runtime', (t) => {
  const { context } = createRuntime(t);
  assert.equal(context.lx.utils.crypto.md5('a'), '0cc175b9c0f1b6a831c399e269772661');
  const key = context.lx.utils.buffer.from('0123456789abcdef', 'binary');
  const iv = context.lx.utils.buffer.from('fedcba9876543210', 'binary');
  const plain = context.lx.utils.buffer.from('hello lxlia', 'binary');
  const encrypted = context.lx.utils.crypto.aesEncrypt(plain, 'aes-128-cbc', key, iv);
  assert.ok(encrypted.length > 0);
  assert.equal(encrypted.length % 16, 0);
});

test('zlib utilities round-trip', async (t) => {
  const { context } = createRuntime(t);
  const deflated = await context.lx.utils.zlib.deflate(context.lx.utils.buffer.from('hello world', 'binary'));
  const inflated = await context.lx.utils.zlib.inflate(deflated);
  assert.equal(inflated.toString(), 'hello world');
});
