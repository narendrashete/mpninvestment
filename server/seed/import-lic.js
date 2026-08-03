// One-time import of Narendra's 5 LIC policies (transcribed from the "LIC" tab
// of his spreadsheet) into data/db.json, under the MPN group. These are
// static policy details only — no premium-payment history is seeded, since
// premiums are tracked going forward from whenever they're logged in the app.
// Usage: node server/seed/import-lic.js [--force]
// Refuses to run if any MPN LIC policy already exists, unless --force (which
// wipes and reimports only MPN LIC policies — RPS data and premium logs for
// other policies are never touched).
import db, { newId, dbFile, ensureMaster } from '../db.js';

const force = process.argv.includes('--force');

const existingMpn = db.data.licPolicies.filter(p => p.group === 'MPN');
if (existingMpn.length > 0 && !force) {
  console.error(`db.json already has ${existingMpn.length} MPN LIC policies. Use --force to wipe and reimport.`);
  process.exit(1);
}

const HOLDER = 'Narendra';

const POLICIES = [
  {
    policyNo: '918431773', planName: 'New Jeevan Anand',
    sumAssured: 200000, guaranteedAddition: 42000, instalmentPremium: 17844,
    premiumPayingTermYears: 16, policyTermYears: 16,
    commencementDate: '2020-01-28', maturityDate: '2036-01-28', ageAtStart: 50
  },
  {
    policyNo: '885886976', planName: 'New Jeevan Anand',
    sumAssured: 400000, guaranteedAddition: 125200, instalmentPremium: 36413,
    premiumPayingTermYears: 15, policyTermYears: 15,
    commencementDate: '2016-04-01', maturityDate: '2031-04-01', ageAtStart: 46
  },
  {
    policyNo: '885987180', planName: 'New Jeevan Anand',
    sumAssured: 300000, guaranteedAddition: 90000, instalmentPremium: 25825,
    premiumPayingTermYears: 16, policyTermYears: 16,
    commencementDate: '2017-12-27', maturityDate: '2033-12-27', ageAtStart: 47
  },
  {
    // Whole-life plan: premiums stop after 15 years, but the policy itself
    // runs 57 years — premiumPayingTermYears and policyTermYears intentionally differ.
    policyNo: '884429771', planName: 'Jeevan Anand',
    sumAssured: 300000, guaranteedAddition: 142500, instalmentPremium: 25788,
    premiumPayingTermYears: 15, policyTermYears: 57,
    commencementDate: '2013-03-15', maturityDate: '2070-03-15', ageAtStart: 43
  },
  {
    policyNo: '885032994', planName: 'New Jeevan Anand',
    sumAssured: 200000, guaranteedAddition: 79000, instalmentPremium: 17030,
    premiumPayingTermYears: 16, policyTermYears: 16,
    commencementDate: '2016-02-22', maturityDate: '2032-02-22', ageAtStart: 46
  }
];

ensureMaster('MPN', 'holders', HOLDER);
for (const planName of new Set(POLICIES.map(p => p.planName))) {
  ensureMaster('MPN', 'licPlans', planName);
}

const imported = POLICIES.map(p => ({
  id: newId('lic'),
  group: 'MPN',
  holder: HOLDER,
  status: 'active',
  nextPremiumDueDate: null,
  notes: null,
  ...p
}));

db.data.licPolicies = db.data.licPolicies.filter(p => p.group !== 'MPN').concat(imported);
await db.write();

const sumAssured = imported.reduce((a, p) => a + (p.sumAssured || 0), 0);
const instalmentTotal = imported.reduce((a, p) => a + (p.instalmentPremium || 0), 0);
console.log(`Imported ${imported.length} MPN LIC policies into ${dbFile}`);
console.log(`Total sum assured: ${sumAssured.toLocaleString('en-IN')}, total instalment premium: ${instalmentTotal.toLocaleString('en-IN')}`);
console.log('Next premium due dates left blank — set them from the app going forward.');
