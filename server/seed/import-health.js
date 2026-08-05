// One-time import of Narendra's 2 Niva Bupa health policies (transcribed from the
// attached policy PDFs) into data/db.json, under the MPN group, plus a copy of each
// original PDF into data/health-docs/. Other family members' health policies are added
// later through the app itself — this seed only covers Narendra's two.
// Usage: node server/seed/import-health.js [--force]
// Refuses to run if any MPN health policy already exists, unless --force (which wipes
// and reimports only MPN health policies — RPS data is never touched).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import db, { newId, dbFile, ensureMaster } from '../db.js';

const force = process.argv.includes('--force');

const existingMpn = db.data.healthPolicies.filter(p => p.group === 'MPN');
if (existingMpn.length > 0 && !force) {
  console.error(`db.json already has ${existingMpn.length} MPN health policies. Use --force to wipe and reimport.`);
  process.exit(1);
}

const HOLDER = 'Narendra';
const UPLOADS_DIR = '/root/.claude/uploads/9b0d1141-2e9f-5987-a196-bb6dd5130335';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsDir = join(__dirname, '..', '..', 'data', 'health-docs');
mkdirSync(docsDir, { recursive: true });

const POLICIES = [
  {
    policyType: 'BASIC',
    insurerName: 'Niva Bupa',
    planName: 'ReAssure 2.0 - Bronze+ (Family Floater)',
    policyNo: '33851457202602',
    insuredMembers: 'Narendra Shete, Nivedita Shete, Mrunal Shete',
    sumInsured: 1000000,
    deductible: null,
    premiumAmount: 33951,
    commencementDate: '2026-03-15',
    expiryDate: '2027-03-14',
    renewalDueDate: '2027-03-14',
    nomineeName: 'Nivedita Narendra Shete',
    notes: 'Base Sum Insured ₹10,00,000 + Booster+ ₹19,36,103 = total available ₹29,36,103.',
    sourceFile: 'e490e62d-niva_bupa_basic_health_policy_of_narendra.pdf'
  },
  {
    policyType: 'TOPUP',
    insurerName: 'Niva Bupa',
    planName: 'Health Recharge',
    policyNo: '36330919202600',
    insuredMembers: 'Narendra Shete, Nivedita Shete, Mrunal Shete',
    sumInsured: 6500000,
    deductible: 1000000,
    premiumAmount: 3139,
    commencementDate: '2026-02-10',
    expiryDate: '2027-02-09',
    renewalDueDate: '2027-02-09',
    nomineeName: 'Nivedita Narendra Shete',
    notes: 'Super top-up sitting on top of the Basic (ReAssure 2.0) policy; deductible matches the Basic policy’s base Sum Insured.',
    sourceFile: '79598230-niva_bupa_topup_health_policy_of_narendra.pdf'
  }
];

ensureMaster('MPN', 'holders', HOLDER);

const imported = POLICIES.map(({ sourceFile, ...p }) => {
  const id = newId('health');
  const srcPath = join(UPLOADS_DIR, sourceFile);
  let documentOriginalName = null;
  let documentUploadedAt = null;
  if (existsSync(srcPath)) {
    copyFileSync(srcPath, join(docsDir, `${id}.pdf`));
    documentOriginalName = sourceFile.replace(/^[0-9a-f]{8}-/, '');
    documentUploadedAt = new Date().toISOString();
  } else {
    console.warn(`Source PDF not found, skipping document copy: ${srcPath}`);
  }
  return {
    id,
    group: 'MPN',
    holder: HOLDER,
    status: 'active',
    documentOriginalName,
    documentUploadedAt,
    ...p
  };
});

db.data.healthPolicies = db.data.healthPolicies.filter(p => p.group !== 'MPN').concat(imported);
await db.write();

const sumInsuredTotal = imported.reduce((a, p) => a + (p.sumInsured || 0), 0);
const premiumTotal = imported.reduce((a, p) => a + (p.premiumAmount || 0), 0);
console.log(`Imported ${imported.length} MPN health policies into ${dbFile}`);
console.log(`Total sum insured: ${sumInsuredTotal.toLocaleString('en-IN')}, total premium: ${premiumTotal.toLocaleString('en-IN')}`);
console.log(`Documents copied into ${docsDir}`);
