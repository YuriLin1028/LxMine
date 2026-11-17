const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/lxmine/app.js'), 'utf8');
function topLevelFunction(name) {
  const start = source.search(new RegExp('^  (?:async )?function ' + name + '\\(', 'm'));
  const next = source.slice(start + 1).search(/^  (?:async )?function /m);
  return source.slice(start, next < 0 ? source.length : start + 1 + next);
}

test('late page data preserves player and search overlays and refreshes after closing', async () => {
  for (const overlay of ['detailOpen', 'searchOpen', 'commentsOpen']) {
    const state = { [overlay]: true }, root = { scrollTop: 420 };
    let renders = 0;
    const context = vm.createContext({ S: state, $: () => root, renderCurrent() { renders++; root.scrollTop = 0; }, updateHomeCompact() {} });
    vm.runInContext(topLevelFunction('deferPageRefresh') + topLevelFunction('flushPageRefresh'), context);
    for (const name of ['renderHome', 'renderMore', 'renderLibrary', 'renderPlaylist', 'renderSettings', 'renderLyricsSettings', 'renderSources', 'renderDownloads', 'renderLocal']) {
      vm.runInContext(topLevelFunction(name), context);
      await context[name]({});
      assert.equal(state.pageRefreshPending, true, name + ' failed to defer a background refresh');
    }
    context.flushPageRefresh(); assert.equal(renders, 0);
    state[overlay] = false;
    context.flushPageRefresh(); assert.equal(renders, 1); assert.equal(root.scrollTop, 420);
    context.flushPageRefresh(); assert.equal(renders, 1);
  }
});
const code = source.slice(source.indexOf('  async function playSong('), source.indexOf('  function cycleMode('));
function fixture() {
  const state = { resolveToken: 0, mode: '列表循环', queue: [], queueIndex: -1 };
  const pending = new Map(), played = [], errors = [];
  const audio = {
    src: 'old', paused: false,
    pause() { this.paused = true; },
    async play() { played.push(this.src); this.paused = false; },
  };
  const noop = () => {};
  const actions = vm.runInNewContext(code + '\n;({playSong,togglePlayback,nextSong})', {
    S: state, audio, identity: song => song.id, durationOf: () => 1000,
    resolveWithFallback: song => new Promise(resolve => pending.set(song.id, resolve)),
    setStageSong: noop, updateDock: noop, renderDetailLyrics: noop, pushDesktopLyrics: noop, syncWallpaperUi: noop,
    pushStageMetadata: noop, pushStageClock: noop, loadLyrics: noop, notify: message => errors.push(message),
    setPlaying: value => { state.playing = value; },
  });
  return { state, pending, played, errors, audio, ...actions };
}

test('latest resolved track owns playback when URL responses arrive out of order', async () => {
  const f = fixture();
  const first = f.playSong({ id: 'a' });
  const second = f.playSong({ id: 'b' });
  f.pending.get('b')('https://a.test/b'); await second;
  f.pending.get('a')('https://a.test/a'); await first;
  assert.deepEqual(f.played, ['https://a.test/b']);
  assert.equal(f.audio.paused, false); assert.equal(f.state.resolving, false);
});

test('pause while resolving cancels autoplay without discarding the new track', async () => {
  const f = fixture(); const request = f.playSong({ id: 'a' });
  f.state.playRequested = false; f.audio.pause();
  f.pending.get('a')('https://a.test/a'); await request;
  assert.deepEqual(f.played, []); assert.equal(f.audio.src, 'https://a.test/a');
});

test('manual next advances in single-repeat mode and keeps autoplay requested', () => {
  const f = fixture();
  f.state.mode = '单曲循环'; f.state.queue = [{ id: 'a' }, { id: 'b' }]; f.state.queueIndex = 0;
  f.nextSong(1);
  assert.equal(f.state.current.id, 'b'); assert.equal(f.state.playRequested, true);
});
