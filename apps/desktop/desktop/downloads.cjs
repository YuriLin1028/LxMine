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
    const coverUrl = String(song.coverUrl || song.cover || '').trim();
    const job = { id, name: song.name, artist: song.artist || song.singer || '', album: song.albumName || song.album || '',
      cover: coverUrl, coverUrl, songId: String(song.id), source: song.lxSource || song.source,
      quality, filePath, exportedPaths: [], state: 'downloading', received: 0, total: 0, createdAt: Date.now(), error: '' };
    this.jobs.unshift(job); this.save();
    const controller = new AbortController(); this.active.set(id, controller);
    this.run(job, url, controller).catch(() => {});
    return { ...job };
  }
  updateCover(id, coverUrl) {
    const clean = String(coverUrl || '').trim();
    if (!clean) return false;
    const job = this.jobs.find(item => item.id === id);
    if (!job || job.coverUrl === clean) return false;
    job.cover = clean;
    job.coverUrl = clean;
    this.save();
    return true;
  }
  recordExportedPath(id, exportedPath) {
    const clean = String(exportedPath || '').trim();
    if (!clean || !path.isAbsolute(clean)) return false;
    const job = this.jobs.find(item => String(item.id) === String(id));
    if (!job) return false;
    const list = Array.isArray(job.exportedPaths) ? job.exportedPaths.slice() : [];
    const norm = path.resolve(clean).toLowerCase();
    if (!list.some(p => path.resolve(String(p)).toLowerCase() === norm)) {
      list.push(clean);
      job.exportedPaths = list;
      this.save();
    }
    return true;
  }
  cancel(id) { this.active.get(id)?.abort(); }
  async deleteFileVerified(targetPath, trashFallback) {
    if (!targetPath || !path.isAbsolute(targetPath)) return { status: 'missing' };
    if (!fs.existsSync(targetPath)) return { status: 'missing' };
    try { fs.chmodSync(targetPath, 0o666); } catch (_) {}
    try {
      fs.rmSync(targetPath, { force: true, maxRetries: 6, retryDelay: 80 });
    } catch (_) {}
    if (!fs.existsSync(targetPath)) return { status: 'deleted' };
    if (typeof trashFallback === 'function') {
      try { await trashFallback(targetPath); } catch (_) {}
    }
    if (!fs.existsSync(targetPath)) return { status: 'deleted' };
    return { status: 'failed', reason: '文件正被占用或无删除权限' };
  }
  async remove(id, opts = {}) {
    return this.removeBatch([id], opts);
  }
  async removeBatch(ids, opts = {}) {
    const list = Array.isArray(ids) ? ids.map(String) : [];
    const targetSet = new Set(list);
    if (!targetSet.size) return { removed: 0, deletedPaths: [], failedPaths: [] };
    const deleteFile = Boolean(opts && opts.deleteFile);
    const trashFallback = opts && typeof opts.trashFallback === 'function' ? opts.trashFallback : null;
    const deletedPaths = [];
    const failedPaths = [];
    let removed = 0;
    let abortedAny = false;
    for (const id of targetSet) {
      if (this.active.has(id)) {
        this.active.get(id)?.abort();
        abortedAny = true;
      }
    }
    if (abortedAny) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const nextJobs = [];
    for (const job of this.jobs) {
      if (!targetSet.has(String(job.id))) {
        nextJobs.push(job);
        continue;
      }
      let primaryFailed = false;
      if (deleteFile) {
        const seen = new Set();
        const candidates = [];
        if (job.filePath && path.isAbsolute(job.filePath)) {
          const norm = path.resolve(job.filePath).toLowerCase();
          seen.add(norm);
          candidates.push({ filePath: job.filePath, primary: true });
        }
        if (Array.isArray(job.exportedPaths)) {
          for (const extra of job.exportedPaths) {
            if (!extra || !path.isAbsolute(extra)) continue;
            const norm = path.resolve(extra).toLowerCase();
            if (seen.has(norm)) continue;
            seen.add(norm);
            candidates.push({ filePath: extra, primary: false });
          }
        }
        for (const entry of candidates) {
          const outcome = await this.deleteFileVerified(entry.filePath, trashFallback);
          if (outcome.status === 'deleted') {
            deletedPaths.push(entry.filePath);
          } else if (outcome.status === 'failed') {
            failedPaths.push({ path: entry.filePath, name: path.basename(entry.filePath), reason: outcome.reason || '无法删除' });
            if (entry.primary) primaryFailed = true;
          }
        }
      }
      if (primaryFailed) {
        nextJobs.push(job);
      } else {
        removed += 1;
      }
    }
    this.jobs = nextJobs;
    if (removed > 0) this.save();
    return { removed, deletedPaths, failedPaths };
  }
  async run(job, url, controller) {
    const temp = job.filePath + '.' + job.id + '.part';
    let output;
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
      });
      if (!response.ok || !response.body) throw new Error('下载失败：HTTP ' + response.status);
      const type = response.headers.get('content-type') || '';
      if (/text\/html|application\/json/i.test(type)) throw new Error('音源返回的不是音频文件');
      job.total = Number(response.headers.get('content-length')) || 0;
      const encoded = Boolean(response.headers.get('content-encoding'));
      fs.mkdirSync(path.dirname(job.filePath), { recursive: true });
      output = fs.createWriteStream(temp, { flags: 'wx' });
      let last = 0;
      const meter = new Transform({ transform: (chunk, encoding, callback) => {
        job.received += chunk.length;
        if (Date.now() - last > 180) { last = Date.now(); this.onChange(this.snapshot()); }
        callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), meter, output, { signal: controller.signal });
      if (!job.received || (!encoded && job.total && job.received < job.total)) throw new Error('下载文件不完整');
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
