import { image } from '@kit.ImageKit';
import http from '@ohos.net.http';

export interface CoverColors { first: string; last: string; }
export const EMPTY_COVER_COLORS: CoverColors = { first: '#7DD3FC', last: '#A5B4FC' };

// Small native decode: no canvas on the UI thread and no synthetic colour theme.
export class CoverPalette {
  private cache: Map<string, CoverColors> = new Map();
  async colors(url: string): Promise<CoverColors> {
    if (!/^https?:\/\//i.test(url)) return EMPTY_COVER_COLORS;
    const cached = this.cache.get(url);
    if (cached) return cached;
    const client = http.createHttp();
    let source: image.ImageSource | null = null;
    let pixels: image.PixelMap | null = null;
    try {
      const result = await client.request(url, { expectDataType: http.HttpDataType.ARRAY_BUFFER, connectTimeout: 6000, readTimeout: 8000 });
      const bytes = result.result as ArrayBuffer;
      if (result.responseCode !== 200 || bytes.byteLength > 4 * 1024 * 1024) return EMPTY_COVER_COLORS;
      source = image.createImageSource(bytes);
      pixels = await source.createPixelMap({ desiredSize: { width: 24, height: 24 }, desiredPixelFormat: image.PixelMapFormat.RGBA_8888 });
      const data = new ArrayBuffer(pixels.getPixelBytesNumber());
      await pixels.readPixelsToBuffer(data);
      const rgba = new Uint8Array(data);
      const counts: Map<number, number> = new Map();
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] < 128) continue;
        const key = (rgba[i] >> 4) * 256 + (rgba[i + 1] >> 4) * 16 + (rgba[i + 2] >> 4);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const ranked = Array.from(counts.keys()).sort((a: number, b: number) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
      if (!ranked.length) return EMPTY_COVER_COLORS;
      const first = ranked[0];
      const alternate = ranked.slice(1).find((key: number) => {
        const dr = (key >> 8) - (first >> 8);
        const dg = ((key >> 4) & 15) - ((first >> 4) & 15);
        const db = (key & 15) - (first & 15);
        return dr * dr + dg * dg + db * db >= 36;
      }) ?? first;
      const colors: CoverColors = { first: this.hex(first), last: this.hex(alternate) };
      if (this.cache.size >= 32) this.cache.clear();
      this.cache.set(url, colors);
      return colors;
    } catch (_) { return EMPTY_COVER_COLORS; }
    finally { try { if (pixels) await pixels.release(); } catch (_) {} try { if (source) await source.release(); } catch (_) {} client.destroy(); }
  }
  private hex(key: number): string {
    const channels = [(key >> 8) * 16 + 8, ((key >> 4) & 15) * 16 + 8, (key & 15) * 16 + 8];
    const luminance = channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114;
    const lift = Math.max(0, (130 - luminance) / Math.max(1, 255 - luminance));
    return '#' + channels.map((channel: number) => Math.round(channel + (255 - channel) * lift).toString(16).padStart(2, '0')).join('');
  }
}
