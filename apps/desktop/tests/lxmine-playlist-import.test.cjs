'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gzipSync } = require('node:zlib');
const core = require('../shared/lx-playlists.cjs');
const { decodePlaylistFile } = require('../shared/lx-playlist-file.cjs');

const track = { id: 'tx_12', name: '歌曲', source: 'tx', singer: '歌手', interval: '03:20',
  meta: { songId: 'QQMID', id: 12, strMediaMid: 'MEDIA', albumMid: 'ALBUM', qualitys: [{ type: 'flac' }] } };
const list = { name: '备份歌单', list: [track] };

test('QQ import uses the paged public endpoint when the legacy endpoint is unavailable', async () => {
  const requests = [];
  const result = await core.importPlaylist('https://y.qq.com/n/ryqq/playlist/12345', 'tx', { json: async url => {
    requests.push(url);
    if (url.includes('getcdinfo')) throw new Error('temporary legacy endpoint failure');
    return { code: 0, req_1: { code: 0, data: { total_song_num: 1, dirinfo: { title: '备用接口歌单' },
      songlist: [{ mid: 'QQMID12345', name: '歌曲', singer: [{ name: '歌手' }], interval: 180 }] } } };
  }, page: async url => ({ url, body: '' }) });
  assert.equal(result[0].songs.length, 1);
  assert.equal(result[0].name, '备用接口歌单');
  assert(requests.some(url => url.includes('musicu.fcg')));
});

test('large QQ imports advance by raw provider offsets and retry a malformed page', async () => {
  const entries = Array.from({ length: 1203 }, (_, i) => ({ mid: 'mid-' + i, name: '歌曲' + i }));
  entries[510] = entries[12];
  const offsets = [];
  let retried = false;
  const result = await core.importPlaylist('12345', 'tx', { json: async (url, options) => {
    if (url.includes('getcdinfo')) return { code: 0, cdlist: [{ total_song_num: entries.length, songlist: entries.slice(0, 50) }] };
    const request = JSON.parse(options.body).req_1.param;
    assert.equal(request.song_num, 100);
    offsets.push(request.song_begin);
    if (request.song_begin === 300 && !retried) { retried = true; return { code: 0 }; }
    return { code: 0, req_1: { code: 0, data: { total_song_num: entries.length, dirinfo: { title: '大歌单' },
      songlist: entries.slice(request.song_begin, request.song_begin + request.song_num) } } };
  } });
  assert.equal(result[0].songs.length, 1202);
  assert.deepEqual(result[0].songs.map(song => song.id), [...new Set(entries.map(song => song.mid))]);
  assert.deepEqual(offsets, [0, 100, 200, 300, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]);
  assert.match(result[0].warning, /1 条重复/);
});

test('QQ switches a failed gateway once and keeps the working gateway for subsequent pages', async () => {
  const gateways = [], offsets = [];
  const result = await core.importPlaylist('12345', 'tx', { json: async (url, options) => {
    if (url.includes('getcdinfo')) return { code: 1 };
    gateways.push(new URL(url).hostname);
    if (url.includes('u6.y.qq.com')) throw new Error('gateway unavailable');
    assert.equal(options.headers.Origin, 'https://y.qq.com');
    const { song_begin: offset } = JSON.parse(options.body).req_1.param;
    offsets.push(offset);
    return { code: 0, req_1: { code: 0, data: { total_song_num: 2,
      songlist: [{ mid: 'song-' + offset, name: '歌' + offset }] } } };
  } });
  assert.equal(result[0].songs.length, 2);
  assert.deepEqual(gateways, ['u6.y.qq.com', 'u6.y.qq.com', 'u6.y.qq.com', 'u.y.qq.com', 'u.y.qq.com']);
  assert.deepEqual(offsets, [0, 1]);
});

test('QQ finishes gracefully when total_song_num exceeds visible songs due to deleted/hidden tracks', async () => {
  const visible = Array.from({ length: 120 }, (_, i) => ({ mid: 'vis-' + i, name: '可见歌' + i }));
  const result = await core.importPlaylist('54321', 'tx', { json: async (url, options) => {
    if (url.includes('getcdinfo')) return { code: 0, cdlist: [{ dissname: '含下架歌单', total_song_num: 125, songlist: visible.slice(0, 50) }] };
    const { song_begin: offset, song_num: limit } = JSON.parse(options.body).req_1.param;
    return { code: 0, req_1: { code: 0, data: { total_song_num: 125, dirinfo: { title: '含下架歌单' },
      songlist: visible.slice(offset, offset + limit) } } };
  } });
  assert.equal(result[0].songs.length, 120);
  assert.equal(result[0].name, '含下架歌单');
  assert.match(result[0].warning, /5 条重复、隐藏或不可用曲目已跳过/);
});

test('large Netease imports only fetch missing details in bounded POST batches and retain playlist order', async () => {
  const ids = Array.from({ length: 1457 }, (_, i) => 10000000 + i);
  const rawSong = id => ({ id, name: '歌' + id, ar: [{ name: '歌手' }], al: { name: '专辑' }, dt: 180000 });
  let active = 0, peak = 0, fetched = 0;
  const unavailable = ids[703];
  const result = await core.importPlaylist('42', 'wy', {
    linuxEncrypt: JSON.stringify,
    json: async (url, options) => {
      assert.equal(url, 'https://music.163.com/api/linux/forward');
      assert.equal(options.method, 'POST');
      const request = JSON.parse(options.body.slice('eparams='.length));
      if (request.url.endsWith('/playlist/detail')) return { code: 200, playlist: {
        name: '1457 首', trackIds: ids.map(id => ({ id })), tracks: ids.slice(0, 57).map(rawSong)
      } };
      const batch = JSON.parse(request.params.ids);
      assert(batch.length <= 100);
      assert(batch.every(id => !ids.slice(0, 57).includes(Number(id))));
      active++; peak = Math.max(peak, active); fetched += batch.length;
      await new Promise(resolve => setTimeout(resolve, batch.length % 3));
      active--;
      return { code: 200, songs: batch.filter(id => Number(id) !== unavailable).map(rawSong).reverse() };
    }
  });
  assert.equal(fetched, 1400); assert(peak <= 3 && peak > 1);
  assert.deepEqual(result[0].songs.map(song => song.id), ids.filter(id => id !== unavailable).map(String));
  assert.match(result[0].warning, /1 首歌曲/);
});

test('Netease falls back to short legacy detail requests and never saves after exhausted network retries', async () => {
  const ids = Array.from({ length: 230 }, (_, i) => i + 1);
  const io = { linuxEncrypt: JSON.stringify, json: async (url, options) => {
    if (url.includes('linux/forward')) {
      const request = JSON.parse(options.body.slice(8));
      if (request.url.endsWith('/playlist/detail')) return { code: 200, playlist: { trackIds: ids.map(id => ({ id })), tracks: [] } };
      return { code: 403 };
    }
    assert(url.length < 2000);
    const batch = JSON.parse(new URL(url).searchParams.get('ids'));
    return { code: 200, songs: batch.map(id => ({ id, name: '歌' + id })) };
  } };
  assert.equal((await core.importPlaylist('42', 'wy', io))[0].songs.length, 230);
  let failures = 0;
  await assert.rejects(core.importPlaylist('42', 'wy', { ...io, json: async (url, options) => {
    if (url.includes('/api/song/detail')) { failures++; throw new Error('offline'); }
    return io.json(url, options);
  } }), /offline/);
  assert(failures >= 3);
});

test('real gzip LX backup families preserve platform identity and quality', async () => {
  const families = [
    { type: 'playList_v2', data: [list] }, { type: 'playList', data: [list] },
    { type: 'playListPart_v2', data: list }, { type: 'playListPart', data: list },
    { type: 'allData_v2', playList: [list] }, { type: 'allData', playList: [list] },
    { type: 'allData', defaultList: list }, { type: 'defautlList', data: list },
  ];
  for (const data of families) {
    const decoded = await decodePlaylistFile(gzipSync(JSON.stringify(data)));
    const song = core.fromJson(decoded)[0].songs[0];
    assert.equal(song.id, 'QQMID');
    assert.equal(song.strMediaMid, 'MEDIA');
    assert.equal(song.songId, '12');
    assert.equal(song.albumId, 'ALBUM');
    assert.equal(song.durationMs, 200000);
    assert.deepEqual(song.qualitys, ['flac']);
  }
  assert.equal(core.fromJson(JSON.stringify(JSON.stringify([list])))[0].songs.length, 1);
  await assert.rejects(decodePlaylistFile(Buffer.from([0x1f, 0x8b, 0])));
});

test('modern Kugou backups preserve every quality hash', () => {
  const value = core.normalizeSong({ id: 'kg_old', source: 'kg', name: '歌', meta: {
    hash: 'MP3', _qualitys: { flac: { hash: 'FLAC' }, '320k': { hash: 'HQ' } },
  } });
  assert.equal(value.id, 'MP3');
  assert.equal(value.hashes.flac, 'FLAC');
  assert.equal(value.hashes['320k'], 'HQ');
});

test('mobile share text, short redirects and Chinese punctuation are accepted', async () => {
  assert.equal(core.parseLink('来听歌单 https://music.douyin.com/qishui/share/playlist?playlist_id=123）。').id, '123');
  assert.equal(core.parseLink('分享 https://m.kugou.com/songlist/gcid_abc123/').id, 'gcid_abc123');
  let requested = '';
  const lists = await core.importPlaylist('分享歌单 https://163cn.tv/abcd', '', {
    page: async () => ({ url: 'https://music.163.com/#/playlist?id=42' }),
    linuxEncrypt: () => 'test', json: async url => { requested = url; return { code: 200, playlist: { name: '短链', tracks: [] } }; },
  });
  assert.equal(lists[0].name, '短链');
  assert.ok(requested.includes('linux/forward'));
});

test('Kugou paginates and failed final pages never produce partial imports', async () => {
  let page = 0;
  const io = { json: async () => ({ data: { total: 2, info: [{ hash: String(++page), filename: '歌手 - 歌' }] } }) };
  const result = await core.importPlaylist('https://www.kugou.com/yy/special/single/123.html', '', io);
  assert.equal(result[0].songs.length, 2);
  page = 0;
  await assert.rejects(core.importPlaylist('123', 'kg', { json: async () => ({ data: { total: 2, info: page++ ? [] : [{ hash: '1' }] } }) }), /分页中断/);
});

test('Qishui uses opaque cursors, preserves all tracks and rejects a repeated cursor', async () => {
  let page = 0;
  const json = async url => {
    assert.equal(new URL(url).searchParams.get('cursor'), page ? 'opaque-cursor' : '');
    return { playlist: { title: '汽水', count_tracks: 2 }, has_more: page === 0, next_cursor: 'opaque-cursor',
      media_resources: [{ entity: { track_wrapper: { track: { id: String(++page), name: '歌', duration: 120000, artists: [{ name: '歌手' }] } } } }] };
  };
  const result = await core.importPlaylist('https://www.qishui.com/playlist/99', '', { json });
  assert.equal(result[0].songs.length, 2);
  assert.equal(result[0].songs[0].source, 'qishui');
  await assert.rejects(core.importPlaylist('99', 'qishui', { json: async () => ({ playlist: {}, has_more: true, next_cursor: 'same', media_resources: [] }) }), /分页中断/);
});

test('Qishui matching preserves version, artist and duration constraints', async () => {
  const original = { source: 'qishui', id: 'strict-match', name: '歌 (Live)', singer: '甲', durationMs: 180000 };
  const raw = (id, name, singer, duration) => ({ id, name, artists: [{ name: singer }], duration });
  const candidates = [raw(1, '歌', '甲', 180000), raw(2, '歌 (Live)', '乙', 180000),
    raw(3, '歌 (Live)', '甲', 240000), raw(4, '歌 (Live)', '甲', 181000)];
  const result = await core.matchSong(original, { json: async () => ({ code: 200, result: { songs: candidates } }) });
  assert.equal(result.id, '4');
  await assert.rejects(core.matchSong({ ...original, id: 'no-match' }, { json: async () => ({ code: 200, result: { songs: candidates.slice(0, 3) } }) }), /暂未找到/);
});
