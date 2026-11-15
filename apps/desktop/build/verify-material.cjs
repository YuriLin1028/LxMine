/* Electron Builder beforePack: a material change cannot bypass native-pixel QA. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../../..');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
function verify() {
  const reportPath = path.join(root, 'qa/material/artifacts/approved.json');
  if (!fs.existsSync(reportPath)) throw new Error('Material gate: no approved native pixel + motion report. Run npm run test:material before packaging.');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (report.status !== 'PASS' || report.calibrationOverride) throw new Error('Material gate: calibration candidates or failed comparisons cannot be packaged.');
  if(report.systemMenus?.status!=='PASS'||report.systemMenus.best?.metrics?.length!==6)throw new Error('Material gate: actual native Menu/Select references on both backgrounds are missing or failed.');
  if(report.systemMenus.negativeControlRejected!==true||report.popupMotion?.status!=='PASS'||report.popupMotion.interruptedClose!==true)throw new Error('Material gate: real popup motion or system-menu negative control is missing.');
  for (const [file, expected] of Object.entries(report.hashes || {})) {
    if (!fs.existsSync(path.join(root, file)) || sha(file) !== expected) throw new Error(`Material gate: ${file} changed after verification; rerun test:material.`);
  }
  const sources = ['apps/desktop/public/index.html', 'apps/desktop/public/lxmine/material.js', 'apps/desktop/public/lxmine/style.css', 'apps/desktop/public/lxmine/app.js','apps/desktop/public/lxmine/pagination.js','apps/desktop/public/lxmine/popup-motion.js'];
  for (const file of sources) if (!report.hashes?.[file]) throw new Error('Material gate: incomplete source provenance.');
  for (const scene of ['grid', 'type', 'grid-tiers', 'type-tiers']) {
    const result = report.pixels?.find(p => p.scene === scene);
    if (!result || result.metrics.length !== 4 || result.preflight?.status !== 'PASS') throw new Error(`Material gate: missing ${scene} native reference validation.`);
    for (const m of result.metrics) {
      if (!(m.mae <= 8 && m.allInsideMAE <= 8 && m.outsideMAE <= 6 && m.rimMAE <= 12 && m.centreMAE <= 8 && m.ssim >= .92)) throw new Error(`Material gate: ${scene}/${m.id} does not match the native reference.`);
    }
    if (!result.smoothness?.length || result.smoothness.some(x => x.ratio > 1.5)) throw new Error(`Material gate: ${scene} sphere contour roughness exceeds native gate.`);
    if (result.shoulder?.samples?.length && result.shoulder.maxPhaseError > .75) throw new Error(`Material gate: ${scene} capsule shoulder displacement exceeds gate.`);
  }
  for (const scenario of ['optics', 'app', 'resize']) {
    const m = report.motion?.find(p => p.scenario === scenario);
    if (!m || !(m.frames.p95 < 33.5 && m.frames.max < 50 && m.frames.longTasks.length === 0)) throw new Error(`Material gate: missing/failed ${scenario} motion evidence.`);
  }
  if (report.negativeControlPassed !== false) throw new Error('Material gate: the no-refraction negative control must be rejected.');
  console.log('Material gate: native pixels, source hashes and motion budget verified.');
}
module.exports = verify;
if (require.main === module) { try { verify(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
