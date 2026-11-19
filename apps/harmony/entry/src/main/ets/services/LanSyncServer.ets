import { socket } from '@kit.NetworkKit';
import { buffer } from '@kit.ArkTS';
import { PullSyncRequest } from './LanDiscovery';

// 鸿蒙端局域网同步接收端：最小 HTTP 服务（TCPSocketServer）。
// 只实现 docs/LANSYNC.md 需要的两个端点：GET /ping 与 POST /push。
// 收到 push 后不立即应用，挂起等待本机用户在界面上确认。

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
  bundleJson: string;
  timer: number;
  resolve: (accepted: boolean) => void;
  reject: (error: Error) => void;
}

interface PullReceipt { receiverId?: string; accepted?: boolean; }

interface BundleShape {
  protocol?: string;
  version?: number;
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
  private seq: number = 0;
  private handler: ((incoming: SyncIncoming) => void) | null = null;
  private autoPlaylistHandler: ((playlistsJson: string) => boolean) | null = null;
  private autoSyncEnabled: boolean = false;
  private queue: SyncIncoming[] = [];
  private connections: Map<number, socket.TCPSocketConnection> = new Map();
  private deviceId: string = '';
  private deviceName: string = 'Harmony';

  setIdentity(id: string, name: string): void { this.deviceId = id; this.deviceName = name; }
  setAutoSync(enabled: boolean): void { this.autoSyncEnabled = enabled; }
  onAutoPlaylists(handler: (playlistsJson: string) => boolean): void { this.autoPlaylistHandler = handler; }

  onIncoming(handler: (incoming: SyncIncoming) => void): void {
    this.handler = handler;
  }

  currentPort(): number {
    return this.port;
  }

  pullRequests(): PullSyncRequest[] {
    const requests: PullSyncRequest[] = [];
    this.outgoing.forEach((entry: OutgoingTransfer, id: string) => { requests.push({ id, receiverId: entry.receiverId }); });
    return requests;
  }

  offerPush(receiverId: string, bundleJson: string): Promise<boolean> {
    const id = `${Date.now()}-${++this.seq}-${Math.random().toString(36).slice(2)}`;
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.outgoing.delete(id);
        reject(new Error('接收方确认超时'));
      }, 120000);
      this.outgoing.set(id, { receiverId, bundleJson, timer, resolve, reject });
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

  /** 返回 true 表示请求已接受；调用方负责先应用数据。 */
  /** 供 UI 轮询：返回尚未处理的第一条请求（不消费，respond 时移除）。 */
  pollIncoming(): SyncIncoming | null {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  async respond(id: string, accepted: boolean, message: string = ''): Promise<void> {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    this.queue = this.queue.filter((item: SyncIncoming) => item.id !== id);
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
          entry.resolve(receipt.accepted === true);
        }
      } catch (_) { this.reply(conn, 400, '{"confirmed":false}'); }
      return;
    }
    if (head.method === 'GET' && head.path === '/lxlia-sync/ping') {
      this.reply(conn, 200, JSON.stringify({ protocol: PROTOCOL, id: this.deviceId, name: this.deviceName, platform: 'harmony', port: this.port }));
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
        const changed = this.autoPlaylistHandler(JSON.stringify(bundle.playlists));
        this.reply(conn, 200, JSON.stringify({ accepted: true, changed }));
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
    const id = String(++this.seq);
    const incoming: SyncIncoming = {
      id,
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
}
