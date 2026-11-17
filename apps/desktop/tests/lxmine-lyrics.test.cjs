'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lyrics = require('../public/mine-stage/mine-stage-lyrics.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function stageModule(name) {
  return fs.readFileSync(path.join(__dirname, '../public/mine-stage/js/modules/02-visual', name), 'utf8');
}

test('both stage themes keep lyric hues readable against their missing-cover background', () => {
  const context = { window: {}, document: { body: { classList: { toggle() {} } }, documentElement: { style: {} } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/mine-stage/mine-stage-appearance.js'), 'utf8'), context);
  const appearance = context.window.LxMineAppearance;
  function luminance(hex) {
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  }
  for (const theme of ['light', 'dark']) {
    appearance.apply(theme);
    assert.equal(appearance.uniform.value, theme === 'light' ? 1 : 0);
    for (const color of ['#ffffff', '#000000', '#f4d28a', '#8fb2a6', '#ff3333']) {
      const foreground = luminance(appearance.readable(color)), background = luminance(theme === 'light' ? '#c2c5ca' : '#151619');
      assert((Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) >= (theme === 'light' ? 7 : 4.5));
    }
  }
});

test('light lyric materials correct bright rgb preset palettes after colour conversion', () => {
  const context = { window: {}, THREE: require('../public/vendor/three.r128.min.js'),
    normalizeHexColor: value => value, document: { body: { classList: { toggle() {} } }, documentElement: { style: {} } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/mine-stage/mine-stage-appearance.js'), 'utf8'), context);
  context.LxMineAppearance = context.window.LxMineAppearance;
  context.LxMineAppearance.apply('light');
  const source = stageModule('07-lyrics-palette-text-utils.js');
  for (const name of ['cssColorToThreeColor', 'lyricThreeColor']) {
    vm.runInContext(source.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n}'))[0], context);
  }
  function luminance(rgb) {
    const linear = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  }
  const background = luminance([194, 197, 202].map(value => value / 255));
  for (const css of ['rgb(250, 250, 250)', 'rgba(244,210,138,1)', '#8fb2a6']) {
    const rendered = context.lyricThreeColor(css, '#ffffff', .48);
    assert((background + .05) / (luminance([rendered.r, rendered.g, rendered.b]) + .05) >= 7, css);
  }
});

test('plain karaoke uses absolute word timing and keeps complete graphemes', () => {
  const segments = lyrics.karaokeSegments({ timeMs: 1000, text: '你好😀', words: [
    { text: '你好', timeMs: 1000, durationMs: 1000 }, { text: '😀', timeMs: 3000, durationMs: 600 }
  ] }, { timeMs: 5000 }, 8000);
  assert.deepEqual(segments, [{ text: '你', start: 1000, end: 1500 }, { text: '好', start: 1500, end: 2000 }, { text: '😀', start: 3000, end: 3600 }]);
  assert.deepEqual(lyrics.karaokeSegments({ timeMs: 0, text: 'á字' }, { timeMs: 2000 }, 9000),
    [{ text: 'á', start: 0, end: 1000 }, { text: '字', start: 1000, end: 2000 }]);
});

test('plain and dynamic lyrics share the original 50 ms lookahead and offsets', () => {
  const times = [0, 1800, 2600, 9000];
  const plain = times.map(timeMs => ({ timeMs }));
  const dynamic = times.map(timeMs => ({ t: timeMs / 1000 }));
  for (const offset of [-500, 0, 350]) {
    for (const position of [0, 1749, 1750, 1799, 1800, 2550, 10000]) {
      const time = lyrics.adjustedTime(position, offset);
      const expected = times.findLastIndex(line => line <= time + 50);
      assert.equal(lyrics.indexAt(plain, time), expected);
      assert.equal(lyrics.indexAt(dynamic, time, 't', 1000), expected);
    }
  }
});

test('both lyric renderers use measured word widths, identical timing gaps and the same colour feather', () => {
  const lines = lyrics.stageLines([{ timeMs: 1000, text: 'iW', words: [
    { text: 'i', timeMs: 1000, durationMs: 1000 }, { text: 'W', timeMs: 3000, durationMs: 40 }
  ] }, { timeMs: 5000, text: '下一行' }], 8000);
  const measure = text => Array.from(text).reduce((sum, char) => sum + (char === 'W' ? 3 : 1), 0);
  const ranges = lyrics.wordRanges(lines[0], measure);
  assert.deepEqual(ranges, [{ p0: 0, p1: .25 }, { p0: .25, p1: 1 }]);
  const dynamicSource = stageModule('14-stage-lyrics-rendering.js');
  const start = dynamicSource.indexOf('function getLyricLineProgress(');
  const end = dynamicSource.indexOf('\nfunction lyricLineDisplayTextAt', start);
  const dynamic = vm.runInNewContext(dynamicSource.slice(start, end) + ';getLyricLineProgress', {
    LxMineLyrics: lyrics, audio: { duration: 8 }, lyricKaraokeWordRanges: () => ranges
  });
  for (const [time, expected] of [[1, 0], [1.5, .125], [2.5, .25], [3.04, .625], [3.08, 1]]) {
    assert(Math.abs(dynamic(lines[0], lines[1], time) - expected) < 1e-9);
    assert.equal(dynamic(lines[0], lines[1], time), lyrics.lineProgress(lines[0], lines[1], time, 8, ranges));
  }
  assert(Math.abs(lyrics.karaokeCoverage(.4, .415, lyrics.feather(true)) - .5) < 1e-12);
  assert.equal(lyrics.karaokeCoverage(.4, .6, lyrics.feather(true)), 0);
  assert.equal(lyrics.karaokeCoverage(.4, .2, lyrics.feather(true)), 1);
  const mask = lyrics.karaokeMask(.4, .3, .6, lyrics.feather(true));
  assert.match(mask, /rgba\(0,0,0,0.50000\) 38.3333%/);
});

test('shared two-stage lyric following remains continuous through a long seek and a quick reversal', () => {
  let phase = 0, displayed = 0;
  const history = [];
  for (let frame = 0; frame < 100; frame++) {
    const goal = frame < 12 ? 20 : 3;
    const before = displayed;
    phase = lyrics.followStep(phase, goal, lyrics.frameEase(lyrics.scrollEase(1) * 1.16, 1 / 60), .68);
    displayed = lyrics.followStep(displayed, phase, lyrics.frameEase(lyrics.scrollEase(1), 1 / 60), .66);
    assert(Math.abs(displayed - before) <= .66);
    history.push(displayed);
  }
  assert(history[1] > history[0]);
  assert(history[20] < Math.max(...history));
  assert(Math.abs(displayed - 3) < .01);
});

test('lyric click uses the original line time and preserves the dynamic glyph anchor', () => {
  assert.equal(lyrics.seekTime(1800), 1800);
  assert.equal(lyrics.seekTime(-1), 0);
  assert(Math.abs(lyrics.anchorY(1840, .43) - 791.2) < .0001);
  assert.equal(lyrics.anchorY(800), 400);
});

test('native dynamic lyrics cover portrait and landscape viewports with a bounded resident window', () => {
  const context = vm.createContext({ window: { __LXMINE_NATIVE_STAGE: true }, innerWidth: 412, innerHeight: 900,
    fx: { lyricTranslationMode: 'off' }, fxDefaults: {}, clampRange: (value, min, max) => Math.max(min, Math.min(max, value)),
    lyricsLines: Array.from({ length: 2000 }, () => ({ text: '歌词' })) });
  vm.runInContext(stageModule('08-lyrics-display-modes.js'), context);
  const source = stageModule('14-stage-lyrics-rendering.js');
  vm.runInContext(source.slice(source.indexOf('function lyricMeshTrackWindow('), source.indexOf('function buildStageLyricMeshTrackEntries(')), context);
  for (const [width, height] of [[412, 900], [1400, 920], [1200, 800]]) {
    context.innerWidth = width; context.innerHeight = height;
    const count = vm.runInContext("lyricDisplayLineCountForMode('cinema')", context);
    assert(count >= Math.ceil(height / Math.max(32, Math.min(width, height) * .10)) + 4);
    assert(count <= 31);
    assert.equal(count % 2, 1);
    for (const index of [0, 1, 11, 50, 1000, 1999]) {
      const resident = vm.runInContext(`lyricMeshTrackWindow(${index}, 'cinema', {})`, context);
      assert(resident.start >= 0 && resident.end < 2000);
      assert(resident.end - resident.start + 1 <= count + 8);
      assert(resident.start <= Math.max(0, index - Math.floor(count / 2)));
      assert(resident.end >= Math.min(1999, index + Math.floor(count / 2)));
    }
  }
});

test('dynamic lyric fade acts on fragments at the screen edge while preserving prior shader hooks', () => {
  const context = vm.createContext({ window: { __LXMINE_NATIVE_STAGE: true }, renderer: { domElement: { height: 900 } } });
  vm.runInContext(stageModule('11-lyrics-shaders.js'), context);
  let previousCalled = false;
  const material = { onBeforeCompile(shader) { previousCalled = true; shader.uniforms.existing = { value: 1 }; } };
  context.applyLyricViewportFade(material);
  const shader = { uniforms: {}, fragmentShader: 'void main(){ gl_FragColor=vec4(1.0); }' };
  material.onBeforeCompile(shader, {});
  assert(previousCalled);
  assert.equal(shader.uniforms.existing.value, 1);
  assert.equal(shader.uniforms.uLyricViewportHeight.value, 900);
  assert.match(shader.fragmentShader, /gl_FragCoord\.y/);
  assert.match(shader.fragmentShader, /gl_FragColor\.a \*= smoothstep/);
  context.stageLyricViewportHeight.value = 800;
  assert.equal(shader.uniforms.uLyricViewportHeight.value, 800);
});
