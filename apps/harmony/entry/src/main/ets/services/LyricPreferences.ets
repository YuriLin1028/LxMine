import { CoverColors } from './CoverPalette';
export interface LyricPreferences {
  colorMode: string;
  primary: string;
  secondary: string;
  showTranslation: boolean;
  showRomaji: boolean;
  scale?: number;
  lineSpacing?: number;
  maxLines?: number;
}
export function lyricPreferences(json: string = '{}'): LyricPreferences {
  let value: LyricPreferences;
  try { value = (JSON.parse(json) as LyricPreferences) ?? {} as LyricPreferences; } catch (_) { value = {} as LyricPreferences; }
  const rawScale = Number(value.scale);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? Math.max(0.55, Math.min(1.5, rawScale)) : 1;
  const rawSpacing = Number(value.lineSpacing);
  const lineSpacing = Number.isFinite(rawSpacing) && rawSpacing > 0 ? Math.max(0.85, Math.min(1.8, rawSpacing)) : 1.2;
  const rawMaxLines = Number(value.maxLines);
  const maxLines = Number.isFinite(rawMaxLines) && rawMaxLines > 0 ? Math.max(1, Math.min(10, Math.round(rawMaxLines))) : 0;
  const colorMode = ['cover-solid', 'cover-gradient', 'custom-solid', 'custom-gradient'].includes(value.colorMode) ? value.colorMode : 'cover-gradient';
  let primary = /^#[0-9a-f]{6}$/i.test(value.primary ?? '') ? value.primary : '#7DD3FC';
  let secondary = /^#[0-9a-f]{6}$/i.test(value.secondary ?? '') ? value.secondary : '#A5B4FC';
  if (colorMode.startsWith('cover') && primary.toLowerCase() === '#f4d28a') {
    primary = '#7DD3FC';
    if (secondary.toLowerCase() === '#8fb2a6') secondary = '#A5B4FC';
  }
  return { colorMode, primary, secondary, showTranslation: value.showTranslation !== false, showRomaji: value.showRomaji === true, scale, lineSpacing, maxLines };
}
export function lyricPrimary(value: LyricPreferences, cover: CoverColors): string { return value.colorMode.startsWith('custom') ? value.primary : cover.first; }
export function lyricSecondary(value: LyricPreferences, cover: CoverColors): string { return value.colorMode.endsWith('gradient') ? (value.colorMode.startsWith('custom') ? value.secondary : cover.last) : lyricPrimary(value, cover); }
