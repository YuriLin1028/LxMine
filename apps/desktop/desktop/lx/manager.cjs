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
  const PREVIEW_URL_RE = /(?:free_?trial|try_?listen|audition|preview_?30|30s_?trial|\/trial\/|[?&]free=1(?:&|$))/i;

  const isSourceCoolingDown = (sourceId) => {
    const h = sourceHealth.get(sourceId);
    if (!h || !h.failCount) return false;
    return Date.now() - h.lastFailAt < 90_000;
  };
  const markSourceSuccess = (sourceId) => {
    sourceHealth.set(sourceId, { failCount: 0, lastFailAt: 0, lastOkAt: Date.now() });
  };
  const markSourceFail = (sourceId) => {
    const prev = sourceHealth.get(sourceId) || { failCount: 0, lastFailAt: 0, lastOkAt: 0 };
    sourceHealth.set(sourceId, { failCount: prev.failCount + 1, lastFailAt: Date.now(), lastOkAt: prev.lastOkAt });
  };

  const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; reject(new Error(label || 'timeout')); }
    }, ms);
    Promise.resolve(promise).then(
      val => { if (!done) { done = true; clearTimeout(timer); resolve(val); } },
      err => { if (!done) { done = true; clearTimeout(timer); reject(err); } },
    );
  });

  /** 快速探测音频 URL 可用性与 30s VIP 试听片段（Range: bytes=0-1，~100-250ms）。 */
  const probePlayableUrl = async (url, expectedDurationMs) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('invalid_url');
    const durMs = Math.max(0, Number(expectedDurationMs) || 0);
    if (durMs >= 75_000 && PREVIEW_URL_RE.test(url)) {
      throw new Error('preview_30s');
    }
    const doFetch = fetchImpl || globalThis.fetch;
    if (typeof doFetch !== 'function') return url;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => { try { controller?.abort(); } catch (_) {} }, 2800);
    try {
      const resp = await doFetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-1', 'User-Agent': 'Mozilla/5.0 LxMine/1.1' },
        redirect: 'follow',
        signal: controller ? controller.signal : undefined,
      });
      if (resp.status >= 400) throw new Error('http_' + resp.status);
      const ct = String(resp.headers?.get?.('content-type') || '').toLowerCase();
      if (ct && (ct.includes('text/html') || ct.includes('application/json') || ct.includes('text/plain') || ct.includes('application/xml'))) {
        throw new Error('non_audio_content');
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
      // 30s VIP 试听拦截：完整歌曲（>=75s）若总字节数远低于正常码率下限（~6.5KB/s 且 <720KB），判定为 30s 试听片段。
      if (durMs >= 75_000 && totalBytes > 0) {
        const minExpectedBytes = Math.min(720 * 1024, Math.floor((durMs / 1000) * 6500));
        if (totalBytes < minExpectedBytes) throw new Error('preview_30s');
      }
      return url;
    } catch (err) {
      const msg = String(err && err.message || '');
      if (msg === 'preview_30s' || msg === 'non_audio_content' || msg === 'empty_audio' || msg.startsWith('http_')) {
        throw err;
      }
      // 网络波动/Abort 不直接误杀已拿到的有效直链（某些 CDN 拒绝 Range），仅在明确错误时拒收。
      return url;
    } finally {
      clearTimeout(timer);
    }
  };

  const requestFromSource = async (source, info, timeoutMs, expectedDurationMs) => {
    const runtime = await withTimeout(getRuntime(source.id), Math.min(3500, timeoutMs), 'init_timeout');
    const declared = runtime.sourceInfo?.sources?.[info?.source];
    if (declared && Array.isArray(declared.actions) && !declared.actions.includes('musicUrl')) {
      throw new Error('unsupported_platform');
    }
    const reqInfo = { ...info };
    if (declared && Array.isArray(declared.qualitys) && declared.qualitys.length && !declared.qualitys.includes(reqInfo.type)) {
      reqInfo.type = declared.qualitys.includes('320k') ? '320k' : (declared.qualitys.includes('128k') ? '128k' : declared.qualitys[0]);
    }
    const result = await withTimeout(runtime.request({
      source: reqInfo?.source,
      action: 'musicUrl',
      info: reqInfo,
    }), timeoutMs, 'request_timeout');
    const url = result?.data?.url;
    if (!url) throw new Error('empty_url');
    await probePlayableUrl(url, expectedDurationMs);
    markSourceSuccess(source.id);
    return { url, sourceId: source.id, sourceName: source.name, type: reqInfo.type };
  };

  const raceMusicUrl = async (info, opts = {}) => {
    const allSources = store.list();
    if (!allSources.length) throw new Error('没有启用的自定义源');
    const exclude = new Set(Array.isArray(opts.excludeSourceIds) ? opts.excludeSourceIds : []);
    const candidates = allSources.filter(s => !exclude.has(s.id));
    if (!candidates.length) throw new Error('全部音源均暂不可用');
    const expectedDurationMs = Number(opts.expectedDurationMs || info?.musicInfo?.durationMs || info?.musicInfo?.duration || 0) || 0;
    const activeId = store.getActiveId();
    const active = candidates.find(s => s.id === activeId);

    // 1. 当前源健康且未强制全源竞速时，先给 3.5s 快速通道；一旦异常/超时/30s 试听，立刻全源并行竞速。
    if (active && !opts.raceAll && !isSourceCoolingDown(active.id)) {
      try {
        const hit = await requestFromSource(active, info, 3800, expectedDurationMs);
        return { ...hit, switched: false };
      } catch (_) {
        markSourceFail(active.id);
      }
    }

    // 2. 把库里所有剩余音源一股脑并行竞速，谁最先返回可用完整直链立刻采用！
    const pool = active && !opts.raceAll && !isSourceCoolingDown(active.id)
      ? candidates.filter(s => s.id !== active.id)
      : candidates;
    if (!pool.length) throw new Error('当前歌曲暂无法获取完整音源');
    try {
      const winner = await Promise.any(pool.map(src =>
        requestFromSource(src, info, 4800, expectedDurationMs).catch(err => {
          markSourceFail(src.id);
          throw err;
        })
      ));
      const switched = winner.sourceId !== activeId;
      if (switched) {
        try { store.setActive(winner.sourceId); } catch (_) {}
      }
      return { ...winner, switched };
    } catch (_) {
      throw new Error('当前歌曲暂无法获取完整音源');
    }
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
      generation++; pendingRuntimes.clear();
      for (const id of Array.from(runtimes.keys())) disposeRuntime(id);
      store.reload();
    },
    list: () => store.list(),
    importScript: (raw) => store.importScript(raw),
    importScripts: (files) => store.importScripts(files),
    remove: (ids) => {
      generation++; pendingRuntimes.clear();
      const targets = Array.isArray(ids) ? ids : [ids];
      for (const id of targets) disposeRuntime(id);
      return store.remove(targets);
    },
    setActive: (id) => {
      store.setActive(id);
      return store.list();
    },
    getActiveId: () => store.getActiveId(),
    async supportedSources(action) {
      const source = store.getActiveSource();
      if (!source) return [];
      const runtime = await getRuntime(source.id);
      return Object.keys(runtime.sourceInfo.sources).filter(key => runtime.sourceInfo.sources[key].actions.includes(action));
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
