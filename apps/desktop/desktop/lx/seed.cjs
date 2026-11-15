'use strict';

// 首次运行（数据目录里还没有 lx-sources.json）时，用安装包内置的音源配置做种子。
// 必须在任何 manager 创建 / 内置音源目录导入之前调用，否则会被自动导入抢先写盘，
// 导致种子被跳过、源 id 被重新生成。已有配置一律不动，升级安装不会覆盖用户音源。
const fs = require('node:fs');
const path = require('node:path');

function seedDefaultSourcesIfMissing(filePath) {
  try {
    if (fs.existsSync(filePath)) return false;
    const seed = path.join(__dirname, '..', 'lx-sources-default.json');
    if (!fs.existsSync(seed)) return false;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.copyFileSync(seed, filePath);
    return true;
  } catch (error) {
    console.warn('[LxSources] 内置音源种子写入失败：', error.message);
    return false;
  }
}

module.exports = { seedDefaultSourcesIfMissing };
