'use strict';
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const MAX_PLAYLIST_BYTES = 32 * 1024 * 1024;
const gunzip = promisify(zlib.gunzip);

async function decodePlaylistFile(bytes) {
  if (bytes.length > MAX_PLAYLIST_BYTES) throw new Error('歌单文件超过 32 MB');
  const data = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? await gunzip(bytes, { maxOutputLength: MAX_PLAYLIST_BYTES }) : bytes;
  return data.toString('utf8').replace(/^\uFEFF/, '');
}
module.exports = { decodePlaylistFile, MAX_PLAYLIST_BYTES };
