/*
 * Lxlia 鸿蒙端 LX 自定义源运行时（Web 沙箱侧）。
 *
 * 与 lx-music-desktop 的 preload 保持同一套 lx API：
 *   - lx.on('request', handler) / lx.send('inited', info)
 *   - lx.request(url, options, callback) 通过原生桥（__lxNative）发 HTTP
 *   - lx.utils.crypto（AES / MD5 / randomBytes；RSA 在鸿蒙端暂不支持）
 *   - lx.utils.buffer / lx.utils.zlib（pako）
 *
 * 原生侧通过 controller.runJavaScript 调用：
 *   window.__lxRequest(id, payloadJson)   请求 musicUrl / lyric / pic
 *   window.__lxHttpResult(id, resultJson) 返回 HTTP 结果
 * 结果通过 __lxNative.onResult(id, json) / onInited(json) 回传。
 */
(function () {
  'use strict';

  var EVENT_NAMES = { request: 'request', inited: 'inited', updateAlert: 'updateAlert' };
  var native = window.__lxNative;
  var state = { handler: null, http: {}, seq: 0 };

  function toU8(value) {
    if (!value) return new Uint8Array(0);
    if (value && value.bytes instanceof Uint8Array) return value.bytes;
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (Array.isArray(value)) return new Uint8Array(value);
    if (typeof value === 'string') return new TextEncoder().encode(value);
    return new Uint8Array(0);
  }

  function toHex(u8) {
    var out = '';
    for (var i = 0; i < u8.length; i += 1) out += u8[i].toString(16).padStart(2, '0');
    return out;
  }

  function fromHex(hex) {
    var u8 = new Uint8Array(hex.length / 2);
    for (var i = 0; i < u8.length; i += 1) u8[i] = parseInt(hex.substr(i * 2, 2), 16);
    return u8;
  }

  function toBase64(u8) {
    var binary = '';
    for (var i = 0; i < u8.length; i += 1) binary += String.fromCharCode(u8[i]);
    return btoa(binary);
  }

  function fromBase64(text) {
    var binary = atob(text);
    var u8 = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) u8[i] = binary.charCodeAt(i);
    return u8;
  }

  /** 极简 Buffer 兼容层：源脚本只需要 toString / length / slice / concat。 */
  function LxBuffer(input, encoding) {
    var bytes = input;
    if (typeof input === 'string') {
      if (encoding === 'base64') bytes = fromBase64(input);
      else if (encoding === 'hex') bytes = fromHex(input);
      else if (encoding === 'binary' || encoding === 'latin1') {
        bytes = new Uint8Array(input.length);
        for (var i = 0; i < input.length; i += 1) bytes[i] = input.charCodeAt(i) & 0xff;
      } else bytes = new TextEncoder().encode(input);
    }
    var u8 = toU8(bytes);
    this.bytes = u8;
    this.length = u8.length;
  }
  LxBuffer.prototype.toString = function (encoding) {
    if (encoding === 'hex') return toHex(this.bytes);
    if (encoding === 'base64') return toBase64(this.bytes);
    if (encoding === 'binary' || encoding === 'latin1') {
      var out = '';
      for (var i = 0; i < this.bytes.length; i += 1) out += String.fromCharCode(this.bytes[i]);
      return out;
    }
    return new TextDecoder().decode(this.bytes);
  };
  LxBuffer.prototype.slice = function (start, end) {
    return new LxBuffer(this.bytes.slice(start, end));
  };
  LxBuffer.concat = function (list) {
    var total = 0;
    for (var i = 0; i < list.length; i += 1) total += toU8(list[i].bytes || list[i]).length;
    var out = new Uint8Array(total);
    var offset = 0;
    for (var j = 0; j < list.length; j += 1) {
      var part = toU8(list[j].bytes || list[j]);
      out.set(part, offset);
      offset += part.length;
    }
    return new LxBuffer(out);
  };

  function wordArrayToU8(wordArray) {
    var words = wordArray.words;
    var sigBytes = wordArray.sigBytes;
    var u8 = new Uint8Array(sigBytes);
    for (var i = 0; i < sigBytes; i += 1) {
      u8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return u8;
  }

  function u8ToWordArray(u8) {
    return CryptoJS.lib.WordArray.create(u8);
  }

  var lx = {
    EVENT_NAMES: EVENT_NAMES,
    version: '2.0.0',
    env: 'desktop',
    currentScriptInfo: window.__lxScriptInfo || {},

    on: function (eventName, handler) {
      if (eventName !== EVENT_NAMES.request) return Promise.reject(new Error('The event is not supported: ' + eventName));
      if (typeof handler !== 'function') return Promise.reject(new Error('Handler must be a function'));
      state.handler = handler;
      return Promise.resolve();
    },

    send: function (eventName, data) {
      if (eventName === EVENT_NAMES.inited) {
        native.onInited(JSON.stringify(data || {}));
        return Promise.resolve();
      }
      if (eventName === EVENT_NAMES.updateAlert) return Promise.resolve();
      return Promise.reject(new Error('The event is not supported: ' + eventName));
    },

    request: function (url, options, callback) {
      options = options || {};
      callback = callback || function () {};
      var id = String(++state.seq);
      state.http[id] = callback;
      var payload = {
        url: url,
        method: options.method || 'get',
        headers: options.headers || {},
        body: options.body,
        form: options.form,
        formData: options.formData,
        timeout: options.timeout,
      };
      try {
        native.httpRequest(id, JSON.stringify(payload));
      } catch (error) {
        delete state.http[id];
        callback(error, null, null);
      }
      return function () {};
    },

    utils: {
      crypto: {
        aesEncrypt: function (buffer, mode, key, iv) {
          var parts = String(mode || 'aes-128-cbc').split('-');
          var cipherMode = (parts[2] || 'cbc') === 'ecb' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC;
          var options = { mode: cipherMode, padding: CryptoJS.pad.Pkcs7 };
          if (iv && cipherMode !== CryptoJS.mode.ECB) options.iv = u8ToWordArray(toU8(iv));
          var encrypted = CryptoJS.AES.encrypt(u8ToWordArray(toU8(buffer)), u8ToWordArray(toU8(key)), options);
          return new LxBuffer(wordArrayToU8(encrypted.ciphertext));
        },
        rsaEncrypt: function () {
          throw new Error('rsaEncrypt is not supported on HarmonyOS yet');
        },
        randomBytes: function (size) {
          var u8 = new Uint8Array(size);
          crypto.getRandomValues(u8);
          return new LxBuffer(u8);
        },
        md5: function (str) {
          return CryptoJS.MD5(String(str)).toString();
        },
      },
      buffer: {
        from: function (input, encoding) {
          return new LxBuffer(input, encoding);
        },
        bufToString: function (buf, format) {
          return new LxBuffer(buf).toString(format);
        },
      },
      zlib: {
        inflate: function (buf) {
          return new Promise(function (resolve) {
            resolve(new LxBuffer(pako.inflate(toU8(buf))));
          });
        },
        deflate: function (data) {
          return new Promise(function (resolve) {
            resolve(new LxBuffer(pako.deflate(toU8(data))));
          });
        },
      },
    },
  };

  window.lx = lx;
  try {
    window.globalThis = window;
  } catch (error) {
    // strict mode 下忽略
  }

  window.__lxHttpResult = function (id, resultJson) {
    var callback = state.http[id];
    if (!callback) return;
    delete state.http[id];
    var result = JSON.parse(resultJson);
    if (result.error) {
      callback(new Error(result.error), null, null);
      return;
    }
    var response = result.response;
    var body = response.body;
    callback(null, response, body);
  };

  window.__lxRequest = function (id, payloadJson) {
    var payload = JSON.parse(payloadJson);
    if (!state.handler) {
      native.onResult(id, JSON.stringify({ ok: false, error: 'Request event is not defined' }));
      return;
    }
    Promise.resolve()
      .then(function () { return state.handler(payload); })
      .then(function (result) {
        native.onResult(id, JSON.stringify({ ok: true, data: result }));
      })
      .catch(function (error) {
        native.onResult(id, JSON.stringify({ ok: false, error: (error && error.message) || String(error) }));
      });
  };

  window.__lxLoaded = true;
  window.__lxReset = function () { state.handler = null; };
})();
