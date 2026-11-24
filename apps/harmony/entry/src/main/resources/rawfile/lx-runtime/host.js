/* Native bridge entry points for isolated source activation and playlist metadata import. */
function __lxParseJson(body) {
  if (typeof body !== 'string') return body;
  var trimmed = body.trim().replace(/^[a-zA-Z0-9_$]+\(([\s\S]*)\)\s*;?$/, '$1');
  return JSON5.parse(trimmed);
}

function __lxEapiEncrypt(apiUrl, object) {
  var text = typeof object === 'object' ? JSON.stringify(object) : String(object);
  var message = 'nobody' + apiUrl + 'use' + text + 'md5forencrypt';
  var digest = CryptoJS.MD5(message).toString();
  var plain = apiUrl + '-36cd479b6b5-' + text + '-36cd479b6b5-' + digest;
  return CryptoJS.AES.encrypt(
    CryptoJS.enc.Utf8.parse(plain),
    CryptoJS.enc.Utf8.parse('e82ckenh8dichen8'),
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
  ).ciphertext.toString(CryptoJS.enc.Hex).toUpperCase();
}

function __lxMakeIo(timeoutMs) {
  return {
    json: function (url, options, check) {
      return new Promise(function (resolve, reject) {
        window.lx.request(url, Object.assign({ timeout: timeoutMs || 8000 }, options || {}), function (error, response, body) {
          if (error) return reject(error);
          if (response.statusCode !== 200) return reject(new Error('HTTP ' + response.statusCode));
          try {
            var data = __lxParseJson(body);
            if (typeof check === 'function') check(data);
            resolve(data);
          } catch (e) { reject(e); }
        });
      });
    },
    page: function (url) {
      return new Promise(function (resolve, reject) {
        window.lx.request(url, { timeout: timeoutMs || 9000 }, function (error, response, body) {
          if (error) return reject(error);
          var headers = (response && response.headers) || {};
          resolve({ body: body, location: headers.location || headers.Location });
        });
      });
    },
    md5: function (text) { return CryptoJS.MD5(text).toString(); },
    eapiEncrypt: __lxEapiEncrypt
  };
}

window.__lxRunSource = function (script, info) {
  window.__lxReset();
  window.__lxScriptInfo = info;
  new Function(script)();
};

window.__lxImportPlaylist = function (id, input, source) {
  window.LxPlaylists.importPlaylist(input, source, {
    page: function (url) {
      return new Promise(function (resolve, reject) {
        window.lx.request(url, {}, function (error, response, body) {
          if (error) return reject(error);
          const headers = response.headers || {};
          resolve({ body: body, location: headers.location || headers.Location });
        });
      });
    },
    md5: function (text) { return CryptoJS.MD5(text).toString(); },
    json: function (url, options, check) {
      return new Promise(function (resolve, reject) {
        window.lx.request(url, options || {}, function (error, response, body) {
          if (error) { reject(error); return; }
          if (response.statusCode !== 200) { reject(new Error('HTTP ' + response.statusCode)); return; }
          try {
            const data = __lxParseJson(body);
            if (typeof check === 'function') check(data);
            window.__lxNative.onResult(id, JSON.stringify({ progress: true }));
            resolve(data);
          } catch (e) { reject(e); }
        });
      });
    },
    linuxEncrypt: function (payload) {
      return CryptoJS.AES.encrypt(JSON.stringify(payload), CryptoJS.enc.Utf8.parse('rFgB&h#%2?^eDg:Q'), {
        mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7
      }).ciphertext.toString(CryptoJS.enc.Hex).toUpperCase();
    },
    eapiEncrypt: __lxEapiEncrypt
  }).then(function (data) {
    window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: data }));
  }).catch(function (error) {
    window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: error.message }));
  });
};

const __lxPool = {};
const __lxSourceHealth = {};
const __lxPreviewUrlRe = /(?:free_?trial|try_?listen|audition|shiting|preview_?(?:30|45|60)|(?:30|45|60)s_?trial|trial_?play|\/trial\/|[?&](?:free|try|trial|preview)=1(?:&|$))/i;
const __lxChromeUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const __lxQualityOrder = ['flac24bit', 'flac', '320k', '128k'];

function __lxBuildQualityChain(requested) {
  const req = String(requested || '128k');
  const idx = __lxQualityOrder.indexOf(req);
  if (idx >= 0) {
    const chain = __lxQualityOrder.slice(idx);
    if (req === '128k') chain.push('320k');
    return chain;
  }
  return [req, '320k', '128k'];
}

function __lxFormatInterval(interval, durationMs) {
  if (typeof interval === 'string' && /^\d+:\d{2}$/.test(interval.trim())) return interval.trim();
  const totalSec = Number(interval) > 0 ? Math.floor(Number(interval)) : Math.floor((Number(durationMs) || 0) / 1000);
  if (totalSec <= 0) return '';
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function __lxIsCoolingDown(sourceId) {
  const h = __lxSourceHealth[sourceId];
  return !!(h && h.failCount >= 2 && Date.now() - h.lastFailAt < 20000);
}
function __lxMarkOk(sourceId) {
  __lxSourceHealth[sourceId] = { failCount: 0, lastFailAt: 0, lastOkAt: Date.now() };
}
function __lxMarkFail(sourceId, err) {
  const msg = String((err && err.message) || err || '');
  if (msg === 'unsupported_platform' || msg === 'preview_30s' || msg === 'excluded_url' || msg === 'wrong_version' || msg === 'init_timeout') return;
  const prev = __lxSourceHealth[sourceId] || { failCount: 0, lastFailAt: 0, lastOkAt: 0 };
  __lxSourceHealth[sourceId] = { failCount: prev.failCount + 1, lastFailAt: Date.now(), lastOkAt: prev.lastOkAt };
}

function __lxWithTimeout(promise, ms, label) {
  return new Promise(function (resolve, reject) {
    let done = false;
    const timer = setTimeout(function () {
      if (!done) { done = true; reject(new Error(label || 'timeout')); }
    }, ms);
    Promise.resolve(promise).then(
      function (val) { if (!done) { done = true; clearTimeout(timer); resolve(val); } },
      function (err) { if (!done) { done = true; clearTimeout(timer); reject(err); } }
    );
  });
}

function __lxInitPooledSource(src) {
  const key = String(src.id || src.name || '');
  const rawScript = String(src.script || '');
  const sig = String(rawScript.length) + ':' + rawScript.slice(0, 64) + ':' + rawScript.slice(-64);
  const cached = __lxPool[key];
  if (cached && cached.sig === sig && cached.ready) return Promise.resolve(cached);
  if (cached && cached.sig === sig && cached.promise) return cached.promise;

  const entry = { id: key, name: src.name || key, sig: sig, ready: false, handler: null, info: null, promise: null };
  entry.promise = __lxWithTimeout(new Promise(function (resolve, reject) {
    let settled = false;
    const baseLx = window.__lxBaseApi || window.lx;
    window.__lxBaseApi = baseLx;
    const localLx = {
      EVENT_NAMES: baseLx.EVENT_NAMES,
      version: baseLx.version,
      env: baseLx.env,
      currentScriptInfo: {
        name: src.name || '',
        description: src.description || '',
        version: src.version || '',
        author: src.author || '',
        homepage: src.homepage || '',
        rawScript: src.script || ''
      },
      utils: baseLx.utils,
      request: baseLx.request,
      on: function (eventName, handler) {
        if (eventName !== baseLx.EVENT_NAMES.request) return Promise.reject(new Error('unsupported_event'));
        if (typeof handler !== 'function') return Promise.reject(new Error('invalid_handler'));
        entry.handler = handler;
        return Promise.resolve();
      },
      send: function (eventName, data) {
        if (eventName === baseLx.EVENT_NAMES.inited) {
          entry.info = data || {};
          entry.ready = true;
          if (!settled) { settled = true; resolve(entry); }
          return Promise.resolve();
        }
        return Promise.resolve();
      }
    };
    const prevLx = window.lx;
    try {
      const localGlobal = Object.create(window);
      localGlobal.lx = localLx;
      localGlobal.Buffer = window.Buffer || window.LxBuffer;
      // 同步执行期间临时将 window.lx 指向 localLx，兼容混淆脚本通过 window.lx 或 Function('return this')().lx 访问。
      window.lx = localLx;
      new Function('lx', 'globalThis', 'window', 'self', 'Buffer', String(src.script || ''))(
        localLx,
        localGlobal,
        localGlobal,
        localGlobal,
        window.Buffer || window.LxBuffer
      );
    } catch (err) {
      if (!settled) { settled = true; reject(err); }
    } finally {
      window.lx = prevLx;
    }
  }), 9500, 'init_timeout').catch(function (err) {
    if (__lxPool[key] === entry) delete __lxPool[key];
    throw err;
  });
  __lxPool[key] = entry;
  return entry.promise;
}

function __lxProbePlayableUrl(url, expectedDurationMs, excludeUrlSet, songName) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return Promise.reject(new Error('invalid_url'));
  if (excludeUrlSet && excludeUrlSet.has(url)) return Promise.reject(new Error('excluded_url'));
  const durMs = Math.max(0, Number(expectedDurationMs) || 0);
  if (durMs >= 45000 && __lxPreviewUrlRe.test(url)) {
    return Promise.reject(new Error('preview_30s'));
  }
  const origName = String(songName || '');
  const versionConflictRe = /(?:\b(?:dj|remix|cover|karaoke|instrumental|acapella|sped\s*up|nightcore)\b|dj版|伴奏|纯音乐|翻唱|翻自|试听|30秒|铃声|变速|加速版|降调|升调)/i;
  const baseLx = window.__lxBaseApi || window.lx;
  const doProbe = function (method, headers) {
    return new Promise(function (resolve) {
      let settled = false;
      const timer = setTimeout(function () {
        if (!settled) { settled = true; resolve(null); }
      }, 2800);
      try {
        baseLx.request(url, {
          method: method,
          headers: headers,
          timeout: 2600,
          probeOnly: true
        }, function (error, response) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error || !response) { resolve(null); return; }
          resolve(response);
        });
      } catch (_) {
        if (!settled) { settled = true; clearTimeout(timer); resolve(null); }
      }
    });
  };
  return doProbe('GET', { Range: 'bytes=0-1', 'User-Agent': __lxChromeUa }).then(function (response) {
    if (!response) return url;
    const code = Number(response.statusCode) || 0;
    if (code === 403 || code === 405 || code === 416) {
      return doProbe('HEAD', { 'User-Agent': __lxChromeUa }).then(function (headResp) {
        if (!headResp) return url;
        const hCode = Number(headResp.statusCode) || 0;
        if (hCode === 403 || hCode === 405) return url;
        return headResp;
      });
    }
    return response;
  }).then(function (response) {
    if (!response || typeof response === 'string') return url;
    const code = Number(response.statusCode) || 0;
    if (code >= 400) throw new Error('http_' + code);
    const headers = response.headers || {};
    const getHeader = function (name) {
      const lower = name.toLowerCase();
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === lower) return String(headers[k] || '');
      }
      return '';
    };
    const ct = getHeader('content-type').toLowerCase();
    if (ct && (ct.includes('text/html') || ct.includes('application/json') || ct.includes('text/plain') || ct.includes('application/xml'))) {
      throw new Error('non_audio_content');
    }
    const cd = getHeader('content-disposition');
    if (cd && origName) {
      let decodedCd = cd;
      try { decodedCd = decodeURIComponent(cd); } catch (_) {}
      if (versionConflictRe.test(decodedCd) && !versionConflictRe.test(origName)) {
        throw new Error('wrong_version');
      }
    }
    let totalBytes = 0;
    const cr = getHeader('content-range');
    const m = cr.match(/\/(\d+)\s*$/);
    if (m) totalBytes = Number(m[1]) || 0;
    else if (code === 200) totalBytes = Number(getHeader('content-length') || 0) || 0;
    if (totalBytes > 0 && totalBytes < 24000) throw new Error('empty_audio');
    if (durMs >= 45000 && totalBytes > 0) {
      const lowerUrl = url.toLowerCase();
      const isLossless = /\.flac(?:$|\?)|\.ape(?:$|\?)|\.wav(?:$|\?)/.test(lowerUrl) || ct.includes('flac') || ct.includes('wav');
      const bytesPerSec = isLossless ? 11000 : 5200;
      const minExpected = Math.min(1450000, Math.floor((durMs / 1000) * bytesPerSec));
      if (totalBytes < minExpected) throw new Error('preview_30s');
    }
    return url;
  });
}

function __lxBuildSongPayload(song, quality, declaredSources) {
  const src = String(song.source || 'wy');
  const declared = declaredSources && declaredSources[src];
  let type = String(quality || '128k');
  if (declared && Array.isArray(declared.qualitys) && declared.qualitys.length && !declared.qualitys.includes(type)) {
    const chain = __lxBuildQualityChain(type);
    const matched = chain.find(function (q) { return declared.qualitys.includes(q); });
    type = matched || declared.qualitys[0];
  }
  const typesMap = Object.assign({}, song._types || {});
  const hashes = song.hashes || {};
  Object.keys(hashes).forEach(function (q) {
    if (hashes[q] && !typesMap[q]) typesMap[q] = { hash: hashes[q] };
  });
  if (song.hash && !typesMap[type]) {
    typesMap[type] = { hash: song.hash };
  }
  const musicInfo = {
    id: song.id,
    songId: song.songId || song.id,
    songmid: song.songmid || song.id,
    hash: hashes[type] || song.hash || hashes['320k'] || hashes['128k'] || song.id,
    strMediaMid: song.strMediaMid || song.songmid || song.id,
    name: song.name || '',
    singer: song.singer || '',
    albumName: song.albumName || '',
    albumId: song.albumId || '',
    interval: __lxFormatInterval(song.interval, song.durationMs),
    durationMs: Number(song.durationMs) || 0,
    source: src,
    qualitys: Array.isArray(song.qualitys) ? song.qualitys : ['128k', '320k', 'flac'],
    hashes: hashes,
    _types: typesMap
  };
  return { source: src, action: 'musicUrl', info: { type: type, musicInfo: musicInfo }, type: type };
}

function __lxRaceOnce(sources, activeId, song, quality, excludeSet, raceAll, excludeUrlSet) {
  const candidates = sources.filter(function (s) { return s && s.id && s.script && !excludeSet.has(s.id); });
  if (!candidates.length) return Promise.reject(new Error('no_sources'));
  const expectedDurationMs = Number(song.durationMs) || 0;
  const trySource = function (src, targetQuality, timeoutMs) {
    return __lxInitPooledSource(src).then(function (entry) {
      if (!entry.handler) throw new Error('no_handler');
      const declared = entry.info && entry.info.sources && entry.info.sources[song.source];
      if (!declared || !Array.isArray(declared.actions) || !declared.actions.includes('musicUrl')) {
        throw new Error('unsupported_platform');
      }
      const req = __lxBuildSongPayload(song, targetQuality, entry.info && entry.info.sources);
      return __lxWithTimeout(entry.handler({ source: req.source, action: 'musicUrl', info: req.info }), timeoutMs, 'request_timeout')
        .then(function (url) {
          if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('invalid_url');
          return __lxProbePlayableUrl(url, expectedDurationMs, excludeUrlSet, song && song.name).then(function (okUrl) {
            __lxMarkOk(src.id);
            return { url: okUrl, sourceId: src.id, sourceName: src.name || src.id, type: req.type, switched: src.id !== activeId };
          });
        });
    }).catch(function (err) {
      __lxMarkFail(src.id, err);
      throw err;
    });
  };
  const runParallel = function (pool, targetQuality, timeoutMs) {
    if (!pool.length) return Promise.reject(new Error('all_failed'));
    return new Promise(function (resolve, reject) {
      let remaining = pool.length;
      let done = false;
      pool.forEach(function (src) {
        trySource(src, targetQuality, timeoutMs || 7500).then(function (hit) {
          if (!done) { done = true; resolve(hit); }
        }, function () {
          remaining -= 1;
          if (!done && remaining <= 0) reject(new Error('all_failed'));
        });
      });
    });
  };
  const healthy = candidates.filter(function (s) { return !__lxIsCoolingDown(s.id); });
  const primaryPool = healthy.length ? healthy : candidates;
  const restPool = candidates.filter(function (s) { return primaryPool.indexOf(s) < 0; });
  const qualityChain = __lxBuildQualityChain(quality);
  let attemptChain = Promise.reject(new Error('init'));
  qualityChain.forEach(function (q, idx) {
    const roundTimeout = idx === 0 ? 7500 : 6000;
    attemptChain = attemptChain.catch(function () {
      return runParallel(primaryPool, q, roundTimeout).catch(function () {
        if (restPool.length) return runParallel(restPool, q, 5500);
        throw new Error('all_failed');
      });
    });
  });
  return attemptChain;
}

const __lxUrlCache = new Map();
const __lxUrlInflight = new Map();
function __lxUrlCacheKey(song, quality) {
  const idPart = String((song && (song.songmid || song.hash || song.id)) || '').trim();
  if (!idPart) return '';
  return String((song && song.source) || '') + ':' + idPart + ':' + String(quality || '128k');
}

window.__lxCatalogue = function (id, operation, params) {
  if (operation === 'race-music-url') {
    const sources = Array.isArray(params && params.sources) ? params.sources : [];
    const activeId = String((params && params.activeId) || '');
    const song = (params && params.song) || {};
    const quality = String((params && params.quality) || '128k');
    const excludeSet = new Set(Array.isArray(params && params.excludeSourceIds) ? params.excludeSourceIds : []);
    const excludeUrlSet = new Set(Array.isArray(params && params.excludeUrls) ? params.excludeUrls.filter(Boolean) : []);
    const raceAll = !!(params && params.raceAll);
    const forceResolve = !!(params && params.forceResolve);
    const preferCross = !!(params && params.preferCrossPlatform);
    const cacheKey = __lxUrlCacheKey(song, quality);
    const canDedupe = Boolean(cacheKey && !forceResolve && !preferCross && excludeSet.size === 0 && excludeUrlSet.size === 0);
    if (cacheKey && !canDedupe) {
      __lxUrlCache.delete(cacheKey);
    }
    if (canDedupe) {
      const hitCache = __lxUrlCache.get(cacheKey);
      if (hitCache) {
        if (Date.now() < hitCache.expiresAt && sources.some(function (s) { return s && s.id === hitCache.data.sourceId; })) {
          window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: Object.assign({}, hitCache.data, { switched: false }) }));
          return;
        }
        __lxUrlCache.delete(cacheKey);
      }
      const pendingFlow = __lxUrlInflight.get(cacheKey);
      if (pendingFlow) {
        pendingFlow
          .then(function (data) { window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: data })); })
          .catch(function () { window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: '暂未找到可用完整音源' })); });
        return;
      }
    }
    const tryCrossPlatform = function () {
      const io = __lxMakeIo(6000);
      const orig = String(song.source || '');
      const origDur = Number(song.durationMs || 0) || 0;
      const altSources = ['wy', 'tx', 'kg', 'kw'].filter(function (p) { return p !== orig; });
      return window.LxPlaylists.searchPlatformCandidates(song, io, altSources, 6).then(function (cands) {
        const valid = (cands || []).filter(function (c) {
          if (origDur > 0) {
            return c.durationMs > 0 && Math.abs(c.durationMs - origDur) <= 5500;
          }
          return true;
        });
        if (!valid.length) throw new Error('暂未找到可用完整音源');
        const tierA = (origDur > 0 ? valid.filter(function (c) { return Math.abs(c.durationMs - origDur) <= 3000; }) : valid).slice(0, 3);
        const tierB = (origDur > 0 ? valid.filter(function (c) { return Math.abs(c.durationMs - origDur) > 3000; }) : []).slice(0, 2);
        const raceGroup = function (group) {
          if (!group.length) return Promise.reject(new Error('empty_tier'));
          return new Promise(function (resolve, reject) {
            let remaining = group.length;
            let done = false;
            group.forEach(function (cand) {
              __lxRaceOnce(sources, activeId, cand, quality, excludeSet, true, excludeUrlSet).then(function (hit) {
                if (!done && hit && hit.url) {
                  done = true;
                  hit.switchedPlatform = cand.source;
                  hit.switched = true;
                  resolve(hit);
                } else {
                  remaining -= 1;
                  if (!done && remaining <= 0) reject(new Error('暂未找到可用完整音源'));
                }
              }, function () {
                remaining -= 1;
                if (!done && remaining <= 0) reject(new Error('暂未找到可用完整音源'));
              });
            });
          });
        };
        return raceGroup(tierA).catch(function () {
          if (tierB.length) return raceGroup(tierB);
          throw new Error('暂未找到可用完整音源');
        });
      });
    };
    const flow = preferCross
      ? tryCrossPlatform().catch(function () {
          return __lxRaceOnce(sources, activeId, song, quality, excludeSet, true, excludeUrlSet);
        })
      : __lxRaceOnce(sources, activeId, song, quality, excludeSet, raceAll, excludeUrlSet)
          .catch(tryCrossPlatform);
    if (canDedupe) {
      __lxUrlInflight.set(cacheKey, flow);
      flow.then(function () { if (__lxUrlInflight.get(cacheKey) === flow) __lxUrlInflight.delete(cacheKey); },
        function () { if (__lxUrlInflight.get(cacheKey) === flow) __lxUrlInflight.delete(cacheKey); });
    }
    flow
      .then(function (data) {
        if (cacheKey && data && data.url) {
          __lxUrlCache.set(cacheKey, { data: data, expiresAt: Date.now() + 90000 });
          if (__lxUrlCache.size > 80) __lxUrlCache.delete(__lxUrlCache.keys().next().value);
        }
        window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: data }));
      })
      .catch(function () { window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: '暂未找到可用完整音源' })); });
    return;
  }
  if (operation === 'song-assets') {
    const io = __lxMakeIo(7000);
    window.LxSongAssets.get(params, io, window.LxPlaylists)
      .then(function (data) { window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: data })); })
      .catch(function (error) { window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: error.message })); });
    return;
  }
  if (operation === 'song-covers') {
    const io = __lxMakeIo(5500);
    const songs = Array.isArray(params && params.songs) ? params.songs : [];
    const covers = {};
    let index = 0;
    function worker() {
      if (index >= songs.length) return Promise.resolve();
      const current = songs[index++];
      if (!current || !current.id || !current.source) return worker();
      const key = current.source + ':' + current.id;
      return window.LxSongAssets.getCover(current, io, window.LxPlaylists)
        .then(function (url) { if (url) covers[key] = url; })
        .catch(function () {})
        .then(worker);
    }
    const workers = [];
    for (let i = 0; i < Math.min(6, songs.length); i++) workers.push(worker());
    Promise.all(workers)
      .then(function () { window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: covers })); })
      .catch(function (error) { window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: error.message })); });
    return;
  }
  if (operation === 'platform-candidates') {
    const io = __lxMakeIo(7000);
    const target = params && params.song ? params.song : params;
    const sources = Array.isArray(params && params.sources) && params.sources.length ? params.sources : ['wy', 'tx', 'kg', 'kw'];
    window.LxPlaylists.searchPlatformCandidates(target, io, sources, 8)
      .then(async function (items) {
        const missing = items.filter(function (s) { return !s.coverUrl; }).slice(0, 8);
        await Promise.all(missing.map(function (s) {
          return window.LxSongAssets.getCover(s, io, window.LxPlaylists).then(function (u) { if (u) s.coverUrl = u; }).catch(function () {});
        }));
        window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: items }));
      })
      .catch(function (error) { window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: error.message })); });
    return;
  }
  if (operation === 'match-song') {
    window.LxPlaylists.matchSong(params, __lxMakeIo(8000))
      .then(function (data) { window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: data })); })
      .catch(function (error) { window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: error.message })); });
    return;
  }
  if (['home', 'home-lite', 'home-section', 'feed-tracks', 'similar-songs', 'personalized-mix'].includes(operation)) return window.__lxDiscover(id, operation, params);
  const catalogue = window.LxCatalogue.createCatalogue(__lxMakeIo(8000));
  Promise.resolve().then(function () { return operation === 'tracks' ? catalogue.entityTracks(params) : catalogue.searchEntities(params); })
    .then(function (data) { window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: data })); })
    .catch(function (error) { window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: error.message })); });
};

window.__lxDiscover = function (id, operation, params) {
  const io = Object.assign(__lxMakeIo(9000), {
    normalizeSong: window.LxPlaylists.normalizeSong,
    collectAll: window.LxPagination.collectAll,
    linuxEncrypt: function (payload) {
      return CryptoJS.AES.encrypt(JSON.stringify(payload), CryptoJS.enc.Utf8.parse('rFgB&h#%2?^eDg:Q'), {
        mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7
      }).ciphertext.toString(CryptoJS.enc.Hex).toUpperCase();
    }
  });
  io.importPlaylist = function (input, source) { return window.LxPlaylists.importPlaylist(input, source, io); };
  const discovery = window.LxDiscovery.createDiscovery(io);
  Promise.resolve().then(function () {
    return operation === 'home' ? discovery.home(params.source)
      : operation === 'home-lite' ? discovery.homeLite(params.source)
      : operation === 'home-section' ? discovery.section(params)
      : operation === 'similar-songs' ? discovery.similarSongs(params)
      : operation === 'personalized-mix' ? discovery.personalizedMix(params && params.seeds, params && params.excludeKeys)
      : discovery.tracks(params);
  })
    .then(function (data) { window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: data })); })
    .catch(function (error) { window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: error.message })); });
};
