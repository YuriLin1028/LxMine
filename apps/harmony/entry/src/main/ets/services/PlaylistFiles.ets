import zlib from '@ohos.zlib';
import { fileIo } from '@kit.CoreFileKit';
import { buffer } from '@kit.ArkTS';

const MAX_PLAYLIST_BYTES: number = 32 * 1024 * 1024;

export async function decodePlaylistFile(bytes: ArrayBuffer, cacheDir: string): Promise<string> {
  const input = new Uint8Array(bytes);
  if (input.length < 2 || input[0] !== 0x1f || input[1] !== 0x8b) return buffer.from(bytes).toString().replace(/^\uFEFF/, '');
  const path = `${cacheDir}/lxmine-playlist-${Date.now()}-${Math.random().toString(36).slice(2)}.gz`;
  const file = fileIo.openSync(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
  try { fileIo.writeSync(file.fd, bytes); } finally { fileIo.closeSync(file); }
  let gzip: zlib.GZip | null = null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    gzip = await zlib.createGZip();
    await gzip.gzopen(path, 'rb');
    const chunk = new ArrayBuffer(32 * 1024);
    while (true) {
      const count = await gzip.gzread(chunk);
      if (count === 0) break;
      if (count < 0) throw new Error('LX 歌单文件损坏');
      total += count;
      if (total > MAX_PLAYLIST_BYTES) throw new Error('歌单内容超过 32 MB');
      chunks.push(new Uint8Array(chunk.slice(0, count)));
    }
  } finally {
    if (gzip) await gzip.gzclose().catch(() => {});
    fileIo.unlinkSync(path);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return buffer.from(output.buffer).toString().replace(/^\uFEFF/, '');
}
