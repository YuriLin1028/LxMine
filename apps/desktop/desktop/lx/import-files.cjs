'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

async function importSourceFiles(manager, filePaths) {
  const files = [], failed = [];
  for (const filePath of filePaths) {
    const file = path.basename(filePath);
    try {
      if ((await fs.stat(filePath)).size > 8 * 1024 * 1024) throw new Error('音源文件超过 8 MB');
      const script = (await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
      files.push({ file, script });
    } catch (error) {
      failed.push({ file, message: error.message || '无法读取文件' });
    }
  }
  const result = manager.importScripts(files);
  result.failed.push(...failed);
  return result;
}

module.exports = { importSourceFiles };
