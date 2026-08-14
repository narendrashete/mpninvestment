import ExcelJS from 'exceljs';
import { TYPE_LABELS } from './format.js';
import { reportHeading, totalsOf, reportStamp, fileStamp, saveBlob } from './reportData.js';

const MONEY = '₹#,##0';
const DATE = 'dd-mmm-yyyy';

const INK = 'FF0F172A';
const HEAD_FILL = 'FF1E293B';
const ZEBRA = 'FFF8FAFC';
const RULE = 'FFCBD5E1';

// Columns mirror the Investments table, plus the two figures the table shows
// only as a derived total (gain) and the free-text notes.
const COLUMNS = [
  { header: 'Type', width: 15, get: i => TYPE_LABELS[i.type] || i.type },
  { header: 'Holder', width: 12, get: i => i.holder || '' },
  { header: 'Investment', width: 34, get: i => i.name || '' },
  { header: 'Nominee', width: 16, get: i => i.nominee || '' },
  { header: 'Rate %', width: 9, numFmt: '0.00', get: i => i.rateOfInterest ?? null },
  { header: 'Invested On', width: 13, numFmt: DATE, get: i => asDate(i.investmentDate) },
  { header: 'Maturity', width: 13, numFmt: DATE, get: i => asDate(i.maturityDate) },
  { header: 'Days Left', width: 10, get: i => (i.type === 'BANK_BALANCE' ? null : i.daysToMaturity ?? null) },
  { header: 'Amount Invested', width: 17, numFmt: MONEY, total: true, get: i => i.amountInvested ?? null },
  { header: 'Current Value', width: 17, numFmt: MONEY, total: true, get: i => i.currentValue ?? null },
  { header: 'Gain / Loss', width: 15, numFmt: MONEY, total: true, get: i => gainOf(i) },
  { header: 'Return', width: 11, numFmt: '0.0%', get: i => i.roi ?? null },
  { header: 'Notes', width: 34, get: i => i.notes || '' }
];

function asDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d) ? null : d;
}

function gainOf(i) {
  if (i.amountInvested == null || i.currentValue == null) return null;
  return i.currentValue - i.amountInvested;
}

export function buildInvestmentsWorkbook({ rows, group, filters = [], now = new Date() }) {
  const { head, others } = reportHeading(group, rows);
  const totals = totalsOf(rows);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'InvestTrack';
  wb.created = now;
  const ws = wb.addWorksheet('Investments', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }
  });

  ws.columns = COLUMNS.map(c => ({ width: c.width }));
  const lastCol = COLUMNS.length;
  const span = (r) => `A${r}:${ws.getColumn(lastCol).letter}${r}`;

  // Title block — group head, then the rest of the group under them.
  ws.mergeCells(span(1));
  const title = ws.getCell('A1');
  title.value = `Investment Portfolio — ${head}`;
  title.font = { size: 16, bold: true, color: { argb: INK } };
  ws.getRow(1).height = 22;

  ws.mergeCells(span(2));
  const sub = ws.getCell('A2');
  sub.value = others.length ? `Other investors: ${others.join(', ')}` : 'Sole investor';
  sub.font = { size: 10, color: { argb: 'FF475569' } };

  ws.mergeCells(span(3));
  const meta = ws.getCell('A3');
  meta.value = `Generated ${reportStamp(now)}  ·  ${rows.length} live investment${rows.length === 1 ? '' : 's'}`
    + (filters.length ? `  ·  Filters: ${filters.join('; ')}` : '  ·  No filters applied');
  meta.font = { size: 9, color: { argb: 'FF64748B' } };

  ws.getRow(4).height = 6;

  // Header row
  const headerRow = ws.getRow(5);
  headerRow.values = COLUMNS.map(c => c.header);
  headerRow.height = 20;
  headerRow.eachCell(cell => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: RULE } } };
  });

  // Data rows, in the exact order the screen is showing them.
  rows.forEach((inv, idx) => {
    const row = ws.addRow(COLUMNS.map(c => c.get(inv)));
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const spec = COLUMNS[col - 1];
      if (spec.numFmt) cell.numFmt = spec.numFmt;
      cell.font = { size: 10, color: { argb: INK } };
      cell.alignment = { vertical: 'middle', horizontal: spec.numFmt || spec.header === 'Days Left' ? 'right' : 'left' };
      cell.border = { bottom: { style: 'hair', color: { argb: RULE } } };
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      if (spec.header === 'Gain / Loss' && typeof cell.value === 'number' && cell.value < 0) {
        cell.font = { size: 10, color: { argb: 'FFB91C1C' } };
      }
    });
  });

  // Totals
  const totalRow = ws.addRow(COLUMNS.map(c => {
    if (c.header === 'Type') return `Total (${totals.count})`;
    if (c.header === 'Amount Invested') return totals.invested;
    if (c.header === 'Current Value') return totals.value;
    if (c.header === 'Gain / Loss') return totals.gain;
    if (c.header === 'Return') return totals.simpleReturn;
    return null;
  }));
  totalRow.eachCell({ includeEmpty: true }, (cell, col) => {
    const spec = COLUMNS[col - 1];
    if (spec.numFmt) cell.numFmt = spec.numFmt;
    cell.font = { bold: true, size: 10, color: { argb: INK } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.alignment = { horizontal: spec.numFmt ? 'right' : 'left' };
    cell.border = { top: { style: 'medium', color: { argb: HEAD_FILL } } };
  });

  const foot = ws.addRow([]);
  ws.mergeCells(span(foot.number + 1));
  const note = ws.getCell(`A${foot.number + 1}`);
  note.value = 'Return is annualized (p.a.) where the term is known, otherwise a simple return. Redeemed / renewed instruments are excluded.';
  note.font = { size: 9, italic: true, color: { argb: 'FF64748B' } };

  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + rows.length, column: lastCol } };

  return { wb, head };
}

export async function downloadInvestmentsExcel(opts) {
  const now = opts.now || new Date();
  const { wb, head } = buildInvestmentsWorkbook({ ...opts, now });
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Investments_${head}_${fileStamp(now)}.xlsx`
  );
}
