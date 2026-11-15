import { CoverColors } from './CoverPalette';
export interface LyricPreferences { colorMode: string; primary: string; secondary: string; showTranslation: boolean; showRomaji: boolean; }
export function lyricPreferences(json: string = '{}'): LyricPreferences {
  let value: LyricPreferences;
  try { value = (JSON.parse(json) as LyricPreferences) ?? {} as LyricPreferences; } catch (_) { value = {} as LyricPreferences; }
  return { colorMode: ['cover-solid', 'cover-gradient', 'custom-solid', 'custom-gradient'].includes(value.colorMode) ? value.colorMode : 'cover-gradient',
    primary: /^#[0-9a-f]{6}$/i.test(value.primary ?? '') ? value.primary : '#F4D28A', secondary: /^#[0-9a-f]{6}$/i.test(value.secondary ?? '') ? value.secondary : '#8FB2A6',
    showTranslation: value.showTranslation !== false, showRomaji: value.showRomaji === true };
}
export function lyricPrimary(value: LyricPreferences, cover: CoverColors): string { return value.colorMode.startsWith('custom') ? value.primary : cover.first; }
export function lyricSecondary(value: LyricPreferences, cover: CoverColors): string { return value.colorMode.endsWith('gradient') ? (value.colorMode.startsWith('custom') ? value.secondary : cover.last) : lyricPrimary(value, cover); }
