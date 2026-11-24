'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LxMineSmartStage = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SMART_MODE_ID = 'smart-auto';
  const SMART_MODE_LABEL = '随声绘色';
  const SMART_MODE_TIP = '依据每首歌的曲风意象与专属声纹特征，智能匹配契合的动效模式（涵盖全部 MineRadio 与 Folia 动效及关闭动效纯享模式）。同一首歌在任意歌单、平台或设备再次播放都将稳定锁定相同的专属动效；未来版本新增动效时会自动重新匹配。';

  function fnv1a(text) {
    let h = 0x811c9dc5;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
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

  function hashUnit(seed) {
    return (fnv1a(seed) % 100000) / 100000;
  }

  function normalizeIdentityPart(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[\s·•、，,;；/&+\-_'"`~]+/g, '')
      .trim();
  }

  function canonicalSongKey(song) {
    if (!song) return 'unknown';
    const name = normalizeIdentityPart(song.name || '');
    const singer = normalizeIdentityPart(song.singer || song.artist || '');
    const validName = Boolean(name && name !== '未知歌曲' && name !== 'unknown');
    const validSinger = Boolean(singer && singer !== '未知歌手' && singer !== 'unknown');
    if (validName && validSinger) return 'track:' + name + '|' + singer;
    const src = String(song.source || song.lxSource || song.provider || '').toLowerCase().trim();
    const id = String(song.id || song.mid || song.hash || '').trim();
    if (id) return src + ':' + id;
    if (validName) return 'track:' + name;
    return 'unknown';
  }

  function extractFeatures(song) {
    const title = String(song?.name || '');
    const singer = String(song?.singer || song?.artist || '');
    const meta = (title + ' ' + singer).toLowerCase();
    const hit = (re) => (re.test(meta) ? 1 : 0);

    return {
      ballad: hit(/piano|acoustic|ballad|unplugged|slow|lullaby|纯音乐|钢琴|吉他|民谣|抒情|独白|晚安|轻音乐|催眠|安静|温柔|回忆|告别|眼泪|心碎|寂寞/),
      electronic: hit(/edm|dj|remix|electro|club|synth|dubstep|house|techno|trance|future|电音|舞曲|混音|节奏|节拍|电流|脉冲|狂欢/),
      rockDark: hit(/rock|metal|punk|goth|hardcore|skull|dark|rage|shadow|摇滚|重金属|暗黑|哥特|朋克|风暴|燃烧|破碎|黑暗|深渊|灵魂/),
      hiphop: hit(/rap|hip[\s-]?hop|trap|drill|funk|groove|cypher|说唱|嘻哈|饶舌|街头|808/),
      retroVinyl: hit(/jazz|blues|soul|r&b|rnb|vinyl|retro|vintage|classic|粤语|爵士|蓝调|复古|黑胶|怀旧|老歌|岁月|时光|往事|旧梦/),
      cosmic: hit(/star|galaxy|space|planet|moon|orbit|eclipse|universe|cosmos|星河|星球|宇宙|月球|月蚀|星空|银河|星辰|光年|梦境/),
      rainUrban: hit(/rain|neon|city|cyber|tokyo|night|midnight|street|citypop|雨|霓虹|都市|夜|深夜|赛博|城市|街道|微醺/),
      acgBright: Math.min(1,
        hit(/anime|acg|ost|op|ed|butterfly|spring|summer|sakura|flower|青春|夏日|樱花|晴天|蝴蝶|动漫|阳光|微风|微笑|花瓣/)
        + (/[\u3040-\u30ff]/.test(meta) ? 0.65 : 0)
      ),
      oceanAncient: hit(/ocean|sea|whale|wave|deep|water|ancient|古风|国风|深海|鲸|海|江南|戏腔|禅|竹|烟雨|青丝|红尘|山水|青花/)
    };
  }

  function scoreMode(modeId, f, seedKey) {
    let affinity = 0;
    switch (modeId) {
      case 'off':
        affinity = -0.18 + f.ballad * 0.72 - f.electronic * 0.40 - f.rockDark * 0.35;
        break;
      case 'mine-0':
        affinity = f.ballad * 0.42 + f.retroVinyl * 0.38;
        break;
      case 'mine-1':
        affinity = f.hiphop * 0.78 + f.electronic * 0.45;
        break;
      case 'mine-2':
        affinity = f.cosmic * 0.80 + f.electronic * 0.32;
        break;
      case 'mine-3':
        affinity = f.rockDark * 0.66 + f.ballad * 0.36;
        break;
      case 'mine-4':
        affinity = f.retroVinyl * 0.82 + f.ballad * 0.32;
        break;
      case 'mine-5':
        affinity = f.cosmic * 0.76 + f.ballad * 0.34 + f.oceanAncient * 0.24;
        break;
      case 'mine-6':
        affinity = f.rockDark * 0.84 + f.hiphop * 0.28;
        break;
      case 'mine-7':
        affinity = f.electronic * 0.72 + f.cosmic * 0.28 + f.hiphop * 0.24;
        break;
      case 'mine-8':
        affinity = f.electronic * 0.76 + f.hiphop * 0.56;
        break;
      case 'mine-9':
        affinity = f.cosmic * 0.70 + f.rockDark * 0.42;
        break;
      case 'mine-10':
        affinity = f.rainUrban * 0.86 + f.electronic * 0.36;
        break;
      case 'mine-11':
        affinity = f.acgBright * 0.84;
        break;
      case 'mine-12':
        affinity = f.oceanAncient * 0.84 + f.cosmic * 0.24;
        break;
      case 'folia-partita':
        affinity = f.ballad * 0.68 + f.acgBright * 0.42 + f.oceanAncient * 0.28;
        break;
      case 'folia-pendolo':
        affinity = f.retroVinyl * 0.80 + f.cosmic * 0.42;
        break;
      case 'folia-diorama':
        affinity = f.electronic * 0.76 + f.rainUrban * 0.64 + f.cosmic * 0.30;
        break;
      case 'folia-fume':
        affinity = f.ballad * 0.78 + f.oceanAncient * 0.48;
        break;
      case 'folia-sonnet':
        affinity = f.retroVinyl * 0.68 + f.ballad * 0.54 + f.oceanAncient * 0.30;
        break;
      case 'folia-tempera':
        affinity = f.hiphop * 0.72 + f.rockDark * 0.64 + f.electronic * 0.38;
        break;
      case 'folia-lumiere':
        affinity = f.acgBright * 0.76 + f.cosmic * 0.54;
        break;
      case 'folia-monet':
        affinity = f.oceanAncient * 0.82 + f.ballad * 0.52;
        break;
      case 'folia-cadenza':
        affinity = f.cosmic * 0.74 + f.rainUrban * 0.54;
        break;
      case 'folia-claddagh':
        affinity = f.retroVinyl * 0.68 + f.cosmic * 0.50 + f.oceanAncient * 0.34;
        break;
      case 'folia-tilt':
        affinity = f.hiphop * 0.78 + f.electronic * 0.64 + f.rockDark * 0.38;
        break;
      case 'folia-classic':
        affinity = f.ballad * 0.64 + f.acgBright * 0.52;
        break;
      case 'folia-cappella':
        affinity = f.acgBright * 0.80 + f.hiphop * 0.40 + f.rainUrban * 0.32;
        break;
      default:
        affinity = 0;
        break;
    }
    const spread = hashUnit(seedKey + '|mode|' + modeId);
    return affinity * 0.36 + spread * 0.74;
  }

  function selectSmartMode(opts) {
    const o = opts || {};
    const candidates = (Array.isArray(o.candidates) ? o.candidates : []).filter(id => id && id !== SMART_MODE_ID);
    if (!candidates.length) return { modeId: 'mine-7', catalogSignature: '', songKey: '', cached: false, ready: false };
    const catalogSignature = 'v5:' + candidates.join(',');
    const songKey = canonicalSongKey(o.song);
    const cache = o.cache && o.cache.catalogSignature === catalogSignature && o.cache.choices ? o.cache.choices : null;
    if (cache && cache[songKey] && candidates.includes(cache[songKey])) {
      return { modeId: cache[songKey], catalogSignature, songKey, cached: true, ready: true };
    }
    const f = extractFeatures(o.song);
    const seedKey = catalogSignature + '|' + songKey;
    let bestId = candidates[0];
    let bestScore = -1e9;
    for (let i = 0; i < candidates.length; i++) {
      const id = candidates[i];
      const sc = scoreMode(id, f, seedKey);
      if (sc > bestScore) {
        bestScore = sc;
        bestId = id;
      }
    }
    const ready = Boolean(o.song && songKey && songKey !== 'unknown');
    return { modeId: bestId, catalogSignature, songKey, cached: false, ready };
  }

  return { SMART_MODE_ID, SMART_MODE_LABEL, SMART_MODE_TIP, canonicalSongKey, selectSmartMode };
});
