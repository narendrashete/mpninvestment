// Adds mock LIC + Mediclaim (health) policies to the DEMO group (Aditya/Neha/
// Yash, primedemo login) — purely fictional, on top of what
// server/seed/import-demo.js already seeded. Never touches MPN/RPS data.
//
// Only the LIC *plan names* are reused from Narendra's real MPN policies
// ("New Jeevan Anand" / "Jeevan Anand" — see server/seed/import-lic.js) —
// everything else (policy numbers, sums assured, dates, nominees) is made up
// for the demo, not copied from real records. Mediclaim insurers are fixed
// per request: ICICI Life, HDFC Life, New India Assurance.
//
// Usage: node server/seed/import-demo-policies.js [--force]
// Refuses to run if any DEMO lic/health policy already exists, unless
// --force (wipes only DEMO lic/health policies).
import db, { newId, dbFile, ensureMaster } from '../db.js';

const force = process.argv.includes('--force');
const GROUP = 'DEMO';

const existingLic = db.data.licPolicies.filter(p => p.group === GROUP);
const existingHealth = db.data.healthPolicies.filter(p => p.group === GROUP);
if ((existingLic.length > 0 || existingHealth.length > 0) && !force) {
  console.error(`db.json already has ${existingLic.length} DEMO LIC + ${existingHealth.length} DEMO health policies. Use --force to wipe and reimport.`);
  process.exit(1);
}

// ---- LIC policies — plan names reused from Narendra's real data, everything
// else fictional. Sum assured totals exactly Rs 20,00,000 across all five. ----

const LIC_POLICIES = [
  {
    holder: 'Aditya', planName: 'New Jeevan Anand', policyNo: '702948561',
    sumAssured: 500000, guaranteedAddition: 105000, instalmentPremium: 44600,
    premiumPayingTermYears: 16, policyTermYears: 16,
    commencementDate: '2019-06-12', maturityDate: '2035-06-12', ageAtStart: 29
  },
  {
    holder: 'Neha', planName: 'New Jeevan Anand', policyNo: '719283746',
    sumAssured: 400000, guaranteedAddition: 84000, instalmentPremium: 33900,
    premiumPayingTermYears: 15, policyTermYears: 15,
    commencementDate: '2021-03-18', maturityDate: '2036-03-18', ageAtStart: 27
  },
  {
    // Whole-life plan, like Narendra's one Jeevan Anand policy: premiums stop
    // well before the policy term ends.
    holder: 'Yash', planName: 'Jeevan Anand', policyNo: '734981205',
    sumAssured: 300000, guaranteedAddition: 138000, instalmentPremium: 24700,
    premiumPayingTermYears: 15, policyTermYears: 57,
    commencementDate: '2018-09-05', maturityDate: '2075-09-05', ageAtStart: 25
  },
  {
    holder: 'Aditya', planName: 'New Jeevan Anand', policyNo: '745612390',
    sumAssured: 400000, guaranteedAddition: 92000, instalmentPremium: 33200,
    premiumPayingTermYears: 16, policyTermYears: 16,
    commencementDate: '2020-11-22', maturityDate: '2036-11-22', ageAtStart: 30
  },
  {
    holder: 'Neha', planName: 'Jeevan Anand', policyNo: '756473829',
    sumAssured: 400000, guaranteedAddition: 168000, instalmentPremium: 32100,
    premiumPayingTermYears: 15, policyTermYears: 55,
    commencementDate: '2019-02-14', maturityDate: '2074-02-14', ageAtStart: 26
  }
];

// ---- Mediclaim (health) policies — one each with ICICI Life, HDFC Life and
// New India Assurance, as requested. Fictional plan names/policy numbers/
// nominees; no source PDF documents attached. ----

const HEALTH_POLICIES = [
  {
    holder: 'Aditya', policyType: 'BASIC', insurerName: 'ICICI Life', planName: 'Health Shield Gold',
    policyNo: '40195728301', insuredMembers: 'Aditya (Self)', sumInsured: 500000, deductible: null,
    premiumAmount: 9500, commencementDate: '2026-01-15', expiryDate: '2027-01-14', renewalDueDate: '2027-01-14',
    nomineeName: 'Priya Kulkarni'
  },
  {
    holder: 'Neha', policyType: 'BASIC', insurerName: 'HDFC Life', planName: 'Optima Secure',
    policyNo: '51287463920', insuredMembers: 'Neha (Self)', sumInsured: 700000, deductible: null,
    premiumAmount: 12500, commencementDate: '2025-11-01', expiryDate: '2026-10-31', renewalDueDate: '2026-10-31',
    nomineeName: 'Rohan Deshpande'
  },
  {
    holder: 'Yash', policyType: 'BASIC', insurerName: 'New India Assurance', planName: 'Mediclaim Policy',
    policyNo: '62938475610', insuredMembers: 'Yash (Self)', sumInsured: 400000, deductible: null,
    premiumAmount: 7200, commencementDate: '2026-02-01', expiryDate: '2027-01-31', renewalDueDate: '2027-01-31',
    nomineeName: 'Kavita Nair'
  }
];

ensureMaster(GROUP, 'holders', 'Aditya');
ensureMaster(GROUP, 'holders', 'Neha');
ensureMaster(GROUP, 'holders', 'Yash');
for (const planName of new Set(LIC_POLICIES.map(p => p.planName))) {
  ensureMaster(GROUP, 'licPlans', planName);
}

const importedLic = LIC_POLICIES.map(p => ({
  id: newId('lic'),
  group: GROUP,
  status: 'active',
  nextPremiumDueDate: null,
  notes: 'Demo data — mock LIC policy for the primedemo login.',
  ...p
}));

const importedHealth = HEALTH_POLICIES.map(p => ({
  id: newId('health'),
  group: GROUP,
  status: 'active',
  documentOriginalName: null,
  documentUploadedAt: null,
  notes: 'Demo data — mock mediclaim policy for the primedemo login.',
  ...p
}));

db.data.licPolicies = db.data.licPolicies.filter(p => p.group !== GROUP).concat(importedLic);
db.data.licPremiums = db.data.licPremiums.filter(x => !existingLic.some(p => p.id === x.policyId));
db.data.healthPolicies = db.data.healthPolicies.filter(p => p.group !== GROUP).concat(importedHealth);

await db.write();

const sumAssured = importedLic.reduce((a, p) => a + (p.sumAssured || 0), 0);
const sumInsured = importedHealth.reduce((a, p) => a + (p.sumInsured || 0), 0);
console.log(`Imported ${importedLic.length} DEMO LIC policies (total sum assured Rs ${sumAssured.toLocaleString('en-IN')}) into ${dbFile}`);
console.log(`Imported ${importedHealth.length} DEMO mediclaim policies (total sum insured Rs ${sumInsured.toLocaleString('en-IN')})`);
console.log('Neither collection touches db.data.investments — excluded from Dashboard/Investments totals as designed.');
