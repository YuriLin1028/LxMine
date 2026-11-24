/* Public artwork and lyrics for the identified recording. Playback remains with the user's source. */
(function (root) {
  'use strict';
  const cache = new Map();
  const coverCache = new Map();
  const decode = text => String(text || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const cover = value => {
    const raw = decode(value).trim().replace('{size}', '400').replace(/^\/\//, 'https://').replace(/^http:/, 'https:');
    return /^https?:\/\//i.test(raw) || /^data:image\//i.test(raw) || /^file:\/\//i.test(raw) ? raw : '';
  };
  const hasLyrics = value => /\[\d{1,3}:\d{2}|\[\d+,\d+\]/.test(value || '');
  const isInstrumentalText = value => /纯音乐[，,\s]*请欣赏|此歌曲为没有填词的纯音乐|纯音乐无歌词|instrumental/i.test(String(value || ''));
  const INSTRUMENTAL_LRC = '[00:00.00]纯音乐，请欣赏';

  function stripLyricTags(raw) {
    return String(raw || '')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/[<(]\d+,\d+(?:,\d+)?[>)]/g, '')
      .replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '')
      .trim();
  }
  function isForeignLyric(raw) {
    const plain = stripLyricTags(raw);
    if (!plain) return false;
    const kana = (plain.match(/[\u3040-\u30ff]/g) || []).length;
    const hangul = (plain.match(/[\uac00-\ud7af]/g) || []).length;
    if (kana >= 4 || hangul >= 4) return true;
    const latin = (plain.match(/[A-Za-z]/g) || []).length;
    const cjk = (plain.match(/[\u4e00-\u9fff]/g) || []).length;
    const cyrillic = (plain.match(/[\u0400-\u04ff]/g) || []).length;
    if (cyrillic >= 6) return true;
    return latin >= 24 && latin > cjk * 1.4;
  }
  function needsRomajiScript(raw) {
    const plain = stripLyricTags(raw);
    if (!plain) return false;
    const kana = (plain.match(/[\u3040-\u30ff]/g) || []).length;
    const hangul = (plain.match(/[\uac00-\ud7af]/g) || []).length;
    return kana >= 3 || hangul >= 3;
  }

  // Built-in deterministic Korean Hangul (Revised Romanization) & Japanese Kana (Hepburn) fallback
  const HANGUL_L = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
  const HANGUL_V = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
  const HANGUL_T = ['','k','k','k','n','n','n','t','l','l','l','l','l','l','l','l','m','p','p','t','t','ng','t','t','k','t','p','t'];
  const KANA_DIGRAPHS = {
    'きゃ':'kya','きゅ':'kyu','きょ':'kyo','しゃ':'sha','しゅ':'shu','しょ':'sho','ちゃ':'cha','ちゅ':'chu','ちょ':'cho',
    'にゃ':'nya','にゅ':'nyu','にょ':'nyo','ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo','みゃ':'mya','みゅ':'myu','みょ':'myo',
    'りゃ':'rya','りゅ':'ryu','りょ':'ryo','ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo','じゃ':'ja','じゅ':'ju','じょ':'jo',
    'びゃ':'bya','びゅ':'byu','びょ':'byo','ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo','ふぁ':'fa','ふぃ':'fi','ふぇ':'fe','ふぉ':'fo',
    'てぃ':'ti','でぃ':'di','うぃ':'wi','うぇ':'we','うぉ':'wo','ゔぁ':'va','ゔぃ':'vi','ゔぇ':'ve','ゔぉ':'vo'
  };
  const KANA_MONO = {
    'あ':'a','い':'i','う':'u','え':'e','お':'o','か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
    'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so','た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
    'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no','は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
    'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo','や':'ya','ゆ':'yu','よ':'yo','ら':'ra','り':'ri',
    'る':'ru','れ':'re','ろ':'ro','わ':'wa','ゐ':'wi','ゑ':'we','を':'o','ん':'n',
    'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go','ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
    'だ':'da','ぢ':'ji','づ':'zu','デ':'de','で':'de','ど':'do','ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
    'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po','ぁ':'a','ぃ':'i','ぅ':'u','ぇ':'e','ぉ':'o',
    'ゃ':'ya','ゅ':'yu','ょ':'yo','ゔ':'vu','ー':'-'
  };
  function toHiragana(ch) {
    const code = ch.charCodeAt(0);
    return (code >= 0x30a1 && code <= 0x30f6) ? String.fromCharCode(code - 0x60) : ch;
  }
  function romanizeText(text) {
    let out = '';
    const chars = Array.from(String(text || ''));
    let changed = false;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const code = ch.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) {
        const sIdx = code - 0xac00;
        const l = Math.floor(sIdx / 588);
        const v = Math.floor((sIdx % 588) / 28);
        const t = sIdx % 28;
        const nextCode = i + 1 < chars.length ? chars[i + 1].charCodeAt(0) : 0;
        const sep = out && /[a-z]$/i.test(out) ? ' ' : '';
        out += sep + HANGUL_L[l] + HANGUL_V[v] + HANGUL_T[t];
        if (nextCode >= 0xac00 && nextCode <= 0xd7a3) out += ' ';
        changed = true;
        continue;
      }
      const hira = toHiragana(ch);
      if (hira === 'っ') {
        const nextHira = i + 1 < chars.length ? toHiragana(chars[i + 1]) : '';
        const nextPair = i + 2 < chars.length ? nextHira + toHiragana(chars[i + 2]) : '';
        const nextRom = KANA_DIGRAPHS[nextPair] || KANA_MONO[nextHira] || '';
        if (nextRom && /^[a-z]/.test(nextRom)) { out += nextRom[0]; changed = true; continue; }
      }
      if (i + 1 < chars.length) {
        const pair = hira + toHiragana(chars[i + 1]);
        if (KANA_DIGRAPHS[pair]) { out += KANA_DIGRAPHS[pair]; i++; changed = true; continue; }
      }
      if (KANA_MONO[hira]) {
        if (hira === 'ー') {
          const prevVowel = out.match(/[aeiou]$/i);
          out += prevVowel ? prevVowel[0] : '';
        } else {
          out += KANA_MONO[hira];
        }
        changed = true;
        continue;
      }
      out += ch;
    }
    return changed ? out.replace(/\s{2,}/g, ' ').trim() : '';
  }
  function synthesizeRomajiLrc(rawLrc) {
    if (!hasLyrics(rawLrc)) return '';
    const out = [];
    for (const row of String(rawLrc).split(/\r?\n/)) {
      const lx = row.match(/^\[(\d+),(\d+)\](.*)$/);
      if (lx) {
        const ms = Number(lx[1]);
        const body = lx[3].replace(/[<(]\d+,\d+(?:,\d+)?[>)]/g, '').trim();
        const rom = romanizeText(body);
        if (rom) {
          const tag = '[' + String(Math.floor(ms / 60000)).padStart(2, '0') + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0') + ']';
          out.push(tag + rom);
        }
        continue;
      }
      const tags = row.match(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g);
      if (!tags) continue;
      const body = row.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '').replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '').replace(/<-?\d+,-?\d+>/g, '').trim();
      const rom = romanizeText(body);
      if (rom) out.push(tags.join('') + rom);
    }
    return out.join('\n');
  }

  function decodeBase64Utf8(raw) {
    const cleaned = String(raw || '').replace(/\s+/g, '');
    if (!cleaned) return '';
    try {
      if (typeof Buffer !== 'undefined') return Buffer.from(cleaned, 'base64').toString('utf8');
    } catch (_) {}
    try {
      return new TextDecoder().decode(Uint8Array.from(atob(cleaned), ch => ch.charCodeAt(0)));
    } catch (_) {}
    return '';
  }

  function lyricText(value) {
    const text = decode(value);
    if (!text) return '';
    if (hasLyrics(text)) return text;
    if (isInstrumentalText(text)) return INSTRUMENTAL_LRC;
    const decoded = decode(decodeBase64Utf8(text));
    if (hasLyrics(decoded)) return decoded;
    if (isInstrumentalText(decoded)) return INSTRUMENTAL_LRC;
    return text;
  }

  function unwrapJsonp(payload) {
    if (typeof payload !== 'string') return payload || {};
    const trimmed = payload.trim().replace(/^[a-zA-Z0-9_$]+\(([\s\S]*)\)\s*;?$/, '$1');
    try { return JSON.parse(trimmed); } catch (_) { return {}; }
  }

  async function safeJson(io, url, options) {
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await io.json(url, options);
        return unwrapJsonp(raw);
      } catch (err) {
        lastErr = err;
        const msg = String((err && err.message) || err || '');
        const nonRetryable = /\b(?:HTTP\s*)?(?:400|401|403|404|405|410|422)\b/i.test(msg) || /Unexpected token|JSON/i.test(msg);
        if (attempt === 0 && !nonRetryable) await new Promise(r => setTimeout(r, 260));
        else break;
      }
    }
    throw lastErr;
  }

  function cleanAuxLrc(raw) {
    if (!hasLyrics(raw)) return '';
    const kept = [];
    for (const line of String(raw).split(/\r?\n/)) {
      const body = line.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '').replace(/\[\d+,\d+\]/g, '').trim();
      if (!body || /^[\/\\\-—–_~·•\s]+$/.test(body)) continue;
      kept.push(line);
    }
    return kept.join('\n');
  }

  function cleanKeyword(song) {
    const name = String(song.name || '').replace(/\((?:live|现场|伴奏|remix|dj[^)]*)\)/gi, '').trim();
    const singer = String(song.singer || '').replace(/未知歌手|本地文件/g, '').split(/[、,&/;，]/)[0].trim();
    return [name, singer].filter(Boolean).join(' ').trim();
  }

  async function platformCoverOnly(song, io, matching) {
    const existing = cover(song.coverUrl);
    if (existing) return existing;
    const id = encodeURIComponent(song.id);
    if (song.source === 'wy') {
      try {
        const data = await safeJson(io, 'https://music.163.com/api/song/detail?ids=' + encodeURIComponent(JSON.stringify([song.id])) + '&id=' + id, { headers: { Referer: 'https://music.163.com/' } });
        const found = cover(data.songs?.[0]?.al?.picUrl || data.songs?.[0]?.album?.picUrl);
        if (found) return found;
      } catch (_) {}
    } else if (song.source === 'kw') {
      try {
        const data = await safeJson(io, 'https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=' + id, { headers: { Referer: 'https://m.kuwo.cn/' } });
        const found = cover(data.data?.songinfo?.pic || data.data?.songinfo?.albumpic);
        if (found) return found;
      } catch (_) {}
      if (matching?.findMatchingSong) {
        try {
          const cand = await matching.findMatchingSong(song, io, ['kw']);
          const found = cover(cand?.coverUrl);
          if (found) return found;
        } catch (_) {}
      }
    } else if (song.source === 'tx') {
      try {
        const detailId = /^\d+$/.test(song.id) ? { song_id: Number(song.id) } : { song_mid: song.id };
        const data = await safeJson(io, 'https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(JSON.stringify({ req_0: { module: 'music.pf_song_detail_svr', method: 'get_song_detail_yqq', param: { ...detailId, song_type: 0 } } })), { headers: { Referer: 'https://y.qq.com/' } });
        const album = data.req_0?.data?.track_info?.album?.mid || data.req_0?.data?.track_info?.album?.pmid;
        if (album) return 'https://y.gtimg.cn/music/photo_new/T002R500x500M000' + album + '.jpg';
      } catch (_) {}
    } else if (song.source === 'kg' && matching?.findMatchingSong) {
      try {
        const cand = await matching.findMatchingSong(song, io, ['kg']);
        const found = cover(cand?.coverUrl);
        if (found) return found;
      } catch (_) {}
    }
    return '';
  }

  const IGNORED_ARTISTS = new Set([
    '未知歌手', '未知艺人', '未知', '本地文件', '群星', '佚名', '华语群星', '欧美群星',
    'variousartists', 'various', 'unknown', 'unknownartist'
  ]);
  function normMatchText(value) {
    return decode(value).normalize('NFKC').toLowerCase().replace(/[\s·・]/g, '').replace(/[（]/g, '(').replace(/[）]/g, ')');
  }
  function normCoreTitle(value) {
    return normMatchText(value)
      .replace(/\((?:live|现场[^)]*|伴奏|inst\.?|instrumental|remix|dj[^)]*|国语[^)]*|粤语[^)]*|原版|正式版|电影[^)]*|电视剧[^)]*|动画[^)]*|游戏[^)]*|片头[^)]*|片尾[^)]*|插曲|主题曲|推广曲|宣传曲|ost|acoustic|version|ver\.?)\)/gi, '')
      .replace(/【(?:live|现场[^】]*|伴奏|电影[^】]*|电视剧[^】]*|ost|主题曲|插曲|片尾曲)】/gi, '')
      .replace(/-(?:live|现场版?|伴奏|remix|inst\.?)$/gi, '')
      .replace(/[^\p{L}\p{N}]/gu, '');
  }
  function normArtistTokens(value) {
    const preSplit = decode(value).replace(/(?:\s+|\()(?:featuring|feat|ft|with|vs)\.?(?:\s+|\))/gi, ',');
    return normMatchText(preSplit)
      .split(/[、,&/;，/|]+/)
      .map(part => part.replace(/\([^)]*\)/g, '').replace(/^[a-z.]+(?=[\u4e00-\u9fff])/i, '').replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(part => part && !IGNORED_ARTISTS.has(part));
  }
  function hasArtistOverlapLocal(origArtists, candArtists) {
    if (!origArtists.length || !candArtists.length) return false;
    return origArtists.some(a => candArtists.some(b => {
      if (a === b) return true;
      const minLen = Math.min(a.length, b.length);
      const hasCjk = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(a) || /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(b);
      if (hasCjk ? minLen >= 2 : minLen >= 4) {
        return a.includes(b) || b.includes(a);
      }
      return false;
    }));
  }
  function extractLrcTimestampsMs(raw) {
    const times = [];
    for (const line of String(raw || '').split(/\r?\n/)) {
      const lx = line.match(/^\[(\d+),(\d+)\](.*)$/);
      if (lx) {
        const body = lx[3].replace(/[<(]\d+,\d+(?:,\d+)?[>)]/g, '').trim();
        if (body && !/^(?:作词|作曲|编曲|制作人|混音|母带|出品)\s*[:：]/.test(body)) times.push(Number(lx[1]));
        continue;
      }
      const m = line.match(/^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$/);
      if (m) {
        const body = m[4].replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '').replace(/<-?\d+,-?\d+>/g, '').trim();
        if (!body || /^(?:作词|作曲|编曲|制作人|混音|母带|出品)\s*[:：]/.test(body)) continue;
        const min = Number(m[1]);
        const sec = Number(m[2]);
        const frac = m[3] ? Number(String(m[3]).padEnd(3, '0').slice(0, 3)) : 0;
        times.push(min * 60000 + sec * 1000 + frac);
      }
    }
    return times.sort((a, b) => a - b);
  }
  function isLyricConsistentWithSong(rawLrc, song) {
    if (!hasLyrics(rawLrc) || !song) return false;
    const text = String(rawLrc || '');
    const tiMatch = text.match(/\[ti\s*:\s*([^\]]+)\]/i);
    const arMatch = text.match(/\[ar\s*:\s*([^\]]+)\]/i);
    const origTitleCore = normCoreTitle(song.name || '');
    const origArtists = normArtistTokens(song.singer || song.artist || '');
    if (arMatch && origArtists.length) {
      const lrcArtists = normArtistTokens(arMatch[1]);
      if (lrcArtists.length && !hasArtistOverlapLocal(origArtists, lrcArtists)) {
        return false;
      }
    }
    if (tiMatch && origTitleCore) {
      const lrcTitleRaw = decode(tiMatch[1]).trim();
      // Some LRC files put "歌手 - 歌名" inside [ti:...]; check both whole and split parts.
      const parts = lrcTitleRaw.split(/\s*-\s*/).map(normCoreTitle).filter(Boolean);
      const fullCore = normCoreTitle(lrcTitleRaw);
      const candidates = [fullCore, ...parts].filter(Boolean);
      if (candidates.length) {
        const ok = candidates.some(c => c === origTitleCore || (Math.min(c.length, origTitleCore.length) >= 3 && (c.includes(origTitleCore) || origTitleCore.includes(c))));
        if (!ok) return false;
      }
    }
    const durMs = Number(song.durationMs || song.duration || 0) || 0;
    if (durMs >= 60000) {
      const times = extractLrcTimestampsMs(text);
      if (times.length >= 4) {
        const lastTime = times[times.length - 1];
        // Reject lyrics from a completely different-length recording (e.g. 5:30 song on a 2:50 track).
        if (lastTime > durMs + 24000) return false;
      }
    }
    return true;
  }
  function lyricsTimelineCompatible(primaryLrc, secondaryLrc) {
    const a = extractLrcTimestampsMs(primaryLrc);
    const b = extractLrcTimestampsMs(secondaryLrc);
    if (a.length < 3 || b.length < 3) return true;
    const firstDiff = Math.abs(a[0] - b[0]);
    const lastDiff = Math.abs(a[a.length - 1] - b[b.length - 1]);
    if (firstDiff > 8000 && lastDiff > 8000) return false;
    let matchedWithin3s = 0;
    const sampleCount = Math.min(a.length, 12);
    for (let i = 0; i < sampleCount; i++) {
      const t = a[Math.floor((i * a.length) / sampleCount)];
      let best = Infinity;
      for (let j = 0; j < b.length; j++) {
        const d = Math.abs(b[j] - t);
        if (d < best) best = d;
      }
      if (best <= 2800) matchedWithin3s += 1;
    }
    return matchedWithin3s >= Math.ceil(sampleCount * 0.5);
  }
  function extractNormalizedLyricBodies(raw) {
    const out = [];
    for (const row of String(raw || '').split(/\r?\n/)) {
      const body = row
        .replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '')
        .replace(/^\[\d+,\d+\]/, '')
        .replace(/[<(]\d+,\d+(?:,\d+)?[>)]/g, '')
        .replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '')
        .replace(/<-?\d+,-?\d+>/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '')
        .toLowerCase()
        .trim();
      if (body.length >= 2 && !/^(?:ti|ar|al|by|offset)/.test(body)) out.push(body);
    }
    return out;
  }
  function lyricsContentMatches(officialLrc, candidateLrc) {
    const a = extractNormalizedLyricBodies(officialLrc);
    const b = extractNormalizedLyricBodies(candidateLrc);
    if (!a.length || !b.length) return false;
    const setA = new Set(a);
    let hits = 0;
    const checkCount = Math.min(b.length, 16);
    for (let i = 0; i < checkCount; i++) {
      const line = b[Math.floor((i * b.length) / checkCount)];
      if (setA.has(line) || a.some(ref => ref.includes(line) || line.includes(ref))) hits += 1;
    }
    return hits >= Math.max(2, Math.ceil(checkCount * 0.5));
  }

  async function fetchKugouLyricBySearch(song, io, includeHash) {
    const keyword = cleanKeyword(song) || [song.name, song.singer].filter(Boolean).join(' ').trim();
    if (!keyword && !includeHash) return '';
    const rawHash = String(song.hash || (song.source === 'kg' ? song.id : '') || '').trim();
    const validHash = /^[0-9a-f]{32}$/i.test(rawHash) ? rawHash : '';
    const hashParam = (includeHash && validHash) ? '&hash=' + encodeURIComponent(validHash) : '';
    const data = await safeJson(io, 'https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=' + encodeURIComponent(includeHash ? ([song.name, song.singer].filter(Boolean).join(' ').trim() || keyword) : keyword) + '&duration=' + (song.durationMs || 0) + hashParam);
    const candidates = Array.isArray(data.candidates) ? data.candidates.filter(item => item && item.id && item.accesskey) : [];
    if (!candidates.length) return '';

    const origCore = normCoreTitle(song.name || '');
    const origArtists = normArtistTokens(song.singer || song.artist || '');
    const origDur = Number(song.durationMs || 0) || 0;
    const origHasInst = /伴奏|inst\.?\b|instrumental|karaoke|纯音乐/i.test(song.name || '');

    let bestCand = null;
    let bestScore = -1;
    for (const item of candidates) {
      const candSongRaw = decode(item.song || '');
      const candSingerRaw = decode(item.singer || '');
      const candCore = normCoreTitle(candSongRaw);
      const candArtists = normArtistTokens(candSingerRaw);
      const candDur = Number(item.duration || 0) || 0;

      if (!origHasInst && /伴奏|inst\.?\b|instrumental|karaoke|卡拉ok/i.test(candSongRaw)) continue;
      if (origCore && candCore) {
        const sameCore = candCore === origCore
          || (Math.min(origCore.length, candCore.length) >= 4 && (candCore.startsWith(origCore) || origCore.startsWith(candCore)));
        if (!sameCore) continue;
      } else if (origCore && !candCore && !(includeHash && validHash)) {
        continue;
      }

      if (origArtists.length && candArtists.length && !hasArtistOverlapLocal(origArtists, candArtists)) {
        continue;
      }

      if (origDur > 0 && candDur > 0 && Math.abs(origDur - candDur) > 12000) {
        continue;
      }

      let s = 50;
      if (origCore && candCore === origCore) s += 30;
      if (origArtists.length && candArtists.length && hasArtistOverlapLocal(origArtists, candArtists)) s += 35;
      if (origDur > 0 && candDur > 0) {
        const diff = Math.abs(origDur - candDur);
        if (diff <= 2500) s += 20;
        else if (diff <= 6000) s += 10;
      }
      s += Math.min(12, (Number(item.score) || 0) / 10);
      if (s > bestScore) {
        bestScore = s;
        bestCand = item;
      }
    }

    if (!bestCand) return '';
    const lyric = await safeJson(io, 'https://lyrics.kugou.com/download?ver=1&client=pc&id=' + encodeURIComponent(bestCand.id) + '&accesskey=' + encodeURIComponent(bestCand.accesskey) + '&fmt=lrc&charset=utf8');
    const decoded = lyricText(lyric.content);
    if (decoded && decoded !== INSTRUMENTAL_LRC && !isLyricConsistentWithSong(decoded, song)) return '';
    return decoded;
  }

  async function platformAssets(song, io, matching, isPrimaryId = false) {
    const id = encodeURIComponent(song.id);
    const assets = { coverUrl: cover(song.coverUrl), lyric: '', tlyric: '', romalrc: '', instrumental: false, exactIdMatch: false };
    if (song.source === 'wy') {
      await Promise.allSettled([
        !assets.coverUrl ? safeJson(io, 'https://music.163.com/api/song/detail?ids=' + encodeURIComponent(JSON.stringify([song.id])), { headers: { Referer: 'https://music.163.com/' } }).then(data => {
          assets.coverUrl = cover(data.songs?.[0]?.al?.picUrl || data.songs?.[0]?.album?.picUrl || assets.coverUrl);
        }) : Promise.resolve(),
        safeJson(io, 'https://music.163.com/api/song/lyric?id=' + id + '&lv=-1&kv=-1&tv=-1&rv=-1&yv=-1&ytv=-1&yrv=-1', { headers: { Referer: 'https://music.163.com/' } }).then(data => {
          const rawLyric = data.yrc?.lyric || data.lrc?.lyric || '';
          if (data.nolyric || data.pureMusic || isInstrumentalText(rawLyric)) {
            assets.instrumental = true;
            assets.lyric = hasLyrics(rawLyric) ? rawLyric : INSTRUMENTAL_LRC;
            if (isPrimaryId) assets.exactIdMatch = true;
          } else {
            assets.lyric = lyricText(rawLyric);
            if (isPrimaryId && hasLyrics(assets.lyric)) assets.exactIdMatch = true;
          }
          assets.tlyric = lyricText(data.ytlrc?.lyric || data.tlyric?.lyric || '');
          assets.romalrc = lyricText(data.yromalrc?.lyric || data.romalrc?.lyric || '');
        })
      ]);
    } else if (song.source === 'kw') {
      const data = await safeJson(io, 'https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=' + id, { headers: { Referer: 'https://m.kuwo.cn/' } });
      assets.coverUrl = cover(data.data?.songinfo?.pic || data.data?.songinfo?.albumpic || assets.coverUrl);
      const lrclist = data.data?.lrclist || [];
      assets.lyric = lrclist.map(line => {
        const ms = Math.max(0, Math.round(Number(line.time) * 1000));
        return '[' + Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0') + ']' + decode(line.lineLyric);
      }).join('\n');
      if (isInstrumentalText(assets.lyric)) {
        assets.instrumental = true;
        if (!hasLyrics(assets.lyric)) assets.lyric = INSTRUMENTAL_LRC;
      }
      if (isPrimaryId && (hasLyrics(assets.lyric) || assets.instrumental)) assets.exactIdMatch = true;
    } else if (song.source === 'tx') {
      const isNum = /^\d+$/.test(song.id);
      const detailId = isNum ? { song_id: Number(song.id) } : { song_mid: song.id };
      await Promise.allSettled([
        !assets.coverUrl ? safeJson(io, 'https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(JSON.stringify({ req_0: { module: 'music.pf_song_detail_svr', method: 'get_song_detail_yqq', param: { ...detailId, song_type: 0 } } })), { headers: { Referer: 'https://y.qq.com/' } }).then(data => {
          const album = data.req_0?.data?.track_info?.album?.mid || data.req_0?.data?.track_info?.album?.pmid;
          if (album) assets.coverUrl = 'https://y.gtimg.cn/music/photo_new/T002R500x500M000' + album + '.jpg';
        }) : Promise.resolve(),
        safeJson(io, 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?' + (isNum ? 'songid=' : 'songmid=') + id + '&format=json&inCharset=utf8&outCharset=utf-8&nobase64=1', { headers: { Referer: 'https://y.qq.com/' } }).then(data => {
          assets.lyric = lyricText(data.lyric);
          assets.tlyric = lyricText(data.trans);
          if (assets.lyric === INSTRUMENTAL_LRC || isInstrumentalText(assets.lyric)) assets.instrumental = true;
          if (isPrimaryId && (hasLyrics(assets.lyric) || assets.instrumental)) assets.exactIdMatch = true;
        })
      ]);
      const txNeedsExtra = !hasLyrics(assets.lyric)
        || (isForeignLyric(assets.lyric) && !hasLyrics(assets.tlyric))
        || (needsRomajiScript(assets.lyric) && !hasLyrics(assets.romalrc));
      if (txNeedsExtra && !assets.instrumental) {
        try {
          const musicu = await safeJson(io, 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
            req_1: { module: 'music.musichallSong.PlayLyricInfo', method: 'GetPlayLyricInfo', param: isNum
              ? { songID: Number(song.id), crypt: 0, lrc_t: 0, trans: 1, trans_t: 0, roma: 1, roma_t: 0, qrc: 0 }
              : { songMid: song.id, crypt: 0, lrc_t: 0, trans: 1, trans_t: 0, roma: 1, roma_t: 0, qrc: 0 } }
          })), { headers: { Referer: 'https://y.qq.com/' } });
          const info = musicu.req_1?.data;
          if (info?.lyric && !hasLyrics(assets.lyric)) {
            assets.lyric = lyricText(info.lyric);
            if (assets.lyric === INSTRUMENTAL_LRC || isInstrumentalText(assets.lyric)) assets.instrumental = true;
            if (isPrimaryId && (hasLyrics(assets.lyric) || assets.instrumental)) assets.exactIdMatch = true;
          }
          if (info?.trans && !hasLyrics(assets.tlyric)) assets.tlyric = lyricText(info.trans);
          if (info?.roma && !hasLyrics(assets.romalrc)) assets.romalrc = lyricText(info.roma);
        } catch (_) {}
      }
    } else if (song.source === 'kg') {
      await Promise.allSettled([
        (async () => {
          let usedExactHash = true;
          let lrc = await fetchKugouLyricBySearch(song, io, true);
          if (!hasLyrics(lrc) && !isInstrumentalText(lrc) && song.name && /^[0-9a-f]{32}$/i.test(String(song.hash || song.id))) {
            usedExactHash = false;
            try { lrc = await fetchKugouLyricBySearch(song, io, false); } catch (_) {}
          }
          assets.lyric = lrc;
          if (assets.lyric === INSTRUMENTAL_LRC || isInstrumentalText(assets.lyric)) assets.instrumental = true;
          if (isPrimaryId && usedExactHash && (hasLyrics(assets.lyric) || assets.instrumental)) assets.exactIdMatch = true;
        })(),
        !assets.coverUrl && matching?.findMatchingSong ? matching.findMatchingSong(song, io, ['kg']).then(candidate => {
          assets.coverUrl = cover(candidate.coverUrl);
        }) : Promise.resolve()
      ]);
    }
    return assets;
  }

  function applyFallback(assets, fallback, adoptPaired) {
    if (!assets.coverUrl && fallback.coverUrl) assets.coverUrl = cover(fallback.coverUrl);
    if (!hasLyrics(assets.lyric) && !assets.instrumental) {
      if (hasLyrics(fallback.lyric)) {
        assets.lyric = fallback.lyric;
        assets.tlyric = fallback.tlyric || assets.tlyric;
        assets.romalrc = fallback.romalrc || assets.romalrc;
        if (fallback.instrumental) assets.instrumental = true;
      } else if (fallback.instrumental) {
        assets.instrumental = true;
        assets.lyric = INSTRUMENTAL_LRC;
      }
      return;
    }
    const gainedTrans = !hasLyrics(assets.tlyric) && hasLyrics(fallback.tlyric);
    const gainedRoma = !hasLyrics(assets.romalrc) && hasLyrics(fallback.romalrc);
    if (gainedTrans || gainedRoma) {
      const refLrc = hasLyrics(fallback.lyric) ? fallback.lyric : (fallback.tlyric || fallback.romalrc);
      if (!lyricsTimelineCompatible(assets.lyric, refLrc)) return;
      if (adoptPaired && !assets.exactIdMatch && hasLyrics(fallback.lyric) && lyricsContentMatches(assets.lyric, fallback.lyric) && !hasLyrics(assets.tlyric) && !hasLyrics(assets.romalrc)) {
        assets.lyric = fallback.lyric;
      }
      if (gainedTrans) assets.tlyric = fallback.tlyric;
      if (gainedRoma) assets.romalrc = fallback.romalrc;
    }
  }

  function pickVerifiedNeteaseCover(song, wySongs) {
    if (!Array.isArray(wySongs) || !wySongs.length) return '';
    const origCore = normCoreTitle(song.name || '');
    const origArtists = normArtistTokens(song.singer || song.artist || '');
    for (const item of wySongs) {
      const pic = item?.al?.picUrl || item?.album?.picUrl;
      if (!pic) continue;
      const candCore = normCoreTitle(item?.name || '');
      if (origCore && candCore && candCore !== origCore) continue;
      const candSinger = (item?.ar || item?.artists || []).map(a => a?.name || '').join('、');
      const candArtists = normArtistTokens(candSinger);
      if (origArtists.length && candArtists.length && !hasArtistOverlapLocal(origArtists, candArtists)) continue;
      return cover(pic);
    }
    return '';
  }

  async function getCover(song, io, matching) {
    if (!song) return '';
    const existing = cover(song.coverUrl);
    if (existing) return existing;
    if (song.source === 'local') return '';
    const key = [song.source, song.id, song.name || '', song.singer || ''].join('|');
    const cached = coverCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.promise;
    const pending = (async () => {
      let url = '';
      try { url = await platformCoverOnly(song, io, matching); } catch (_) {}
      if (!url && matching?.findMatchingSong) {
        const altSources = ['wy', 'tx', 'kg', 'kw'].filter(s => s !== song.source);
        try {
          url = await Promise.any(altSources.map(async (src) => {
            const cand = await matching.findMatchingSong(song, io, [src]);
            const found = cover(cand.coverUrl) || await platformCoverOnly(cand, io, matching);
            if (!found) throw new Error('no_cover');
            return found;
          }));
        } catch (_) {}
      }
      if (!url && matching?.searchPlatformCandidates) {
        try {
          const candidates = await matching.searchPlatformCandidates(song, io, ['wy', 'tx', 'kg', 'kw'], 3);
          for (const cand of candidates) {
            url = cover(cand.coverUrl) || await platformCoverOnly(cand, io, matching);
            if (url) break;
          }
        } catch (_) {}
      }
      if (!url && song.name) {
        try {
          const kw = cleanKeyword(song) || song.name;
          const res = await safeJson(io, 'https://music.163.com/api/cloudsearch/pc?' + new URLSearchParams({ s: kw, type: '1', limit: '5', offset: '0' }), { headers: { Referer: 'https://music.163.com/' } });
          url = pickVerifiedNeteaseCover(song, res.result?.songs);
        } catch (_) {}
      }
      coverCache.set(key, { promise: Promise.resolve(url), expires: Date.now() + (url ? 3600000 : 20000) });
      return url;
    })();
    coverCache.set(key, { promise: pending, expires: Date.now() + 30000 });
    if (coverCache.size > 256) coverCache.delete(coverCache.keys().next().value);
    return pending;
  }

  async function get(song, io, matching) {
    if (song.source === 'local') {
      if (!song.name || song.name === '未知歌曲') return { coverUrl: song.coverUrl || '', lyric: '', tlyric: '', romalrc: '', exactIdMatch: false };
    }
    const coverKey = [song.source, song.id, song.name || '', song.singer || ''].join('|');
    const key = [song.source, song.id, song.name || '', song.singer || '', song.durationMs || ''].join('|');
    const previous = cache.get(key);
    if (previous && previous.expires > Date.now()) {
      return previous.promise.then(res => (song.coverUrl && res && !res.coverUrl ? { ...res, coverUrl: cover(song.coverUrl) } : res));
    }
    const pending = (async () => {
      let assets;
      if (song.source === 'local') {
        assets = { coverUrl: song.coverUrl || '', lyric: '', tlyric: '', romalrc: '', instrumental: false, exactIdMatch: false };
      } else {
        try { assets = await platformAssets(song, io, matching, true); }
        catch (_) { assets = { coverUrl: cover(song.coverUrl), lyric: '', tlyric: '', romalrc: '', instrumental: false, exactIdMatch: false }; }
      }
      // Tier 1: Strict recording match across remaining platforms in parallel (preserves exact version e.g. Live).
      if ((!assets.coverUrl || (!hasLyrics(assets.lyric) && !assets.instrumental)) && matching?.findMatchingSong) {
        const others = ['wy', 'kg', 'kw', 'tx'].filter(source => source !== song.source);
        const settled = await Promise.allSettled(others.map(async (src) => {
          const candidate = await matching.findMatchingSong(song, io, [src]);
          return platformAssets(candidate, io, matching, false);
        }));
        for (const entry of settled) {
          if (entry.status !== 'fulfilled' || !entry.value) continue;
          const fallback = entry.value;
          if (!hasLyrics(fallback.lyric) || fallback.instrumental || isLyricConsistentWithSong(fallback.lyric, song)) {
            applyFallback(assets, fallback, false);
          }
          if (assets.coverUrl && (hasLyrics(assets.lyric) || assets.instrumental)) break;
        }
      }
      // Tier 2: Verified same-artist cross-platform match (handles "G.E.M.邓紫棋" vs "邓紫棋").
      if ((!assets.coverUrl || (!hasLyrics(assets.lyric) && !assets.instrumental)) && matching?.searchPlatformCandidates) {
        try {
          const candidates = await matching.searchPlatformCandidates(song, io, ['wy', 'tx', 'kg', 'kw'], 2);
          for (const candidate of candidates.slice(0, 4)) {
            if (assets.coverUrl && (hasLyrics(assets.lyric) || assets.instrumental)) break;
            try {
              const fallback = await platformAssets(candidate, io, matching, false);
              if (!hasLyrics(fallback.lyric) || fallback.instrumental || isLyricConsistentWithSong(fallback.lyric, song)) {
                applyFallback(assets, fallback, false);
              }
            } catch (_) {}
          }
        } catch (_) {}
      }
      // Tier 3: Validated Kugou keyword lyric search (strictly checks song title, artist overlap & duration).
      if (!hasLyrics(assets.lyric) && !assets.instrumental && song.name) {
        try {
          const kwLyric = await fetchKugouLyricBySearch(song, io, false);
          if (hasLyrics(kwLyric)) assets.lyric = kwLyric;
          else if (kwLyric === INSTRUMENTAL_LRC) { assets.instrumental = true; assets.lyric = INSTRUMENTAL_LRC; }
        } catch (_) {}
      }
      // Tier 3.5: Cross-platform enrichment for missing translation (tlyric) & romaji (romalrc) on foreign-language tracks.
      const wantTrans = !assets.instrumental && hasLyrics(assets.lyric) && isForeignLyric(assets.lyric) && !hasLyrics(assets.tlyric);
      const wantRoma = !assets.instrumental && hasLyrics(assets.lyric) && needsRomajiScript(assets.lyric) && !hasLyrics(assets.romalrc);
      if (wantTrans || wantRoma) {
        const adoptPaired = !assets.exactIdMatch && (song.source === 'kw' || song.source === 'kg' || song.source === 'local');
        const auxPlatforms = ['wy', 'tx'].filter(src => src !== song.source);
        const searchPlatforms = auxPlatforms.length ? auxPlatforms : ['wy', 'tx'];
        if (matching?.findMatchingSong) {
          const matched = await Promise.allSettled(searchPlatforms.map(src =>
            matching.findMatchingSong(song, io, [src]).then(cand => platformAssets(cand, io, matching, false))
          ));
          for (const entry of matched) {
            if (entry.status === 'fulfilled' && entry.value) applyFallback(assets, entry.value, adoptPaired);
          }
        }
        if (((wantTrans && !hasLyrics(assets.tlyric)) || (wantRoma && !hasLyrics(assets.romalrc))) && matching?.searchPlatformCandidates) {
          try {
            const cands = (await matching.searchPlatformCandidates(song, io, searchPlatforms, 2))
              .filter(cand => !song.durationMs || !cand.durationMs || Math.abs(song.durationMs - cand.durationMs) <= 5000);
            const enrichedList = await Promise.allSettled(cands.slice(0, 3).map(cand => platformAssets(cand, io, matching, false)));
            for (const entry of enrichedList) {
              if (entry.status === 'fulfilled' && entry.value) applyFallback(assets, entry.value, adoptPaired);
            }
          } catch (_) {}
        }
      }
      // Tier 4: Deterministic built-in Korean Hangul / Japanese Kana romanization safety net when no upstream romalrc exists.
      if (!assets.instrumental && hasLyrics(assets.lyric) && needsRomajiScript(assets.lyric) && !hasLyrics(assets.romalrc)) {
        const synth = synthesizeRomajiLrc(assets.lyric);
        if (hasLyrics(synth)) assets.romalrc = synth;
      }
      if (!assets.coverUrl && song.source !== 'local' && song.name) {
        try {
          const kw = cleanKeyword(song) || song.name;
          const res = await safeJson(io, 'https://music.163.com/api/cloudsearch/pc?' + new URLSearchParams({ s: kw, type: '1', limit: '5', offset: '0' }), { headers: { Referer: 'https://music.163.com/' } });
          const pic = pickVerifiedNeteaseCover(song, res.result?.songs);
          if (pic) assets.coverUrl = pic;
        } catch (_) {}
      }
      const out = {
        coverUrl: assets.coverUrl || '',
        lyric: assets.lyric || '',
        tlyric: cleanAuxLrc(assets.tlyric || ''),
        romalrc: cleanAuxLrc(assets.romalrc || ''),
        instrumental: Boolean(assets.instrumental),
        exactIdMatch: Boolean(assets.exactIdMatch)
      };
      if (out.coverUrl && !coverCache.has(coverKey)) {
        coverCache.set(coverKey, { promise: Promise.resolve(out.coverUrl), expires: Date.now() + 3600000 });
        if (coverCache.size > 256) coverCache.delete(coverCache.keys().next().value);
      }
      // Never cache missing lyrics: transient network errors or timeouts must recover immediately on retry without needing track-switch.
      if (hasLyrics(out.lyric) || assets.instrumental) {
        cache.set(key, { promise: Promise.resolve(out), expires: Date.now() + 3600000 });
      } else {
        cache.delete(key);
      }
      return out;
    })();
    cache.set(key, { promise: pending, expires: Date.now() + 30000 });
    if (cache.size > 160) cache.delete(cache.keys().next().value);
    return pending;
  }

  const api = { get, getCover, hasLyrics, isInstrumentalText, isLyricConsistentWithSong, lyricsContentMatches };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LxSongAssets = api;
})(typeof window !== 'undefined' ? window : globalThis);
