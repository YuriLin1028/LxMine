const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, '.research/startup-20261019');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function measure(label, exe) {
  const profile = path.join(out, label + '-' + Date.now());
  const env = { ...process.env, MINERADIO_STARTUP_QA_HIDDEN: '1', MINERADIO_STARTUP_QA_USER_DATA: profile, MINERADIO_STARTUP_QA_EXIT_MS: '1500', MINERADIO_NO_DESKTOP_SHORTCUT: '1', MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const started = Date.now();
  const child = cp.spawn(exe, [], { env, stdio: 'ignore', windowsHide: true, cwd: path.dirname(exe) });
  let spawnError; child.once('error', error => { spawnError = error; });
  let state;
  for (let i = 0; i < 1200; i++) {
    if (spawnError) throw spawnError;
    try { state = JSON.parse(fs.readFileSync(path.join(profile, 'startup-state.json'), 'utf8')); } catch {}
    if (state?.readyAt && state?.windowVisibleAt) break;
    await sleep(50);
  }
  if (!state?.readyAt) throw Error('Startup timeout: ' + label);
  const result = { label, exe, profile, launchedAt: new Date(started).toISOString(), launchToVisibleMs: state.windowVisibleAt - started, launchToReadyMs: state.readyAt - started, mainToVisibleMs: state.windowVisibleAt - state.startedAt, beforeMainMs: state.startedAt - started, state };
  fs.writeFileSync(path.join(profile, 'measurement.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, state: undefined }));
  await sleep(2200);
  return result;
}
(async () => {
  const args = process.argv.slice(2);
  const candidates = args.length ? [['direct', path.resolve(args[0])]] : [['portable', path.join(root, 'releases/windows/LxMine-0.1.0-Portable-Liquid-20261018.exe')], ['unpacked', path.join(root, 'apps/desktop/dist/win-unpacked/LxMine.exe')]];
  const results = [];
  for (const [label, exe] of candidates) results.push(await measure(label, exe));
  fs.writeFileSync(path.join(out, args.length ? 'direct-results.json' : 'baseline-results.json'), JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
