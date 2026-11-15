'use strict';

// 局域网一键同步的传输层：UDP 广播发现 + HTTP 推送。
// 纯 Node 实现（不依赖 Electron），便于单测；Electron 侧只负责把设置 / 音源 / 歌单
// 组装进 bundle，以及确认对话框的事件转发。
//
// 协议：docs/LANSYNC.md
// - 发现：UDP 41234 广播 announce（每 3 秒），10 秒未更新视为离线。
// - 传输：接收方 HTTP 服务器随机端口；发送方 POST /lxlia-sync/push。
// - 接收：请求会挂起，直到接收方在本机确认（或拒绝/超时）。

const dgram = require('node:dgram');
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');

const PROTOCOL = 'lxlia-lansync/1';
const DISCOVERY_PORT = 41234;
const ANNOUNCE_INTERVAL_MS = 3000;
const STALE_MS = 10000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const PENDING_TTL_MS = 120000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Bundle too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function jsonResponse(res, status, payload) {
  if (res.destroyed || res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * 创建局域网同步节点。
 * @param {object} options
 * @param {string} options.deviceId 设备唯一 id
 * @param {string} options.deviceName 设备名（展示用）
 * @param {string} options.platform 'win32' | 'harmony' | ...
 * @param {number} [options.discoveryPort]
 * @param {(peer: object, bundle: object, pendingId: string) => object|null} [options.onIncoming]
 *        收到推送时调用；返回给本机 UI 的摘要（可为 null）。
 * @param {(devices: object[]) => void} [options.onDevicesChanged]
 * @param {(bundle: object) => void} [options.onAccept] 接收方确认后、回复发送方前应用数据
 */
function createLanSyncTransport(options) {
  const {
    deviceId,
    deviceName,
    platform,
    discoveryPort = DISCOVERY_PORT,
    onIncoming,
    onDevicesChanged,
    onAccept,
  } = options;

  const devices = new Map();
  const pending = new Map();
  let udp = null;
  let server = null;
  let announceTimer = null;
  let cleanupTimer = null;
  let port = null;

  const snapshotDevices = () => Array.from(devices.values())
    .sort((left, right) => left.name.localeCompare(right.name));

  const emitDevices = () => {
    try {
      onDevicesChanged?.(snapshotDevices());
    } catch {
      // 展示层错误不影响发现。
    }
  };

  const announce = (directAddress) => {
    if (!udp) return;
    const message = Buffer.from(JSON.stringify({
      protocol: PROTOCOL,
      type: 'announce',
      id: deviceId,
      name: deviceName,
      platform,
      port,
      ts: Date.now(),
    }));
    try {
      const addresses = new Set(directAddress ? [directAddress] : ['255.255.255.255']);
      if (!directAddress) for (const entries of Object.values(os.networkInterfaces())) for (const entry of entries || []) {
        if (entry.internal || entry.family !== 'IPv4') continue;
        const address = entry.address.split('.').map(Number), mask = entry.netmask.split('.').map(Number);
        addresses.add(address.map((part, index) => part | (255 ^ mask[index])).join('.'));
      }
      for (const address of addresses) udp.send(message, discoveryPort, address);
    } catch {
      // 广播失败（例如未联网）时等待下一轮。
    }
  };

  const upsertDevice = (message, rinfo) => {
    if (!message || message.protocol !== PROTOCOL || message.id === deviceId) return;
    if (!message.port || !message.id) return;
    const firstSeen = !devices.has(String(message.id));
    const next = {
      id: String(message.id),
      name: String(message.name || 'LxMine'),
      platform: String(message.platform || 'unknown'),
      address: rinfo.address,
      port: Number(message.port),
      lastSeen: Date.now(),
    };
    if (firstSeen) announce(rinfo.address);
    const previous = devices.get(next.id);
    devices.set(next.id, next);
    if (!previous || previous.name !== next.name || previous.address !== next.address) emitDevices();
  };

  const pruneDevices = () => {
    const now = Date.now();
    let changed = false;
    for (const [id, device] of devices) {
      if (now - device.lastSeen > STALE_MS) {
        devices.delete(id);
        changed = true;
      }
    }
    if (changed) emitDevices();
  };

  const handlePush = async (req, res) => {
    let bundle;
    try {
      const raw = await readBody(req);
      bundle = JSON.parse(raw);
    } catch (error) {
      jsonResponse(res, 400, { accepted: false, message: `invalid bundle: ${error.message}` });
      return;
    }
    if (!bundle || bundle.protocol !== PROTOCOL || bundle.version !== 1 || !bundle.device?.id ||
        (bundle.sources !== undefined && !Array.isArray(bundle.sources)) ||
        (bundle.playlists !== undefined && !Array.isArray(bundle.playlists))) {
      jsonResponse(res, 400, { accepted: false, message: 'invalid bundle protocol' });
      return;
    }
    if (bundle.device.id === deviceId) {
      jsonResponse(res, 400, { accepted: false, message: 'cannot sync with self' });
      return;
    }

    const pendingId = crypto.randomUUID();
    const peer = {
      id: String(bundle.device.id),
      name: String(bundle.device.name || 'LxMine'),
      platform: String(bundle.device.platform || 'unknown'),
      address: req.socket.remoteAddress?.replace(/^::ffff:/, '') || '',
    };

    const summary = onIncoming ? onIncoming(peer, bundle, pendingId) : null;
    const timer = setTimeout(() => {
      const entry = pending.get(pendingId);
      if (!entry) return;
      pending.delete(pendingId);
      entry.reject?.(new Error('timeout'));
    }, PENDING_TTL_MS);
    if (typeof timer.unref === 'function') timer.unref();

    pending.set(pendingId, {
      resolve(result) {
        clearTimeout(timer);
        jsonResponse(res, 200, result);
      },
      reject(error) {
        clearTimeout(timer);
        jsonResponse(res, 500, { accepted: false, message: error?.message || 'failed' });
      },
      peer,
      summary,
      bundle,
      lastError: '',
    });
    res.once('close', () => {
      if (!res.writableEnded) { clearTimeout(timer); pending.delete(pendingId); }
    });
  };

  // 手机端拉取用的待同步 bundle（同一时间只保留最新一份）。
  let pullBundle = null;

  const startServer = () => new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = req.url || '/';
      if (req.method === 'GET' && url === '/lxlia-sync/ping') {
        jsonResponse(res, 200, { protocol: PROTOCOL, id: deviceId, name: deviceName, platform, port });
        return;
      }
      if (req.method === 'POST' && url === '/lxlia-sync/push') {
        void handlePush(req, res);
        return;
      }
      if (req.method === 'GET' && url.startsWith('/lxlia-sync/pull')) {
        if (!pullBundle) {
          jsonResponse(res, 204, {});
          return;
        }
        const bundle = pullBundle;
        pullBundle = null;
        jsonResponse(res, 200, bundle);
        return;
      }
      jsonResponse(res, 404, { message: 'not found' });
    });
    server.on('error', reject);
    server.listen(0, '0.0.0.0', () => {
      port = server.address().port;
      resolve(port);
    });
  });

  const startDiscovery = () => new Promise((resolve, reject) => {
    udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    udp.on('error', reject);
    udp.on('message', (buffer, rinfo) => {
      try {
        const message = JSON.parse(buffer.toString('utf8'));
        if (message.type === 'bye') {
          if (devices.delete(String(message.id))) emitDevices();
          return;
        }
        upsertDevice(message, rinfo);
      } catch {
        // 忽略非本协议的广播。
      }
    });
    udp.bind(discoveryPort, '0.0.0.0', () => {
      try {
        udp.setBroadcast(true);
      } catch {
        // 某些网络栈不允许设置广播，仍可通过 loopback 发现本机实例。
      }
      announce();
      announceTimer = setInterval(announce, ANNOUNCE_INTERVAL_MS);
      cleanupTimer = setInterval(pruneDevices, ANNOUNCE_INTERVAL_MS);
      if (typeof announceTimer.unref === 'function') announceTimer.unref();
      if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
      resolve();
    });
  });

  return {
    protocol: PROTOCOL,
    async start() {
      if (server) return { port };
      await startServer();
      await startDiscovery();
      return { port };
    },
    stop() {
      if (udp) {
        try {
          udp.send(Buffer.from(JSON.stringify({ protocol: PROTOCOL, type: 'bye', id: deviceId })), discoveryPort, '255.255.255.255');
        } catch {
          // 尽力广播离开消息。
        }
        clearInterval(announceTimer);
        clearInterval(cleanupTimer);
        try { udp.close(); } catch { /* 已关闭 */ }
        udp = null;
      }
      if (server) {
        for (const entry of pending.values()) entry.reject(new Error('server stopped'));
        pending.clear();
        try { server.close(); } catch { /* 已关闭 */ }
        server = null;
      }
      port = null;
    },
    listDevices: snapshotDevices,
    getPort: () => port,
    listPending: () => Array.from(pending.entries()).map(([pendingId, entry]) => ({
      pendingId,
      peer: entry.peer,
      summary: entry.summary,
      playlists: Array.isArray(entry.bundle?.playlists) ? entry.bundle.playlists : [],
      receivedAt: Date.now(),
      lastError: entry.lastError || '',
    })),
    getPendingBundle: (pendingId) => pending.get(pendingId)?.bundle ?? null,
    queueForPull(_deviceId, bundle) {
      pullBundle = bundle;
      return true;
    },
    async respond(pendingId, accepted, message) {
      const entry = pending.get(pendingId);
      if (!entry || entry.applying) return false;
      entry.applying = true;
      if (accepted) {
        try {
          await onAccept?.(entry.bundle);
        } catch (error) {
          // Keep the request and phone's acknowledgement open for a retry.
          entry.lastError = error?.message || '保存失败';
          entry.applying = false;
          return false;
        }
      }
      pending.delete(pendingId);
      entry.resolve({ accepted: Boolean(accepted), message: message || (accepted ? 'accepted' : 'rejected') });
      return true;
    },
    /** 向一台已发现的设备推送 bundle，等待对方确认。 */
    send(deviceId, bundle) {
      const device = devices.get(deviceId);
      if (!device) throw new Error('device not found');
      const payload = JSON.stringify(bundle);
      return new Promise((resolve, reject) => {
        const request = http.request({
          host: device.address,
          port: device.port,
          path: '/lxlia-sync/push',
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'content-length': Buffer.byteLength(payload),
          },
          timeout: PENDING_TTL_MS + 5000,
        }, response => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (error) {
              reject(new Error(`invalid response: ${error.message}`));
            }
          });
        });
        request.on('timeout', () => request.destroy(new Error('sync request timeout')));
        request.on('error', reject);
        request.end(payload);
      });
    },
  };
}

module.exports = {
  PROTOCOL,
  DISCOVERY_PORT,
  createLanSyncTransport,
};
