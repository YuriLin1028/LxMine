import { http } from '@kit.NetworkKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { LanDevice } from './LanDiscovery';

// 鸿蒙端局域网同步发送：把本机的音源（以及设置/歌单）推给已信任设备，
// 对方确认后覆盖。协议见 docs/LANSYNC.md。

const PROTOCOL = 'lxlia-lansync/1';

export interface TrustedDevice {
  id: string;
  name: string;
  platform: string;
  token: string;
  trustedAt: number;
}

export interface PeerSummary {
  id: string;
  name: string;
  platform: string;
}

export interface IntroducedPeer {
  id: string;
  name: string;
  platform: string;
  token: string;
}

export interface PendingVouch {
  targetId: string;
  introduced: IntroducedPeer;
  createdAt: number;
}

export const PENDING_VOUCH_TTL_MS: number = 7 * 24 * 60 * 60 * 1000;

export function parsePendingVouches(raw: string, now: number = Date.now()): PendingVouch[] {
  try {
    const parsed = JSON.parse(raw) as PendingVouch[];
    if (!Array.isArray(parsed)) return [];
    const list: PendingVouch[] = [];
    for (const item of parsed) {
      if (!item || typeof item.targetId !== 'string' || !item.targetId.trim()) continue;
      const intro = item.introduced;
      if (!intro || typeof intro.id !== 'string' || !intro.id.trim() || typeof intro.token !== 'string' || intro.token.length < 16) continue;
      const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : now;
      if (now - createdAt > PENDING_VOUCH_TTL_MS) continue;
      list.push({
        targetId: item.targetId.trim(),
        introduced: {
          id: intro.id.trim(),
          name: typeof intro.name === 'string' && intro.name.trim() ? intro.name.trim() : 'LxMine',
          platform: typeof intro.platform === 'string' && intro.platform.trim() ? intro.platform.trim() : 'unknown',
          token: intro.token,
        },
        createdAt,
      });
    }
    return list;
  } catch (_) {
    return [];
  }
}

export interface LanPushResponse {
  accepted: boolean;
  code: string;
  message: string;
  peerId: string;
  peerName: string;
  peerPlatform: string;
  transitive?: boolean;
  introducedPeers?: IntroducedPeer[];
  reverseVouches?: IntroducedPeer[];
  acceptedIntroducedIds?: string[];
}

export interface LanPingInfo {
  protocol: string;
  id: string;
  name: string;
  platform: string;
  port: number;
}

export function generateTrustToken(): string {
  try {
    const rand = cryptoFramework.createRandom();
    const blob = rand.generateRandomSync(16);
    let hex = '';
    for (let i = 0; i < blob.data.length; i += 1) {
      hex += blob.data[i].toString(16).padStart(2, '0');
    }
    if (hex.length >= 32) return hex;
  } catch (_) {}
  let fallback = '';
  for (let i = 0; i < 32; i += 1) {
    fallback += Math.floor(Math.random() * 16).toString(16);
  }
  return fallback;
}

export function generatePairCode(): string {
  try {
    const rand = cryptoFramework.createRandom();
    const blob = rand.generateRandomSync(4);
    const num = (((blob.data[0] << 24) | (blob.data[1] << 16) | (blob.data[2] << 8) | blob.data[3]) >>> 0) % 900000;
    return String(100000 + num);
  } catch (_) {
    return String(100000 + Math.floor(Math.random() * 900000));
  }
}

export function formatPairCode(code: string): string {
  const clean = (code || '').replace(/\D/g, '');
  return clean.length === 6 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean;
}

export function safeTokenEquals(left: string, right: string): boolean {
  if (!left || !right || left.length < 16 || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

export function parseTrustedDevices(raw: string): TrustedDevice[] {
  try {
    const parsed = JSON.parse(raw) as TrustedDevice[];
    if (!Array.isArray(parsed)) return [];
    const list: TrustedDevice[] = [];
    for (const item of parsed) {
      if (!item || typeof item.id !== 'string' || !item.id.trim() || typeof item.token !== 'string' || item.token.length < 16) continue;
      list.push({
        id: item.id.trim(),
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'LxMine',
        platform: typeof item.platform === 'string' && item.platform.trim() ? item.platform.trim() : 'unknown',
        token: item.token,
        trustedAt: typeof item.trustedAt === 'number' && Number.isFinite(item.trustedAt) ? item.trustedAt : Date.now(),
      });
    }
    return list;
  } catch (_) {
    return [];
  }
}

export interface SyncSourcePayload {
  id?: string;
  name: string;
  description: string;
  version: string;
  author: string;
  homepage: string;
  script: string;
  allowShowUpdateAlert: boolean;
  importedAt: number;
}

export function uniqueSyncSources(sources: SyncSourcePayload[]): SyncSourcePayload[] {
  const used = new Set<string>();
  return sources.map((source: SyncSourcePayload, index: number): SyncSourcePayload => {
    const base = source.id || `harmony-source-legacy-${index}`;
    let id = base;
    let suffix = 0;
    while (used.has(id)) id = `${base}-${index}-${++suffix}`;
    used.add(id);
    return { id: id, name: source.name, description: source.description, version: source.version, author: source.author, homepage: source.homepage, script: source.script, allowShowUpdateAlert: source.allowShowUpdateAlert, importedAt: source.importedAt };
  });
}

export interface SyncDeviceInfo {
  id: string;
  name: string;
  platform: string;
}

export interface SyncBundle {
  activeSourceId?: string;
  protocol: string;
  version: number;
  createdAt: number;
  device: SyncDeviceInfo;
  trustToken?: string;
  syncDigest?: string;
  settings: Record<string, Object>;
  sources: SyncSourcePayload[];
  playlists: Object[];
}

export interface PairRequestPayload {
  protocol: string;
  version: number;
  type: string;
  code: string;
  token: string;
  transitive?: boolean;
  peers?: PeerSummary[];
  introducedPeers?: IntroducedPeer[];
  device: SyncDeviceInfo;
}

export interface VouchRequestPayload {
  protocol: string;
  version: number;
  type: string;
  device: SyncDeviceInfo;
  trustToken: string;
  introduced: IntroducedPeer;
}

export interface UnpairRequestPayload {
  protocol: string;
  version: number;
  type: string;
  device: SyncDeviceInfo;
  trustToken: string;
}

export interface AutoSyncExchangeResponse {
  accepted: boolean;
  changed: boolean;
  syncDigest: string;
  playlists: Object[];
  code?: string;
}

interface PushResult {
  accepted?: boolean;
  changed?: boolean;
  syncDigest?: string;
  playlists?: Object[];
  code?: string;
  message?: string;
  device?: SyncDeviceInfo;
  transitive?: boolean;
  introducedPeers?: IntroducedPeer[];
  reverseVouches?: IntroducedPeer[];
  acceptedIntroducedIds?: string[];
}

export function buildBundle(deviceId: string, deviceName: string, sourceScript: string): SyncBundle {
  const sources: SyncSourcePayload[] = [];
  if (sourceScript.trim()) {
    sources.push({
      name: 'LxMine 自定义源',
      description: '',
      version: '',
      author: '',
      homepage: '',
      script: sourceScript,
      allowShowUpdateAlert: false,
      importedAt: Date.now(),
    });
  }
  return {
    protocol: PROTOCOL,
    version: 1,
    createdAt: Date.now(),
    device: { id: deviceId, name: deviceName, platform: 'harmony' },
    settings: {},
    sources,
    playlists: [],
  };
}

export async function pingDirect(address: string, port: number, timeout: number = 5000): Promise<LanPingInfo | null> {
  if (!address.trim() || !port || port <= 0) return null;
  const client = http.createHttp();
  try {
    const response = await client.request(`http://${address.trim()}:${port}/lxlia-sync/ping`, {
      method: http.RequestMethod.GET,
      connectTimeout: timeout,
      readTimeout: timeout,
    });
    if (response.responseCode !== 200) return null;
    const parsed = JSON.parse(response.result as string) as LanPingInfo;
    if (!parsed || parsed.protocol !== PROTOCOL || !parsed.id) return null;
    return parsed;
  } catch (_) {
    return null;
  } finally {
    client.destroy();
  }
}

export async function pushBundle(device: LanDevice, bundle: SyncBundle): Promise<boolean> {
  const res = await pushBundleDetailed(device, bundle);
  return res.accepted;
}

export async function pushBundleDetailed(device: LanDevice, bundle: SyncBundle): Promise<LanPushResponse> {
  if (!device.port || device.port <= 0) throw new Error('该设备没有可接收的端口');
  return pushDirectDetailed(device.address, device.port, bundle, '/lxlia-sync/push', 130000);
}

export async function pairDirect(address: string, port: number, payload: PairRequestPayload, readTimeout: number = 130000): Promise<LanPushResponse> {
  if (!address.trim() || !port || port <= 0) throw new Error('目标地址或端口无效');
  const client = http.createHttp();
  try {
    const response = await client.request(`http://${address.trim()}:${port}/lxlia-sync/pair`, {
      method: http.RequestMethod.POST,
      header: { 'content-type': 'application/json; charset=utf-8' },
      extraData: JSON.stringify(payload),
      connectTimeout: 10000,
      readTimeout,
    });
    let result: PushResult = {};
    try { result = JSON.parse(response.result as string) as PushResult; } catch (_) {}
    return {
      accepted: response.responseCode === 200 && result.accepted === true,
      code: typeof result.code === 'string' ? result.code : '',
      message: typeof result.message === 'string' ? result.message : '',
      peerId: result.device?.id ?? '',
      peerName: result.device?.name ?? '',
      peerPlatform: result.device?.platform ?? '',
      transitive: result.transitive === true,
      introducedPeers: Array.isArray(result.introducedPeers) ? result.introducedPeers : [],
      reverseVouches: Array.isArray(result.reverseVouches) ? result.reverseVouches : [],
      acceptedIntroducedIds: Array.isArray(result.acceptedIntroducedIds) ? result.acceptedIntroducedIds : [],
    };
  } catch (error) {
    throw new Error((error as BusinessError).message);
  } finally {
    client.destroy();
  }
}

export async function vouchDirect(address: string, port: number, payload: VouchRequestPayload, timeout: number = 8000): Promise<LanPushResponse> {
  if (!address.trim() || !port || port <= 0) {
    return { accepted: false, code: 'NO_PORT', message: '', peerId: '', peerName: '', peerPlatform: '' };
  }
  const client = http.createHttp();
  try {
    const response = await client.request(`http://${address.trim()}:${port}/lxlia-sync/vouch`, {
      method: http.RequestMethod.POST,
      header: { 'content-type': 'application/json; charset=utf-8' },
      extraData: JSON.stringify(payload),
      connectTimeout: Math.min(4000, timeout),
      readTimeout: timeout,
    });
    let result: PushResult = {};
    try { result = JSON.parse(response.result as string) as PushResult; } catch (_) {}
    return {
      accepted: response.responseCode === 200 && result.accepted === true,
      code: typeof result.code === 'string' ? result.code : '',
      message: typeof result.message === 'string' ? result.message : '',
      peerId: '',
      peerName: '',
      peerPlatform: '',
    };
  } catch (_) {
    return { accepted: false, code: 'NETWORK', message: '', peerId: '', peerName: '', peerPlatform: '' };
  } finally {
    client.destroy();
  }
}

export async function unpairDirect(address: string, port: number, payload: UnpairRequestPayload): Promise<void> {
  if (!address.trim() || !port || port <= 0) return;
  const client = http.createHttp();
  try {
    await client.request(`http://${address.trim()}:${port}/lxlia-sync/unpair`, {
      method: http.RequestMethod.POST,
      header: { 'content-type': 'application/json; charset=utf-8' },
      extraData: JSON.stringify(payload),
      connectTimeout: 3000,
      readTimeout: 4000,
    });
  } catch (_) {
  } finally {
    client.destroy();
  }
}

export async function exchangeAutoPlaylists(address: string, port: number, bundle: SyncBundle, readTimeout: number = 10000): Promise<AutoSyncExchangeResponse> {
  if (!address.trim() || !port || port <= 0) {
    return { accepted: false, changed: false, syncDigest: '', playlists: [], code: '' };
  }
  const client = http.createHttp();
  try {
    const response = await client.request(`http://${address.trim()}:${port}/lxlia-sync/auto-playlists`, {
      method: http.RequestMethod.POST,
      header: { 'content-type': 'application/json; charset=utf-8' },
      extraData: JSON.stringify(bundle),
      connectTimeout: Math.min(4000, readTimeout),
      readTimeout,
    });
    let result: PushResult = {};
    try { result = JSON.parse(response.result as string) as PushResult; } catch (_) {}
    if (response.responseCode !== 200) {
      return { accepted: false, changed: false, syncDigest: '', playlists: [], code: typeof result.code === 'string' ? result.code : '' };
    }
    return {
      accepted: result.accepted === true,
      changed: result.changed === true,
      syncDigest: typeof result.syncDigest === 'string' ? result.syncDigest : '',
      playlists: Array.isArray(result.playlists) ? result.playlists : [],
      code: typeof result.code === 'string' ? result.code : '',
    };
  } catch (_) {
    return { accepted: false, changed: false, syncDigest: '', playlists: [], code: '' };
  } finally {
    client.destroy();
  }
}

export async function pushDirect(address: string, port: number, bundle: SyncBundle, path: string = '/lxlia-sync/push', readTimeout: number = 130000): Promise<boolean> {
  const res = await pushDirectDetailed(address, port, bundle, path, readTimeout);
  return res.accepted;
}

export async function pushDirectDetailed(address: string, port: number, bundle: SyncBundle, path: string = '/lxlia-sync/push', readTimeout: number = 130000): Promise<LanPushResponse> {
  if (!address.trim() || !port || port <= 0) throw new Error('目标地址或端口无效');
  const client = http.createHttp();
  try {
    const response = await client.request(`http://${address.trim()}:${port}${path}`, {
      method: http.RequestMethod.POST,
      header: { 'content-type': 'application/json; charset=utf-8' },
      extraData: JSON.stringify(bundle),
      connectTimeout: 10000,
      readTimeout,
    });
    let result: PushResult = {};
    try { result = JSON.parse(response.result as string) as PushResult; } catch (_) {}
    return {
      accepted: response.responseCode === 200 && result.accepted === true,
      code: typeof result.code === 'string' ? result.code : '',
      message: typeof result.message === 'string' ? result.message : '',
      peerId: result.device?.id ?? '',
      peerName: result.device?.name ?? '',
      peerPlatform: result.device?.platform ?? '',
    };
  } catch (error) {
    throw new Error((error as BusinessError).message);
  } finally {
    client.destroy();
  }
}
