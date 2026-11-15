const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { MusicDownloads } = require('../desktop/downloads.cjs');
async function fixture(t, handler) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lxmine-download-test-'));
  const server = http.createServer(handler); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    const resolved = fs.realpathSync(root);
    assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('lxmine-download-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return { root, url: 'http://127.0.0.1:' + server.address().port + '/music' };
}
function terminal(downloads, start) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('download timed out')), 4000);
    downloads.onChange = jobs => { const job = jobs[0]; if (job && job.state !== 'downloading') { clearTimeout(timer); resolve(job); } };
    start();
  });
}
test('download persists actual streamed bytes and survives restart', async t => {
  const bytes = Buffer.alloc(65536, 42);
  const { root, url } = await fixture(t, (req, res) => { res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': bytes.length }); res.end(bytes); });
  const downloads = new MusicDownloads({ userDataPath: root });
  const filePath = path.join(root, 'music.mp3');
  const done = await terminal(downloads, () => downloads.start({ url, song: { id: 'a', name: 'Song', lxSource: 'kw' }, quality: '128k', filePath }));
  assert.equal(done.state, 'complete'); assert.equal(done.received, bytes.length);
  assert.deepEqual(fs.readFileSync(filePath), bytes);
  assert.equal(new MusicDownloads({ userDataPath: root }).snapshot()[0].state, 'complete');
});
test('a failed response never overwrites an existing audio file', async t => {
  const { root, url } = await fixture(t, (req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>error</html>'); });
  const downloads = new MusicDownloads({ userDataPath: root });
  const filePath = path.join(root, 'existing.mp3'); fs.writeFileSync(filePath, 'original');
  const done = await terminal(downloads, () => downloads.start({ url, song: { id: 'a', name: 'Song' }, quality: '128k', filePath }));
  assert.equal(done.state, 'failed'); assert.equal(fs.readFileSync(filePath, 'utf8'), 'original');
  assert.equal(fs.readdirSync(root).some(name => name.endsWith('.part')), false);
});
test('cancelling an active download removes only its partial file', async t => {
  const { root, url } = await fixture(t, (req, res) => { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); res.write(Buffer.alloc(2048)); });
  const downloads = new MusicDownloads({ userDataPath: root });
  const done = terminal(downloads, () => {
    const job = downloads.start({ url, song: { id: 'a', name: 'Song' }, quality: '128k', filePath: path.join(root, 'music.mp3') });
    setTimeout(() => downloads.cancel(job.id), 40);
  });
  assert.equal((await done).state, 'cancelled');
  assert.equal(fs.readdirSync(root).some(name => name.endsWith('.part')), false);
});
