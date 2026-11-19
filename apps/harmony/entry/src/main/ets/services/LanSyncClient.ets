import { http } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { LanDevice } from './LanDiscovery';

// 鸿蒙端局域网同步发送：把本机的音源（以及将来的设置/歌单）推给对方，
// 对方确认后覆盖。协议见 docs/LANSYNC.md。

const PROTOCOL = 'lxlia-lansync/1';

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
  settings: Record<string, Object>;
  sources: SyncSourcePayload[];
  playlists: Object[];
}

interface PushResult {
  accepted?: boolean;
  message?: string;
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

export async function pushBundle(device: LanDevice, bundle: SyncBundle): Promise<boolean> {
  if (!device.port || device.port <= 0) throw new Error('该设备没有可接收的端口');
  return pushDirect(device.address, device.port, bundle, '/lxlia-sync/push', 130000);
}

export async function pushDirect(address: string, port: number, bundle: SyncBundle, path: string = '/lxlia-sync/push', readTimeout: number = 130000): Promise<boolean> {
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
    if (response.responseCode !== 200) return false;
    const result = JSON.parse(response.result as string) as PushResult;
    return result.accepted === true;
  } catch (error) {
    throw new Error((error as BusinessError).message);
  } finally {
    client.destroy();
  }
}
