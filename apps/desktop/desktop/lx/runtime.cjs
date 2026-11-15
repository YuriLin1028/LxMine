'use strict';

// LX 自定义源沙箱：在 Node vm 里执行源脚本，并提供与 lx-music-desktop 一致的
// `lx` 全局对象。一个 runtime 对应一个已启用的源；request() 用于按 LX 协议
// 请求 musicUrl / lyric / pic。

const vm = require('node:vm');
const {
  EVENT_NAMES,
  ALL_SOURCES,
  SUPPORT_QUALITY,
  SUPPORT_ACTIONS,
  createLxApi,
} = require('./api.cjs');

const DEFAULT_INIT_TIMEOUT_MS = 15_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const MAX_LOG_LINES = 200;

/** 把源声明的 sources 归一化成与上游 preload 相同形状。 */
function normalizeSourceInfo(raw) {
  if (!raw || typeof raw !== 'object' || !raw.sources || typeof raw.sources !== 'object') {
    throw new Error('Missing required parameter init info');
  }
  const sourceInfo = { sources: {} };
  for (const source of ALL_SOURCES) {
    const declared = raw.sources[source];
    if (!declared || declared.type !== 'music') continue;
    if (!Array.isArray(declared.actions) || !Array.isArray(declared.qualitys)) {
      throw new Error(`Invalid source declaration: ${source}`);
    }
    sourceInfo.sources[source] = {
      type: 'music',
      actions: (SUPPORT_ACTIONS[source] ?? []).filter(action => declared.actions.includes(action)),
      qualitys: (SUPPORT_QUALITY[source] ?? []).filter(quality => declared.qualitys.includes(quality)),
    };
  }
  return sourceInfo;
}

/** 按 LX 上游规则校验一次 request 的返回值。 */
function validateResult(action, response, source) {
  switch (action) {
    case 'musicUrl':
      if (typeof response !== 'string' || response.length > 2048 || !/^https?:/.test(response)) {
        throw new Error('Invalid musicUrl response');
      }
      return { source, action, data: { type: undefined, url: response } };
    case 'lyric':
      if (response == null) {
        return {
          source,
          action,
          data: { lyric: '', tlyric: null, rlyric: null, lxlyric: null },
        };
      }
      if (!response || typeof response !== 'object' || typeof response.lyric !== 'string') {
        throw new Error('Invalid lyric response');
      }
      if (response.lyric.length > 51200) throw new Error('Invalid lyric response');
      return {
        source,
        action,
        data: {
          lyric: response.lyric,
          tlyric: typeof response.tlyric === 'string' && response.tlyric.length < 5120 ? response.tlyric : null,
          rlyric: typeof response.rlyric === 'string' && response.rlyric.length < 5120 ? response.rlyric : null,
          lxlyric: typeof response.lxlyric === 'string' && response.lxlyric.length < 8192 ? response.lxlyric : null,
        },
      };
    case 'pic':
      if (typeof response !== 'string' || response.length > 2048 || !/^https?:/.test(response)) {
        throw new Error('Invalid pic response');
      }
      return { source, action, data: response };
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}

/**
 * 在独立沙箱里启动一个 LX 自定义源。
 * @param {object} options
 * @param {string} options.script 源脚本全文
 * @param {object} [options.info] 源元数据（name/description/version/author/homepage）
 * @param {number} [options.initTimeoutMs]
 * @param {typeof fetch} [options.fetchImpl] 测试注入
 * @returns {Promise<{ sourceInfo: object, request: Function, dispose: Function, getLogs: Function }>}
 */
function createLxRuntime(options) {
  const {
    script,
    info = {},
    initTimeoutMs = DEFAULT_INIT_TIMEOUT_MS,
    fetchImpl,
  } = options;

  const logs = [];
  const log = (level, args) => {
    if (logs.length >= MAX_LOG_LINES) logs.shift();
    logs.push(`[${level}] ${args.map(value => {
      if (typeof value === 'string') return value;
      try { return JSON.stringify(value); } catch { return String(value); }
    }).join(' ')}`);
  };

  let requestHandler = null;
  let sourceInfo = null;
  let resolveReady;
  let rejectReady;
  let settled = false;

  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const settleError = (error) => {
    if (settled) return;
    settled = true;
    rejectReady(error instanceof Error ? error : new Error(String(error)));
  };

  const api = createLxApi({
    scriptInfo: {
      name: info.name ?? '',
      description: info.description ?? '',
      version: info.version ?? '',
      author: info.author ?? '',
      homepage: info.homepage ?? '',
      rawScript: script,
    },
    fetchImpl,
    onRequestSet(handler) {
      requestHandler = handler;
    },
    onInited(data) {
      if (settled) return;
      try {
        sourceInfo = normalizeSourceInfo(data);
        settled = true;
        resolveReady(sourceInfo);
      } catch (error) {
        settleError(error);
      }
    },
    onUpdateAlert(data) {
      log('update-alert', [data?.log ?? '']);
    },
    onError(message) {
      log('error', [message]);
    },
  });

  const sandbox = {
    console: {
      log: (...args) => log('log', args),
      info: (...args) => log('info', args),
      warn: (...args) => log('warn', args),
      error: (...args) => log('error', args),
      debug: (...args) => log('debug', args),
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    URLSearchParams,
    TextDecoder,
    TextEncoder,
    atob,
    btoa,
    lx: api,
  };
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox, { name: `lx-source:${info.name ?? 'unknown'}` });

  let initTimer;
  const initTimeout = new Promise((_, reject) => {
    initTimer = setTimeout(() => reject(new Error('Custom source did not send inited event')), initTimeoutMs);
    if (typeof initTimer.unref === 'function') initTimer.unref();
  });

  try {
    new vm.Script(script, { filename: `lx-source-${info.name ?? 'unknown'}.js` })
      .runInContext(context, { timeout: initTimeoutMs });
  } catch (error) {
    clearTimeout(initTimer);
    settleError(new Error(`Custom source failed to run: ${error.message}`));
  }

  const ready = Promise.race([
    readyPromise,
    initTimeout.then(() => { throw new Error('Custom source did not send inited event'); }),
  ]).finally(() => clearTimeout(initTimer));

  return ready.then(infoResult => ({
    sourceInfo: infoResult,
    getLogs: () => logs.slice(),
    async request(payload) {
      if (!requestHandler) throw new Error('Request event is not defined');
      if (!payload || typeof payload !== 'object') throw new Error('Invalid request payload');
      const { source, action, info: songInfo } = payload;
      if (!source || !action) throw new Error('Invalid request payload');

      const timeout = new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error(`Custom source request timeout: ${action}`)), DEFAULT_REQUEST_TIMEOUT_MS);
        if (typeof timer.unref === 'function') timer.unref();
      });

      const result = await Promise.race([
        Promise.resolve().then(() => requestHandler.call(context, {
          source,
          action,
          // LX 源读 info.musicInfo；同时把字段平铺，兼容按 info.songmid 取值的旧脚本。
          info: songInfo?.musicInfo
            ? songInfo
            : { ...(songInfo ?? {}), type: songInfo?.type, musicInfo: songInfo ?? {} },
        })),
        timeout,
      ]);
      return validateResult(action, result, source);
    },
    dispose() {
      requestHandler = null;
      sourceInfo = null;
    },
  }));
}

module.exports = {
  createLxRuntime,
  normalizeSourceInfo,
  validateResult,
};
