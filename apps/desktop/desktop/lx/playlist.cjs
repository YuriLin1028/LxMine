'use strict';
const crypto = require('node:crypto');
const core = require('../../shared/lx-playlists.cjs');
const assets = require('../../shared/lx-song-assets.cjs');

// 歌单 transport：仅访问受支持平台的公开元数据，不涉及账号或播放地址。
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(20000), headers: {
    'User-Agent': 'Mozilla/5.0 LxMine/0.1', ...options.headers,
  } });
  if (!response.ok) throw new Error(`歌单请求失败：HTTP ${response.status}`);
  return response;
}
async function importPlaylist(input, source) {
  return core.importPlaylist(input, source, {
    json: async (url, options) => (await request(url, options)).json(),
    page: async url => {
      const response = await request(url);
      return { url: response.url, body: await response.text() };
    },
    md5: text => crypto.createHash('md5').update(text).digest('hex'),
    linuxEncrypt(payload) {
      const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from('rFgB&h#%2?^eDg:Q'), null);
      return Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]).toString('hex').toUpperCase();
    },
  });
}
async function resolveImportedSong(song, matchSources) {
  return core.matchSong(matchSources ? { ...song, matchSources } : song, { json: async (url, options) => (await request(url, options)).json() });
}
async function songAssets(song) {
  return assets.get(song, { json: async (url, options) => (await request(url, { ...options, signal: AbortSignal.timeout(6000) })).json() }, core);
}
module.exports = { importPlaylist, resolveImportedSong, songAssets };
