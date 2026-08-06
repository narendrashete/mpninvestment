// One-time seed of mock demo data for the "primedemo" login, under the DEMO
// group. Purely fictional — Aditya/Neha/Yash are not real people, and none of
// this touches or merges with the real MPN/RPS data. Usage:
//   node server/seed/import-demo.js [--force]
// Refuses to run if any DEMO investment already exists, unless --force (which
// wipes only DEMO investments/holdings — MPN and RPS data is never touched).
//
// Mutual fund scheme codes/ISINs/NAVs below were looked up on mfapi.in
// (AMFI-backed, live) on 2026-08-06 — real schemes, but the units/invested
// amounts are made up to hit the demo's target totals, not anyone's real
// holdings.
import db, { newId, dbFile, ensureMaster } from '../db.js';

const force = process.argv.includes('--force');

const existingDemo = db.data.investments.filter(i => i.group === 'DEMO');
if (existingDemo.length > 0 && !force) {
  console.error(`db.json already has ${existingDemo.length} DEMO investments. Use --force to wipe and reimport.`);
  process.exit(1);
}

const GROUP = 'DEMO';
const today = new Date().toISOString().slice(0, 10);

const investments = [];
const holdings = [];

function addShares({ holder, platform, investmentDate, funds }) {
  ensureMaster(GROUP, 'holders', holder);
  ensureMaster(GROUP, 'investmentNames', platform);
  const totalInvested = funds.reduce((a, f) => a + f.invested, 0);
  const inv = {
    id: newId('inv'),
    type: 'SHARES',
    group: GROUP,
    holder,
    name: platform,
    rateOfInterest: null,
    investmentDate,
    maturityDate: null,
    amountInvested: totalInvested,
    maturityValue: null,
    notes: 'Demo data — mock portfolio for the primedemo login.',
    nominee: null
  };
  investments.push(inv);
  for (const f of funds) {
    holdings.push({
      id: newId('hld'),
      investmentId: inv.id,
      kind: 'MF',
      schemeCode: String(f.schemeCode),
      symbol: null,
      displayName: f.displayName,
      isin: f.isin,
      units: f.units,
      investedAmount: f.invested,
      manualPrice: false,
      lastPrice: f.nav,
      lastPriceDate: f.navDate
    });
  }
}

function addFD({ holder, bank, investmentDate, maturityDate, rate, invested, maturity, note }) {
  ensureMaster(GROUP, 'holders', holder);
  ensureMaster(GROUP, 'investmentNames', bank);
  investments.push({
    id: newId('inv'),
    type: 'FD',
    group: GROUP,
    holder,
    name: bank,
    rateOfInterest: rate,
    investmentDate,
    maturityDate,
    amountInvested: invested,
    maturityValue: maturity,
    notes: note || 'Demo data — mock FD for the primedemo login.',
    nominee: null
  });
}

function addBankBalance({ holder, bank, amount }) {
  ensureMaster(GROUP, 'holders', holder);
  ensureMaster(GROUP, 'investmentNames', bank);
  investments.push({
    id: newId('inv'),
    type: 'BANK_BALANCE',
    group: GROUP,
    holder,
    name: bank,
    rateOfInterest: null,
    investmentDate: null,
    maturityDate: null,
    amountInvested: amount,
    maturityValue: amount,
    notes: 'Demo data — mock bank balance for the primedemo login.',
    nominee: null
  });
}

// ---- Mutual funds: 10 real top-performing scheme codes/NAVs (as of
// 2026-08-05 via mfapi.in), spread across the three demo investors via three
// platform "wrapper" investments (SHARES type). Invested/units are made up to
// hit the demo's target totals. ----

addShares({
  holder: 'Aditya',
  platform: 'Zerodha',
  investmentDate: '2023-08-01',
  funds: [
    { schemeCode: 120828, displayName: 'quant Small Cap Fund - Growth Option - Direct Plan', isin: 'INF966L01689', invested: 800000, units: 3743.507, nav: 315.7467, navDate: '2026-08-05' },
    { schemeCode: 127042, displayName: 'Motilal Oswal Midcap Fund - Direct Plan - Growth Option', isin: 'INF247L01445', invested: 700000, units: 8501.401, nav: 117.7453, navDate: '2026-08-05' },
    { schemeCode: 118834, displayName: 'Mirae Asset Large & Midcap Fund - Direct Plan - Growth', isin: 'INF769K01BI1', invested: 600000, units: 4155.041, nav: 181.707, navDate: '2026-08-05' },
    { schemeCode: 120586, displayName: 'ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund) - Direct Plan - Growth', isin: 'INF109K016L0', invested: 550000, units: 5144.353, nav: 122.27, navDate: '2026-08-05' }
  ]
});

addShares({
  holder: 'Neha',
  platform: 'Groww',
  investmentDate: '2023-09-15',
  funds: [
    { schemeCode: 118778, displayName: 'Nippon India Small Cap Fund - Direct Plan Growth Plan - Growth Option', isin: 'INF204K01K15', invested: 750000, units: 5092.177, nav: 207.7697, navDate: '2026-08-05' },
    { schemeCode: 118989, displayName: 'HDFC Mid Cap Fund - Growth Option - Direct Plan', isin: 'INF179K01XQ0', invested: 650000, units: 3623.204, nav: 235.979, navDate: '2026-08-05' },
    { schemeCode: 125354, displayName: 'Axis Small Cap Fund - Direct Plan - Growth', isin: 'INF846K01K35', invested: 550000, units: 5506.689, nav: 135.29, navDate: '2026-08-05' }
  ]
});

addShares({
  holder: 'Yash',
  platform: 'Kuvera',
  investmentDate: '2023-10-10',
  funds: [
    { schemeCode: 125497, displayName: 'SBI Small Cap Fund - Direct Plan - Growth', isin: 'INF200K01T51', invested: 600000, units: 3944.165, nav: 210.1839, navDate: '2026-08-05' },
    { schemeCode: 122639, displayName: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth', isin: 'INF879O01027', invested: 750000, units: 10018.0, nav: 92.8329, navDate: '2026-08-05' },
    { schemeCode: 146130, displayName: 'CANARA ROBECO SMALL CAP FUND - DIRECT PLAN - GROWTH OPTION', isin: 'INF760K01JC6', invested: 550000, units: 16590.86, nav: 46.17, navDate: '2026-08-05' }
  ]
});

// ---- Bank FDs: 20% of the demo's current value, across the 5 requested banks ----

addFD({ holder: 'Aditya', bank: 'ICICI Bank', investmentDate: '2023-07-10', maturityDate: '2026-07-10', rate: 7.0, invested: 500000, maturity: 570000 });
addFD({ holder: 'Neha', bank: 'Axis Bank', investmentDate: '2024-09-01', maturityDate: '2026-09-01', rate: 6.9, invested: 500000, maturity: 565000 });
addFD({ holder: 'Yash', bank: 'UCO Bank', investmentDate: '2024-02-15', maturityDate: '2027-02-15', rate: 6.7, invested: 400000, maturity: 450000 });
addFD({ holder: 'Aditya', bank: 'Bank of Baroda', investmentDate: '2023-11-20', maturityDate: '2026-11-20', rate: 7.2, invested: 450000, maturity: 505000 });
addFD({ holder: 'Neha', bank: 'Saraswat Bank', investmentDate: '2024-01-05', maturityDate: '2027-01-05', rate: 7.4, invested: 350000, maturity: 410000 });

// ---- Bank balances: 10% of the demo's current value, across the same 5 banks ----

addBankBalance({ holder: 'Aditya', bank: 'ICICI Bank', amount: 300000 });
addBankBalance({ holder: 'Neha', bank: 'Axis Bank', amount: 300000 });
addBankBalance({ holder: 'Yash', bank: 'UCO Bank', amount: 250000 });
addBankBalance({ holder: 'Aditya', bank: 'Bank of Baroda', amount: 200000 });
addBankBalance({ holder: 'Neha', bank: 'Saraswat Bank', amount: 200000 });

// Wipe any prior DEMO data (only relevant with --force) and write the fresh set.
db.data.investments = db.data.investments.filter(i => i.group !== GROUP).concat(investments);
const demoInvIds = new Set(investments.filter(i => i.type === 'SHARES').map(i => i.id));
db.data.holdings = db.data.holdings.filter(h => !existingDemo.some(i => i.id === h.investmentId)).concat(holdings);

await db.write();

const invested = investments.reduce((a, i) => a + (i.amountInvested || 0), 0);
const mfCurrent = holdings.reduce((a, h) => a + h.units * h.lastPrice, 0);
const fdCurrent = investments.filter(i => i.type === 'FD').reduce((a, i) => a + i.maturityValue, 0);
const bbCurrent = investments.filter(i => i.type === 'BANK_BALANCE').reduce((a, i) => a + i.maturityValue, 0);

console.log(`Imported ${investments.length} DEMO investments (${holdings.length} MF holdings) into ${dbFile}`);
console.log(`Total invested: Rs ${invested.toLocaleString('en-IN')}`);
console.log(`Current value — MF: Rs ${mfCurrent.toLocaleString('en-IN')}, FD: Rs ${fdCurrent.toLocaleString('en-IN')}, Bank balance: Rs ${bbCurrent.toLocaleString('en-IN')}`);
console.log(`Total current value: Rs ${(mfCurrent + fdCurrent + bbCurrent).toLocaleString('en-IN')}`);
