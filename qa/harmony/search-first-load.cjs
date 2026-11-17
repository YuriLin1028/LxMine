const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

const device = process.env.LM_HARMONY_DEVICE || '127.0.0.1:5555';
assert(device.startsWith('127.0.0.1:'), 'Use a Harmony emulator for this fixture');
const entry = process.env.LM_SEARCH_ENTRY || 'suggestion';
const directory = path.join(__dirname, 'artifacts/search-first-' + entry);
fs.mkdirSync(directory, { recursive: true });
const hdc = 'D:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe';
const run = (...args) => cp.execFileSync(hdc, ['-t', device, ...args], { windowsHide: true, timeout: 30000 });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function flatten(node, result = []) {
  if (node.attributes) result.push(node.attributes);
  for (const child of node.children || []) flatten(child, result);
  return result;
}
function ui(label) {
  run('shell', 'uitest', 'dumpLayout', '-a', '-b', 'cn.migu.music', '-p', '/data/local/tmp/lxmine-first-search.json');
  const file = path.join(directory, label + '.json');
  run('file', 'recv', '/data/local/tmp/lxmine-first-search.json', file);
  return flatten(JSON.parse(fs.readFileSync(file)));
}
const bounds = node => {
  assert(node, 'Missing native control');
  return (node.origBounds || node.bounds).match(/-?\d+/g).map(Number);
};
function tap(node) {
  const b = bounds(node);
  run('shell', 'uinput', '-T', '-c', String((b[0] + b[2]) >> 1), String((b[1] + b[3]) >> 1), '100');
}
function snapshot(nodes, height) {
  const count = nodes.find(node => /\d+ 首歌曲/.test(node.text));
  const texts = nodes.filter(node => {
    if (node.type !== 'Text' || !node.text) return false;
    const b = bounds(node);
    return b[1] > height * .32 && b[3] < height * .84;
  }).map(node => ({ text: node.text, y: bounds(node)[1] }));
  return { count: count ? Number(count.text.match(/(\d+) 首歌曲/)[1]) : null,
    query: nodes.find(node => node.id === 'search-page-input')?.text || '', texts };
}

const report = { device, entry, samples: [] };
(async () => {
  run('shell', 'aa', 'force-stop', 'cn.migu.music');
  run('shell', 'aa', 'start', '-a', 'EntryAbility', '-b', 'cn.migu.music');
  let nodes;
  for (let attempt = 0; attempt < 10; attempt++) {
    await pause(500);
    nodes = ui('startup-' + attempt);
    if (nodes.some(node => node.id === 'search-morph-node')) break;
  }
  const root = nodes.find(node => node.type === 'Root') || nodes.find(node => bounds(node)[2] > 1000);
  const width = bounds(root)[2], height = bounds(root)[3];
  report.viewport = { width, height };
  tap(nodes.find(node => node.id === 'search-morph-node'));
  await pause(700);
  nodes = ui('search-open');
  if (entry === 'suggestion') {
    tap(nodes.find(node => node.text === '周杰伦' && bounds(node)[1] < height * .8));
  } else {
    const b = bounds(nodes.find(node => node.id === 'search-page-input'));
    run('shell', 'uitest', 'uiInput', 'inputText', String((b[0] + b[2]) >> 1), String((b[1] + b[3]) >> 1), 'love');
    await pause(300);
    nodes = ui('typed');
    tap(nodes.find(node => node.text === '搜索' && bounds(node)[0] > width * .7));
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    await pause(400);
    nodes = ui('results-' + attempt);
    report.before = snapshot(nodes, height);
    if (report.before.count > 20) break;
  }
  assert(report.before.count > 20, 'The first search did not return results');
  assert(nodes.some(node => node.id === 'song-list-view'), 'The installed app has an outdated song-list implementation');
  report.keyboardFocused = nodes.find(node => node.id === 'search-page-input')?.focused;
  for (let index = 0; index < 6; index++) {
    const x = Math.round(width * [.5, .3, .7][index % 3]);
    run('shell', 'uitest', 'uiInput', 'swipe', String(x), String(Math.round(height * .74)), String(x), String(Math.round(height * .4)), '1400');
    await pause(250);
    report.samples.push(snapshot(ui('swipe-' + index), height));
  }
  const signatures = report.samples.map(sample => JSON.stringify(sample.texts));
  assert(report.samples.every(sample => sample.query === report.before.query && sample.texts.length),
    'The native search page was interrupted during the scroll sequence');
  assert(new Set(signatures).size >= 4, 'First-search results do not scroll without changing platform or category');
  assert.notEqual(signatures[0], JSON.stringify(report.before.texts), 'The first swipe did not move result rows');
  report.status = 'PASS';
})().catch(error => {
  report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
}).finally(() => {
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
});
