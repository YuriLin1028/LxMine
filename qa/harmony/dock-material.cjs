// Native emulator regression: one persistent dock, real touch light/drag, and
// unclipped source actions. This never controls the user's physical device.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { PNG } = require('../../apps/desktop/node_modules/pngjs');
const root = path.resolve(__dirname, '../..'), out = path.join(__dirname, 'artifacts/dock-material');
const device = process.env.LM_HARMONY_DEVICE || '127.0.0.1:5555', bundle = 'cn.migu.music';
assert(device.startsWith('127.0.0.1:'), 'Run this fixture only on a Harmony emulator');
const hdc = process.env.LM_HDC || 'D:/Program Files/Huawei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe';
const run = (...args) => cp.execFileSync(hdc, ['-t', device, ...args], { windowsHide: true, timeout: 30000 });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
fs.mkdirSync(out, { recursive: true });
function flatten(node, result = []) { if (node.attributes) result.push(node.attributes); for (const child of node.children || []) flatten(child, result); return result; }
function ui(name) {
  run('shell', 'uitest', 'dumpLayout', '-a', '-b', bundle, '-p', '/data/local/tmp/lxmine-dock-ui.json');
  const file = path.join(out, name + '.json'); run('file', 'recv', '/data/local/tmp/lxmine-dock-ui.json', file);
  return flatten(JSON.parse(fs.readFileSync(file)));
}
const box = node => { assert(node, 'Missing native control'); return node.origBounds.match(/-?\d+/g).map(Number); };
const center = node => { const b = box(node); return [(b[0] + b[2]) / 2 | 0, (b[1] + b[3]) / 2 | 0]; };
const tap = node => run('shell', 'uinput', '-T', '-c', ...center(node).map(String), '120');
function shot(name) {
  const jpeg = path.join(out, name + '.jpeg'); run('shell', 'snapshot_display', '-f', '/data/local/tmp/lxmine-dock.jpeg');
  run('file', 'recv', '/data/local/tmp/lxmine-dock.jpeg', jpeg);
  const png = cp.execFileSync('ffmpeg.exe', ['-i', jpeg, '-f', 'image2pipe', '-vcodec', 'png', '-loglevel', 'error', '-'], { windowsHide: true, maxBuffer: 30e6 });
  fs.writeFileSync(path.join(out, name + '.png'), png); return PNG.sync.read(png);
}
async function hold(node, name, dx = 0, dy = 0) {
  const [x, y] = center(node);
  const child = cp.spawn(hdc, ['-t', device, 'shell', 'uinput', '-T', '-m', String(x), String(y), String(x + dx), String(y + dy), '-k', '8000', '450'], { windowsHide: true });
  const done = new Promise((resolve, reject) => child.once('exit', code => code ? reject(Error('Touch injection failed')) : resolve()));
  await pause(1000); const image = shot(name), nodes = ui(name); await done; await pause(750); return { image, nodes };
}
async function boot() {
  run('shell', 'aa force-stop ' + bundle);
  run('shell', `aa start -a EntryAbility -b ${bundle} -U 'lxmine://play?source=local&id=dock-material-qa&name=DockMaterialQA&duration=300000'`);
  let previousGeometry = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    await pause(500);
    const nodes = ui('startup-' + attempt);
    const dock = nodes.find(node => node.id === 'dock-playback');
    const settings = nodes.find(node => node.id === 'dock-nav-设置');
    const startupVisible = nodes.some(node => node.text?.includes('mine-stage/startup.html'));
    if (!dock || !settings || startupVisible) {
      previousGeometry = '';
      continue;
    }
    // Initial viewport measurement animates the dock to its tablet geometry.
    // Wait for two composed layouts to agree before using screenshot coordinates.
    const geometry = [dock.hostWindowId, dock.bounds, settings.bounds].join('|');
    if (geometry === previousGeometry) return nodes;
    previousGeometry = geometry;
  }
  throw Error('Startup dock geometry did not settle');
}
function lightGain(before, after, node) {
  const b = box(node), [cx, cy] = center(node), width = b[2] - b[0], height = b[3] - b[1]; let sum = 0, count = 0;
  for (let y = Math.ceil(cy - height * .46); y < cy - height * .36; y++) for (let x = Math.ceil(cx - width * .3); x < cx + width * .3; x++) {
    const i = (y * before.width + x) * 4; for (let c = 0; c < 3; c++) { sum += after.data[i + c] - before.data[i + c]; count++; }
  }
  return sum / count;
}
function glyph(image, node) {
  const b = box(node), inset = (b[2] - b[0]) * .23; let sx = 0, sy = 0, total = 0;
  const brightness = (x, y) => { const i = (y * image.width + x) * 4; return (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3; };
  for (let y = Math.ceil(b[1] + inset); y < b[3] - inset; y++) for (let x = Math.ceil(b[0] + inset); x < b[2] - inset; x++) {
    // Native light illuminates the glyph as well as the material. Track sharp
    // glyph edges rather than assuming its pressed pixels stay dark.
    const edge = Math.hypot(brightness(x + 1, y) - brightness(x - 1, y), brightness(x, y + 1) - brightness(x, y - 1));
    const weight = Math.pow(Math.max(0, edge - 4), 2); sx += x * weight; sy += y * weight; total += weight;
  }
  assert(total > 1000, 'Native glyph edges are missing'); return { x: sx / total, y: sy / total };
}
function contour(image, node) {
  const b = box(node), margin = (b[2] - b[0]) * .18; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = Math.ceil(b[1] - margin); y < b[3] + margin; y++) for (let x = Math.ceil(b[0] - margin); x < b[2] + margin; x++) {
    const i = (y * image.width + x) * 4;
    if (Math.min(image.data[i], image.data[i + 1], image.data[i + 2]) <= 235) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  assert(maxX > minX && maxY > minY, 'Native light-appearance contour is missing'); return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
const report = { device, identities: {}, light: {} };
(async () => {
  let nodes = await boot(); const dockId = nodes.find(n => n.id === 'dock-playback').accessibilityId;
  report.identities.home = dockId;
  async function press(scene) {
    const action = nodes.find(n => n.id === 'dock-play-toggle'), before = shot(scene + '-idle');
    const held = await hold(action, scene + '-pressed');
    report.light[scene] = lightGain(before, held.image, action);
    assert(report.light[scene] > 4, scene + ': the native flowing light did not reach the visible dock');
    const resting = box(nodes.find(n => n.id === 'dock-playback')), pressed = box(held.nodes.find(n => n.id === 'dock-playback'));
    const scale = (pressed[2] - pressed[0]) / (resting[2] - resting[0]);
    assert(scale > 1.015 && scale < 1.05, 'The whole dock must enlarge gently');
    report[scene + 'Scale'] = scale;
  }
  await press('home');
  tap(nodes.find(n => n.id === 'dock-cover')); await pause(900); nodes = ui('detail');
  assert(nodes.some(n => n.id === 'player-close'), 'Native detail page did not open');
  report.identities.detail = nodes.find(n => n.id === 'dock-playback').accessibilityId;
  await press('detail');
  const icon = nodes.find(n => n.id === 'player-close'), before = shot('drag-idle'), idleGlyph = glyph(before, icon), size = box(icon)[2] - box(icon)[0];
  const dragged = await hold(icon, 'drag-held', Math.round(size * .3), Math.round(size * .2));
  const movedGlyph = glyph(dragged.image, icon), shift = { x: movedGlyph.x - idleGlyph.x, y: movedGlyph.y - idleGlyph.y };
  const a = contour(before, icon), b = contour(dragged.image, icon), rim = { x: b.x - a.x, y: b.y - a.y };
  assert(rim.x > .5 && rim.y > .5, 'Native material must follow a drag on both axes');
  assert(Math.hypot(shift.x, shift.y) > 1, 'The glyph must follow its material'); report.drag = { glyph: shift, contour: rim };
  nodes = ui('after-drag'); if (nodes.some(n => n.id === 'player-close')) { run('shell', 'uitest', 'uiInput', 'keyEvent', 'Back'); await pause(700); nodes = ui('back'); }
  report.identities.back = nodes.find(n => n.id === 'dock-playback').accessibilityId;
  for (const tab of ['设置', '资料库', '发现']) { tap(nodes.find(n => n.id === 'dock-nav-' + tab)); await pause(600); nodes = ui('tab-' + tab); report.identities[tab] = nodes.find(n => n.id === 'dock-playback').accessibilityId; }
  assert.equal(new Set(Object.values(report.identities)).size, 1, 'Scene changes replaced the native material node');
  report.sources = [];
  for (const id of ['source-import-file', 'source-import-text']) {
    nodes = await boot(); tap(nodes.find(n => n.id === 'dock-nav-设置')); await pause(600); nodes = ui(id + '-settings');
    tap(nodes.find(n => n.text?.includes('个音源 · 当前使用'))); await pause(600); nodes = ui(id + '-page');
    const held = await hold(nodes.find(n => n.id === id), id + '-pressed'), control = held.nodes.find(n => n.id === id);
    const visible = control.bounds.match(/-?\d+/g).map(Number), original = box(control);
    assert(visible.every((v, i) => Math.abs(v - original[i]) <= 1), id + ': pressed material was clipped');
    report.sources.push({ id, bounds: original, clipped: false });
  }
  report.status = 'PASS';
})().catch(error => { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }).finally(() => {
  run('shell', 'aa force-stop ' + bundle); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
});
