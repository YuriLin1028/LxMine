#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const included = [
  'README.md',
  'STANDARD.md',
  'SKILL.md',
  'CHANGELOG.md',
  'VALIDATION.md',
  'NOTICE.md',
  'LICENSE',
  'package.json',
  'src/hx-immersive.css',
  'src/hx-material.js',
  'src/hx-interactions.js',
  'src/hx-popup.js',
  'src/hx-surfaces.js',
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
  'tools/validate.cjs',
  'tools/smoke.cjs',
  'tools/manifest.cjs'
];

const lines = included.filter((file) => fs.existsSync(path.join(root, file))).map((file) => {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  return digest + '  ' + file;
});
fs.writeFileSync(path.join(root, 'MANIFEST.sha256'), lines.join('\n') + '\n');
console.log('Wrote MANIFEST.sha256 (' + lines.length + ' files).');
