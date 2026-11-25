import { socket } from '@kit.NetworkKit';
import { buffer } from '@kit.ArkTS';
import { PullSyncRequest } from './LanDiscovery';
import { LanPushResponse, PeerSummary, IntroducedPeer } from './LanSyncClient';

// 鸿蒙端局域网同步接收端：最小 HTTP 服务（TCPSocketServer）。
// 实现 /ping、/pair、/vouch、/unpair、/push、/auto-playlists、/pull、/receipt。
// 未加入设备信任圈的同步与自动同步一律拒绝（403 UNTRUSTED）。

export interface SyncSummary {
  settings: number;
  sources: number;
  playlists: number;
}

export interface SyncIncoming {
  id: string;
  peerName: string;
  platform: string;
  bundleJson: string;
  summary: SyncSummary;
  kind?: string;
  peerId?: string;
  pairCode?: string;
  pairToken?: string;
  transitive?: boolean;
  peers?: PeerSummary[];
  introducedPeers?: IntroducedPeer[];
}

export interface PairRespondOptions {
  transitive: boolean;
  introducedPeers: IntroducedPeer[];
  reverseVouches: IntroducedPeer[];
}

export interface VouchHandlerReply {
  accepted: boolean;
  code: string;
  message: string;
}

interface HttpRequestHead {
  method: string;
  path: string;
  contentLength: number;
}

interface PendingEntry {
  conn: socket.TCPSocketConnection;
  incoming: SyncIncoming;
  timer: number;
}

interface OutgoingTransfer {
  receiverId: string;
  kind: string;
  bundleJson: string;
  timer: number;
  resolve: (result: LanPushResponse) => void;
  reject: (error: Error) => void;
}

interface PullReceipt {
  receiverId?: string;
  accepted?: boolean;
  code?: string;
  message?: string;
  device?: BundleDevice;
  transitive?: boolean;
  introducedPeers?: IntroducedPeer[];
  acceptedIntroducedIds?: string[];
}

export interface AutoSyncServerReply {
  accepted: boolean;
  changed: boolean;
  syncDigest: string;
  playlists: Object[];
}

interface BundleShape {
  protocol?: string;
  version?: number;
  type?: string;
  code?: string;
  token?: string;
  trustToken?: string;
  transitive?: boolean;
  peers?: PeerSummary[];
  introducedPeers?: IntroducedPeer[];
  introduced?: IntroducedPeer;
  syncDigest?: string;
  device?: BundleDevice;
  settings?: Record<string, string>;
  sources?: Object[];
  playlists?: Object[];
}

interface BundleDevice {
  id?: string;
  name?: string;
  platform?: string;
}

interface PairReplyPayload {
  accepted: boolean;
  device?: BundleDevice;
  transitive?: boolean;
  introducedPeers?: IntroducedPeer[];
  reverseVouches?: IntroducedPeer[];
  message: string;
}

interface VouchReplyPayload {
  accepted: boolean;
  code?: string;
  message?: string;
}

const PROTOCOL = 'lxlia-lansync/1';
const DEFAULT_PORT = 41300;
const MAX_BODY = 8 * 1024 * 1024;

function parseHead(text: string): HttpRequestHead | null {
  const lines = text.split('\r\n');
  if (lines.length === 0) return null;
  const parts = lines[0].split(' ');
  if (parts.length < 3) return null;
  let contentLength = 0;
  for (const line of lines) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    const name = line.slice(0, index).trim().toLowerCase();
    if (name === 'content-length') contentLength = parseInt(line.slice(index + 1).trim());
  }
  return { method: parts[0], path: parts[1], contentLength };
}

function httpResponse(status: number, body: string): string {
  return `HTTP/1.1 ${status} ${status === 200 ? 'OK' : 'Error'}\r\n` +
    'Content-Type: application/json; charset=utf-8\r\n' +
    `Content-Length: ${buffer.byteLength(body, 'utf-8')}\r\n` +
    'Connection: close\r\n\r\n' + body;
}

export class LanSyncServer {
  private server: socket.TCPSocketServer | null = null;
  private port: number = 0;
  private buffers: Map<number, Uint8Array> = new Map();
  private pending: Map<string, PendingEntry> = new Map();
  private outgoing: Map<string, OutgoingTransfer> = new Map();
  private rejectedPairAt: Map<string, number> = new Map();
  private seq: number = 0;
  private handler: ((incoming: SyncIncoming) => void) | null = null;
  private autoPlaylistHandler: ((peerId: string, peerName: string, peerDigest: string, playlistsJson: string) => AutoSyncServerReply) | null = null;
  private verifyTrustHandler: ((peerId: string, token: string) => boolean) | null = null;
  private vouchHandler: ((voucherId: string, introduced: IntroducedPeer) => VouchHandlerReply) | null = null;
  private unpairHandler: ((peerId: string) => void) | null = null;
  private autoSyncEnabled: boolean = false;
  private queue: SyncIncoming[] = [];
  private connections: Map<number, socket.TCPSocketConnection> = new Map();
  private deviceId: string = '';
  private deviceName: string = 'Harmony';

  setIdentity(id: string, name: string): void { this.deviceId = id; this.deviceName = name; }
  setAutoSync(enabled: boolean): void { this.autoSyncEnabled = enabled; }
  setVerifyTrust(handler: (peerId: string, token: string) => boolean): void { this.verifyTrustHandler = handler; }
  onAcceptVouch(handler: (voucherId: string, introduced: IntroducedPeer) => VouchHandlerReply): void { this.vouchHandler = handler; }
  onUnpair(handler: (peerId: string) => void): void { this.unpairHandler = handler; }
  onAutoPlaylists(handler: (peerId: string, peerName: string, peerDigest: string, playlistsJson: string) => AutoSyncServerReply): void { this.autoPlaylistHandler = handler; }

  private isTrusted(peerId: string, token: string): boolean {
    if (!this.verifyTrustHandler || !peerId || !token) return false;
    try { return this.verifyTrustHandler(peerId, token) === true; } catch (_) { return false; }
  }

  onIncoming(handler: (incoming: SyncIncoming) => void): void {
    this.handler = handler;
  }

  currentPort(): number {
    return this.port;
  }

  pullRequests(): PullSyncRequest[] {
    const requests: PullSyncRequest[] = [];
    this.outgoing.forEach((entry: OutgoingTransfer, id: string) => { requests.push({ id, receiverId: entry.receiverId, kind: entry.kind }); });
    return requests;
  }

  async offerPush(receiverId: string, bundleJson: string): Promise<boolean> {
    const res = await this.offerOutgoing(receiverId, bundleJson, 'push');
    return res.accepted;
  }

  offerPushDetailed(receiverId: string, bundleJson: string): Promise<LanPushResponse> {
    return this.offerOutgoing(receiverId, bundleJson, 'push');
  }

  offerPair(receiverId: string, pairJson: string): Promise<LanPushResponse> {
    return this.offerOutgoing(receiverId, pairJson, 'pair', 120000);
  }

  offerVouch(receiverId: string, vouchJson: string): Promise<LanPushResponse> {
    return this.offerOutgoing(receiverId, vouchJson, 'vouch', 18000);
  }

  private offerOutgoing(receiverId: string, bundleJson: string, kind: string, timeoutMs: number = 120000): Promise<LanPushResponse> {
    const id = `${Date.now()}-${++this.seq}-${Math.random().toString(36).slice(2)}`;
    return new Promise<LanPushResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.outgoing.delete(id);
        reject(new Error(kind === 'pair' ? '信任确认超时' : (kind === 'vouch' ? '引荐确认超时' : '接收方确认超时')));
      }, timeoutMs);
      this.outgoing.set(id, { receiverId, kind, bundleJson, timer, resolve, reject });
    });
  }

  async start(): Promise<number> {
    if (this.server) return this.port;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const port = DEFAULT_PORT + attempt;
      const server = socket.constructTCPSocketServerInstance();
      const address: socket.NetAddress = { address: '0.0.0.0', port, family: 1 };
      // 必须先注册 connect 监听再 listen，否则连接事件可能丢失。
      server.on('connect', (conn: socket.TCPSocketConnection) => this.handleConnection(conn));
      try {
        await server.listen(address);
        this.server = server;
        this.port = port;
        return port;
      } catch (error) {
        try {
          await server.close();
        } catch (closeError) {
          // 忽略关闭失败，换下一个端口。
        }
      }
    }
    throw new Error('没有可用端口启动同步服务');
  }

  async stop(): Promise<void> {
    for (const entry of this.outgoing.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('同步服务已停止'));
    }
    this.outgoing.clear();
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      try {
        await entry.conn.close();
      } catch (error) {
        // 已断开。
      }
    }
    this.pending.clear();
    this.queue = [];
    this.buffers.clear();
    for (const connection of this.connections.values()) { connection.close().catch(() => {}); }
    this.connections.clear();
    if (this.server) {
      await this.server.close();
      this.server = null;
    }
  }

  /** 供 UI 轮询：返回尚未处理的第一条请求（不消费，respond 时移除）。 */
  pollIncoming(): SyncIncoming | null {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  async respond(id: string, accepted: boolean, message: string = '', pairOpts?: PairRespondOptions): Promise<void> {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    this.queue = this.queue.filter((item: SyncIncoming) => item.id !== id);
    if (entry.incoming.kind === 'pair') {
      if (!accepted && entry.incoming.peerId) {
        this.rejectedPairAt.set(entry.incoming.peerId, Date.now());
      }
      const selfDev: BundleDevice = { id: this.deviceId, name: this.deviceName, platform: 'harmony' };
      const pairReply: PairReplyPayload = accepted
        ? {
          accepted: true,
          device: selfDev,
          transitive: pairOpts ? pairOpts.transitive : false,
          introducedPeers: pairOpts ? pairOpts.introducedPeers : [],
          reverseVouches: pairOpts ? pairOpts.reverseVouches : [],
          message: message || 'accepted',
        }
        : { accepted: false, message: message || '对方拒绝了信任请求' };
      await this.reply(entry.conn, 200, JSON.stringify(pairReply));
      return;
    }
    await this.reply(entry.conn, 200, JSON.stringify({ accepted, message }));
  }

  private async reply(conn: socket.TCPSocketConnection, status: number, body: string): Promise<void> {
    try {
      await conn.send({ data: httpResponse(status, body) });
      await conn.close();
    } catch (error) {
      // 对端可能已经断开。
    }
  }

  private handleConnection(conn: socket.TCPSocketConnection): void {
    const id = conn.clientId;
    this.connections.set(id, conn);
    conn.on('message', (info: socket.SocketMessageInfo) => {
      const chunk = new Uint8Array(info.message);
      const prev = this.buffers.get(id) ?? new Uint8Array(0);
      const merged = new Uint8Array(prev.length + chunk.length);
      merged.set(prev);
      merged.set(chunk, prev.length);
      if (merged.length > MAX_BODY + 16384) {
        this.buffers.delete(id);
        this.reply(conn, 413, '{"accepted":false,"message":"bundle too large"}');
        return;
      }
      this.buffers.set(id, merged);

      // 按字节找头部结束标记，避免把多字节 UTF-8 当字符处理。
      let headerEnd = -1;
      for (let i = 0; i + 3 < merged.length; i += 1) {
        if (merged[i] === 13 && merged[i + 1] === 10 && merged[i + 2] === 13 && merged[i + 3] === 10) {
          headerEnd = i;
          break;
        }
      }
      if (headerEnd < 0) {
        if (merged.length > 16384) this.reply(conn, 400, '{"accepted":false,"message":"header too large"}');
        return;
      }
      const head = parseHead(buffer.from(merged.subarray(0, headerEnd)).toString());
      if (!head || !Number.isFinite(head.contentLength) || head.contentLength < 0 || head.contentLength > MAX_BODY) {
        this.reply(conn, 400, '{"accepted":false,"message":"bad request"}');
        return;
      }
      const bodyBytes = merged.subarray(headerEnd + 4);
      if (head.contentLength > 0 && bodyBytes.length < head.contentLength) return;
      if (bodyBytes.length > MAX_BODY) {
        this.reply(conn, 400, '{"accepted":false,"message":"bundle too large"}');
        return;
      }
      this.buffers.delete(id);
      this.handleRequest(conn, head, buffer.from(bodyBytes.subarray(0, head.contentLength)).toString());
    });
    conn.on('close', () => {
      this.buffers.delete(id);
      this.connections.delete(id);
      for (const entry of this.pending.values()) {
        if (entry.conn.clientId === id) {
          clearTimeout(entry.timer);
          this.pending.delete(entry.incoming.id);
          this.queue = this.queue.filter((item: SyncIncoming) => item.id !== entry.incoming.id);
        }
      }
    });
  }

  private handleRequest(conn: socket.TCPSocketConnection, head: HttpRequestHead, body: string): void {
    const parts = head.path.split('/');
    if (head.method === 'GET' && parts.length === 5 && parts[1] === 'lxlia-sync' && parts[2] === 'pull') {
      try {
        const entry = this.outgoing.get(decodeURIComponent(parts[3]));
        if (!entry || entry.receiverId !== decodeURIComponent(parts[4])) this.reply(conn, 404, '{"message":"request expired"}');
        else this.reply(conn, 200, `{"bundle":${entry.bundleJson}}`);
      } catch (_) { this.reply(conn, 400, '{"message":"invalid request"}'); }
      return;
    }
    if (head.method === 'POST' && parts.length === 4 && parts[1] === 'lxlia-sync' && parts[2] === 'receipt') {
      try {
        const id = decodeURIComponent(parts[3]), receipt = JSON.parse(body) as PullReceipt;
        const entry = this.outgoing.get(id);
        if (!entry || receipt.receiverId !== entry.receiverId || typeof receipt.accepted !== 'boolean') {
          this.reply(conn, 404, '{"confirmed":false}');
        } else {
          this.outgoing.delete(id); clearTimeout(entry.timer);
          this.reply(conn, 200, '{"confirmed":true}');
          entry.resolve({
            accepted: receipt.accepted === true,
            code: typeof receipt.code === 'string' ? receipt.code : '',
            message: typeof receipt.message === 'string' ? receipt.message : '',
            peerId: receipt.device?.id ?? '',
            peerName: receipt.device?.name ?? '',
            peerPlatform: receipt.device?.platform ?? '',
            transitive: receipt.transitive === true,
            introducedPeers: Array.isArray(receipt.introducedPeers) ? receipt.introducedPeers : [],
            acceptedIntroducedIds: Array.isArray(receipt.acceptedIntroducedIds) ? receipt.acceptedIntroducedIds : [],
          });
        }
      } catch (_) { this.reply(conn, 400, '{"confirmed":false}'); }
      return;
    }
    if (head.method === 'GET' && head.path === '/lxlia-sync/ping') {
      this.reply(conn, 200, JSON.stringify({ protocol: PROTOCOL, id: this.deviceId, name: this.deviceName, platform: 'harmony', port: this.port }));
      return;
    }
    if (head.method === 'POST' && head.path === '/lxlia-sync/pair') {
      this.handlePair(conn, body);
      return;
    }
    if (head.method === 'POST' && head.path === '/lxlia-sync/vouch') {
      this.handleVouch(conn, body);
      return;
    }
    if (head.method === 'POST' && head.path === '/lxlia-sync/unpair') {
      this.handleUnpair(conn, body);
      return;
    }
    if (head.method === 'POST' && head.path === '/lxlia-sync/auto-playlists') {
      if (!this.autoSyncEnabled || !this.autoPlaylistHandler) {
        this.reply(conn, 403, '{"accepted":false,"message":"auto sync disabled"}');
        return;
      }
      try {
        const bundle = JSON.parse(body) as BundleShape;
        if (bundle.protocol !== PROTOCOL || bundle.version !== 1 || !bundle.device || !bundle.device.id || bundle.device.id === this.deviceId || !Array.isArray(bundle.playlists)) {
          this.reply(conn, 400, '{"accepted":false,"message":"invalid auto-sync payload"}');
          return;
        }
        const peerId = bundle.device.id ?? '';
        const trustToken = typeof bundle.trustToken === 'string' ? bundle.trustToken : '';
        if (!this.isTrusted(peerId, trustToken)) {
          this.reply(conn, 403, '{"accepted":false,"code":"UNTRUSTED","message":"设备不在信任圈内"}');
          return;
        }
        const peerName = bundle.device.name ?? 'LxMine';
        const peerDigest = typeof bundle.syncDigest === 'string' ? bundle.syncDigest : '';
        const reply = this.autoPlaylistHandler(peerId, peerName, peerDigest, JSON.stringify(bundle.playlists));
        this.reply(conn, 200, JSON.stringify({
          accepted: reply.accepted,
          changed: reply.changed,
          syncDigest: reply.syncDigest,
          playlists: reply.playlists,
        }));
      } catch (_) {
        this.reply(conn, 400, '{"accepted":false,"message":"invalid json"}');
      }
      return;
    }
    if (head.method !== 'POST' || head.path !== '/lxlia-sync/push') {
      this.reply(conn, 404, '{"accepted":false,"message":"not found"}');
      return;
    }
    let bundle: BundleShape;
    try {
      bundle = JSON.parse(body) as BundleShape;
    } catch (error) {
      this.reply(conn, 400, '{"accepted":false,"message":"invalid bundle"}');
      return;
    }
    if (bundle.protocol !== PROTOCOL || bundle.version !== 1 || !bundle.device || !bundle.device.id || bundle.device.id === this.deviceId ||
      !Array.isArray(bundle.sources) || !Array.isArray(bundle.playlists) || this.pending.size >= 3) {
      this.reply(conn, 400, '{"accepted":false,"message":"invalid bundle protocol"}');
      return;
    }
    const peerId = bundle.device.id ?? '';
    const trustToken = typeof bundle.trustToken === 'string' ? bundle.trustToken : '';
    if (!this.isTrusted(peerId, trustToken)) {
      this.reply(conn, 403, '{"accepted":false,"code":"UNTRUSTED","message":"设备不在信任圈内，请先加入信任圈"}');
      return;
    }
    const id = String(++this.seq);
    const incoming: SyncIncoming = {
      id,
      kind: 'push',
      peerId,
      peerName: bundle.device.name ?? 'LxMine',
      platform: bundle.device.platform ?? 'unknown',
      bundleJson: body,
      summary: {
        settings: bundle.settings ? Object.keys(bundle.settings).length : 0,
        sources: bundle.sources ? bundle.sources.length : 0,
        playlists: bundle.playlists ? bundle.playlists.length : 0,
      },
    };
    const timer = setTimeout(() => { this.respond(id, false, '接收方确认超时'); }, 120000);
    this.pending.set(id, { conn, incoming, timer });
    this.queue.push(incoming);
    // 保持请求挂起；本机用户确认、数据成功落盘后才由 respond 返回成功。
    this.handler?.(incoming);
  }

  private handlePair(conn: socket.TCPSocketConnection, body: string): void {
    let payload: BundleShape;
    try {
      payload = JSON.parse(body) as BundleShape;
    } catch (_) {
      this.reply(conn, 400, '{"accepted":false,"message":"invalid pair json"}');
      return;
    }
    const peerId = payload.device?.id ?? '';
    const code = typeof payload.code === 'string' ? payload.code : '';
    const token = typeof payload.token === 'string' ? payload.token : '';
    if (payload.protocol !== PROTOCOL || payload.version !== 1 || payload.type !== 'pair' ||
      !peerId || peerId === this.deviceId || !/^\d{6}$/.test(code) || token.length < 16) {
      this.reply(conn, 400, '{"accepted":false,"message":"invalid pair protocol"}');
      return;
    }
    if (this.isTrusted(peerId, token)) {
      const selfDev: BundleDevice = { id: this.deviceId, name: this.deviceName, platform: 'harmony' };
      const okReply: PairReplyPayload = { accepted: true, device: selfDev, message: 'already trusted' };
      this.reply(conn, 200, JSON.stringify(okReply));
      return;
    }
    const lastRejected = this.rejectedPairAt.get(peerId) ?? 0;
    if (Date.now() - lastRejected < 10000) {
      this.reply(conn, 429, '{"accepted":false,"code":"RATE_LIMITED","message":"对方刚刚拒绝了请求，请稍后再试"}');
      return;
    }
    for (const existing of this.pending.values()) {
      if (existing.incoming.peerId === peerId) {
        this.reply(conn, 409, '{"accepted":false,"code":"PENDING","message":"对方已有待处理的请求，请在对方屏幕确认"}');
        return;
      }
    }
    if (this.pending.size >= 3) {
      this.reply(conn, 429, '{"accepted":false,"code":"BUSY","message":"对方待处理请求过多，请稍后再试"}');
      return;
    }
    const id = String(++this.seq);
    const peerList: PeerSummary[] = [];
    if (Array.isArray(payload.peers)) {
      for (const item of payload.peers) {
        if (!item || typeof item.id !== 'string' || !item.id || item.id === this.deviceId || item.id === peerId) continue;
        peerList.push({
          id: item.id,
          name: typeof item.name === 'string' && item.name ? item.name : 'LxMine',
          platform: typeof item.platform === 'string' && item.platform ? item.platform : 'unknown',
        });
        if (peerList.length >= 32) break;
      }
    }
    const incoming: SyncIncoming = {
      id,
      kind: 'pair',
      peerId,
      pairCode: code,
      pairToken: token,
      transitive: payload.transitive === true,
      peers: peerList,
      peerName: payload.device?.name ?? 'LxMine',
      platform: payload.device?.platform ?? 'unknown',
      bundleJson: body,
      summary: { settings: 0, sources: 0, playlists: 0 },
    };
    const timer = setTimeout(() => { this.respond(id, false, '信任确认超时'); }, 120000);
    this.pending.set(id, { conn, incoming, timer });
    this.queue.push(incoming);
    this.handler?.(incoming);
  }

  private handleVouch(conn: socket.TCPSocketConnection, body: string): void {
    try {
      const payload = JSON.parse(body) as BundleShape;
      const peerId = payload.device?.id ?? '';
      const token = typeof payload.trustToken === 'string' ? payload.trustToken : '';
      const intro = payload.introduced;
      const introId = typeof intro?.id === 'string' ? intro.id.trim() : '';
      const introToken = typeof intro?.token === 'string' ? intro.token.trim() : '';
      if (payload.protocol !== PROTOCOL || payload.version !== 1 || payload.type !== 'vouch' ||
        !peerId || !introId || introId === this.deviceId || introToken.length < 16) {
        const bad: VouchReplyPayload = { accepted: false, code: 'INVALID', message: 'invalid vouch payload' };
        this.reply(conn, 400, JSON.stringify(bad));
        return;
      }
      if (!this.isTrusted(peerId, token)) {
        const deny: VouchReplyPayload = { accepted: false, code: 'UNTRUSTED', message: '设备不在信任圈内' };
        this.reply(conn, 403, JSON.stringify(deny));
        return;
      }
      if (!this.vouchHandler) {
        const off: VouchReplyPayload = { accepted: false, code: 'TRANSITIVE_DISABLED', message: '未开启信任圈成员互通' };
        this.reply(conn, 403, JSON.stringify(off));
        return;
      }
      const introducedPeer: IntroducedPeer = {
        id: introId,
        name: typeof intro?.name === 'string' && intro.name.trim() ? intro.name.trim() : 'LxMine',
        platform: typeof intro?.platform === 'string' && intro.platform.trim() ? intro.platform.trim() : 'unknown',
        token: introToken,
      };
      const res = this.vouchHandler(peerId, introducedPeer);
      if (res.accepted) {
        const ok: VouchReplyPayload = { accepted: true };
        this.reply(conn, 200, JSON.stringify(ok));
      } else {
        const rej: VouchReplyPayload = {
          accepted: false,
          code: res.code || 'TRANSITIVE_DISABLED',
          message: res.message || '对方未开启信任圈成员互通',
        };
        this.reply(conn, 403, JSON.stringify(rej));
      }
    } catch (_) {
      const err: VouchReplyPayload = { accepted: false, code: 'INVALID' };
      this.reply(conn, 400, JSON.stringify(err));
    }
  }

  private handleUnpair(conn: socket.TCPSocketConnection, body: string): void {
    try {
      const payload = JSON.parse(body) as BundleShape;
      const peerId = payload.device?.id ?? '';
      const token = typeof payload.trustToken === 'string' ? payload.trustToken : '';
      if (payload.protocol !== PROTOCOL || !peerId || !this.isTrusted(peerId, token)) {
        this.reply(conn, 403, '{"ok":false,"code":"UNTRUSTED"}');
        return;
      }
      this.unpairHandler?.(peerId);
      this.reply(conn, 200, '{"ok":true}');
    } catch (_) {
      this.reply(conn, 400, '{"ok":false}');
    }
  }
}
