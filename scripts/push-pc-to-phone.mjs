#!/usr/bin/env node
// 把 PC 端的设置、歌单与音源通过局域网同步协议推送到手机。
// 只读 PC 数据，不启动 Electron，也不实例化 LanSyncData（它的构造函数会做事务回滚写盘）。
//
// 用法：
//   node scripts/push-pc-to-phone.mjs                 # UDP 自动发现同一 Wi-Fi 下的鸿蒙设备
//   node scripts/push-pc-to-phone.mjs --host 192.168.0.106
//   node scripts/push-pc-to-phone.mjs --dry           # 只打印统计，不发送
//
// 手机端会弹「接收同步」，需要本人点「接收并覆盖」，脚本才会返回 accepted=true。

import { createRequire } from 'node:module';
import { createSocket } from 'node:dgram';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { portableLists } = require(path.join(root, 'apps/desktop/desktop/lansync/data.cjs'));
const { BuiltInPlaylistLibrary } = require(path.join(root, 'apps/desktop/desktop/built-in-playlist-library.js'));

const PROTOCOL = 'lxlia-lansync/1';
const DISCOVERY_PORT = 41234;
const PORTS = [41300, 41301, 41302, 41303, 41304];
const PHONE_SOURCES = new Set(['kw', 'kg', 'wy', 'tx']);
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ''; };

function userDataPath() {
  const override = value('--user-data');
  if (override) return override;
  return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Lxlia');
}

function readJson(dir, name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

function buildBundle(dir) {
  const library = new BuiltInPlaylistLibrary({ userDataPath: dir });
  const settings = { ...readJson(dir, 'lxmine-sync-settings.json', {}) };
  const fx = readJson(dir, 'current-fx-autosave.json', null);
  // 与 LanSyncData.snapshot() 保持一致：PC 视觉预设随设置一起下放。
  if (fx) {
    settings.lxmine_pc_visuals = fx;
    if (Number.isInteger(fx.preset)) settings.lxlia_native_style = 'mine-' + fx.preset;
  }
  const stored = readJson(dir, 'lx-sources.json', { sources: [], activeId: '' });
  const identity = readJson(dir, 'lansync-device.json', null) || { id: 'lxlia-script-' + Date.now().toString(16), name: os.hostname() };

  const sources = (Array.isArray(stored.sources) ? stored.sources : [])
    .filter(source => source && typeof source.id === 'string' && typeof source.name === 'string' && typeof source.script === 'string');
  const playlists = portableLists(library.playlists);
  let dropped = 0;
  for (const list of playlists) {
    // 手机只接受 kw/kg/wy/tx；一首 mg 就会让整包被拒。
    const kept = (list.songs || []).filter(song => { if (PHONE_SOURCES.has(song.source)) return true; dropped += 1; return false; });
    list.songs = kept;
  }
  return {
    bundle: {
      protocol: PROTOCOL, version: 1, createdAt: Date.now(),
      device: { id: identity.id, name: identity.name, platform: 'win32' },
      activeSourceId: typeof stored.activeId === 'string' ? stored.activeId : '',
      settings, sources, playlists,
    },
    dropped,
  };
}

function summarize(bundle) {
  const songs = bundle.playlists.reduce((sum, list) => sum + (list.songs?.length || 0), 0);
  return { settings: Object.keys(bundle.settings).length, sources: bundle.sources.length, playlists: bundle.playlists.length, songs };
}

function discover(timeoutMs = 7000) {
  return new Promise(resolve => {
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    const seen = [];
    let timer = null;
    const finish = () => { try { socket.close(); } catch (_) {} resolve(seen[0] || null); };
    socket.on('error', () => finish());
    socket.on('message', message => {
      try {
        const payload = JSON.parse(message.toString('utf8'));
        if (payload?.protocol !== PROTOCOL || payload.type !== 'announce') return;
        const entry = { id: payload.id, name: payload.name, host: payload.address || message.address, port: payload.port };
        if (!seen.some(item => item.id === entry.id)) seen.push(entry);
        if (seen.length) { clearTimeout(timer); finish(); }
      } catch (_) { /* 忽略其它广播 */ }
    });
    socket.bind(DISCOVERY_PORT, () => { timer = setTimeout(finish, timeoutMs); });
  });
}

function request(host, port, method, route, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host, port, path: route, method, timeout: timeoutMs,
      headers: body ? { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) } : {} },
      res => { const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })); });
    req.on('timeout', () => { req.destroy(new Error('连接超时')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const dir = userDataPath();
  const { bundle, dropped } = buildBundle(dir);
  const stats = summarize(bundle);
  const bytes = Buffer.byteLength(JSON.stringify(bundle));
  console.log(`[sync] 数据源 ${dir}`);
  console.log(`[sync] 设置 ${stats.settings} 项 · 歌单 ${stats.playlists} 个（${stats.songs} 首）· 音源 ${stats.sources} 个 · ${(bytes / 1024).toFixed(0)} KB`);
  if (dropped) console.log(`[sync] 已跳过 ${dropped} 首手机端不支持的曲目（mg 等）`);
  if (bytes > 8 * 1024 * 1024) throw new Error('同步包超过手机端 8 MB 限制');
  if (flag('--dry')) return;

  let host = value('--host');
  let port = Number(value('--port')) || 0;
  if (!host) {
    const device = await discover();
    if (!device) throw new Error('没有发现局域网内的鸿蒙设备：确认手机与电脑同一 Wi-Fi，且 LxMine 在前台');
    host = device.host; port = device.port;
    console.log(`[sync] 发现「${device.name}」 ${host}:${port}`);
  }
  if (!port) {
    for (const candidate of PORTS) {
      try {
        const ping = await request(host, candidate, 'GET', '/lxlia-sync/ping', null, 3000);
        const payload = JSON.parse(ping.body);
        if (payload?.platform === 'harmony') { port = candidate; break; }
      } catch (_) { /* 试下一个端口 */ }
    }
    if (!port) throw new Error(`${host} 的 41300-41304 都没有回应：确认 LxMine 已打开`);
  }

  console.log(`[sync] 推送中… 请在手机上点「接收并覆盖」`);
  const response = await request(host, port, 'POST', '/lxlia-sync/push', JSON.stringify(bundle), 140000);
  let result = {};
  try { result = JSON.parse(response.body); } catch (_) {}
  if (result.accepted === true) { console.log('[sync] 已同步：手机端已接收并覆盖'); return; }
  console.log(`[sync] 未同步：${result.message || '对方拒绝或超时'}`);
  process.exitCode = 1;
}

main().catch(error => { console.error(`[sync] 失败：${error.message}`); process.exitCode = 1; });
