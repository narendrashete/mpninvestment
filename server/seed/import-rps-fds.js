// One-time import of the RPS (Ramchandra & Smita Shete) FD summary sheet into
// data/db.json, under the RPS group. Usage: node server/seed/import-rps-fds.js
// [path\to\FD_Summary.xlsx] [--force]
// Refuses to run if any RPS investment already exists, unless --force (which
// wipes only RPS investments — MPN data is never touched).
import { readFileSync, existsSync } from 'node:fs';
import xlsx from 'xlsx';
import db, { newId, dbFile, ensureMaster } from '../db.js';

const force = process.argv.includes('--force');
const filePath = process.argv.slice(2).filter(a => a !== '--force')[0]
  || 'C:\\Users\\naren\\Downloads\\FD_Summary.xlsx';

if (!existsSync(filePath)) {
  console.error(`Excel file not found: ${filePath}`);
  process.exit(1);
}

const existingRps = db.data.investments.filter(i => i.group === 'RPS');
if (existingRps.length > 0 && !force) {
  console.error(`db.json already has ${existingRps.length} RPS investments. Use --force to wipe and reimport.`);
  process.exit(1);
}

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

// Parses dd/mm/yyyy, tolerating a trailing "(approx.)" note (present on
// several cells derived from handwritten renewal entries). Returns
// { iso, approx } or null.
function cleanDate(v) {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s || s === '-') return null;
  const approx = /\(approx\.?\)/i.test(s);
  s = s.replace(/\(approx\.?\)/i, '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return { iso: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`, approx };
}

// Joint holders are recorded in varying order across rows ("Smita R Shete &
// Ramchandra P Shete" vs "Ramchandra P Shete & Smita R Shete") — the app's
// holder field is a single pick-list value, so we use whichever is named
// first in that row.
function firstDepositor(depositors) {
  if (!depositors) return null;
  const first = depositors.split('&')[0].trim();
  if (/^ramchandra/i.test(first)) return 'Ramchandra';
  if (/^smita/i.test(first)) return 'Smita';
  return first;
}

const wb = xlsx.read(readFileSync(filePath));
const ws = wb.Sheets[wb.SheetNames[0]];

const grid = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
const headerIdx = grid.findIndex(r => r.some(c => String(c || '').trim() === 'Sr No'));
if (headerIdx === -1) {
  console.error('Could not find the "Sr No" header row in the sheet.');
  process.exit(1);
}
const headers = grid[headerIdx].map(h => (h == null ? null : String(h).trim()));
const rows = grid.slice(headerIdx + 1)
  .map(r => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = r[i] ?? null; });
    return obj;
  })
  // Stop at the trailing TOTAL row(s), which have no Sr No.
  .filter(r => cleanNumber(r['Sr No']) != null);

const investments = [];
for (const row of rows) {
  const bank = cleanText(row['Bank']);
  const branch = cleanText(row['Branch']);
  const acct = cleanText(row['Account / Certificate No']);
  const depositors = cleanText(row['Depositor(s)']);
  const scheme = cleanText(row['Scheme']);
  const nominee = cleanText(row['Nominee']);
  const remarks = cleanText(row['Remarks']);
  const holder = firstDepositor(depositors);

  const origDate = cleanDate(row['Original Deposit Date']);
  const origAmt = cleanNumber(row['Original Amount (Rs)']);
  const origRate = cleanNumber(row['Original Rate (%)']);
  const origMaturityDate = cleanDate(row['Original Maturity Date']);
  const origMaturityAmt = cleanNumber(row['Original Maturity Amount (Rs)']);

  const renewDate = cleanDate(row['Latest Renewal Date']);
  const renewAmt = cleanNumber(row['Latest Renewal Amount (Rs)']);
  const renewRate = cleanNumber(row['Latest Renewal Rate (%)']);

  const curMaturityDate = cleanDate(row['Current Maturity Date']);
  const curMaturityAmt = cleanNumber(row['Current Maturity Amount (Rs)']);

  const approxDates = [origMaturityDate, renewDate, curMaturityDate].some(d => d?.approx);
  const notes = [
    branch && `Branch: ${branch}`,
    acct && `A/C: ${acct}`,
    scheme && `Scheme: ${scheme}`,
    nominee && `Nominee: ${nominee}`,
    remarks,
    approxDates && 'One or more dates above are approximate (from a handwritten record).'
  ].filter(Boolean).join(' | ') || null;

  ensureMaster('RPS', 'holders', holder);
  ensureMaster('RPS', 'investmentNames', bank);

  if (renewDate) {
    const original = {
      id: newId('inv'),
      type: 'FD',
      group: 'RPS',
      holder,
      name: bank,
      rateOfInterest: origRate,
      investmentDate: origDate?.iso ?? null,
      maturityDate: origMaturityDate?.iso ?? null,
      amountInvested: origAmt,
      maturityValue: origMaturityAmt,
      notes,
      status: 'renewed',
      renewedOn: renewDate.iso
    };
    const renewed = {
      id: newId('inv'),
      type: 'FD',
      group: 'RPS',
      holder,
      name: bank,
      rateOfInterest: renewRate,
      investmentDate: renewDate.iso,
      maturityDate: curMaturityDate?.iso ?? null,
      amountInvested: renewAmt,
      maturityValue: curMaturityAmt,
      notes,
      renewedFromId: original.id
    };
    original.renewedToId = renewed.id;
    investments.push(original, renewed);
  } else {
    investments.push({
      id: newId('inv'),
      type: 'FD',
      group: 'RPS',
      holder,
      name: bank,
      rateOfInterest: origRate,
      investmentDate: origDate?.iso ?? null,
      maturityDate: curMaturityDate?.iso ?? origMaturityDate?.iso ?? null,
      amountInvested: origAmt,
      maturityValue: curMaturityAmt ?? origMaturityAmt,
      notes
    });
  }
}

db.data.investments = db.data.investments.filter(i => i.group !== 'RPS').concat(investments);
await db.write();

let invested = 0, current = 0, closedCount = 0;
for (const i of investments) {
  invested += i.amountInvested || 0;
  if (i.status !== 'renewed') current += i.maturityValue || 0;
  if (i.status === 'renewed') closedCount++;
}
console.log(`Imported ${investments.length} RPS investment records (from ${rows.length} sheet rows) into ${dbFile}`);
console.log(`${closedCount} closed as renewed (kept as records only), ${investments.length - closedCount} active.`);
console.log(`Sum of amountInvested across all imported records (incl. closed): ${invested.toLocaleString('en-IN')}`);
console.log(`Sum of maturityValue across active records only: ${current.toLocaleString('en-IN')}`);
