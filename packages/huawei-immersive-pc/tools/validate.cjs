#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const failures = [];
const checks = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function exists(relative) {
  return fs.existsSync(path.join(root, relative));
}

function check(name, condition, detail) {
  checks.push({ name, ok: !!condition, detail: detail || '' });
  if (!condition) failures.push(name + (detail ? ': ' + detail : ''));
}

const required = [
  'README.md',
  'STANDARD.md',
  'SKILL.md',
  'CHANGELOG.md',
  'VALIDATION.md',
  'LICENSE',
  'NOTICE.md',
  'src/hx-material.js',
  'src/hx-interactions.js',
  'src/hx-popup.js',
  'src/hx-surfaces.js',
  'src/hx-immersive.css',
  'examples/index.html',
  'examples/demo.css',
  'examples/demo.js',
  'references/material-model.md',
  'references/motion-model.md',
  'references/popup-model.md',
  'references/surfaces-and-choreography.md',
  'references/windows-electron.md',
  'references/acceptance-protocol.md',
  'references/porting-checklist.md',
  'references/anti-patterns.md',
  'references/api-reference.md',
  'tools/serve.cjs',
  'tools/electron-main.cjs',
  'tools/smoke.cjs'
];
required.forEach((file) => check('exists: ' + file, exists(file)));

const jsFiles = [
  'src/hx-material.js',
  'src/hx-interactions.js',
  'src/hx-popup.js',
  'src/hx-surfaces.js',
  'examples/demo.js',
  'tools/serve.cjs',
  'tools/electron-main.cjs',
  'tools/smoke.cjs'
];
jsFiles.forEach((file) => {
  if (!exists(file)) return;
  try {
    new vm.Script(read(file), { filename: file });
    check('syntax: ' + file, true);
  } catch (error) {
    check('syntax: ' + file, false, error.message);
  }
});

const material = exists('src/hx-material.js') ? read('src/hx-material.js') : '';
const interactions = exists('src/hx-interactions.js') ? read('src/hx-interactions.js') : '';
const popup = exists('src/hx-popup.js') ? read('src/hx-popup.js') : '';
const css = exists('src/hx-immersive.css') ? read('src/hx-immersive.css') : '';
const demo = exists('examples/index.html') ? read('examples/index.html') : '';
const standard = exists('STANDARD.md') ? read('STANDARD.md') : '';
const skill = exists('SKILL.md') ? read('SKILL.md') : '';

[
  ['material: feDisplacementMap', /feDisplacementMap/],
  ['material: tangent shoulder', /tangentGain/],
  ['material: independent environmental rim', /envWeight/],
  ['material: post-displacement smoothing', /resultSigma/],
  ['material: live backdrop only', /backdrop-filter/],
  ['material: resize batching', /flushBudgetMs/],
  ['material: byte-exact interior shortcut', /neutralDepth/],
  ['interactions: pointer light reset', /pointerout/],
  ['interactions: window blur cleanup', /blur/],
  ['interactions: visibility cleanup', /visibilitychange/],
  ['interactions: content excluded from press', /contenteditable/],
  ['popup: 740ms entry', /ENTRY_DURATION = 740/],
  ['popup: 150ms close', /CLOSE_DURATION = 150/],
  ['popup: trigger-centre origin', /originX/],
  ['popup: above flip', /is-above/],
  ['popup: keyboard escape', /Escape/],
  ['popup: aria expanded', /aria-expanded/],
  ['css: 56px dock token', /--hx-height-dock:\s*56px/],
  ['css: 54px compact token', /--hx-height-compact:\s*54px/],
  ['css: 152px popup minimum', /--hx-popup-min-width:\s*152px/],
  ['css: 48px popup row', /--hx-popup-row:\s*48px/],
  ['css: 20px popup radius', /--hx-radius-popup:\s*20px/],
  ['css: blue selected row', /--hx-selected:\s*#5e9fff/i],
  ['css: reduced motion', /prefers-reduced-motion/],
  ['css: no persistent outer filter on content', /\.hx-glass__skin/]
].forEach(([name, pattern]) => check(name, pattern.test({ material, interactions, popup, css }[name.split(':')[0]] || '')));

check('demo loads material runtime', /src\/hx-material\.js/.test(demo));
check('demo loads interactions runtime', /src\/hx-interactions\.js/.test(demo));
check('demo loads popup runtime', /src\/hx-popup\.js/.test(demo));
check('demo loads surfaces runtime', /src\/hx-surfaces\.js/.test(demo));

[
  '范围与非目标',
  '架构与层级模型',
  '材质模型',
  '动效模型',
  '弹窗模型',
  '窗口与 Windows 集成',
  '性能',
  '验收',
  '反模式索引'
].forEach((heading) => check('standard section: ' + heading, standard.indexOf(heading) >= 0));

check('skill frontmatter name', /^---\s*[\s\S]*?name:\s*huawei-immersive-pc/m.test(skill));
check('skill frontmatter description', /^---\s*[\s\S]*?description:/m.test(skill));

const textFiles = required.filter((file) => /\.(md|html|css|js)$/.test(file) && exists(file));
const absolutePathPattern = /(?:[A-Za-z]:\\Users\\|[A-Za-z]:\\Lxlia|D:\/Lxlia)/;
textFiles.forEach((file) => {
  const text = read(file);
  check('no machine-local path: ' + file, !absolutePathPattern.test(text));
});

const manifestPath = path.join(root, 'MANIFEST.sha256');
if (fs.existsSync(manifestPath)) {
  const lines = fs.readFileSync(manifestPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  lines.forEach((line) => {
    const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/);
    if (!match) { check('manifest line format', false, line); return; }
    const file = match[2];
    if (!exists(file)) { check('manifest file: ' + file, false); return; }
    const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    check('manifest hash: ' + file, digest === match[1], digest === match[1] ? '' : 'stale manifest, regenerate');
  });
} else {
  check('manifest exists', false, 'run node tools/manifest.cjs');
}

const passed = checks.filter((item) => item.ok).length;
console.log('Huawei Immersive PC validation');
console.log('  checks: ' + passed + '/' + checks.length);
if (failures.length) {
  console.error('\nFAIL');
  failures.forEach((failure) => console.error('  - ' + failure));
  process.exit(1);
}
console.log('  status: PASS');
