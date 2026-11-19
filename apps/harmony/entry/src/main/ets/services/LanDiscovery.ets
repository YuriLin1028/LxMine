import { socket, connection } from '@kit.NetworkKit';
import { wifiManager } from '@kit.ConnectivityKit';
import { buffer } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';

// 鸿蒙端局域网发现：与 Windows 端共用 docs/LANSYNC.md 的 UDP 广播协议。
// 只负责「看见谁在线」，推送与接收由后续 LanSyncService 负责。

export interface LanDevice {
  id: string;
  name: string;
  platform: string;
  address: string;
  port: number;
  lastSeen: number;
  ssid?: string;
  receiveMode?: string;
  autoSyncPlaylists?: boolean;
}

export interface PullSyncRequest { id: string; receiverId: string; }

interface AnnounceMessage {
  protocol?: string;
  type?: string;
  id?: string;
  name?: string;
  platform?: string;
  port?: number;
  ssid?: string;
  receiveMode?: string;
  autoSyncPlaylists?: boolean;
}

const PROTOCOL = 'lxlia-lansync/1';
const DISCOVERY_PORT = 41234;
const ANNOUNCE_INTERVAL_MS = 3000;
const STALE_MS = 10000;

export class LanDiscovery {
  private generation: number = 0;
  private restarting: Promise<void> | null = null;
  private udp: socket.UDPSocket | null = null;
  private devices: Map<string, LanDevice> = new Map();
  private announceTimer: number = -1;
  private pruneTimer: number = -1;
  private deviceId: string;
  private deviceName: string;
  private port: number = 0;
  private ssid: string = '';
  private localIp: string = '';
  private autoSyncPlaylists: boolean = false;
  private listener: ((devices: LanDevice[]) => void) | null = null;
  private broadcasts: string[] = ['255.255.255.255'];
  private lastNetworkRefresh: number = 0;
  pendingRequests: () => PullSyncRequest[] = () => [];

  constructor(deviceId: string, deviceName: string) {
    this.deviceId = deviceId;
    this.deviceName = deviceName;
  }

  /** 同步服务实际监听的端口；0 表示只发现、不接收推送。 */
  setPort(port: number): void {
    this.port = port;
  }

  onDevices(callback: (devices: LanDevice[]) => void): void {
    this.listener = callback;
  }

  /** 当前 Wi-Fi 名称，用于向用户解释设备不在同一网络的情况。 */
  getSsid(): string { return this.ssid; }
  getLocalIp(): string { return this.localIp; }
  setAutoSync(enabled: boolean): void {
    if (this.autoSyncPlaylists === enabled) return;
    this.autoSyncPlaylists = enabled;
    this.announce();
  }

  async start(): Promise<void> {
    if (this.udp) return;
    const generation = this.generation;
    const udp = socket.constructUDPSocketInstance();
    const local: socket.NetAddress = { address: '0.0.0.0', port: DISCOVERY_PORT, family: 1 };
    try {
      await udp.bind(local);
      await udp.setExtraOptions({ broadcast: true, reuseAddress: true });
      if (generation !== this.generation) { await udp.close(); return; }
    } catch (error) { await udp.close().catch(() => {}); throw new Error((error as BusinessError).message); }
    udp.on('message', (info: socket.SocketMessageInfo) => this.handleMessage(info));
    udp.on('error', (error: BusinessError) => console.warn(`[LanDiscovery] socket error: ${error.message}`));
    this.udp = udp;
    await this.refreshNetworks();
    await this.refreshSsid();
    if (generation !== this.generation || this.udp !== udp) return;
    console.info(`[LanDiscovery] listening :${DISCOVERY_PORT} sync=${this.port} ssid=${this.ssid || '-'} targets=${this.broadcasts.join(',')}`);
    this.announce();
    this.announceTimer = setInterval(() => this.announce(), ANNOUNCE_INTERVAL_MS);
    this.pruneTimer = setInterval(() => this.prune(), ANNOUNCE_INTERVAL_MS);
  }

  private detach(): socket.UDPSocket | null {
    this.generation++;
    if (this.announceTimer >= 0) clearInterval(this.announceTimer);
    if (this.pruneTimer >= 0) clearInterval(this.pruneTimer);
    this.announceTimer = -1; this.pruneTimer = -1;
    const udp = this.udp; this.udp = null;
    return udp;
  }
  stop(): void { this.detach()?.close().catch(() => {}); }
  async restart(): Promise<void> {
    if (this.restarting) return this.restarting;
    this.restarting = this.resume();
    try { await this.restarting; } finally { this.restarting = null; }
  }
  private async resume(): Promise<void> {
    const old = this.detach(); const generation = this.generation;
    if (old) await old.close().catch(() => {});
    if (generation !== this.generation) return;
    this.devices.clear(); this.emit();
    await this.start();
  }

  private async refreshNetworks(): Promise<void> {
    this.lastNetworkRefresh = Date.now();
    const targets: Set<string> = new Set();
    try {
      for (const net of await connection.getAllNets()) {
        const properties = await connection.getConnectionProperties(net);
        const iface = properties.interfaceName ?? '';
        // Wi-Fi Direct (ancowlan0) and cellular/VPN interfaces must not receive
        // LAN announcements; sending through them aborts the UDP socket.
        if (iface && !iface.startsWith('wlan')) continue;
        for (const link of properties.linkAddresses) {
          const parts = link.address.address.split('.').map((part: string) => Number(part));
          if (parts.length !== 4 || parts[0] === 127 || link.prefixLength < 1 || link.prefixLength > 30) continue;
          if (parts[0] === 172 && parts[1] === 17) continue;
          if (!this.localIp) this.localIp = link.address.address;
          const ip = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
          const mask = (0xffffffff << (32 - link.prefixLength)) >>> 0;
          const broadcast = (ip | ~mask) >>> 0;
          targets.add([24, 16, 8, 0].map((shift: number) => (broadcast >>> shift) & 255).join('.'));
        }
      }
      if (!targets.size) targets.add('255.255.255.255');
      this.broadcasts = Array.from(targets);
    } catch (_) {}
  }
  private async refreshSsid(): Promise<void> {
    try {
      const info = await wifiManager.getLinkedInfo();
      this.ssid = info.ssid || '';
      console.info(`[LanDiscovery] wifi ${this.ssid || '-'} bssid=${info.bssid || '-'} band=${info.band}`);
    } catch (error) {
      console.info(`[LanDiscovery] wifi info unavailable: ${(error as BusinessError).message}`);
    }
  }

  private announce(address?: string): void {
    if (!this.udp) return;
    const payload = JSON.stringify({
      protocol: PROTOCOL,
      type: 'announce',
      id: this.deviceId,
      name: this.deviceName,
      platform: 'harmony',
      port: this.port,
      autoSyncPlaylists: this.autoSyncPlaylists,
      pullRequests: this.pendingRequests(),
      ssid: this.ssid,
      ts: Date.now(),
    });
    if (!address && Date.now() - this.lastNetworkRefresh > 15000) this.refreshNetworks();
    for (const host of address ? [address] : this.broadcasts) {
      const target: socket.NetAddress = { address: host, port: DISCOVERY_PORT, family: 1 };
      this.udp.send({ data: payload, address: target }).catch((error: BusinessError) => {
        console.warn(`[LanDiscovery] announce failed: ${error.message}`);
      });
    }
  }

  private handleMessage(info: socket.SocketMessageInfo): void {
    let parsed: AnnounceMessage;
    try {
      parsed = JSON.parse(buffer.from(info.message).toString()) as AnnounceMessage;
    } catch (error) {
      return;
    }
    if (parsed.protocol !== PROTOCOL || parsed.id === this.deviceId || !parsed.id || parsed.type !== 'announce' || !parsed.port || parsed.port < 1 || parsed.port > 65535) return;
    const firstSeen = !this.devices.has(parsed.id);
    const device: LanDevice = {
      id: parsed.id,
      name: parsed.name ?? 'LxMine',
      platform: parsed.platform ?? 'unknown',
      address: info.remoteInfo.address,
      port: parsed.port ?? 0,
      lastSeen: Date.now(),
      ssid: parsed.ssid ?? '',
      receiveMode: parsed.receiveMode === 'pull' ? 'pull' : 'direct',
      autoSyncPlaylists: parsed.autoSyncPlaylists === true,
    };
    this.devices.set(device.id, device);
    if (firstSeen) {
      console.info(`[LanDiscovery] seen ${device.name} ${device.address}:${device.port} ssid=${device.ssid || '-'}`);
      this.announce(info.remoteInfo.address);
    }
    this.emit();
  }

  private prune(): void {
    const now = Date.now();
    let changed = false;
    const stale: string[] = [];
    this.devices.forEach((device: LanDevice) => {
      if (now - device.lastSeen > STALE_MS) stale.push(device.id);
    });
    for (const id of stale) {
      this.devices.delete(id);
      changed = true;
    }
    if (changed) this.emit();
  }

  announceNow(): void { this.announce(); }

  private emit(): void {
    if (!this.listener) return;
    const list: LanDevice[] = [];
    this.devices.forEach((device: LanDevice) => list.push(device));
    this.listener(list);
  }
}
