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
    onIncomingPair,
    onDevicesChanged,
    onAccept,
    onAcceptPair,
    onAcceptVouch,
    onUnpair,
    verifyTrust,
  } = options;

  const isTrustedToken = (peerId, token) => {
    if (typeof verifyTrust !== 'function') return false;
    try {
      return verifyTrust(String(peerId || ''), String(token || '')) === true;
    } catch {
      return false;
    }
  };

  const devices = new Map();
  const pending = new Map();
  const outgoingPull = new Map();
  const rejectedPairAt = new Map();
  let autoSyncPlaylists = Boolean(options.autoSyncPlaylists);
  let udp = null;
  let server = null;
  let announceTimer = null;
  let cleanupTimer = null;
  let port = null;

  const localAddresses = () => {
    const list = [];
    try {
      for (const entries of Object.values(os.networkInterfaces())) {
        for (const entry of entries || []) {
          if (entry.internal || entry.family !== 'IPv4' || !entry.address) continue;
          if (entry.address.startsWith('169.254.')) continue;
          list.push(entry.address);
        }
      }
    } catch {}
    return list;
  };

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
    let syncDigest = '';
    try {
      syncDigest = typeof options.getSyncDigest === 'function' ? String(options.getSyncDigest() || '') : '';
    } catch {}
    const message = Buffer.from(JSON.stringify({
      protocol: PROTOCOL,
      type: 'announce',
      id: deviceId,
      name: deviceName,
      platform,
      port,
      autoSyncPlaylists,
      syncDigest,
      pullRequests: Array.from(outgoingPull, ([id, entry]) => ({ id, receiverId: entry.receiverId, kind: entry.kind || 'push' })),
      ts: Date.now(),
    }));
    try {
      const addresses = new Set(directAddress ? [directAddress] : ['255.255.255.255']);
      if (!directAddress) for (const entries of Object.values(os.networkInterfaces())) for (const entry of entries || []) {
        if (entry.internal || entry.family !== 'IPv4') continue;
        const address = entry.address.split('.').map(Number), mask = entry.netmask.split('.').map(Number);
        addresses.add(address.map((part, index) => part | (255 ^ mask[index])).join('.'));
      }
      for (const address of addresses) udp.send(message, discoveryPort, address, () => {});
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
      receiveMode: message.receiveMode === 'pull' ? 'pull' : 'direct',
      autoSyncPlaylists: message.autoSyncPlaylists === true,
      syncDigest: typeof message.syncDigest === 'string' ? message.syncDigest : '',
      lastSeen: Date.now(),
    };
    if (firstSeen) announce(rinfo.address);
    const previous = devices.get(next.id);
    devices.set(next.id, next);
    if (!previous || previous.name !== next.name || previous.address !== next.address ||
        previous.port !== next.port || previous.receiveMode !== next.receiveMode ||
        previous.autoSyncPlaylists !== next.autoSyncPlaylists ||
        previous.syncDigest !== next.syncDigest) emitDevices();
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

  const handlePair = async (req, res) => {
    let body;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw);
    } catch (error) {
      jsonResponse(res, 400, { accepted: false, message: `invalid pair request: ${error.message}` });
      return;
    }
    const peerId = String(body?.device?.id || '');
    const code = String(body?.code || '');
    const token = String(body?.token || '');
    if (!body || body.protocol !== PROTOCOL || body.version !== 1 || body.type !== 'pair' ||
        !peerId || peerId === deviceId || !/^\d{6}$/.test(code) || token.length < 16) {
      jsonResponse(res, 400, { accepted: false, message: 'invalid pair protocol' });
      return;
    }
    if (isTrustedToken(peerId, token)) {
      jsonResponse(res, 200, {
        accepted: true,
        device: { id: deviceId, name: deviceName, platform },
        message: 'already trusted',
      });
      return;
    }
    const lastRejected = rejectedPairAt.get(peerId) || 0;
    if (Date.now() - lastRejected < 10000) {
      jsonResponse(res, 429, { accepted: false, code: 'RATE_LIMITED', message: '对方刚刚拒绝了请求，请稍后再试' });
      return;
    }
    for (const existing of pending.values()) {
      if (existing.peer?.id === peerId) {
        jsonResponse(res, 409, { accepted: false, code: 'PENDING', message: '对方已有待处理的请求，请在对方屏幕确认' });
        return;
      }
    }
    if (pending.size >= 3) {
      jsonResponse(res, 429, { accepted: false, code: 'BUSY', message: '对方待处理请求过多，请稍后再试' });
      return;
    }
    const pendingId = crypto.randomUUID();
    const peer = {
      id: peerId,
      name: String(body.device.name || 'LxMine'),
      platform: String(body.device.platform || 'unknown'),
      address: req.socket.remoteAddress?.replace(/^::ffff:/, '') || '',
    };
    const peerList = Array.isArray(body.peers)
      ? body.peers
          .filter(item => item && typeof item.id === 'string' && item.id && item.id !== deviceId && item.id !== peerId)
          .slice(0, 32)
          .map(item => ({
            id: String(item.id),
            name: String(item.name || 'LxMine'),
            platform: String(item.platform || 'unknown'),
          }))
      : [];
    const pairRequest = {
      peer,
      code,
      token,
      transitive: body.transitive === true,
      peers: peerList,
      raw: body,
    };
    onIncomingPair?.(peer, pairRequest, pendingId);
    const timer = setTimeout(() => {
      const entry = pending.get(pendingId);
      if (!entry) return;
      pending.delete(pendingId);
      entry.reject?.(new Error('timeout'));
    }, PENDING_TTL_MS);
    if (typeof timer.unref === 'function') timer.unref();
    pending.set(pendingId, {
      kind: 'pair',
      code,
      token,
      resolve(result) {
        clearTimeout(timer);
        jsonResponse(res, 200, result);
      },
      reject(error) {
        clearTimeout(timer);
        jsonResponse(res, 500, { accepted: false, message: error?.message || 'failed' });
      },
      peer,
      summary: null,
      bundle: pairRequest,
      lastError: '',
    });
    res.once('close', () => {
      if (!res.writableEnded) { clearTimeout(timer); pending.delete(pendingId); }
    });
  };

  const handleVouch = async (req, res) => {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw);
      const peerId = String(body?.device?.id || '');
      const token = String(body?.trustToken || '');
      const intro = body?.introduced;
      const introId = String(intro?.id || '').trim();
      const introToken = String(intro?.token || '').trim();
      if (!body || body.protocol !== PROTOCOL || body.version !== 1 || body.type !== 'vouch' ||
          !peerId || !introId || introId === deviceId || introToken.length < 16) {
        jsonResponse(res, 400, { accepted: false, code: 'INVALID', message: 'invalid vouch payload' });
        return;
      }
      if (!isTrustedToken(peerId, token)) {
        jsonResponse(res, 403, { accepted: false, code: 'UNTRUSTED', message: '设备不在信任圈内' });
        return;
      }
      if (typeof onAcceptVouch !== 'function') {
        jsonResponse(res, 403, { accepted: false, code: 'TRANSITIVE_DISABLED', message: '未开启信任圈成员互通' });
        return;
      }
      const resData = await onAcceptVouch({
        voucherId: peerId,
        introduced: {
          id: introId,
          name: String(intro?.name || 'LxMine'),
          platform: String(intro?.platform || 'unknown'),
          token: introToken,
        },
      });
      if (resData && resData.accepted === false) {
        jsonResponse(res, 403, {
          accepted: false,
          code: resData.code || 'TRANSITIVE_DISABLED',
          message: resData.message || '对方未开启信任圈成员互通',
        });
        return;
      }
      jsonResponse(res, 200, { accepted: true });
    } catch {
      jsonResponse(res, 400, { accepted: false, code: 'INVALID' });
    }
  };

  const handleUnpair = async (req, res) => {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw);
      const peerId = String(body?.device?.id || '');
      const token = String(body?.trustToken || '');
      if (!body || body.protocol !== PROTOCOL || !peerId || !isTrustedToken(peerId, token)) {
        jsonResponse(res, 403, { ok: false, code: 'UNTRUSTED' });
        return;
      }
      await onUnpair?.(peerId);
      jsonResponse(res, 200, { ok: true });
    } catch {
      jsonResponse(res, 400, { ok: false });
    }
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
    if (!isTrustedToken(bundle.device.id, bundle.trustToken)) {
      jsonResponse(res, 403, { accepted: false, code: 'UNTRUSTED', message: '设备不在信任圈内，请先加入信任圈' });
      return;
    }
    if (pending.size >= 3) {
      jsonResponse(res, 429, { accepted: false, message: '对方待处理请求过多' });
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
      kind: 'push',
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
      if (req.method === 'POST' && url === '/lxlia-sync/pair') {
        void handlePair(req, res);
        return;
      }
      if (req.method === 'POST' && url === '/lxlia-sync/vouch') {
        void handleVouch(req, res);
        return;
      }
      if (req.method === 'POST' && url === '/lxlia-sync/unpair') {
        void handleUnpair(req, res);
        return;
      }
      if (req.method === 'POST' && url === '/lxlia-sync/push') {
        void handlePush(req, res);
        return;
      }
      if (req.method === 'POST' && url === '/lxlia-sync/auto-playlists') {
        if (!autoSyncPlaylists || typeof options.onAutoPlaylists !== 'function') {
          jsonResponse(res, 403, { accepted: false, message: 'auto sync disabled' });
          return;
        }
        void readBody(req).then(async raw => {
          const bundle = JSON.parse(raw);
          if (!bundle || bundle.protocol !== PROTOCOL || bundle.version !== 1 || !bundle.device?.id || bundle.device.id === deviceId || !Array.isArray(bundle.playlists)) {
            jsonResponse(res, 400, { accepted: false, message: 'invalid auto-sync payload' });
            return;
          }
          if (!isTrustedToken(bundle.device.id, bundle.trustToken)) {
            jsonResponse(res, 403, { accepted: false, code: 'UNTRUSTED', message: '设备不在信任圈内' });
            return;
          }
          const result = await options.onAutoPlaylists(bundle.device, bundle);
          jsonResponse(res, 200, {
            accepted: true,
            changed: Boolean(result?.changed),
            syncDigest: typeof result?.syncDigest === 'string' ? result.syncDigest : '',
            playlists: Array.isArray(result?.playlists) ? result.playlists : [],
          });
        }).catch(error => jsonResponse(res, 500, { accepted: false, message: error?.message || 'failed' }));
        return;
      }
      const parts = url.split('?')[0].split('/');
      if (req.method === 'GET' && parts.length === 5 && parts[1] === 'lxlia-sync' && parts[2] === 'pull') {
        let entry;
        try {
          entry = outgoingPull.get(decodeURIComponent(parts[3]));
          if (entry?.receiverId !== decodeURIComponent(parts[4])) entry = null;
        } catch { /* An invalid path cannot select a transfer. */ }
        if (!entry) jsonResponse(res, 404, { message: 'request expired' });
        else jsonResponse(res, 200, { bundle: JSON.parse(entry.payload) });
        return;
      }
      if (req.method === 'POST' && parts.length === 4 && parts[1] === 'lxlia-sync' && parts[2] === 'receipt') {
        void readBody(req).then(raw => {
          const id = decodeURIComponent(parts[3]), receipt = JSON.parse(raw), entry = outgoingPull.get(id);
          if (!entry || receipt.receiverId !== entry.receiverId || typeof receipt.accepted !== 'boolean') {
            jsonResponse(res, 404, { confirmed: false });
            return;
          }
          outgoingPull.delete(id);
          clearTimeout(entry.timer);
          jsonResponse(res, 200, { confirmed: true });
          entry.resolve({
            accepted: receipt.accepted,
            code: receipt.code || '',
            device: receipt.device || null,
            transitive: receipt.transitive === true,
            introducedPeers: Array.isArray(receipt.introducedPeers) ? receipt.introducedPeers : [],
            acceptedIntroducedIds: Array.isArray(receipt.acceptedIntroducedIds) ? receipt.acceptedIntroducedIds : [],
            message: receipt.message || '',
          });
        }).catch(() => jsonResponse(res, 400, { confirmed: false }));
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
    const preferredPorts = [41300, 41301, 41302, 41303, 41304, 41305, 0];
    let attempt = 0;
    const tryListen = () => {
      const targetPort = preferredPorts[attempt++];
      const onError = err => {
        if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES') && attempt < preferredPorts.length) {
          tryListen();
          return;
        }
        reject(err);
      };
      server.once('error', onError);
      server.listen(targetPort, '0.0.0.0', () => {
        server.off('error', onError);
        port = server.address().port;
        resolve(port);
      });
    };
    tryListen();
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
      for (const entry of outgoingPull.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('server stopped'));
      }
      outgoingPull.clear();
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
    localAddresses,
    getPort: () => port,
    getAutoSync: () => autoSyncPlaylists,
    setAutoSync(enabled) {
      const next = Boolean(enabled);
      if (autoSyncPlaylists === next) return;
      autoSyncPlaylists = next;
      announce();
    },
    announceNow() {
      announce();
    },
    listPending: () => Array.from(pending.entries()).map(([pendingId, entry]) => ({
      pendingId,
      kind: entry.kind || 'push',
      code: entry.code || '',
      transitive: Boolean(entry.bundle?.transitive),
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
      if (entry.kind === 'pair') {
        let pairExtra = null;
        if (accepted) {
          try {
            pairExtra = (await onAcceptPair?.(entry.bundle)) || null;
          } catch (error) {
            entry.lastError = error?.message || '保存信任设备失败';
            entry.applying = false;
            return false;
          }
        } else if (entry.peer?.id) {
          rejectedPairAt.set(entry.peer.id, Date.now());
        }
        pending.delete(pendingId);
        entry.resolve({
          accepted: Boolean(accepted),
          device: accepted ? { id: deviceId, name: deviceName, platform } : null,
          transitive: Boolean(accepted && pairExtra?.transitive),
          introducedPeers: accepted && Array.isArray(pairExtra?.introducedPeers) ? pairExtra.introducedPeers : [],
          reverseVouches: accepted && Array.isArray(pairExtra?.reverseVouches) ? pairExtra.reverseVouches : [],
          message: message || (accepted ? 'accepted' : '对方拒绝了信任请求'),
        });
        return true;
      }
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
    /** 向一台已发现的设备发起加入信任圈请求（支持 Android pull 容器模式）。 */
    sendPair(targetDeviceId, pairPayload) {
      const device = devices.get(targetDeviceId);
      if (!device) throw new Error('device not found');
      const payload = JSON.stringify(pairPayload);
      if (device.receiveMode === 'pull') {
        return new Promise((resolve, reject) => {
          const id = crypto.randomUUID();
          const timer = setTimeout(() => {
            outgoingPull.delete(id);
            reject(new Error('信任确认超时'));
          }, PENDING_TTL_MS);
          outgoingPull.set(id, { receiverId: device.id, kind: 'pair', payload, timer, resolve, reject });
          announce();
        });
      }
      return new Promise((resolve, reject) => {
        const request = http.request({
          host: device.address,
          port: device.port,
          path: '/lxlia-sync/pair',
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
        request.on('timeout', () => request.destroy(new Error('信任确认超时')));
        request.on('error', reject);
        request.end(payload);
      });
    },
    /** 向信任圈内在线设备发送引荐消息（支持 Android pull 容器模式）。 */
    sendVouch(targetDeviceId, vouchPayload, timeoutMs = 8000) {
      const device = devices.get(targetDeviceId);
      if (!device) throw new Error('device not found');
      const payload = JSON.stringify(vouchPayload);
      if (device.receiveMode === 'pull') {
        return new Promise((resolve, reject) => {
          const id = crypto.randomUUID();
          const timer = setTimeout(() => {
            outgoingPull.delete(id);
            reject(new Error('vouch pull timeout'));
          }, Math.max(timeoutMs, 15000));
          if (typeof timer.unref === 'function') timer.unref();
          outgoingPull.set(id, { receiverId: device.id, kind: 'vouch', payload, timer, resolve, reject });
          announce();
        });
      }
      return new Promise((resolve, reject) => {
        const request = http.request({
          host: device.address,
          port: device.port,
          path: '/lxlia-sync/vouch',
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'content-length': Buffer.byteLength(payload),
          },
          timeout: timeoutMs,
        }, response => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (error) {
              reject(new Error(`invalid vouch response: ${error.message}`));
            }
          });
        });
        request.on('timeout', () => request.destroy(new Error('vouch timeout')));
        request.on('error', reject);
        request.end(payload);
      });
    },
    pingDirect(address, targetPort, timeoutMs = 4000) {
      return new Promise((resolve, reject) => {
        const request = http.request({
          host: String(address).trim(),
          port: Number(targetPort),
          path: '/lxlia-sync/ping',
          method: 'GET',
          timeout: timeoutMs,
        }, response => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => {
            try {
              const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              if (response.statusCode === 200 && data?.protocol === PROTOCOL) resolve(data);
              else reject(new Error('目标地址不是有效的 LxMine 设备'));
            } catch (error) {
              reject(new Error(`invalid ping response: ${error.message}`));
            }
          });
        });
        request.on('timeout', () => request.destroy(new Error('连接目标设备超时')));
        request.on('error', reject);
        request.end();
      });
    },
    /** 向一台已发现的设备推送 bundle，等待对方确认。 */
    send(deviceId, bundle) {
      const device = devices.get(deviceId);
      if (!device) throw new Error('device not found');
      const payload = JSON.stringify(bundle);
      if (device.receiveMode === 'pull') {
        return new Promise((resolve, reject) => {
          const id = crypto.randomUUID();
          const timer = setTimeout(() => {
            outgoingPull.delete(id);
            reject(new Error('sync confirmation timeout'));
          }, PENDING_TTL_MS);
          outgoingPull.set(id, { receiverId: device.id, kind: 'push', payload, timer, resolve, reject });
          announce();
        });
      }
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
    sendDirect(address, targetPort, bundle, reqPath = '/lxlia-sync/push', timeoutMs = PENDING_TTL_MS + 5000) {
      const payload = JSON.stringify(bundle);
      return new Promise((resolve, reject) => {
        const request = http.request({
          host: String(address).trim(),
          port: Number(targetPort),
          path: reqPath,
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'content-length': Buffer.byteLength(payload),
          },
          timeout: timeoutMs,
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
