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
  let started = false;

  const applyBundle = async (bundle) => {
    const result = await deps.data.apply(bundle);
    const library = deps.library.listSync();
    if (!library.ok || library.count !== result.playlistsCount) throw new Error('同步后歌单数量校验失败');
    broadcastToWindows('lansync-applied', { settings: bundle.settings, library, ...result });
    return result;
  };

  const transport = createLanSyncTransport({
    deviceId: identity.id,
    deviceName: identity.name,
    platform: process.platform,
    onDevicesChanged: devices => broadcastToWindows('lansync-devices-changed', devices),
    onAccept: applyBundle,
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
        peer,
        summary,
        playlists: Array.isArray(bundle.playlists) ? bundle.playlists : [],
      });
      return summary;
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
    discovery: started,
  });

  const buildBundle = () => ({
    protocol: PROTOCOL, version: 1, createdAt: Date.now(),
    device: { id: identity.id, name: identity.name, platform: process.platform },
    ...deps.data.snapshot(),
  });

  return {
    start,
    stop,
    status,
    devices: () => transport.listDevices(),
    pending: () => transport.listPending(),
    async send(deviceId, extra = {}) {
      if (!started) await start();
      return transport.send(String(deviceId), buildBundle(extra));
    },
    async respond(pendingId, accepted) {
      const entry = transport.listPending().find(item => item.pendingId === pendingId);
      if (!entry) return { ok: false, code: 'PENDING_NOT_FOUND', message: '同步请求已过期，请重新发送' };
      const bundle = transport.getPendingBundle(pendingId);
      const ok = await transport.respond(pendingId, Boolean(accepted), accepted ? 'accepted' : 'rejected');
      return {
        ok,
        message: ok ? '' : transport.listPending().find(item => item.pendingId === pendingId)?.lastError || '同步正在保存，请稍候',
        accepted: Boolean(accepted),
        playlists: ok && accepted && Array.isArray(bundle?.playlists) ? bundle.playlists : [],
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
  handle('lansync-pending', () => manager.pending());
  handle('lansync-send', id => manager.send(id));
  handle('lansync-respond', (id, accepted) => manager.respond(id, accepted));
}

module.exports = {
  createLanSync,
  registerLanSyncIpc,
  writeSources,
  readSources,
};
