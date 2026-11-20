'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

class MusicDownloads {
  constructor({ userDataPath, onChange = () => {} }) {
    this.file = path.join(userDataPath, 'lxmine-downloads.json'); this.onChange = onChange; this.jobs = []; this.active = new Map();
    if (fs.existsSync(this.file)) {
      try { const saved = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (Array.isArray(saved)) this.jobs = saved; }
      catch (error) { fs.copyFileSync(this.file, this.file + '.corrupt-' + Date.now()); }
    }
    for (const job of this.jobs) if (job.state === 'downloading') { job.state = 'interrupted'; job.error = '下载被中断，请重试'; }
  }
  snapshot() { return this.jobs.map(job => ({ ...job })); }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.jobs, null, 2)); fs.renameSync(this.file + '.tmp', this.file);
    this.onChange(this.snapshot());
  }
  start({ url, song, quality, filePath }) {
    if (!/^https?:\/\//i.test(url) || !path.isAbsolute(filePath)) throw new Error('下载地址或保存路径无效');
    const id = crypto.randomUUID();
    const job = { id, name: song.name, artist: song.artist || song.singer || '', songId: String(song.id), source: song.lxSource || song.source,
      quality, filePath, state: 'downloading', received: 0, total: 0, createdAt: Date.now(), error: '' };
    this.jobs.unshift(job); this.save();
    const controller = new AbortController(); this.active.set(id, controller);
    this.run(job, url, controller).catch(() => {});
    return { ...job };
  }
  cancel(id) { this.active.get(id)?.abort(); }
  remove(id) {
    this.active.get(id)?.abort();
    const index = this.jobs.findIndex(job => job.id === id);
    if (index < 0) return false;
    this.jobs.splice(index, 1);
    this.save();
    return true;
  }
  async run(job, url, controller) {
    const temp = job.filePath + '.' + job.id + '.part';
    let output;
    try {
      const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!response.ok || !response.body) throw new Error('下载失败：HTTP ' + response.status);
      const type = response.headers.get('content-type') || '';
      if (/text\/html|application\/json/i.test(type)) throw new Error('音源返回的不是音频文件');
      job.total = Number(response.headers.get('content-length')) || 0;
      fs.mkdirSync(path.dirname(job.filePath), { recursive: true });
      output = fs.createWriteStream(temp, { flags: 'wx' });
      let last = 0;
      const meter = new Transform({ transform: (chunk, encoding, callback) => {
        job.received += chunk.length;
        if (Date.now() - last > 180) { last = Date.now(); this.onChange(this.snapshot()); }
        callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), meter, output, { signal: controller.signal });
      if (!job.received || job.total && job.received !== job.total) throw new Error('下载文件不完整');
      fs.renameSync(temp, job.filePath); job.state = 'complete'; job.completedAt = Date.now();
    } catch (error) {
      output?.destroy();
      // Only remove the uniquely named partial file created for this exact job.
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
      job.state = controller.signal.aborted ? 'cancelled' : 'failed'; job.error = controller.signal.aborted ? '已取消' : error.message;
    } finally { this.active.delete(job.id); this.save(); }
  }
  dispose() { for (const controller of this.active.values()) controller.abort(); }
}
module.exports = { MusicDownloads };
