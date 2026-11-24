import { Song } from '../model/Song';
import { MINE_RADIO_MODES, MineRadioMode } from '../model/MineRadioModes';
import { LyricLine } from './LyricParser';

export const SMART_STAGE_MODE_ID: string = 'smart-auto';
export const SMART_STAGE_MODE_LABEL: string = '随声绘色';
export const SMART_STAGE_MODE_TIP: string = '依据每首歌的曲风意象与专属声纹特征，智能匹配契合的动效模式（涵盖全部 MineRadio 与 Folia 动效及关闭动效纯享模式）。同一首歌在任意歌单、平台或设备再次播放都将稳定锁定相同的专属动效；未来版本新增动效时会自动重新匹配。';

export interface SmartStageCache {
  catalogSignature: string;
  choices: Record<string, string>;
}

export interface SmartStageDecision {
  modeId: string;
  catalogSignature: string;
  songKey: string;
  cached: boolean;
  ready: boolean;
}

interface SongSemanticFeatures {
  ballad: number;
  electronic: number;
  rockDark: number;
  hiphop: number;
  retroVinyl: number;
  cosmic: number;
  rainUrban: number;
  acgBright: number;
  oceanAncient: number;
}

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Murmur3-style avalanche finalizer so adjacent songs distribute uniformly across all modes.
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h >>> 0;
}

function hashUnit(seed: string): number {
  return (fnv1a(seed) % 100000) / 100000;
}

function normalizeIdentityPart(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[\s·•、，,;；/&+\-_'"`~]+/g, '')
    .trim();
}

export function smartStageCatalogIds(): string[] {
  return MINE_RADIO_MODES.map((m: MineRadioMode) => m.id).filter((id: string) => id !== SMART_STAGE_MODE_ID);
}

export function smartStageCatalogSignature(): string {
  return 'v5:' + smartStageCatalogIds().join(',');
}

export function smartStageSongKey(song?: Song): string {
  if (!song) return 'unknown';
  const name = normalizeIdentityPart(song.name || '');
  const singer = normalizeIdentityPart(song.singer || '');
  const validName = Boolean(name && name !== '未知歌曲' && name !== 'unknown');
  const validSinger = Boolean(singer && singer !== '未知歌手' && singer !== 'unknown');
  if (validName && validSinger) return `track:${name}|${singer}`;
  const id = (song.id || '').trim();
  if (id) return `${(song.source || '').toLowerCase().trim()}:${id}`;
  if (validName) return `track:${name}`;
  return 'unknown';
}

function hitPattern(meta: string, re: RegExp): number {
  return re.test(meta) ? 1 : 0;
}

function extractFeatures(song: Song | undefined): SongSemanticFeatures {
  const title = song?.name ?? '';
  const singer = song?.singer ?? '';
  const meta = `${title} ${singer}`.toLowerCase();

  return {
    ballad: hitPattern(meta, /piano|acoustic|ballad|unplugged|slow|lullaby|纯音乐|钢琴|吉他|民谣|抒情|独白|晚安|轻音乐|催眠|安静|温柔|回忆|告别|眼泪|心碎|寂寞/),
    electronic: hitPattern(meta, /edm|dj|remix|electro|club|synth|dubstep|house|techno|trance|future|电音|舞曲|混音|节奏|节拍|电流|脉冲|狂欢/),
    rockDark: hitPattern(meta, /rock|metal|punk|goth|hardcore|skull|dark|rage|shadow|摇滚|重金属|暗黑|哥特|朋克|风暴|燃烧|破碎|黑暗|深渊|灵魂/),
    hiphop: hitPattern(meta, /rap|hip[\s-]?hop|trap|drill|funk|groove|cypher|说唱|嘻哈|饶舌|街头|808/),
    retroVinyl: hitPattern(meta, /jazz|blues|soul|r&b|rnb|vinyl|retro|vintage|classic|粤语|爵士|蓝调|复古|黑胶|怀旧|老歌|岁月|时光|往事|旧梦/),
    cosmic: hitPattern(meta, /star|galaxy|space|planet|moon|orbit|eclipse|universe|cosmos|星河|星球|宇宙|月球|月蚀|星空|银河|星辰|光年|梦境/),
    rainUrban: hitPattern(meta, /rain|neon|city|cyber|tokyo|night|midnight|street|citypop|雨|霓虹|都市|夜|深夜|赛博|城市|街道|微醺/),
    acgBright: Math.min(1,
      hitPattern(meta, /anime|acg|ost|op|ed|butterfly|spring|summer|sakura|flower|青春|夏日|樱花|晴天|蝴蝶|动漫|阳光|微风|微笑|花瓣/)
      + (/[\u3040-\u30ff]/.test(meta) ? 0.65 : 0)
    ),
    oceanAncient: hitPattern(meta, /ocean|sea|whale|wave|deep|water|ancient|古风|国风|深海|鲸|海|江南|戏腔|禅|竹|烟雨|青丝|红尘|山水|青花/)
  };
}

function scoreMode(modeId: string, f: SongSemanticFeatures, seedKey: string): number {
  let affinity = 0;
  if (modeId === 'off') {
    affinity = -0.18 + f.ballad * 0.72 - f.electronic * 0.40 - f.rockDark * 0.35;
  } else if (modeId === 'mine-0') {
    affinity = f.ballad * 0.42 + f.retroVinyl * 0.38;
  } else if (modeId === 'mine-1') {
    affinity = f.hiphop * 0.78 + f.electronic * 0.45;
  } else if (modeId === 'mine-2') {
    affinity = f.cosmic * 0.80 + f.electronic * 0.32;
  } else if (modeId === 'mine-3') {
    affinity = f.rockDark * 0.66 + f.ballad * 0.36;
  } else if (modeId === 'mine-4') {
    affinity = f.retroVinyl * 0.82 + f.ballad * 0.32;
  } else if (modeId === 'mine-5') {
    affinity = f.cosmic * 0.76 + f.ballad * 0.34 + f.oceanAncient * 0.24;
  } else if (modeId === 'mine-6') {
    affinity = f.rockDark * 0.84 + f.hiphop * 0.28;
  } else if (modeId === 'mine-7') {
    affinity = f.electronic * 0.72 + f.cosmic * 0.28 + f.hiphop * 0.24;
  } else if (modeId === 'mine-8') {
    affinity = f.electronic * 0.76 + f.hiphop * 0.56;
  } else if (modeId === 'mine-9') {
    affinity = f.cosmic * 0.70 + f.rockDark * 0.42;
  } else if (modeId === 'mine-10') {
    affinity = f.rainUrban * 0.86 + f.electronic * 0.36;
  } else if (modeId === 'mine-11') {
    affinity = f.acgBright * 0.84;
  } else if (modeId === 'mine-12') {
    affinity = f.oceanAncient * 0.84 + f.cosmic * 0.24;
  } else if (modeId === 'folia-partita') {
    affinity = f.ballad * 0.68 + f.acgBright * 0.42 + f.oceanAncient * 0.28;
  } else if (modeId === 'folia-pendolo') {
    affinity = f.retroVinyl * 0.80 + f.cosmic * 0.42;
  } else if (modeId === 'folia-diorama') {
    affinity = f.electronic * 0.76 + f.rainUrban * 0.64 + f.cosmic * 0.30;
  } else if (modeId === 'folia-fume') {
    affinity = f.ballad * 0.78 + f.oceanAncient * 0.48;
  } else if (modeId === 'folia-sonnet') {
    affinity = f.retroVinyl * 0.68 + f.ballad * 0.54 + f.oceanAncient * 0.30;
  } else if (modeId === 'folia-tempera') {
    affinity = f.hiphop * 0.72 + f.rockDark * 0.64 + f.electronic * 0.38;
  } else if (modeId === 'folia-lumiere') {
    affinity = f.acgBright * 0.76 + f.cosmic * 0.54;
  } else if (modeId === 'folia-monet') {
    affinity = f.oceanAncient * 0.82 + f.ballad * 0.52;
  } else if (modeId === 'folia-cadenza') {
    affinity = f.cosmic * 0.74 + f.rainUrban * 0.54;
  } else if (modeId === 'folia-claddagh') {
    affinity = f.retroVinyl * 0.68 + f.cosmic * 0.50 + f.oceanAncient * 0.34;
  } else if (modeId === 'folia-tilt') {
    affinity = f.hiphop * 0.78 + f.electronic * 0.64 + f.rockDark * 0.38;
  } else if (modeId === 'folia-classic') {
    affinity = f.ballad * 0.64 + f.acgBright * 0.52;
  } else if (modeId === 'folia-cappella') {
    affinity = f.acgBright * 0.80 + f.hiphop * 0.40 + f.rainUrban * 0.32;
  }
  const spread = hashUnit(`${seedKey}|mode|${modeId}`);
  return affinity * 0.36 + spread * 0.74;
}

export function selectSmartStageMode(
  song: Song | undefined,
  _lyrics: LyricLine[],
  _primaryHex: string,
  _secondaryHex: string,
  cache?: SmartStageCache,
  _forceCommit: boolean = false,
  _recentModes: string[] = []
): SmartStageDecision {
  const candidates = smartStageCatalogIds();
  const catalogSignature = smartStageCatalogSignature();
  const key = smartStageSongKey(song);
  if (cache && cache.catalogSignature === catalogSignature) {
    const existing = cache.choices[key];
    if (existing && candidates.includes(existing)) {
      return { modeId: existing, catalogSignature, songKey: key, cached: true, ready: true };
    }
  }
  const f = extractFeatures(song);
  const seedKey = `${catalogSignature}|${key}`;
  let bestId = candidates.length > 0 ? candidates[0] : 'mine-7';
  let bestScore = -1e9;
  for (const id of candidates) {
    const sc = scoreMode(id, f, seedKey);
    if (sc > bestScore) {
      bestScore = sc;
      bestId = id;
    }
  }
  const ready = Boolean(song && key && key !== 'unknown');
  return { modeId: bestId, catalogSignature, songKey: key, cached: false, ready };
}
