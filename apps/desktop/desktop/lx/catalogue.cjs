'use strict';

// Public catalogue metadata only. No provider accounts or playback credentials.
const UA = 'Mozilla/5.0 LxMine/0.1';
const JSON5 = require('json5');
async function json(url, options = {}, check) {
  const response = await fetch(url, { ...options, headers: { 'User-Agent': UA, ...(options.headers || {}) }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('检索请求失败：HTTP ' + response.status);
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) {
    const match = text.match(/^[^(]*\(([\s\S]*)\)\s*;?$/);
    if (!match) {
      try { parsed = JSON5.parse(text); } catch (_) { throw new Error('平台暂时没有返回有效的检索数据'); }
    } else {
      parsed = JSON.parse(match[1]);
    }
  }
  if (typeof check === 'function') check(parsed);
  return parsed;
}
module.exports = require('../../shared/lx-catalogue.cjs').createCatalogue({ json });
module.exports.discovery=require('../../shared/lx-discovery.cjs').createDiscovery({json,normalizeSong:require('../../shared/lx-playlists.cjs').normalizeSong,importPlaylist:require('./playlist.cjs').importPlaylist,collectAll:require('../../public/lxmine/pagination.js').collectAll});
