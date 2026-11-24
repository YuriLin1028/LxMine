'use strict';

// 自定义源管理器：把持久化存储、沙箱运行时和 LX 请求协议串起来。
// 之后由 IPC 层（electron/lx/ipc.cjs）暴露给渲染进程使用。

const path = require('node:path');
const { createLxSourceStore } = require('./store.cjs');
const { createLxRuntime } = require('./runtime.cjs');

function createLxManager(options) {
  const filePath = options.filePath;
  const fetchImpl = options.fetchImpl;
  const store = createLxSourceStore({ filePath });
  const runtimes = new Map();
  const pendingRuntimes = new Map();
  let generation = 0;

  const getRuntime = async (sourceId) => {
    const existing = runtimes.get(sourceId);
    if (existing) return existing;
    if (pendingRuntimes.has(sourceId)) return pendingRuntimes.get(sourceId);

    const source = store.getSource(sourceId);
    if (!source) throw new Error('自定义源不存在');
    const epoch = generation;
    const creating = createLxRuntime({
      script: source.script,
      info: source,
      fetchImpl,
    }).then(runtime => {
      if (epoch !== generation || !store.getSource(sourceId)) { runtime.dispose(); throw new Error('音源已重新加载'); }
      runtimes.set(sourceId, runtime);
      return runtime;
    }).finally(() => {
      if (pendingRuntimes.get(sourceId) === creating) pendingRuntimes.delete(sourceId);
    });
    pendingRuntimes.set(sourceId, creating);
    return creating;
  };

  const disposeRuntime = (sourceId) => {
    const runtime = runtimes.get(sourceId);
    if (runtime) {
      runtime.dispose();
      runtimes.delete(sourceId);
    }
  };

  const sourceHealth = new Map();
  const urlCache = new Map();
  const PREVIEW_URL_RE = /(?:free_?trial|try_?listen|audition|shiting|preview_?(?:30|45|60)|(?:30|45|60)s_?trial|trial_?play|\/trial\/|[?&](?:free|try|trial|preview)=1(?:&|$))/i;

  const VERSION_CONFLICT_RE = /(?:\b(?:dj|remix|cover|karaoke|instrumental|acapella|sped\s*up|nightcore)\b|dj版|伴奏|纯音乐|翻唱|翻自|试听|30秒|铃声|变速|加速版|降调|升调)/i;

  const cacheKeyFor = (info) => {
    const idPart = String(info?.musicInfo?.songmid || info?.musicInfo?.hash || info?.musicInfo?.id || '').trim();
    if (!idPart) return '';
    return `${info?.source || ''}:${idPart}:${info?.type || '128k'}`;
  };
  const getCachedUrl = (key) => {
    const entry = urlCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { urlCache.delete(key); return null; }
    return entry.value;
  };
  const putCachedUrl = (key, value) => {
    if (!key || !value || !value.url) return;
    urlCache.set(key, { value, expiresAt: Date.now() + 90_000 });
    if (urlCache.size > 80) urlCache.delete(urlCache.keys().next().value);
  };

  const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const QUALITY_ORDER = ['flac24bit', 'flac', '320k', '128k'];

  const buildQualityChain = (requested) => {
    const req = String(requested || '128k');
    const idx = QUALITY_ORDER.indexOf(req);
    if (idx >= 0) {
      const chain = QUALITY_ORDER.slice(idx);
      if (req === '128k') chain.push('320k');
      return chain;
    }
    return [req, '320k', '128k'];
  };

  const isSourceCoolingDown = (sourceId) => {
    const h = sourceHealth.get(sourceId);
    if (!h || h.failCount < 2) return false;
    return Date.now() - h.lastFailAt < 20_000;
  };
  const markSourceSuccess = (sourceId) => {
    sourceHealth.set(sourceId, { failCount: 0, lastFailAt: 0, lastOkAt: Date.now() });
  };
  const markSourceFail = (sourceId, err) => {
    const msg = String((err && err.message) || err || '');
    // 平台未声明、单曲试听拦截、版本冲突、重复 URL 排除、冷启动脚本初始化超时不代表音源本身损坏，禁止污染冷却状态。
    if (msg === 'unsupported_platform' || msg === 'preview_30s' || msg === 'wrong_version' || msg === 'excluded_url' || msg === 'init_timeout') return;
    const prev = sourceHealth.get(sourceId) || { failCount: 0, lastFailAt: 0, lastOkAt: 0 };
    sourceHealth.set(sourceId, { failCount: prev.failCount + 1, lastFailAt: Date.now(), lastOkAt: prev.lastOkAt });
  };

  const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; reject(new Error(label || 'timeout')); }
    }, ms);
    if (typeof timer.unref === 'function') timer.unref();
    Promise.resolve(promise).then(
      val => { if (!done) { done = true; clearTimeout(timer); resolve(val); } },
      err => { if (!done) { done = true; clearTimeout(timer); reject(err); } },
    );
  });

  /** 快速探测音频 URL 可用性、30s/60s VIP 试听片段与异常版本文件名（Range: bytes=0-1 + HEAD 兜底）。 */
  const probePlayableUrl = async (url, expectedDurationMs, excludeUrlSet, songName) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('invalid_url');
    if (excludeUrlSet && excludeUrlSet.has(url)) throw new Error('excluded_url');
    const durMs = Math.max(0, Number(expectedDurationMs) || 0);
    if (durMs >= 45_000 && PREVIEW_URL_RE.test(url)) {
      throw new Error('preview_30s');
    }
    const origName = String(songName || '');
    const doFetch = fetchImpl || globalThis.fetch;
    if (typeof doFetch !== 'function') return url;
    const probeOnce = async (method, headers) => {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => { try { controller?.abort(); } catch (_) {} }, 2800);
      if (typeof timer.unref === 'function') timer.unref();
      try {
        return await doFetch(url, {
          method,
          headers,
          redirect: 'follow',
          signal: controller ? controller.signal : undefined,
        });
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      let resp = await probeOnce('GET', { Range: 'bytes=0-1', 'User-Agent': CHROME_UA });
      if (resp.status === 403 || resp.status === 405 || resp.status === 416) {
        try { await resp.body?.cancel?.(); } catch (_) {}
        resp = await probeOnce('HEAD', { 'User-Agent': CHROME_UA });
        if (resp.status === 405 || resp.status === 403) {
          // 部分音乐 CDN 拒绝 Range/HEAD 探测但播放器直连 GET 200 可正常播，不直接误杀
          try { await resp.body?.cancel?.(); } catch (_) {}
          return url;
        }
      }
      if (resp.status >= 400) {
        try { await resp.body?.cancel?.(); } catch (_) {}
        throw new Error('http_' + resp.status);
      }
      const ct = String(resp.headers?.get?.('content-type') || '').toLowerCase();
      if (ct && (ct.includes('text/html') || ct.includes('application/json') || ct.includes('text/plain') || ct.includes('application/xml'))) {
        try { await resp.body?.cancel?.(); } catch (_) {}
        throw new Error('non_audio_content');
      }
      const cd = String(resp.headers?.get?.('content-disposition') || '');
      if (cd && origName) {
        let decodedCd = cd;
        try { decodedCd = decodeURIComponent(cd); } catch (_) {}
        if (VERSION_CONFLICT_RE.test(decodedCd) && !VERSION_CONFLICT_RE.test(origName)) {
          try { await resp.body?.cancel?.(); } catch (_) {}
          throw new Error('wrong_version');
        }
      }
      let totalBytes = 0;
      const contentRange = String(resp.headers?.get?.('content-range') || '');
      const rangeMatch = contentRange.match(/\/(\d+)\s*$/);
      if (rangeMatch) {
        totalBytes = Number(rangeMatch[1]) || 0;
      } else if (resp.status === 200) {
        totalBytes = Number(resp.headers?.get?.('content-length') || 0) || 0;
      }
      try { await resp.body?.cancel?.(); } catch (_) {}
      if (totalBytes > 0 && totalBytes < 24_000) throw new Error('empty_audio');
      // 仅拦截明确短试听（30s/60s 试听片段），避免误杀合法 64k/96k AAC 或以 mp3 返回的 flac 请求。
      if (durMs >= 45_000 && totalBytes > 0) {
        const lowerUrl = url.toLowerCase();
        const isLossless = /\.flac(?:$|\?)|\.ape(?:$|\?)|\.wav(?:$|\?)/.test(lowerUrl) || ct.includes('flac') || ct.includes('wav');
        const bytesPerSec = isLossless ? 11_000 : 5_200;
        const minExpectedBytes = Math.min(1_450_000, Math.floor((durMs / 1000) * bytesPerSec));
        if (totalBytes < minExpectedBytes) throw new Error('preview_30s');
      }
      return url;
    } catch (err) {
      const msg = String(err && err.message || '');
      if (msg === 'preview_30s' || msg === 'wrong_version' || msg === 'excluded_url' || msg === 'non_audio_content' || msg === 'empty_audio' || msg.startsWith('http_')) {
        throw err;
      }
      return url;
    }
  };

  const requestFromSource = async (source, info, timeoutMs, expectedDurationMs, excludeUrlSet) => {
    const runtime = await withTimeout(getRuntime(source.id), Math.max(9500, timeoutMs), 'init_timeout');
    const declared = runtime.sourceInfo?.sources?.[info?.source];
    if (!declared || !Array.isArray(declared.actions) || !declared.actions.includes('musicUrl')) {
      throw new Error('unsupported_platform');
    }
    const reqInfo = { ...info };
    if (Array.isArray(declared.qualitys) && declared.qualitys.length && !declared.qualitys.includes(reqInfo.type)) {
      const fallbackQ = buildQualityChain(reqInfo.type).find(q => declared.qualitys.includes(q));
      reqInfo.type = fallbackQ || declared.qualitys[0];
    }
    const result = await withTimeout(runtime.request({
      source: reqInfo?.source,
      action: 'musicUrl',
      info: reqInfo,
    }), timeoutMs, 'request_timeout');
    const url = result?.data?.url;
    if (!url) throw new Error('empty_url');
    await probePlayableUrl(url, expectedDurationMs, excludeUrlSet, reqInfo?.musicInfo?.name);
    markSourceSuccess(source.id);
    return { url, sourceId: source.id, sourceName: source.name, type: reqInfo.type };
  };

  const inflightUrlRaces = new Map();
  const raceMusicUrl = async (info, opts = {}) => {
    const allSources = store.list();
    if (!allSources.length) throw new Error('没有启用的自定义源');
    const exclude = new Set(Array.isArray(opts.excludeSourceIds) ? opts.excludeSourceIds : []);
    const excludeUrlSet = new Set(Array.isArray(opts.excludeUrls) ? opts.excludeUrls.filter(Boolean) : []);
    const key = cacheKeyFor(info);
    const canDedupe = Boolean(key && !opts.forceResolve && exclude.size === 0 && excludeUrlSet.size === 0);
    if (key && !canDedupe) {
      urlCache.delete(key);
    }
    if (canDedupe) {
      const cached = getCachedUrl(key);
      if (cached && allSources.some(s => s.id === cached.sourceId)) return { ...cached, switched: false };
      if (inflightUrlRaces.has(key)) return inflightUrlRaces.get(key);
    }
    const candidates = allSources.filter(s => !exclude.has(s.id));
    if (!candidates.length) throw new Error('全部音源均暂不可用');
    const expectedDurationMs = Number(opts.expectedDurationMs || info?.musicInfo?.durationMs || info?.musicInfo?.duration || 0) || 0;
    const activeId = store.getActiveId();
    const healthy = candidates.filter(s => !isSourceCoolingDown(s.id));
    const pool = healthy.length ? healthy : candidates;

    const racePool = async (srcPool, reqInfo, timeoutMs) => {
      const winner = await Promise.any(srcPool.map(src =>
        requestFromSource(src, reqInfo, timeoutMs, expectedDurationMs, excludeUrlSet).catch(err => {
          markSourceFail(src.id, err);
          throw err;
        })
      ));
      const switched = winner.sourceId !== activeId;
      if (switched) {
        try { store.setActive(winner.sourceId); } catch (_) {}
      }
      const out = { ...winner, switched };
      putCachedUrl(key, out);
      return out;
    };

    const runRace = async () => {
      // 音质阶梯自动降级（flac24bit -> flac -> 320k -> 128k），同时保留 7.5s 宽裕并发超时
      // 防止响应 4-6s 的高可用音源被 3.6s 过早掐断。
      const qualityChain = buildQualityChain(info?.type || '128k');
      for (let qi = 0; qi < qualityChain.length; qi++) {
        const q = qualityChain[qi];
        const reqInfo = { ...info, type: q };
        const roundTimeout = qi === 0 ? 7500 : 6000;
        try {
          return await racePool(pool, reqInfo, roundTimeout);
        } catch (_) {
          const fallbackPool = candidates.filter(s => !pool.includes(s));
          if (fallbackPool.length) {
            try {
              return await racePool(fallbackPool, reqInfo, 5500);
            } catch (_) {}
          }
        }
      }
      throw new Error('当前歌曲暂无法获取完整音源');
    };
    const promise = runRace();
    if (canDedupe) {
      inflightUrlRaces.set(key, promise);
      promise.finally(() => { if (inflightUrlRaces.get(key) === promise) inflightUrlRaces.delete(key); }).catch(() => {});
    }
    return promise;
  };

  const request = async (action, info) => {
    const source = store.getActiveSource();
    if (!source) throw new Error('没有启用的自定义源');
    const runtime = await getRuntime(source.id);
    return runtime.request({
      source: info?.source,
      action,
      info,
    });
  };

  return {
    filePath,
    reload() {
      generation++; pendingRuntimes.clear(); urlCache.clear(); inflightUrlRaces.clear();
      for (const id of Array.from(runtimes.keys())) disposeRuntime(id);
      store.reload();
    },
    list: () => store.list(),
    importScript: (raw) => store.importScript(raw),
    importScripts: (files) => store.importScripts(files),
    remove: (ids) => {
      generation++; pendingRuntimes.clear(); urlCache.clear(); inflightUrlRaces.clear();
      const targets = Array.isArray(ids) ? ids : [ids];
      for (const id of targets) disposeRuntime(id);
      return store.remove(targets);
    },
    setActive: (id) => {
      store.setActive(id);
      return store.list();
    },
    getActiveId: () => store.getActiveId(),
    warmUp() {
      const all = store.list();
      if (!all.length) return;
      const active = store.getActiveSource();
      const ordered = active ? [active, ...all.filter(s => s.id !== active.id)] : all;
      for (const src of ordered.slice(0, 3)) {
        if (!runtimes.has(src.id) && !pendingRuntimes.has(src.id)) {
          getRuntime(src.id).catch(() => {});
        }
      }
    },
    async supportedSources(action) {
      const all = store.list();
      if (!all.length) return [];
      const active = store.getActiveSource();
      const ordered = active ? [active, ...all.filter(s => s.id !== active.id)] : all;
      const union = new Set();
      for (const src of ordered.slice(0, 6)) {
        try {
          const runtime = await withTimeout(getRuntime(src.id), 4500, 'init_timeout');
          for (const key of Object.keys(runtime.sourceInfo.sources || {})) {
            if (runtime.sourceInfo.sources[key]?.actions?.includes(action)) union.add(key);
          }
          if (union.size >= 4) break;
        } catch (_) {}
      }
      return Array.from(union);
    },
    getActiveSource: () => {
      const source = store.getActiveSource();
      return source ? { id: source.id, name: source.name, version: source.version } : null;
    },
    async getMusicUrl(info, opts) {
      const result = await raceMusicUrl(info, opts);
      return result?.url ?? null;
    },
    raceMusicUrl,
    async getLyric(info) {
      const result = await request('lyric', info);
      return result.data ?? null;
    },
    async getPic(info) {
      const result = await request('pic', info);
      return result.data ?? null;
    },
    dispose() {
      generation++; pendingRuntimes.clear();
      for (const id of Array.from(runtimes.keys())) disposeRuntime(id);
    },
  };
}

/** 数据目录下的默认存储路径。 */
function defaultLxSourcesPath(userDataPath) {
  return path.join(userDataPath, 'lx-sources.json');
}

module.exports = {
  createLxManager,
  defaultLxSourcesPath,
};
