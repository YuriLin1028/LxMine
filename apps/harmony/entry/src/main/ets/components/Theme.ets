export const INK: ResourceColor = $r('app.color.page_background');
export const TEXT: ResourceColor = $r('app.color.text_primary');
export const MUTED: ResourceColor = $r('app.color.text_secondary');
export const ACCENT: ResourceColor = $r('app.color.text_accent');
export const ON_ACCENT: ResourceColor = $r('app.color.text_on_accent');
export function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export function platformName(source: string): string {
  if (source === 'all') return '聚合';
  return source === 'wy' ? '网易云' : source === 'tx' ? 'QQ 音乐' : source === 'kg' ? '酷狗' : source === 'qishui' ? '汽水' : source === 'mg' ? '咪咕' : source === 'local' ? '本地' : '酷我';
}
export function devicePlatformName(platform: string): string {
  switch (platform) {
    case 'harmony': return 'HarmonyOS';
    case 'android': return 'Android';
    case 'win32':
    case 'windows': return 'Windows';
    case 'darwin': return 'macOS';
    case 'linux': return 'Linux';
    default: return platform || '未知平台';
  }
}
/** 平台 logo 角标：封面右上角用图标标注来源，替代文字（播控球等圆形封面不加）。 */
export function sourceBadge(source: string | undefined | null): Resource | null {
  if (!source) return null;
  if (source === 'wy') return $r('app.media.ic_src_wy');
  if (source === 'tx') return $r('app.media.ic_src_tx');
  if (source === 'kg') return $r('app.media.ic_src_kg');
  if (source === 'kw') return $r('app.media.ic_src_kw');
  return null;
}
export function formatPlayCount(count: number): string {
  if (count >= 100000000) return `${(count / 100000000).toFixed(1)}亿`;
  if (count >= 10000) return `${Math.round(count / 10000)}万`;
  return count > 0 ? `${count}` : '';
}
