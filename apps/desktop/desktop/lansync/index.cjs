'use strict';

// Electron 侧的局域网同步：设备身份、bundle 组装/应用、IPC 与事件。
// 传输细节（UDP 发现 + HTTP 推送）在 transport.cjs；本文件只处理业务数据。

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { ipcMain, BrowserWindow } = require('electron');
const { PROTOCOL, createLanSyncTransport } = require('./transport.cjs');

const DEVICE_FILE = 'lansync-device.json';
const TRUSTED_FILE = 'lansync-trusted.json';
const VOUCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function safeTokenEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length < 16 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function loadTrustedState(userDataPath) {
  const file = path.join(userDataPath, TRUSTED_FILE);
  const map = new Map();
  let transitive = true;
  const pendingVouches = [];
  const now = Date.now();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rawList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.devices) ? parsed.devices : []);
    if (parsed && !Array.isArray(parsed) && typeof parsed.transitive === 'boolean') {
      transitive = parsed.transitive;
    }
    for (const item of rawList) {
      if (!item || typeof item.id !== 'string' || !item.id || typeof item.token !== 'string' || item.token.length < 16) continue;
      map.set(item.id, {
        id: item.id,
        name: String(item.name || 'LxMine'),
        platform: String(item.platform || 'unknown'),
        token: item.token,
        trustedAt: Number(item.trustedAt) || now,
      });
    }
    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.pendingVouches)) {
      for (const v of parsed.pendingVouches) {
        if (!v || typeof v.targetId !== 'string' || !v.targetId) continue;
        const intro = v.introduced;
        if (!intro || typeof intro.id !== 'string' || !intro.id || typeof intro.token !== 'string' || intro.token.length < 16) continue;
        const createdAt = Number(v.createdAt) || now;
        if (now - createdAt > VOUCH_TTL_MS) continue;
        pendingVouches.push({
          targetId: v.targetId,
          introduced: {
            id: intro.id,
            name: String(intro.name || 'LxMine'),
            platform: String(intro.platform || 'unknown'),
            token: intro.token,
          },
          createdAt,
        });
      }
    }
  } catch {
    // 首次运行或无信任记录。
  }
  return { map, transitive, pendingVouches };
}

function saveTrustedState(userDataPath, map, transitive, pendingVouches) {
  const file = path.join(userDataPath, TRUSTED_FILE);
  const temp = file + '.tmp';
  const payload = {
    version: 1,
    transitive: Boolean(transitive),
    devices: Array.from(map.values()),
    pendingVouches: Array.isArray(pendingVouches) ? pendingVouches.slice(0, 64) : [],
  };
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(temp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(temp, file);
  } catch {
    try { fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8'); } catch {}
  }
}

function generatePairCode(input) {
  const raw = String(input || '').replace(/\s+/g, '');
  if (/^\d{6}$/.test(raw)) return raw;
  return String(crypto.randomInt(100000, 1000000));
}

function loadIdentity(userDataPath) {
  const file = path.join(userDataPath, DEVICE_FILE);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed?.id) return parsed;
  } catch {
    // 首次运行或文件损坏：重新生成。
  }
  const identity = {
    id: `lxlia-${crypto.randomBytes(6).toString('hex')}`,
    name: String(os.hostname() || 'LxMine'),
    createdAt: Date.now(),
  };
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(identity, null, 2), 'utf8');
  } catch {
    // 身份写入失败时仍可使用内存中的临时身份。
  }
  return identity;
}

function broadcastToWindows(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(channel, payload);
  }
}

function readSources(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed?.sources) ? parsed.sources : [];
  } catch {
    return [];
  }
}

function readActiveSourceId(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')).activeId ?? null; } catch { return null; }
}

function writeSources(filePath, sources, activeId) {
  const nextActive = activeId && sources.some(source => source.id === activeId)
    ? activeId
    : null;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ activeId: nextActive, sources }, null, 2), 'utf8');
}

/**
 * @param {object} deps
 * @param {string} deps.userDataPath
 * @param {() => Record<string, unknown>} deps.getSettings
 * @param {(settings: Record<string, unknown>) => number} deps.applySettings
 * @param {string} deps.sourcesFilePath lx-sources.json 路径
 */
function createLanSync(deps) {
  const identity = loadIdentity(deps.userDataPath);
  const loadedTrust = loadTrustedState(deps.userDataPath);
  const trustedMap = loadedTrust.map;
  let trustCircleTransitive = loadedTrust.transitive;
  let pendingVouches = loadedTrust.pendingVouches;
  let started = false;
  let autoSyncTimer = null;
  let reconcileTimer = null;
  let suppressAutoSyncUntil = 0;
  let lastAutoToastAt = 0;
  const inFlightPeers = new Set();
  const inFlightVouches = new Set();
  const vouchBackoffUntil = new Map();
  const exchangedPairs = new Map();
  const peerBackoffUntil = new Map();

  const persistTrusted = () => saveTrustedState(deps.userDataPath, trustedMap, trustCircleTransitive, pendingVouches);

  const publicTrustedList = () => Array.from(trustedMap.values())
    .sort((a, b) => (b.trustedAt || 0) - (a.trustedAt || 0))
    .map(({ id, name, platform, trustedAt }) => ({ id, name, platform, trustedAt }));

  const broadcastTrusted = () => {
    broadcastToWindows('lansync-trusted-changed', publicTrustedList());
  };

  const addTrustedDevice = (peer, token, { silent = false } = {}) => {
    const id = String(peer?.id || '').trim();
    const secret = String(token || '').trim();
    if (!id || id === identity.id || secret.length < 16) throw new Error('无效的信任设备信息');
    trustedMap.set(id, {
      id,
      name: String(peer?.name || 'LxMine'),
      platform: String(peer?.platform || 'unknown'),
      token: secret,
      trustedAt: Date.now(),
    });
    persistTrusted();
    peerBackoffUntil.delete(id);
    exchangedPairs.delete(id);
    if (!silent) {
      broadcastTrusted();
      if (transport.getAutoSync()) {
        transport.announceNow();
        scheduleReconcile(250, true);
      }
    }
  };

  const removeTrustedLocal = (peerId) => {
    const id = String(peerId || '').trim();
    const removed = trustedMap.get(id);
    if (!removed) return null;
    trustedMap.delete(id);
    pendingVouches = pendingVouches.filter(v => v.targetId !== id && v.introduced?.id !== id);
    persistTrusted();
    exchangedPairs.delete(id);
    peerBackoffUntil.delete(id);
    broadcastTrusted();
    return removed;
  };

  const queuePendingVouch = (targetId, introduced) => {
    const tid = String(targetId || '').trim();
    const introId = String(introduced?.id || '').trim();
    const introToken = String(introduced?.token || '').trim();
    if (!tid || !introId || tid === identity.id || introId === identity.id || tid === introId || introToken.length < 16) return;
    if (!trustedMap.has(tid)) return;
    const now = Date.now();
    pendingVouches = pendingVouches.filter(v =>
      (now - (v.createdAt || 0) <= VOUCH_TTL_MS) && !(v.targetId === tid && v.introduced?.id === introId)
    );
    pendingVouches.push({
      targetId: tid,
      introduced: {
        id: introId,
        name: String(introduced.name || 'LxMine'),
        platform: String(introduced.platform || 'unknown'),
        token: introToken,
      },
      createdAt: now,
    });
    if (pendingVouches.length > 64) pendingVouches = pendingVouches.slice(-64);
    persistTrusted();
    vouchBackoffUntil.delete(`${tid}|${introId}`);
    void flushPendingVouches().catch(() => {});
  };

  const flushPendingVouches = async () => {
    if (!pendingVouches.length) return;
    const now = Date.now();
    const beforeLen = pendingVouches.length;
    pendingVouches = pendingVouches.filter(v =>
      (now - (v.createdAt || 0) <= VOUCH_TTL_MS) && trustedMap.has(v.targetId)
    );
    if (pendingVouches.length !== beforeLen) persistTrusted();
    if (!pendingVouches.length) return;
    const onlineById = new Map(transport.listDevices().map(d => [d.id, d]));
    const snapshot = pendingVouches.slice();
    await Promise.allSettled(snapshot.map(async item => {
      const key = `${item.targetId}|${item.introduced.id}`;
      if (inFlightVouches.has(key)) return;
      if (Date.now() < (vouchBackoffUntil.get(key) || 0)) return;
      const targetOnline = onlineById.get(item.targetId);
      const trustedTarget = trustedMap.get(item.targetId);
      if (!targetOnline || !trustedTarget) return;
      inFlightVouches.add(key);
      try {
        const res = await transport.sendVouch(item.targetId, {
          protocol: PROTOCOL,
          version: 1,
          type: 'vouch',
          device: { id: identity.id, name: identity.name, platform: process.platform },
          trustToken: trustedTarget.token,
          introduced: item.introduced,
        });
        if (res?.accepted || res?.code === 'TRANSITIVE_DISABLED' || res?.code === 'UNTRUSTED') {
          pendingVouches = pendingVouches.filter(v => !(v.targetId === item.targetId && v.introduced.id === item.introduced.id));
          persistTrusted();
          vouchBackoffUntil.delete(key);
        } else {
          vouchBackoffUntil.set(key, Date.now() + 5000);
        }
      } catch {
        vouchBackoffUntil.set(key, Date.now() + 5000);
      } finally {
        inFlightVouches.delete(key);
      }
    }));
  };

  const verifyTrust = (peerId, token) => {
    const entry = trustedMap.get(String(peerId || ''));
    if (!entry) return false;
    return safeTokenEqual(entry.token, token);
  };

  const applyBundle = async (bundle) => {
    const result = await deps.data.apply(bundle);
    const library = deps.library.listSync();
    if (!library.ok || library.count !== result.playlistsCount) throw new Error('同步后歌单数量校验失败');
    suppressAutoSyncUntil = Date.now() + 3000;
    exchangedPairs.clear();
    transport.announceNow();
    broadcastToWindows('lansync-applied', { settings: bundle.settings, library, ...result });
    return result;
  };

  const notifyAutoMerged = (result) => {
    suppressAutoSyncUntil = Date.now() + 2500;
    const library = deps.library.listSync();
    const now = Date.now();
    const quiet = now - lastAutoToastAt < 2500;
    if (!quiet) lastAutoToastAt = now;
    broadcastToWindows('lansync-applied', { autoSync: true, quiet, library, ...result });
  };

  const scheduleReconcile = (delayMs = 350, forceLocalPush = false) => {
    if (!transport.getAutoSync()) return;
    clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(() => {
      void reconcileAutoSyncPeers(forceLocalPush).catch(() => {});
    }, delayMs);
    if (typeof reconcileTimer.unref === 'function') reconcileTimer.unref();
  };

  const transport = createLanSyncTransport({
    deviceId: identity.id,
    deviceName: identity.name,
    platform: process.platform,
    verifyTrust,
    getSyncDigest: () => deps.data.getSyncDigest(),
    onDevicesChanged: devices => {
      let nameUpdated = false;
      for (const dev of devices) {
        const entry = trustedMap.get(dev.id);
        if (entry && dev.name && entry.name !== dev.name) {
          entry.name = dev.name;
          nameUpdated = true;
        }
      }
      if (nameUpdated) {
        persistTrusted();
        broadcastTrusted();
      }
      broadcastToWindows('lansync-devices-changed', devices);
      void flushPendingVouches().catch(() => {});
      if (transport.getAutoSync()) scheduleReconcile(350, false);
    },
    onAccept: applyBundle,
    async onAcceptPair(pairRequest) {
      const existingPeers = Array.from(trustedMap.values()).filter(p => p.id !== pairRequest.peer.id);
      addTrustedDevice(pairRequest.peer, pairRequest.token, { silent: true });
      const introducedPeers = [];
      const reverseVouches = [];
      const allowTransitive = Boolean(trustCircleTransitive && pairRequest.transitive);
      if (allowTransitive) {
        const initiatorKnown = new Set((pairRequest.peers || []).map(p => p.id));
        for (const p of existingPeers) {
          if (initiatorKnown.has(p.id)) continue;
          const freshToken = crypto.randomBytes(16).toString('hex');
          introducedPeers.push({ id: p.id, name: p.name, platform: p.platform, token: freshToken });
          queuePendingVouch(p.id, {
            id: pairRequest.peer.id,
            name: pairRequest.peer.name,
            platform: pairRequest.peer.platform,
            token: freshToken,
          });
        }
        for (const q of (pairRequest.peers || [])) {
          if (!q?.id || q.id === identity.id || q.id === pairRequest.peer.id || trustedMap.has(q.id)) continue;
          const revToken = crypto.randomBytes(16).toString('hex');
          addTrustedDevice(q, revToken, { silent: true });
          reverseVouches.push({ id: q.id, name: q.name, platform: q.platform, token: revToken });
        }
      }
      broadcastTrusted();
      if (transport.getAutoSync()) {
        transport.announceNow();
        scheduleReconcile(250, true);
      }
      return { transitive: allowTransitive, introducedPeers, reverseVouches };
    },
    async onAcceptVouch({ introduced }) {
      if (!trustCircleTransitive) {
        return { accepted: false, code: 'TRANSITIVE_DISABLED', message: '对方未开启信任圈成员互通' };
      }
      addTrustedDevice(introduced, introduced.token);
      return { accepted: true };
    },
    onUnpair(peerId) {
      removeTrustedLocal(peerId);
    },
    async onAutoPlaylists(peer, bundle) {
      const result = await deps.data.mergePlaylists(bundle.playlists || []);
      const peerId = String(peer?.id || '');
      if (peerId) {
        const peerDigest = typeof bundle.syncDigest === 'string' ? bundle.syncDigest : '';
        exchangedPairs.set(peerId, `${result.syncDigest}|${peerDigest}`);
      }
      if (result.changed) {
        notifyAutoMerged(result);
        transport.announceNow();
        // Propagate merged state to any 3rd/4th trusted device on the LAN.
        scheduleReconcile(450, false);
      }
      return result;
    },
    onIncoming(peer, bundle, pendingId) {
      // 只保留展示所需的摘要，完整 bundle 留在 transport 的 pending 里。
      const summary = {
        settings: Object.keys(bundle.settings || {}).length,
        sources: Array.isArray(bundle.sources) ? bundle.sources.length : 0,
        playlists: Array.isArray(bundle.playlists) ? bundle.playlists.length : 0,
        createdAt: bundle.createdAt ?? null,
      };
      broadcastToWindows('lansync-incoming', {
        pendingId,
        kind: 'push',
        peer,
        summary,
        playlists: Array.isArray(bundle.playlists) ? bundle.playlists : [],
      });
      return summary;
    },
    onIncomingPair(peer, pairRequest, pendingId) {
      broadcastToWindows('lansync-incoming', {
        pendingId,
        kind: 'pair',
        code: pairRequest.code,
        transitive: Boolean(pairRequest.transitive),
        peer,
        summary: null,
        playlists: [],
      });
    },
  });

  const start = async () => {
    if (started) return;
    await transport.start();
    started = true;
  };

  const stop = () => {
    transport.stop();
    started = false;
  };

  const status = () => ({
    deviceId: identity.id,
    deviceName: identity.name,
    platform: process.platform,
    port: transport.getPort(),
    addresses: transport.localAddresses(),
    autoSync: transport.getAutoSync(),
    trustCircleTransitive,
    trustedCount: trustedMap.size,
    discovery: started,
  });

  const buildBundle = (trustToken = '') => ({
    protocol: PROTOCOL, version: 1, createdAt: Date.now(),
    device: { id: identity.id, name: identity.name, platform: process.platform },
    trustToken,
    ...deps.data.snapshot(),
  });

  const reconcileAutoSyncPeers = async (forceLocalPush = false) => {
    if (!transport.getAutoSync()) return { pushed: 0, merged: 0 };
    if (trustedMap.size === 0) return { pushed: 0, merged: 0 };
    if (forceLocalPush && Date.now() < suppressAutoSyncUntil) forceLocalPush = false;
    if (!started) await start();
    const myDigest = deps.data.getSyncDigest();
    const now = Date.now();
    const allPeers = transport.listDevices().filter(device => device.autoSyncPlaylists && device.port > 0 && trustedMap.has(device.id));
    if (!allPeers.length) return { pushed: 0, merged: 0 };

    const targets = allPeers.filter(peer => {
      if (inFlightPeers.has(peer.id)) return false;
      if (now < (peerBackoffUntil.get(peer.id) || 0)) return false;
      if (peer.syncDigest && peer.syncDigest === myDigest) {
        peerBackoffUntil.delete(peer.id);
        return false;
      }
      const pairKey = `${myDigest}|${peer.syncDigest || ''}`;
      if (!forceLocalPush && exchangedPairs.get(peer.id) === pairKey) return false;
      if (peer.receiveMode === 'pull') {
        // Android (including 卓易通) pulls outbound automatically upon seeing our syncDigest,
        // and we also try a quick direct push on local edit for normal LAN Android devices.
        return forceLocalPush;
      }
      return forceLocalPush || identity.id < peer.id || !peer.syncDigest;
    });
    if (!targets.length) return { pushed: 0, merged: 0 };

    const snapshot = deps.data.snapshot();
    const basePayload = {
      protocol: PROTOCOL,
      version: 1,
      createdAt: Date.now(),
      device: { id: identity.id, name: identity.name, platform: process.platform },
      syncDigest: myDigest,
      playlists: snapshot.playlists,
    };
    let pushed = 0;
    let mergedAny = false;
    await Promise.allSettled(targets.map(async peer => {
      const trusted = trustedMap.get(peer.id);
      if (!trusted) return;
      inFlightPeers.add(peer.id);
      try {
        const timeoutMs = peer.receiveMode === 'pull' ? 3500 : 10000;
        const payload = { ...basePayload, trustToken: trusted.token };
        const res = await transport.sendDirect(peer.address, peer.port, payload, '/lxlia-sync/auto-playlists', timeoutMs);
        if (res?.code === 'UNTRUSTED') {
          peerBackoffUntil.set(peer.id, Date.now() + 30000);
          return;
        }
        if (res?.accepted) {
          pushed += 1;
          peerBackoffUntil.delete(peer.id);
          let postDigest = deps.data.getSyncDigest();
          if (Array.isArray(res.playlists) && res.playlists.length > 0) {
            const mergeRes = await deps.data.mergePlaylists(res.playlists);
            postDigest = mergeRes.syncDigest;
            if (mergeRes.changed) {
              mergedAny = true;
              notifyAutoMerged(mergeRes);
            }
          }
          const remoteDigest = typeof res.syncDigest === 'string' && res.syncDigest ? res.syncDigest : (peer.syncDigest || '');
          exchangedPairs.set(peer.id, `${postDigest}|${remoteDigest}`);
        }
      } catch {
        peerBackoffUntil.set(peer.id, Date.now() + 5000);
      } finally {
        inFlightPeers.delete(peer.id);
      }
    }));
    if (mergedAny) {
      transport.announceNow();
      scheduleReconcile(450, false);
    }
    return { pushed, merged: mergedAny ? 1 : 0 };
  };

  const triggerAutoSync = () => {
    if (!transport.getAutoSync() || trustedMap.size === 0 || Date.now() < suppressAutoSyncUntil) return { scheduled: false };
    transport.announceNow();
    clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => { void reconcileAutoSyncPeers(true).catch(() => {}); }, 700);
    if (typeof autoSyncTimer.unref === 'function') autoSyncTimer.unref();
    return { scheduled: true };
  };

  return {
    start,
    stop,
    status,
    devices: () => transport.listDevices(),
    trusted: publicTrustedList,
    pending: () => transport.listPending(),
    setAutoSync(enabled) {
      transport.setAutoSync(Boolean(enabled));
      if (enabled) {
        exchangedPairs.clear();
        transport.announceNow();
        scheduleReconcile(250, true);
      }
      return { ok: true, autoSync: transport.getAutoSync() };
    },
    setTrustCircleTransitive(enabled) {
      trustCircleTransitive = Boolean(enabled);
      persistTrusted();
      return { ok: true, trustCircleTransitive };
    },
    triggerAutoSync,
    async pair(deviceId, codeInput) {
      if (!started) await start();
      const targetId = String(deviceId || '').trim();
      const device = transport.listDevices().find(item => item.id === targetId);
      if (!device) throw new Error('设备当前不在线，请刷新后重试');
      const code = generatePairCode(codeInput);
      const token = crypto.randomBytes(16).toString('hex');
      const ownPeers = trustCircleTransitive
        ? Array.from(trustedMap.values())
            .filter(p => p.id !== targetId)
            .slice(0, 32)
            .map(({ id, name, platform }) => ({ id, name, platform }))
        : [];
      const preIntroduced = (trustCircleTransitive && device.receiveMode === 'pull')
        ? ownPeers.map(p => ({ ...p, token: crypto.randomBytes(16).toString('hex') }))
        : [];
      const payload = {
        protocol: PROTOCOL,
        version: 1,
        type: 'pair',
        code,
        token,
        transitive: trustCircleTransitive,
        peers: ownPeers,
        ...(preIntroduced.length ? { introducedPeers: preIntroduced } : {}),
        device: { id: identity.id, name: identity.name, platform: process.platform },
      };
      const result = await transport.sendPair(targetId, payload);
      let introducedCount = 0;
      if (result?.accepted) {
        const peer = result.device?.id ? result.device : { id: device.id, name: device.name, platform: device.platform };
        addTrustedDevice(peer, token, { silent: true });
        if (trustCircleTransitive && result.transitive === true) {
          if (device.receiveMode === 'pull' && preIntroduced.length) {
            const acceptedSet = new Set(Array.isArray(result.acceptedIntroducedIds) ? result.acceptedIntroducedIds : []);
            for (const pre of preIntroduced) {
              if (!acceptedSet.size || acceptedSet.has(pre.id)) {
                queuePendingVouch(pre.id, { id: peer.id, name: peer.name, platform: peer.platform, token: pre.token });
              }
            }
          }
          for (const intro of (Array.isArray(result.introducedPeers) ? result.introducedPeers : [])) {
            if (!intro?.id || intro.id === identity.id || intro.id === peer.id || String(intro.token || '').length < 16) continue;
            if (trustedMap.has(intro.id)) continue;
            addTrustedDevice(intro, intro.token, { silent: true });
            introducedCount += 1;
          }
          for (const rv of (Array.isArray(result.reverseVouches) ? result.reverseVouches : [])) {
            if (!rv?.id || rv.id === identity.id || String(rv.token || '').length < 16 || !trustedMap.has(rv.id)) continue;
            queuePendingVouch(rv.id, { id: peer.id, name: peer.name, platform: peer.platform, token: rv.token });
          }
        }
        broadcastTrusted();
        if (transport.getAutoSync()) {
          transport.announceNow();
          scheduleReconcile(250, true);
        }
      }
      return {
        accepted: Boolean(result?.accepted),
        code,
        peerName: result?.device?.name || device.name,
        introducedCount,
        message: result?.message || (result?.accepted ? '已加入信任圈' : '对方未接受信任请求'),
      };
    },
    async removeTrusted(peerId) {
      const removed = removeTrustedLocal(peerId);
      if (!removed) return { ok: true, removed: false };
      const online = transport.listDevices().find(item => item.id === removed.id);
      if (online && online.receiveMode !== 'pull' && online.port > 0) {
        void transport.sendDirect(online.address, online.port, {
          protocol: PROTOCOL,
          version: 1,
          type: 'unpair',
          device: { id: identity.id, name: identity.name, platform: process.platform },
          trustToken: removed.token,
        }, '/lxlia-sync/unpair', 4000).catch(() => {});
      }
      return { ok: true, removed: true };
    },
    async send(deviceId) {
      if (!started) await start();
      const targetId = String(deviceId || '').trim();
      const trusted = trustedMap.get(targetId);
      if (!trusted) {
        return { accepted: false, code: 'UNTRUSTED', message: '该设备尚未加入信任圈，请先点击「加入信任圈」' };
      }
      return transport.send(targetId, buildBundle(trusted.token));
    },
    async sendDirect(target, codeInput) {
      if (!started) await start();
      const raw = String(target || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
      if (!raw) throw new Error('请输入对端设备的局域网 IP 地址');
      const [hostPart, portPart] = raw.split(':');
      const address = (hostPart || '').trim();
      const portNum = portPart ? Number(portPart) : 41300;
      if (!address || !Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error('地址格式无效，请输入如 192.168.1.10:41300');
      }
      const pingInfo = await transport.pingDirect(address, portNum, 5000);
      const peerId = String(pingInfo?.id || '').trim();
      if (!peerId) throw new Error('无法识别对端设备身份');
      if (peerId === identity.id) throw new Error('不能向本机自身发送同步');
      const peerName = String(pingInfo?.name || `${address}:${portNum}`);
      const peerPlatform = String(pingInfo?.platform || 'unknown');
      const trusted = trustedMap.get(peerId);
      if (!trusted) {
        const code = generatePairCode(codeInput);
        const token = crypto.randomBytes(16).toString('hex');
        const ownPeers = trustCircleTransitive
          ? Array.from(trustedMap.values())
              .filter(p => p.id !== peerId)
              .slice(0, 32)
              .map(({ id, name, platform }) => ({ id, name, platform }))
          : [];
        const pairRes = await transport.sendDirect(address, portNum, {
          protocol: PROTOCOL,
          version: 1,
          type: 'pair',
          code,
          token,
          transitive: trustCircleTransitive,
          peers: ownPeers,
          device: { id: identity.id, name: identity.name, platform: process.platform },
        }, '/lxlia-sync/pair');
        let introducedCount = 0;
        if (pairRes?.accepted) {
          const peerObj = { id: peerId, name: pairRes?.device?.name || peerName, platform: pairRes?.device?.platform || peerPlatform };
          addTrustedDevice(peerObj, token, { silent: true });
          if (trustCircleTransitive && pairRes.transitive === true) {
            for (const intro of (Array.isArray(pairRes.introducedPeers) ? pairRes.introducedPeers : [])) {
              if (!intro?.id || intro.id === identity.id || intro.id === peerId || String(intro.token || '').length < 16) continue;
              if (trustedMap.has(intro.id)) continue;
              addTrustedDevice(intro, intro.token, { silent: true });
              introducedCount += 1;
            }
            for (const rv of (Array.isArray(pairRes.reverseVouches) ? pairRes.reverseVouches : [])) {
              if (!rv?.id || rv.id === identity.id || String(rv.token || '').length < 16 || !trustedMap.has(rv.id)) continue;
              queuePendingVouch(rv.id, { id: peerObj.id, name: peerObj.name, platform: peerObj.platform, token: rv.token });
            }
          }
          broadcastTrusted();
          if (transport.getAutoSync()) {
            transport.announceNow();
            scheduleReconcile(250, true);
          }
        }
        return {
          mode: 'pair',
          accepted: Boolean(pairRes?.accepted),
          code,
          peerName: pairRes?.device?.name || peerName,
          introducedCount,
          message: pairRes?.message || (pairRes?.accepted ? '已加入信任圈' : '对方未接受信任请求'),
        };
      }
      const pushRes = await transport.sendDirect(address, portNum, buildBundle(trusted.token), '/lxlia-sync/push');
      return {
        mode: 'push',
        peerName,
        ...pushRes,
      };
    },
    async respond(pendingId, accepted) {
      const entry = transport.listPending().find(item => item.pendingId === pendingId);
      if (!entry) return { ok: false, code: 'PENDING_NOT_FOUND', message: '请求已过期，请重新发送' };
      const bundle = transport.getPendingBundle(pendingId);
      const ok = await transport.respond(pendingId, Boolean(accepted), accepted ? 'accepted' : 'rejected');
      return {
        ok,
        kind: entry.kind || 'push',
        message: ok ? '' : transport.listPending().find(item => item.pendingId === pendingId)?.lastError || '正在处理，请稍候',
        accepted: Boolean(accepted),
        playlists: ok && accepted && entry.kind !== 'pair' && Array.isArray(bundle?.playlists) ? bundle.playlists : [],
      };
    },
    applyBundle,
  };
}

function registerLanSyncIpc(manager, trusted) {
  const handle = (channel, action) => ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('不受信任的同步页面');
    return action(...args);
  });
  handle('lansync-status', () => manager.status());
  handle('lansync-devices', () => manager.devices());
  handle('lansync-trusted', () => manager.trusted());
  handle('lansync-pair', (id, code) => manager.pair(id, code));
  handle('lansync-remove-trusted', id => manager.removeTrusted(id));
  handle('lansync-pending', () => manager.pending());
  handle('lansync-send', id => manager.send(id));
  handle('lansync-send-direct', (target, code) => manager.sendDirect(target, code));
  handle('lansync-auto-sync', enabled => manager.setAutoSync(enabled));
  handle('lansync-set-transitive', enabled => manager.setTrustCircleTransitive(enabled));
  handle('lansync-trigger-auto', () => manager.triggerAutoSync());
  handle('lansync-respond', (id, accepted) => manager.respond(id, accepted));
}

module.exports = {
  createLanSync,
  registerLanSyncIpc,
  writeSources,
  readSources,
};
