const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createLxManager } = require('../desktop/lx/manager.cjs');
const { importSourceFiles } = require('../desktop/lx/import-files.cjs');
const script = name => `/*\n * @name ${name}\n * @version 1.2\n */\nconst value = '${name}';`;

test('batch import skips duplicates, continues past unreadable/invalid files and keeps the active source', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lxmine-source-batch-'));
  const target = path.resolve(dir);
  t.after(async () => {
    assert(target.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert(path.basename(target).startsWith('lxmine-source-batch-'));
    await fs.rm(target, { recursive: true, force: true });
  });
  const options = { filePath: path.join(dir, 'sources.json') };
  const manager = createLxManager(options);
  t.after(() => manager.dispose());
  const active = manager.importScript(script('Existing'));
  const inputs = [
    ['duplicate.js', script('Existing')], ['bad.txt', 'not a source'],
    ['first.js', '\uFEFF' + script('First')], ['repeat.js', script('First')],
    ['last.js', script('Last')], ['huge.js', 'x'.repeat(8 * 1024 * 1024 + 1)],
  ];
  for (const [name, content] of inputs) await fs.writeFile(path.join(dir, name), content);
  const result = await importSourceFiles(manager, [path.join(dir, 'missing.js'), ...inputs.map(([name]) => path.join(dir, name))]);
  assert.equal(result.imported, 2);
  assert.equal(result.skipped, 2);
  assert.deepEqual(result.failed.map(item => item.file).sort(), ['bad.txt', 'huge.js', 'missing.js']);
  assert.equal(manager.getActiveId(), active.id);
  const reopened = createLxManager(options);
  t.after(() => reopened.dispose());
  assert.deepEqual(reopened.list().map(item => item.name), ['Existing', 'First', 'Last']);
  assert.equal(reopened.getActiveId(), active.id);
  const repeated = await importSourceFiles(reopened, [path.join(dir, 'first.js'), path.join(dir, 'last.js')]);
  assert.deepEqual(repeated, { imported: 0, skipped: 2, failed: [] });
});
