// One-time import of the original Excel sheet into data/db.json.
// Usage: npm run seed [-- path\to\file.xlsx]
// Refuses to run if investments already exist (pass --force to wipe and reimport).
import { readFileSync, existsSync } from 'node:fs';
import xlsx from 'xlsx';
import db, { newId, dbFile } from '../db.js';

const args = process.argv.slice(2).filter(a => a !== '--force');
const force = process.argv.includes('--force');
const filePath = args[0] || 'C:\\Users\\naren\\OneDrive\\Desktop\\narendra investment.xlsx';

if (!existsSync(filePath)) {
  console.error(`Excel file not found: ${filePath}`);
  process.exit(1);
}
if (db.data.investments.length > 0 && !force) {
  console.error(`db.json already has ${db.data.investments.length} investments. Use --force to wipe and reimport.`);
  process.exit(1);
}

const TYPE_MAP = {
  'SHARES': 'SHARES',
  'FD': 'FD',
  'BANK SHARES': 'BANK_SHARES',
  'BANK BALANCE': 'BANK_BALANCE'
};

function cleanText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' || s === '-' ? null : s;
}

function cleanNumber(v) {
  if (v == null || v === '-' || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function cleanDate(v) {
  if (v == null || v === '-' || v === '') return null;
  // Excel date serial → exact calendar date via UTC (avoids timezone day-shift)
  if (typeof v === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

const wb = xlsx.read(readFileSync(filePath));
const ws = wb.Sheets[wb.SheetNames[0]];

// The header row is not necessarily the first row of the sheet range —
// locate it by finding the row that contains "Type of Investment".
const grid = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
const headerIdx = grid.findIndex(r => r.some(c => String(c || '').trim() === 'Type of Investment'));
if (headerIdx === -1) {
  console.error('Could not find the "Type of Investment" header row in the sheet.');
  process.exit(1);
}
const headers = grid[headerIdx].map(h => (h == null ? null : String(h).trim()));
const rows = grid.slice(headerIdx + 1).map(r => {
  const obj = {};
  headers.forEach((h, i) => { if (h) obj[h] = r[i] ?? null; });
  return obj;
});

const investments = [];
for (const row of rows) {
  const rawType = cleanText(row['Type of Investment']);
  if (!rawType) continue;
  const type = TYPE_MAP[rawType.toUpperCase()];
  if (!type) {
    console.warn(`Skipping row with unknown type "${rawType}"`);
    continue;
  }

  let maturityDate = cleanDate(row['Maturity Date']);
  let notes = null;
  // Known typo in the sheet: Janta Sahakari bank shares dated 1931 → 2031
  if (maturityDate && maturityDate < '1990-01-01') {
    const fixed = maturityDate.replace(/^19/, '20');
    notes = `Maturity date imported as ${fixed} (sheet had ${maturityDate}, assumed typo)`;
    maturityDate = fixed;
  }

  investments.push({
    id: newId('inv'),
    type,
    holder: cleanText(row['Holder Name']),
    name: cleanText(row['Name of Investment']),
    rateOfInterest: cleanNumber(row['Rate of Interest']),
    investmentDate: cleanDate(row['Investment Date']),
    maturityDate,
    amountInvested: cleanNumber(row['Amount Invested']),
    maturityValue: cleanNumber(row['Maturity Value']),
    notes
  });
}

db.data.investments = investments;
db.data.holdings = [];
await db.write();

const byType = {};
let invested = 0, value = 0;
for (const i of investments) {
  byType[i.type] = (byType[i.type] || 0) + 1;
  invested += i.amountInvested || 0;
  value += i.maturityValue || 0;
}
console.log(`Imported ${investments.length} investments into ${dbFile}`);
console.log('By type:', byType);
console.log(`Total invested: ${invested.toLocaleString('en-IN')}  |  Total maturity/current value: ${value.toLocaleString('en-IN')}`);
