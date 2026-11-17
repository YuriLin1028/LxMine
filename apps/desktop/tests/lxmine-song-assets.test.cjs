'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../shared/lx-playlists.cjs');
const assets = require('../shared/lx-song-assets.cjs');

test('the actual Android and Harmony runtime entries load public asset repair before the host', () => {
  const fs = require('node:fs'), path = require('node:path');
  for (const file of ['../../android/app/src/main/assets/lx-runtime/index-android.html', '../../harmony/entry/src/main/resources/rawfile/lx-runtime/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert(html.indexOf('src="lx-song-assets.js"') >= 0);
    assert(html.indexOf('src="lx-song-assets.js"') < html.indexOf('src="host.js"'));
  }
});

test('artwork repair preserves a direct Kugou URL and normalizes its search metadata', () => {
  const result = core.normalizeSong({ FileHash: 'hash', SongName: '歌', SingerName: '甲', Duration: 180, Image: 'http://img.test/cover.jpg' }, 'kg');
  assert.equal(result.coverUrl, 'https://img.test/cover.jpg');
  assert.equal(result.name, '歌');
  assert.equal(result.singer, '甲');
  assert.equal(result.durationMs, 180000);
});

test('Netease detail fills a missing search cover and retains YRC and translated lyrics', async () => {
  const song = { source: 'wy', id: 'assets-wy', name: '歌', singer: '甲' };
  const io = { json: async url => url.includes('/detail') ? { songs: [{ al: { picUrl: 'http://img.test/album.jpg' } }] }
    : { yrc: { lyric: '[1000,2000](1000,2000,0)歌词' }, tlyric: { lyric: '[00:01]翻译' } } };
  const result = await assets.get(song, io, core);
  assert.equal(result.coverUrl, 'https://img.test/album.jpg');
  assert.match(result.lyric, /^\[1000/);
  assert.equal(result.tlyric, '[00:01]翻译');
});

test('Kuwo assets retain timestamp fractions and decoded original text', async () => {
  const result = await assets.get({ source: 'kw', id: 'assets-kw', name: '歌', singer: '甲' }, { json: async () => ({ data: {
    songinfo: { pic: 'https://img.test/kw.jpg' }, lrclist: [{ time: '62.125', lineLyric: '歌词' }]
  } }) }, core);
  assert.equal(result.lyric, '[1:02.125]歌词');
  assert.equal(result.coverUrl, 'https://img.test/kw.jpg');
});

test('missing assets only use a complete matching recording and keep the original platform identity', async () => {
  const original = { source: 'kg', id: 'no-assets', name: '歌 (Live)', singer: '甲', durationMs: 180000 };
  const requests = [];
  const io = { json: async url => {
    requests.push(url);
    if (url.includes('kugou.com/search')) return { candidates: [] };
    if (url.includes('/search/get/web')) return { result: { songs: [
      { id: 11, name: '歌', artists: [{ name: '甲' }], duration: 180000 },
      { id: 12, name: '歌 (Live)', artists: [{ name: '甲' }], duration: 180500 }
    ] } };
    if (url.includes('/detail')) return { songs: [{ album: { picUrl: 'https://img.test/live.jpg' } }] };
    return { lrc: { lyric: '[00:01]现场歌词' } };
  } };
  const result = await assets.get(original, io, core);
  assert.equal(result.coverUrl, 'https://img.test/live.jpg');
  assert.equal(result.lyric, '[00:01]现场歌词');
  assert.equal(original.source, 'kg');
  assert(requests.some(url => url.includes('id=12')));
});

test('numeric QQ identifiers request numeric song details and decode timed base64 lyrics', async () => {
  const song = core.normalizeSong({ id: '123456789', name: '数字标识', singer: '甲', albumId: '10001' }, 'tx');
  assert.equal(song.coverUrl, '');
  const result = await assets.get(song, { json: async url => {
    if (url.includes('musicu.fcg')) {
      const request = JSON.parse(new URL(url).searchParams.get('data'));
      assert.equal(request.req_0.param.song_id, 123456789);
      assert.equal(request.req_0.param.song_mid, undefined);
      return { req_0: { data: { track_info: { album: { mid: '002Album' } } } } };
    }
    return { lyric: Buffer.from('[00:01]数字歌词').toString('base64') };
  } }, core);
  assert.match(result.coverUrl, /002Album\.jpg$/);
  assert.equal(result.lyric, '[00:01]数字歌词');
});

test('Kugou missing cover uses the exact hash and survives a separate lyric outage', async () => {
  const song = { source: 'kg', id: 'exact-cover-hash', name: '封面测试', singer: '甲', durationMs: 180000 };
  const result = await assets.get(song, { json: async url => {
    if (url.includes('lyrics.kugou.com')) throw new Error('temporary lyrics outage');
    if (url.includes('songsearch.kugou.com')) return { data: { lists: [
      { FileHash: 'other-hash', SongName: song.name, SingerName: song.singer, Duration: 180, Image: 'https://img.test/other.jpg' },
      { FileHash: song.id, SongName: '歌曲原始标题', SingerName: '甲 / 合作歌手', Duration: 193, Image: '//img.test/exact.jpg?a=1&amp;b=2' }
    ] } };
    throw new Error('no other recording');
  } }, core);
  assert.equal(result.coverUrl, 'https://img.test/exact.jpg?a=1&b=2');
  assert.equal(result.lyric, '');
});
