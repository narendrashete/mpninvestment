// Full reset of the "primedemo" demo sandbox (group DEMO) back to its seeded
// baseline — investments, holdings, masters, LIC policies, health policies,
// and any uploaded health-doc PDFs. Never touches MPN/RPS data. Run this any
// time the demo needs a clean slate:
//   node server/seed/reset-demo.js
// Safe to run on a schedule (e.g. a nightly cron job on the VPS) since it
// always converges on the same known baseline, no matter what testers added
// in between.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, unlinkSync } from 'node:fs';
import db, { dbFile, ensureMaster } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GROUP = 'DEMO';
const docsDir = join(__dirname, '..', '..', 'data', 'health-docs');

// 1. Delete any uploaded health-doc PDFs belonging to DEMO policies. The
// seed script below (--force) replaces the healthPolicies records, but it
// never touches these files on disk — left alone they'd leak forever.
const demoHealthIds = db.data.healthPolicies.filter(p => p.group === GROUP).map(p => p.id);
let removedFiles = 0;
for (const id of demoHealthIds) {
  const path = join(docsDir, `${id}.pdf`);
  if (existsSync(path)) { unlinkSync(path); removedFiles++; }
}
console.log(`Removed ${removedFiles} DEMO health-doc PDF(s) from disk`);

// 2. Re-run the two demo seed scripts as separate processes (each re-reads
// db.json fresh from disk and fully replaces DEMO investments/holdings and
// DEMO licPolicies/licPremiums/healthPolicies, regardless of what was there).
function run(script) {
  const result = spawnSync(process.execPath, [join(__dirname, script), '--force'], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`${script} failed (exit ${result.status})`);
    process.exit(result.status || 1);
  }
}
run('import-demo.js');
run('import-demo-policies.js');

// 3. Rebuild masters.DEMO from scratch, purely from what the freshly-reseeded
// DEMO records actually reference. ensureMaster() only ever adds entries, so
// any holder/investment-name/plan a tester typed in on the Masters page
// would otherwise survive every reseed — this is what actually purges them.
await db.read(); // pick up what the two child processes just wrote
const before = {
  holders: db.data.masters[GROUP].holders.length,
  investmentNames: db.data.masters[GROUP].investmentNames.length,
  licPlans: db.data.masters[GROUP].licPlans.length
};
db.data.masters[GROUP] = { holders: [], investmentNames: [], licPlans: [] };
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
await db.write();
const after = {
  holders: db.data.masters[GROUP].holders.length,
  investmentNames: db.data.masters[GROUP].investmentNames.length,
  licPlans: db.data.masters[GROUP].licPlans.length
};

console.log(`Masters rebuilt — holders ${before.holders}->${after.holders}, investmentNames ${before.investmentNames}->${after.investmentNames}, licPlans ${before.licPlans}->${after.licPlans}`);
console.log(`Demo sandbox reset to baseline in ${dbFile}`);
