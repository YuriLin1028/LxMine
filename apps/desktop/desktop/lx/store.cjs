'use strict';

// 自定义源的持久化：与 LX 桌面版相同的元数据解析规则（脚本头部注释里的 @name 等），
// 存到 profile 数据目录下的 JSON 文件。脚本原文直接保存（不压缩），便于用户查看。

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const INFO_LIMITS = {
  name: 24,
  description: 36,
  author: 56,
  homepage: 1024,
  version: 36,
};

/** 从脚本头部注释解析源信息，规则与 LX 桌面版一致。 */
function parseScriptInfo(script) {
  const header = /^\/\*[\S|\s]+?\*\//.exec(script);
  if (!header) throw new Error('无效的自定义源文件：缺少头部信息注释');

  const info = {};
  for (const line of header[0].split(/\r?\n/)) {
    const match = /^\s?\*\s?@(\w+)\s(.+)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    if (!Object.prototype.hasOwnProperty.call(INFO_LIMITS, key)) continue;
    let value = match[2].trim();
    const limit = INFO_LIMITS[key];
    if (value.length > limit) value = value.substring(0, limit) + '...';
    info[key] = value;
  }
  for (const key of Object.keys(INFO_LIMITS)) {
    info[key] ??= '';
  }
  info.name ||= `user_api_${new Date().toLocaleString()}`;
  return info;
}

function hashScript(script) {
  return crypto.createHash('sha256').update(script, 'utf8').digest('hex');
}

function createLxSourceStore(options) {
  const filePath = options.filePath;
  let state = null;

  const load = () => {
    if (state) return state;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      state = {
        activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      };
    } catch {
      state = { activeId: null, sources: [] };
    }
    return state;
  };

  const save = () => {
    const data = load();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  };

  const list = () => load().sources.map(({ script, ...meta }) => ({
    ...meta,
    size: Buffer.byteLength(script ?? '', 'utf8'),
  }));

  const getScript = (id) => load().sources.find(source => source.id === id)?.script ?? null;
  const getSource = (id) => load().sources.find(source => source.id === id) ?? null;
  const getActiveId = () => load().activeId;
  const getActiveSource = () => {
    const id = getActiveId();
    return id ? getSource(id) : null;
  };

  const importScript = (raw) => {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('无效的自定义源文件');
    const data = load();
    const scriptInfo = parseScriptInfo(raw);
    const scriptHash = hashScript(raw);
    for (const source of data.sources) {
      if (source.scriptHash === scriptHash) {
        throw new Error(`导入失败，脚本内容与已有的源「${source.name}」相同`);
      }
    }
    const source = {
      id: `user_api_${Math.random().toString().substring(2, 5)}_${Date.now()}`,
      ...scriptInfo,
      script: raw,
      scriptHash,
      allowShowUpdateAlert: true,
      importedAt: Date.now(),
    };
    data.sources.push(source);
    if (!data.activeId) data.activeId = source.id;
    save();
    return list().find(item => item.id === source.id);
  };

  const remove = (ids) => {
    const data = load();
    const targets = Array.isArray(ids) ? ids : [ids];
    data.sources = data.sources.filter(source => !targets.includes(source.id));
    if (data.activeId && targets.includes(data.activeId)) {
      data.activeId = data.sources[0]?.id ?? null;
    }
    save();
    return list();
  };

  const setActive = (id) => {
    const data = load();
    if (!data.sources.some(source => source.id === id)) throw new Error('自定义源不存在');
    data.activeId = id;
    save();
    return list();
  };

  return {
    filePath,
    list,
    importScript,
    remove,
    setActive,
    getActiveId,
    getActiveSource,
    getSource,
    getScript,
    reload() { state = null; return load(); },
  };
}

module.exports = {
  createLxSourceStore,
  parseScriptInfo,
  hashScript,
};
