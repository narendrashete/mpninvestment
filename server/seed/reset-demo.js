// Full reset of the "primedemo" demo sandbox (group DEMO) back to its seeded
// baseline — investments, holdings, masters, LIC / health / vehicle policies,
// and every uploaded document and premium receipt. Never touches MPN/RPS data. Run this any
// time the demo needs a clean slate:
//   node server/seed/reset-demo.js
// Safe to run on a schedule (e.g. a nightly cron job on the VPS) since it
// always converges on the same known baseline, no matter what testers added
// in between.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, unlinkSync } from 'node:fs';
import db, { dbFile, ensureMaster, emptyMasters } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GROUP = 'DEMO';
const dataDir = join(__dirname, '..', '..', 'data');

// 1. Delete every uploaded file belonging to DEMO records. The seed scripts
// below (--force) replace the records, but they never touch these files on
// disk — left alone they'd leak forever. Policy documents are named after the
// policy id; premium attachments carry their own ids, so those have to be
// read out of the payment log before it's replaced.
const isDemo = (x) => x.group === GROUP;
const rm = (path) => { if (existsSync(path)) { unlinkSync(path); return 1; } return 0; };
let removedFiles = 0;

for (const [dir, records] of [
  ['health-docs', db.data.healthPolicies],
  ['lic-docs', db.data.licPolicies],
  ['vehicle-docs', db.data.vehiclePolicies]
]) {
  for (const rec of records.filter(isDemo)) {
    removedFiles += rm(join(dataDir, dir, `${rec.id}.pdf`));
  }
}

for (const [dir, policies, premiums] of [
  ['lic-premium-docs', db.data.licPolicies, db.data.licPremiums],
  ['health-premium-docs', db.data.healthPolicies, db.data.healthPremiums],
  ['vehicle-premium-docs', db.data.vehiclePolicies, db.data.vehiclePremiums]
]) {
  const ids = new Set(policies.filter(isDemo).map(p => p.id));
  for (const pay of premiums.filter(x => ids.has(x.policyId))) {
    for (const att of pay.attachments || []) {
      removedFiles += rm(join(dataDir, dir, `${att.id}${att.ext}`));
    }
  }
}
console.log(`Removed ${removedFiles} DEMO uploaded file(s) from disk`);

// 2. Re-run the demo seed scripts as separate processes (each re-reads
// db.json fresh from disk and fully replaces its own slice of the DEMO data —
// investments/holdings, LIC/health policies, vehicles — whatever was there).
function run(script) {
  const result = spawnSync(process.execPath, [join(__dirname, script), '--force'], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`${script} failed (exit ${result.status})`);
    process.exit(result.status || 1);
  }
}
run('import-demo.js');
run('import-demo-policies.js');
run('import-demo-vehicles.js');

// 3. Rebuild masters.DEMO from scratch, purely from what the freshly-reseeded
// DEMO records actually reference. ensureMaster() only ever adds entries, so
// any holder/investment-name/plan a tester typed in on the Masters page
// would otherwise survive every reseed — this is what actually purges them.
await db.read(); // pick up what the child processes just wrote
// Counting every kind off emptyMasters() means a new master kind added in
// db.js is reset here automatically instead of quietly surviving reseeds.
const KINDS = Object.keys(emptyMasters());
const countMasters = () => Object.fromEntries(KINDS.map(k => [k, db.data.masters[GROUP][k].length]));
const before = countMasters();
db.data.masters[GROUP] = emptyMasters();
for (const inv of db.data.investments.filter(i => i.group === GROUP)) {
  ensureMaster(GROUP, 'holders', inv.holder);
  ensureMaster(GROUP, 'investmentNames', inv.name);
}
for (const p of db.data.licPolicies.filter(p => p.group === GROUP)) {
  ensureMaster(GROUP, 'holders', p.holder);
  ensureMaster(GROUP, 'licPlans', p.planName);
}
for (const p of db.data.healthPolicies.filter(p => p.group === GROUP)) {
  ensureMaster(GROUP, 'holders', p.holder);
}
for (const v of db.data.vehicles.filter(v => v.group === GROUP)) {
  ensureMaster(GROUP, 'holders', v.holder);
}
for (const p of db.data.vehiclePolicies.filter(p => p.group === GROUP)) {
  ensureMaster(GROUP, 'vehicleInsurers', p.insurerName);
}
await db.write();
const after = countMasters();

console.log('Masters rebuilt — ' + KINDS.map(k => `${k} ${before[k]}->${after[k]}`).join(', '));
console.log(`Demo sandbox reset to baseline in ${dbFile}`);
