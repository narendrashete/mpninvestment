// Shaping shared by the Excel and PDF exports on the Investments page. Both
// work off the same filtered rows the table is showing, so a report can never
// disagree with what's on screen.
import { TYPE_LABELS } from './format.js';

export const CATEGORY_ORDER = ['FD', 'SHARES', 'BANK_SHARES', 'BANK_BALANCE'];

// Every group has one head investor; the rest of the group is reported under
// them. Only the head is fixed here — the other names come from the data.
const GROUP_HEADS = { MPN: 'Narendra', RPS: 'Ramchandra', DEMO: 'Aditya' };

export function reportHeading(group, rows) {
  const holders = [...new Set(rows.map(r => r.holder).filter(Boolean))].sort();
  const head = GROUP_HEADS[group] || holders[0] || '—';
  return { head, others: holders.filter(h => h !== head) };
}

export function totalsOf(rows) {
  const invested = rows.reduce((a, r) => a + (r.amountInvested || 0), 0);
  const value = rows.reduce((a, r) => a + (r.currentValue || 0), 0);
  return {
    count: rows.length,
    invested,
    value,
    gain: value - invested,
    simpleReturn: invested ? (value - invested) / invested : null
  };
}

// One row per category present, in a fixed display order.
export function categoryBreakdown(rows) {
  return CATEGORY_ORDER
    .map(type => ({ type, label: TYPE_LABELS[type], rows: rows.filter(r => r.type === type) }))
    .filter(c => c.rows.length > 0)
    .map(c => ({ ...c, ...totalsOf(c.rows) }));
}

// Investor × category matrix: the head first, then everyone else.
export function investorBreakdown(group, rows) {
  const { head } = reportHeading(group, rows);
  const holders = [...new Set(rows.map(r => r.holder || 'Unknown'))]
    .sort((a, b) => (a === head ? -1 : b === head ? 1 : a.localeCompare(b)));
  const types = CATEGORY_ORDER.filter(t => rows.some(r => r.type === t));

  return {
    types,
    holders: holders.map(h => {
      const own = rows.filter(r => (r.holder || 'Unknown') === h);
      return {
        holder: h,
        isHead: h === head,
        byType: Object.fromEntries(types.map(t => [t, totalsOf(own.filter(r => r.type === t))])),
        ...totalsOf(own)
      };
    })
  };
}

// FDs first by soonest maturity — undated ones last, so the top of the list is
// always what needs attention next.
export function fdsByMaturity(rows) {
  return rows
    .filter(r => r.type === 'FD')
    .sort((a, b) => String(a.maturityDate || '9999').localeCompare(String(b.maturityDate || '9999')));
}

export function reportStamp(now = new Date()) {
  return now.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

export function fileStamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
