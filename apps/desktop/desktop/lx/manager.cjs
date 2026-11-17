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
    async getMusicUrl(info) {
      const result = await request('musicUrl', info);
      return result.data?.url ?? null;
    },
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
