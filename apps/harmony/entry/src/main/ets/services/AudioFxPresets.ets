export interface AudioFxPreset {
  id: string;
  label: string;
  shortLabel: string;
  detail: string;
  bands: number[];
  bassBoost: number;
  spatial: boolean;
  reverb: string;
}

export interface AudioFxConfig {
  preset: string;
  customBands: number[];
  spatial: boolean;
  reverb: string;
  spatialMode?: string;
}

export const AUDIO_FX_BAND_LABELS: string[] = ['60Hz', '230Hz', '910Hz', '3.6kHz', '14kHz'];

export const AUDIO_FX_PRESETS: AudioFxPreset[] = [
  { id: 'off', label: '原声（关闭）', shortLabel: '原声', detail: '原始音频直出，无染色', bands: [0, 0, 0, 0, 0], bassBoost: 0, spatial: false, reverb: 'none' },
  { id: 'pop', label: '流行 Pop', shortLabel: '流行', detail: '均衡微提人声与通透高音', bands: [2, 1, 3, 2, 1], bassBoost: 2, spatial: false, reverb: 'none' },
  { id: 'bass', label: '重低音 Bass', shortLabel: '重低音', detail: '低频下潜强劲，鼓点冲击力拉满', bands: [7, 5, 0, 1, 2], bassBoost: 8, spatial: false, reverb: 'none' },
  { id: 'vocal', label: '清澈人声 Vocal', shortLabel: '人声', detail: '突出人声质感，削减低频浑浊', bands: [-2, 1, 5, 4, 1], bassBoost: 0, spatial: false, reverb: 'none' },
  { id: 'rock', label: '摇滚 Rock', shortLabel: '摇滚', detail: '电吉他张力与澎湃鼓组动态', bands: [5, 2, -1, 3, 5], bassBoost: 4, spatial: false, reverb: 'small' },
  { id: 'edm', label: '电子舞曲 EDM', shortLabel: '电音', detail: '超低频脉冲与闪耀高频能量', bands: [6, 4, 0, 3, 6], bassBoost: 7, spatial: true, reverb: 'none' },
  { id: 'hiphop', label: '说唱 Hip-Hop', shortLabel: '说唱', detail: '808 肥厚低音与清晰人声咬字', bands: [6, 4, 2, 1, 3], bassBoost: 6, spatial: false, reverb: 'none' },
  { id: 'acoustic', label: '民谣原声', shortLabel: '民谣', detail: '温暖木吉他与自然空气感', bands: [2, 2, 3, 2, 3], bassBoost: 1, spatial: false, reverb: 'small' },
  { id: 'classical', label: '古典交响', shortLabel: '古典', detail: '宽广动态与音乐厅弦乐光泽', bands: [3, 1, 0, 2, 4], bassBoost: 1, spatial: true, reverb: 'hall' },
  { id: 'jazz', label: '爵士蓝调', shortLabel: '爵士', detail: '丝滑中频与温暖萨克斯质感', bands: [3, 2, 2, 3, 2], bassBoost: 2, spatial: true, reverb: 'small' },
  { id: 'ancient', label: '古风轻音', shortLabel: '古风', detail: '清越笛萧与温润丝竹泛音', bands: [0, 2, 4, 4, 3], bassBoost: 0, spatial: true, reverb: 'hall' },
  { id: 'acg', label: 'ACG 动漫', shortLabel: 'ACG', detail: '甜亮女声与轻快节奏层次', bands: [3, 1, 3, 5, 4], bassBoost: 3, spatial: false, reverb: 'none' },
  { id: 'live', label: 'Live 现场', shortLabel: '现场', detail: '环绕声场与演唱会空间混响', bands: [4, 2, 1, 3, 4], bassBoost: 3, spatial: true, reverb: 'hall' },
  { id: 'vinyl', label: '黑胶温暖', shortLabel: '黑胶', detail: '模拟暖声底，柔和顺滑高频', bands: [3, 3, 1, -2, -3], bassBoost: 2, spatial: false, reverb: 'small' },
  { id: 'night', label: '深夜柔音', shortLabel: '深夜', detail: '柔化尖锐频段，久听不累', bands: [1, 2, 2, -1, -3], bassBoost: 0, spatial: false, reverb: 'none' },
  { id: 'custom', label: '自定义均衡器', shortLabel: '自定义', detail: '自由调节 5 段均衡与空间环绕', bands: [0, 0, 0, 0, 0], bassBoost: 0, spatial: false, reverb: 'none' }
];

export function defaultAudioFxConfig(): AudioFxConfig {
  return { preset: 'off', customBands: [0, 0, 0, 0, 0], spatial: false, reverb: 'none', spatialMode: 'system' };
}

export function audioFxPresetById(id: string): AudioFxPreset {
  const found = AUDIO_FX_PRESETS.find((item: AudioFxPreset) => item.id === id);
  return found ?? AUDIO_FX_PRESETS[0];
}

export function clampAudioFxDb(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-12, Math.min(12, Math.round(value)));
}

export function normalizeAudioFxConfig(raw?: Partial<AudioFxConfig>): AudioFxConfig {
  const preset = audioFxPresetById(raw?.preset ?? 'off');
  const rawBands = raw?.customBands;
  const bands = Array.isArray(rawBands) && rawBands.length === 5
    ? rawBands.map((v: number) => clampAudioFxDb(v))
    : [0, 0, 0, 0, 0];
  const spatial = typeof raw?.spatial === 'boolean' ? raw.spatial : preset.spatial;
  const reverb = (raw?.reverb === 'none' || raw?.reverb === 'small' || raw?.reverb === 'hall') ? raw.reverb : preset.reverb;
  const spatialMode = raw?.spatialMode === 'off' ? 'off' : 'system';
  return { preset: preset.id, customBands: bands, spatial, reverb, spatialMode };
}

export function effectiveAudioFxBands(config: AudioFxConfig): number[] {
  const preset = audioFxPresetById(config.preset);
  return preset.id === 'custom' ? config.customBands : preset.bands;
}

export function audioFxSummary(config: AudioFxConfig): string {
  const preset = audioFxPresetById(config.preset);
  if (preset.id === 'off' && !config.spatial && config.reverb === 'none') return '原声（关闭）';
  const tags: string[] = [preset.id === 'off' ? '原声' : preset.shortLabel];
  if (config.spatial) tags.push('3D 环绕');
  if (config.reverb === 'hall') tags.push('音乐厅');
  else if (config.reverb === 'small') tags.push('室内混响');
  return tags.join(' · ');
}
