'use strict';

// LX 自定义源运行时：忠实复刻 lx-music-desktop 的 lx API（preload.js）表面。
// 与上游的差异：这里跑在主进程的 Node 环境（不使用隐藏 BrowserWindow），
// 断网/代理等环境能力按需补齐。API 形状、事件名与校验规则保持一致。

const crypto = require('node:crypto');
const zlib = require('node:zlib');

const EVENT_NAMES = {
  request: 'request',
  inited: 'inited',
  updateAlert: 'updateAlert',
};

/** 自定义源可声明的来源与音质（与上游 preload 一致）。 */
const ALL_SOURCES = ['kw', 'kg', 'tx', 'wy', 'mg', 'local'];
const SUPPORT_QUALITY = {
  kw: ['128k', '320k', 'flac', 'flac24bit'],
  kg: ['128k', '320k', 'flac', 'flac24bit'],
  tx: ['128k', '320k', 'flac', 'flac24bit'],
  wy: ['128k', '320k', 'flac', 'flac24bit'],
  mg: ['128k', '320k', 'flac', 'flac24bit'],
  local: [],
};
const SUPPORT_ACTIONS = {
  kw: ['musicUrl'],
  kg: ['musicUrl'],
  tx: ['musicUrl'],
  wy: ['musicUrl'],
  mg: ['musicUrl'],
  xm: ['musicUrl'],
  local: ['musicUrl', 'lyric', 'pic'],
};

const DEFAULT_TIMEOUT_MS = 60_000;

function toHeaderObject(headers) {
  const result = {};
  if (!headers) return result;
  if (typeof headers.forEach === 'function') {
    headers.forEach((value, key) => {
      result[String(key).toLowerCase()] = value;
    });
    return result;
  }
  for (const [key, value] of Object.entries(headers)) result[String(key).toLowerCase()] = value;
  return result;
}

function buildBody({ body, form, formData }) {
  if (body !== undefined) return { payload: body, headers: {} };
  if (form) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) params.append(key, String(value));
    return { payload: params, headers: {} };
  }
  if (formData) {
    const fd = new FormData();
    for (const [key, value] of Object.entries(formData)) {
      if (Buffer.isBuffer(value)) fd.append(key, new Blob([value]), key);
      else if (value && typeof value === 'object' && value.buffer instanceof ArrayBuffer) {
        fd.append(key, new Blob([Buffer.from(value)]), key);
      } else {
        fd.append(key, String(value));
      }
    }
    return { payload: fd, headers: {} };
  }
  return { payload: undefined, headers: {} };
}

/**
 * 创建 lx API 对象。
 * @param {object} options
 * @param {object} options.scriptInfo 当前源信息（name/description/version/author/homepage）
 * @param {(fn: Function) => void} options.onRequestSet 源注册 request 处理器
 * @param {(data: object) => void} options.onInited 源完成初始化
 * @param {(data: object) => void} options.onUpdateAlert 源请求更新提示
 * @param {(message: string) => void} options.onError 源内部错误
 * @param {typeof fetch} [options.fetchImpl]
 */
function createLxApi(options) {
  const {
    scriptInfo,
    onRequestSet,
    onInited,
    onUpdateAlert,
    onError,
    fetchImpl = globalThis.fetch,
  } = options;

  const events = { request: null };
  let inited = false;
  let shownUpdateAlert = false;

  const api = {
    EVENT_NAMES,
    version: '2.0.0',
    env: 'desktop',
    currentScriptInfo: {
      name: scriptInfo?.name ?? '',
      description: scriptInfo?.description ?? '',
      version: scriptInfo?.version ?? '',
      author: scriptInfo?.author ?? '',
      homepage: scriptInfo?.homepage ?? '',
      rawScript: scriptInfo?.rawScript ?? '',
    },

    request(url, requestOptions = {}, callback = () => {}) {
      const {
        method = 'get',
        timeout,
        headers = {},
        body,
        form,
        formData,
      } = requestOptions || {};
      const controller = new AbortController();
      const waitMs = typeof timeout === 'number' && timeout > 0
        ? Math.min(timeout, DEFAULT_TIMEOUT_MS)
        : DEFAULT_TIMEOUT_MS;
      const timer = setTimeout(() => controller.abort(new Error('Request timeout')), waitMs);

      (async () => {
        try {
          const { payload, headers: extraHeaders } = buildBody({ body, form, formData });
          const response = await fetchImpl(url, {
            method: String(method).toUpperCase(),
            headers: { ...headers, ...extraHeaders },
            body: payload,
            signal: controller.signal,
            redirect: 'follow',
          });
          const raw = Buffer.from(await response.arrayBuffer());
          const text = raw.toString('utf8');
          let parsed = text;
          try {
            parsed = JSON.parse(text);
          } catch {
            // 非 JSON 响应保留原文，与上游 needle 的行为一致。
          }
          const result = {
            statusCode: response.status,
            statusMessage: response.statusText,
            headers: toHeaderObject(response.headers),
            bytes: raw.length,
            raw,
            body: parsed,
          };
          callback.call(api, null, result, result.body);
        } catch (error) {
          callback.call(api, error, null, null);
        } finally {
          clearTimeout(timer);
        }
      })();

      return () => {
        controller.abort(new Error('Request aborted'));
      };
    },

    send(eventName, data) {
      return new Promise((resolve, reject) => {
        if (!Object.values(EVENT_NAMES).includes(eventName)) {
          reject(new Error('The event is not supported: ' + eventName));
          return;
        }
        switch (eventName) {
          case EVENT_NAMES.inited:
            if (inited) {
              reject(new Error('Script is inited'));
              return;
            }
            inited = true;
            try {
              onInited(data);
              resolve();
            } catch (error) {
              reject(error);
            }
            break;
          case EVENT_NAMES.updateAlert:
            if (shownUpdateAlert) {
              reject(new Error('The update alert can only be called once.'));
              return;
            }
            shownUpdateAlert = true;
            try {
              onUpdateAlert(data);
              resolve();
            } catch (error) {
              reject(error);
            }
            break;
          default:
            reject(new Error('Unknown event name: ' + eventName));
        }
      });
    },

    on(eventName, handler) {
      if (!Object.values(EVENT_NAMES).includes(eventName)) {
        return Promise.reject(new Error('The event is not supported: ' + eventName));
      }
      if (eventName !== EVENT_NAMES.request) {
        return Promise.reject(new Error('The event is not supported: ' + eventName));
      }
      if (typeof handler !== 'function') return Promise.reject(new Error('Handler must be a function'));
      events.request = handler;
      onRequestSet?.(handler);
      return Promise.resolve();
    },

    utils: {
      crypto: {
        aesEncrypt(buffer, mode, key, iv) {
          const cipher = crypto.createCipheriv(mode, key, iv);
          return Buffer.concat([cipher.update(buffer), cipher.final()]);
        },
        rsaEncrypt(buffer, key) {
          const padded = Buffer.concat([Buffer.alloc(128 - buffer.length), buffer]);
          return crypto.publicEncrypt({ key, padding: crypto.constants.RSA_NO_PADDING }, padded);
        },
        randomBytes(size) {
          return crypto.randomBytes(size);
        },
        md5(str) {
          return crypto.createHash('md5').update(str).digest('hex');
        },
      },
      buffer: {
        from(...args) {
          return Buffer.from(...args);
        },
        bufToString(buf, format) {
          return Buffer.from(buf, 'binary').toString(format);
        },
      },
      zlib: {
        inflate(buf) {
          return new Promise((resolve, reject) => {
            zlib.inflate(buf, (error, data) => {
              if (error) reject(new Error(error.message));
              else resolve(data);
            });
          });
        },
        deflate(data) {
          return new Promise((resolve, reject) => {
            zlib.deflate(data, (error, buf2) => {
              if (error) reject(new Error(error.message));
              else resolve(buf2);
            });
          });
        },
      },
    },
  };

  // 源内部未捕获异常的上报入口（上游是 window.onerror）。
  api.__reportError = (error) => {
    onError?.(error instanceof Error ? error.message : String(error));
  };

  return api;
}

module.exports = {
  EVENT_NAMES,
  ALL_SOURCES,
  SUPPORT_QUALITY,
  SUPPORT_ACTIONS,
  createLxApi,
};
