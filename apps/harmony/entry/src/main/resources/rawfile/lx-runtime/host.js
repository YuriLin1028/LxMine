/* Native bridge entry points for isolated source activation and playlist metadata import. */
function __lxParseJson(body) {
  if (typeof body !== 'string') return body;
  var trimmed = body.trim().replace(/^[a-zA-Z0-9_$]+\(([\s\S]*)\)\s*;?$/, '$1');
  return JSON5.parse(trimmed);
}

function __lxMakeIo(timeoutMs) {
  return {
    json: function (url, options) {
      return new Promise(function (resolve, reject) {
        window.lx.request(url, Object.assign({ timeout: timeoutMs || 8000 }, options || {}), function (error, response, body) {
          if (error) return reject(error);
          if (response.statusCode !== 200) return reject(new Error('HTTP ' + response.statusCode));
          try { resolve(__lxParseJson(body)); } catch (e) { reject(e); }
        });
      });
    }
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
    json: function (url, options) {
      return new Promise(function (resolve, reject) {
        window.lx.request(url, options || {}, function (error, response, body) {
          if (error) { reject(error); return; }
          if (response.statusCode !== 200) { reject(new Error('HTTP ' + response.statusCode)); return; }
          try {
            const data = __lxParseJson(body);
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
    }
  }).then(function (data) {
    window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: data }));
  }).catch(function (error) {
    window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: error.message }));
  });
};

const __lxPool = {};
const __lxSourceHealth = {};
const __lxPreviewUrlRe = /(?:free_?trial|try_?listen|audition|preview_?30|30s_?trial|\/trial\/|[?&]free=1(?:&|$))/i;

function __lxIsCoolingDown(sourceId) {
  const h = __lxSourceHealth[sourceId];
  return !!(h && h.failCount > 0 && Date.now() - h.lastFailAt < 90000);
}
function __lxMarkOk(sourceId) {
  __lxSourceHealth[sourceId] = { failCount: 0, lastFailAt: 0, lastOkAt: Date.now() };
}
function __lxMarkFail(sourceId) {
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
  const sig = String((src.script || '').length) + ':' + String(src.script || '').slice(0, 64);
  const cached = __lxPool[key];
  if (cached && cached.sig === sig && cached.ready) return Promise.resolve(cached);
  if (cached && cached.sig === sig && cached.promise) return cached.promise;

  const entry = { id: key, name: src.name || key, sig: sig, ready: false, handler: null, info: null, promise: null };
  entry.promise = __lxWithTimeout(new Promise(function (resolve, reject) {
    let settled = false;
    const localLx = {
      EVENT_NAMES: window.lx.EVENT_NAMES,
      version: window.lx.version,
      env: window.lx.env,
      currentScriptInfo: {
        name: src.name || '',
        description: src.description || '',
        version: src.version || '',
        author: src.author || '',
        homepage: src.homepage || '',
        rawScript: src.script || ''
      },
      utils: window.lx.utils,
      request: window.lx.request,
      on: function (eventName, handler) {
        if (eventName !== window.lx.EVENT_NAMES.request) return Promise.reject(new Error('unsupported_event'));
        if (typeof handler !== 'function') return Promise.reject(new Error('invalid_handler'));
        entry.handler = handler;
        return Promise.resolve();
      },
      send: function (eventName, data) {
        if (eventName === window.lx.EVENT_NAMES.inited) {
          entry.info = data || {};
          entry.ready = true;
          if (!settled) { settled = true; resolve(entry); }
          return Promise.resolve();
        }
        return Promise.resolve();
      }
    };
    try {
      const localGlobal = Object.create(window);
      localGlobal.lx = localLx;
      new Function('lx', 'globalThis', String(src.script || ''))(localLx, localGlobal);
    } catch (err) {
      if (!settled) { settled = true; reject(err); }
    }
  }), 4500, 'init_timeout').catch(function (err) {
    if (__lxPool[key] === entry) delete __lxPool[key];
    throw err;
  });
  __lxPool[key] = entry;
  return entry.promise;
}

function __lxProbePlayableUrl(url, expectedDurationMs) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return Promise.reject(new Error('invalid_url'));
  const durMs = Math.max(0, Number(expectedDurationMs) || 0);
  if (durMs >= 75000 && __lxPreviewUrlRe.test(url)) {
    return Promise.reject(new Error('preview_30s'));
  }
  return new Promise(function (resolve, reject) {
    let settled = false;
    const timer = setTimeout(function () {
      if (!settled) { settled = true; resolve(url); }
    }, 2800);
    try {
      window.lx.request(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-1', 'User-Agent': 'Mozilla/5.0 LxMine/1.1' },
        timeout: 2600
      }, function (error, response) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error || !response) { resolve(url); return; }
        const code = Number(response.statusCode) || 0;
        if (code >= 400) { reject(new Error('http_' + code)); return; }
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
          reject(new Error('non_audio_content'));
          return;
        }
        let totalBytes = 0;
        const cr = getHeader('content-range');
        const m = cr.match(/\/(\d+)\s*$/);
        if (m) totalBytes = Number(m[1]) || 0;
        else if (code === 200) totalBytes = Number(getHeader('content-length') || 0) || 0;
        if (totalBytes > 0 && totalBytes < 24000) { reject(new Error('empty_audio')); return; }
        // 30s VIP 试听拦截：标称完整歌曲（>=75s）但总字节数过小，直接拒收并换源。
        if (durMs >= 75000 && totalBytes > 0) {
          const minExpected = Math.min(720 * 1024, Math.floor((durMs / 1000) * 6500));
          if (totalBytes < minExpected) { reject(new Error('preview_30s')); return; }
        }
        resolve(url);
      });
    } catch (_) {
      if (!settled) { settled = true; clearTimeout(timer); resolve(url); }
    }
  });
}

function __lxBuildSongPayload(song, quality, declaredSources) {
  const src = String(song.source || 'wy');
  const declared = declaredSources && declaredSources[src];
  let type = String(quality || '128k');
  if (declared && Array.isArray(declared.qualitys) && declared.qualitys.length && !declared.qualitys.includes(type)) {
    type = declared.qualitys.includes('320k') ? '320k' : (declared.qualitys.includes('128k') ? '128k' : declared.qualitys[0]);
  }
  const musicInfo = {
    id: song.id,
    songmid: song.songmid || song.id,
    hash: song.hash || song.id,
    strMediaMid: song.strMediaMid || song.songmid || song.id,
    name: song.name || '',
    singer: song.singer || '',
    albumName: song.albumName || '',
    interval: song.interval || '',
    durationMs: Number(song.durationMs) || 0,
    source: src,
    qualitys: Array.isArray(song.qualitys) ? song.qualitys : ['128k', '320k', 'flac'],
    hashes: song.hashes || {}
  };
  return { source: src, action: 'musicUrl', info: { type: type, musicInfo: musicInfo }, type: type };
}

function __lxRaceOnce(sources, activeId, song, quality, excludeSet, raceAll) {
  const candidates = sources.filter(function (s) { return s && s.id && s.script && !excludeSet.has(s.id); });
  if (!candidates.length) return Promise.reject(new Error('no_sources'));
  const expectedDurationMs = Number(song.durationMs) || 0;
  const trySource = function (src, timeoutMs) {
    return __lxInitPooledSource(src).then(function (entry) {
      if (!entry.handler) throw new Error('no_handler');
      const declared = entry.info && entry.info.sources && entry.info.sources[song.source];
      if (declared && Array.isArray(declared.actions) && !declared.actions.includes('musicUrl')) {
        throw new Error('unsupported_platform');
      }
      const req = __lxBuildSongPayload(song, quality, entry.info && entry.info.sources);
      return __lxWithTimeout(entry.handler({ source: req.source, action: 'musicUrl', info: req.info }), timeoutMs, 'request_timeout')
        .then(function (url) {
          if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('invalid_url');
          return __lxProbePlayableUrl(url, expectedDurationMs).then(function (okUrl) {
            __lxMarkOk(src.id);
            return { url: okUrl, sourceId: src.id, sourceName: src.name || src.id, type: req.type, switched: src.id !== activeId };
          });
        });
    }).catch(function (err) {
      __lxMarkFail(src.id);
      throw err;
    });
  };
  const active = candidates.find(function (s) { return s.id === activeId; });
  const runParallel = function (pool) {
    if (!pool.length) return Promise.reject(new Error('all_failed'));
    return new Promise(function (resolve, reject) {
      let remaining = pool.length;
      let done = false;
      pool.forEach(function (src) {
        trySource(src, 4800).then(function (hit) {
          if (!done) { done = true; resolve(hit); }
        }, function () {
          remaining -= 1;
          if (!done && remaining <= 0) reject(new Error('all_failed'));
        });
      });
    });
  };
  if (active && !raceAll && !__lxIsCoolingDown(active.id)) {
    return trySource(active, 3800).catch(function () {
      const rest = candidates.filter(function (s) { return s.id !== active.id; });
      return runParallel(rest);
    });
  }
  return runParallel(candidates);
}

window.__lxCatalogue = function (id, operation, params) {
  if (operation === 'race-music-url') {
    const sources = Array.isArray(params && params.sources) ? params.sources : [];
    const activeId = String((params && params.activeId) || '');
    const song = (params && params.song) || {};
    const quality = String((params && params.quality) || '128k');
    const excludeSet = new Set(Array.isArray(params && params.excludeSourceIds) ? params.excludeSourceIds : []);
    const raceAll = !!(params && params.raceAll);
    const preferCross = !!(params && params.preferCrossPlatform);
    const tryCrossPlatform = function () {
      const io = __lxMakeIo(5500);
      const orig = String(song.source || '');
      const altSources = ['wy', 'tx', 'kg', 'kw'].filter(function (p) { return p !== orig; });
      return window.LxPlaylists.searchPlatformCandidates(song, io, altSources, 6).then(async function (cands) {
        for (const cand of (cands || []).slice(0, 3)) {
          try {
            const hit = await __lxRaceOnce(sources, activeId, cand, quality, new Set(), true);
            if (hit && hit.url) {
              hit.switchedPlatform = cand.source;
              hit.switched = true;
              return hit;
            }
          } catch (_) {}
        }
        throw new Error('暂未找到可用完整音源');
      });
    };
    const flow = preferCross
      ? tryCrossPlatform()
      : __lxRaceOnce(sources, activeId, song, quality, excludeSet, raceAll).catch(tryCrossPlatform);
    flow
      .then(function (data) { window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: data })); })
      .catch(function () { window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: '暂未找到可用完整音源，请检查网络或导入更多音源' })); });
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
  if (['home', 'home-lite', 'home-section', 'feed-tracks'].includes(operation)) return window.__lxDiscover(id, operation, params);
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
      : discovery.tracks(params);
  })
    .then(function (data) { window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: data })); })
    .catch(function (error) { window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: error.message })); });
};
