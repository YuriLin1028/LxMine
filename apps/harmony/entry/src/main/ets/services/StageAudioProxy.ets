import { socket, http } from '@kit.NetworkKit';
import { buffer } from '@kit.ArkTS';
import { fileIo } from '@kit.CoreFileKit';

// A loopback-only streaming route gives WebAudio a CORS-enabled copy of the
// current source. AVPlayer remains the audible player and the playback clock.
// Forward byte ranges; never buffer an entire lossless track in ArkUI memory.
export interface StageProxyDiagnostics { port: number; requests: number; status: number; received: number; sent: number; error: string; }
export class StageAudioProxy {
  private stats: StageProxyDiagnostics = { port: 0, requests: 0, status: 0, received: 0, sent: 0, error: '' };
  diagnostics(): StageProxyDiagnostics { return this.stats; }
  private server: socket.TCPSocketServer | null = null;
  private port: number = 0;
  private token: string = '';
  private remote: string = '';
  private localRoot: string = '';
  private clients: Map<number, http.HttpRequest> = new Map();
  private connections: Map<number, socket.TCPSocketConnection> = new Map();
  async start(localRoot: string = ''): Promise<void> {
    if (this.server) return;
    this.localRoot = localRoot;
    const server = socket.constructTCPSocketServerInstance();
    server.on('connect', (connection: socket.TCPSocketConnection) => this.connect(connection));
    await server.listen({ address: '127.0.0.1', port: 0, family: 1 });
    this.port = (await server.getLocalAddress()).port ?? 0;
    if (!this.port) { await server.close(); throw new Error('音频分析端口不可用'); }
    this.server = server; this.stats.port = this.port;
  }
  source(url: string): string {
    const local = this.localRoot && url.startsWith(`file://${this.localRoot}`) && !url.includes('/../');
    if (!this.server || (!/^https?:\/\//i.test(url) && !local)) return '';
    if (url !== this.remote) {
      this.cancel(); this.remote = url;
      this.token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }
    return `http://127.0.0.1:${this.port}/audio/${this.token}`;
  }
  private cancel(): void {
    for (const client of this.clients.values()) client.destroy();
    this.clients.clear();
    for (const connection of this.connections.values()) connection.close().catch(() => {});
    this.connections.clear();
  }
  async stop(): Promise<void> {
    this.cancel(); this.remote = ''; this.token = '';
    await this.server?.close(); this.server = null;
  }
  private connect(connection: socket.TCPSocketConnection): void {
    this.connections.set(connection.clientId, connection);
    let head = '';
    let started = false;
    const cleanup = (): void => {
      this.clients.get(connection.clientId)?.destroy();
      this.clients.delete(connection.clientId); this.connections.delete(connection.clientId);
    };
    connection.on('close', cleanup);
    connection.on('error', cleanup);
    connection.on('message', (message: socket.SocketMessageInfo) => {
      if (started) return;
      head += buffer.from(message.message).toString('utf8');
      if (head.length > 16384) { started = true; connection.close().catch(() => {}); return; }
      if (!head.includes('\r\n\r\n')) return;
      started = true;
      const line = head.split('\r\n')[0];
      if (line !== `GET /audio/${this.token} HTTP/1.1` || !this.remote) {
        connection.send({ data: 'HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n' })
          .finally(() => connection.close().catch(() => {})); return;
      }
      const range = head.match(/\r\nrange:\s*(bytes=\d*-\d*)\s*\r\n/i)?.[1];
      if (this.remote.startsWith('file://')) this.streamFile(connection, range ?? '').catch(() => connection.close().catch(() => {}));
      else { this.stats.requests++; this.stream(connection, range ?? ''); }
    });
  }
  private async streamFile(connection: socket.TCPSocketConnection, range: string): Promise<void> {
    const path = this.remote.slice(7);
    if (!this.localRoot || !path.startsWith(this.localRoot) || path.includes('/../')) throw new Error('离线音频路径无效');
    const size = fileIo.statSync(path).size;
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    let start = match && match[1] ? Number(match[1]) : 0;
    let end = match && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (match && !match[1] && match[2]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
    if (start >= size || end < start) {
      await connection.send({ data: `HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */${size}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n` });
      await connection.close(); return;
    }
    const mime = path.endsWith('.flac') ? 'audio/flac' : 'audio/mpeg';
    await connection.send({ data: `HTTP/1.1 ${match ? '206 Partial Content' : '200 OK'}\r\nContent-Type: ${mime}\r\n` +
      'Access-Control-Allow-Origin: http://127.0.0.1\r\nAccept-Ranges: bytes\r\n' +
      (match ? `Content-Range: bytes ${start}-${end}/${size}\r\n` : '') + `Content-Length: ${end - start + 1}\r\nConnection: close\r\n\r\n` });
    const file = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY);
    let position = start;
    try {
      while (position <= end) {
        const bytes = new ArrayBuffer(Math.min(65536, end - position + 1));
        const read = fileIo.readSync(file.fd, bytes, { offset: position === start ? start : 0, length: bytes.byteLength });
        if (!read) throw new Error('离线音频文件不完整');
        await connection.send({ data: read === bytes.byteLength ? bytes : bytes.slice(0, read) }); position += read;
      }
    } finally { fileIo.closeSync(file); await connection.close().catch(() => {}); this.connections.delete(connection.clientId); }
  }
  private stream(connection: socket.TCPSocketConnection, range: string): void {
    const client = http.createHttp();
    this.clients.set(connection.clientId, client);
    let headers: Record<string, string> = {};
    let sent = false;
    let pending = 0;
    let chain: Promise<void> = Promise.resolve();
    const enqueue = (data: string | ArrayBuffer): void => {
      pending += typeof data === 'string' ? data.length : data.byteLength;
      if (pending > 8 * 1024 * 1024) { client.destroy(); connection.close().catch(() => {}); return; }
      const size = typeof data === 'string' ? data.length : data.byteLength;
      chain = chain.then(async () => { await connection.send({ data }); pending -= size; this.stats.sent += size; });
      chain.catch(() => { client.destroy(); connection.close().catch(() => {}); });
    };
    client.on('headersReceive', (raw: Object) => {
      const incoming = raw as Record<string, string>;
      headers = {};
      for (const name of Object.keys(incoming)) headers[name.toLowerCase()] = String(incoming[name]);
    });
    client.on('dataReceive', (bytes: ArrayBuffer) => {
      this.stats.received += bytes.byteLength;
      if (!sent) {
        sent = true;
        const partial = headers['content-range'] ?? '';
        const mime = (headers['content-type'] ?? 'audio/mpeg').split('\r')[0];
        enqueue(`HTTP/1.1 ${partial ? '206 Partial Content' : '200 OK'}\r\nContent-Type: ${mime}\r\n` +
          'Access-Control-Allow-Origin: http://127.0.0.1\r\nAccept-Ranges: bytes\r\n' +
          (partial ? `Content-Range: ${partial}\r\n` : '') + 'Transfer-Encoding: chunked\r\nConnection: close\r\n\r\n');
      }
      enqueue(`${bytes.byteLength.toString(16)}\r\n`); enqueue(bytes); enqueue('\r\n');
    });
    let endStream: () => void = () => {};
    const streamEnded = new Promise<void>((resolve) => { endStream = resolve; });
    client.on('dataEnd', () => endStream());
    const requestHeaders: Record<string, string> = { 'Accept-Encoding': 'identity' };
    // Bound each open-ended browser range so the native network stack cannot
    // outrun the media consumer and fill the pending socket queue.
    const requested = range.match(/^bytes=(\d+)-(\d*)$/);
    if (requested) {
      const start = Number(requested[1]);
      const end = requested[2] ? Math.min(Number(requested[2]), start + 1048575) : start + 1048575;
      requestHeaders['Range'] = `bytes=${start}-${end}`;
    } else if (range) requestHeaders['Range'] = range;
    client.requestInStream(this.remote, { method: http.RequestMethod.GET, header: requestHeaders, usingCache: false,
      connectTimeout: 10000, readTimeout: 120000 })
      .then(async (code: number) => {
        this.stats.status = code;
        await streamEnded;
        if (!sent) enqueue(`HTTP/1.1 ${code === 416 ? '416 Range Not Satisfiable' : '502 Bad Gateway'}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
        else enqueue('0\r\n\r\n');
        await chain;
      }).catch((error: Error) => { this.stats.error = error.message; }).finally(() => {
        client.destroy(); this.clients.delete(connection.clientId);
        connection.close().catch(() => {}); this.connections.delete(connection.clientId);
      });
  }
}
