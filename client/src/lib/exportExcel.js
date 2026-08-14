import ExcelJS from 'exceljs';
import { TYPE_LABELS } from './format.js';
import {
  reportHeading, totalsOf, licTotals, healthTotals, HEALTH_TYPE_LABELS,
  reportStamp, fileStamp, saveBlob
} from './reportData.js';

const MONEY = '₹#,##0';
const DATE = 'dd-mmm-yyyy';

const INK = 'FF0F172A';
const HEAD_FILL = 'FF1E293B';
const ZEBRA = 'FFF8FAFC';
const RULE = 'FFCBD5E1';

function asDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d) ? null : d;
}

// Investments — mirrors the on-screen table, plus the figure it shows only as a
// derived total (gain) and the free-text notes.
const INVESTMENT_COLUMNS = [
  { header: 'Type', width: 15, get: i => TYPE_LABELS[i.type] || i.type, total: t => `Total (${t.count})` },
  { header: 'Holder', width: 12, get: i => i.holder || '' },
  { header: 'Investment', width: 34, get: i => i.name || '' },
  { header: 'Nominee', width: 16, get: i => i.nominee || '' },
  { header: 'Rate %', width: 9, numFmt: '0.00', get: i => i.rateOfInterest ?? null },
  { header: 'Invested On', width: 13, numFmt: DATE, get: i => asDate(i.investmentDate) },
  { header: 'Maturity', width: 13, numFmt: DATE, get: i => asDate(i.maturityDate) },
  { header: 'Days Left', width: 10, align: 'right', get: i => (i.type === 'BANK_BALANCE' ? null : i.daysToMaturity ?? null) },
  { header: 'Amount Invested', width: 17, numFmt: MONEY, get: i => i.amountInvested ?? null, total: t => t.invested },
  { header: 'Current Value', width: 17, numFmt: MONEY, get: i => i.currentValue ?? null, total: t => t.value },
  { header: 'Gain / Loss', width: 15, numFmt: MONEY, negRed: true, total: t => t.gain,
    get: i => (i.amountInvested == null || i.currentValue == null ? null : i.currentValue - i.amountInvested) },
  { header: 'Return', width: 11, numFmt: '0.0%', get: i => i.roi ?? null, total: t => t.simpleReturn },
  { header: 'Notes', width: 34, get: i => i.notes || '' }
];

// LIC policies — no market value or ROI, so this is cover, premium and dates.
const LIC_COLUMNS = [
  { header: 'Policy No.', width: 16, get: p => p.policyNo || '', total: t => `Total (${t.count})` },
  { header: 'Plan Name', width: 30, get: p => p.planName || '' },
  { header: 'Holder', width: 14, get: p => p.holder || '' },
  { header: 'Status', width: 12, get: p => p.status || 'active' },
  { header: 'Sum Assured', width: 15, numFmt: MONEY, get: p => p.sumAssured ?? null, total: t => t.sumAssured },
  { header: 'Guaranteed Addition', width: 15, numFmt: MONEY, get: p => p.guaranteedAddition ?? null },
  { header: 'Instalment Premium', width: 15, numFmt: MONEY, get: p => p.instalmentPremium ?? null, total: t => t.premium },
  { header: 'Policy Term (Yrs)', width: 11, align: 'right', get: p => p.policyTermYears ?? null },
  { header: 'Premium Paying Term (Yrs)', width: 12, align: 'right', get: p => p.premiumPayingTermYears ?? null },
  { header: 'Age at Start', width: 10, align: 'right', get: p => p.ageAtStart ?? null },
  { header: 'Commenced', width: 13, numFmt: DATE, get: p => asDate(p.commencementDate) },
  { header: 'Maturity', width: 13, numFmt: DATE, get: p => asDate(p.maturityDate) },
  { header: 'Next Premium Due', width: 15, numFmt: DATE, get: p => asDate(p.nextPremiumDueDate) },
  { header: 'Due In (Days)', width: 11, align: 'right', get: p => p.daysToNextPremium ?? null },
  { header: 'Document', width: 26, get: p => p.documentOriginalName || '' },
  { header: 'Notes', width: 34, get: p => p.notes || '' }
];

// Health policies — cover, deductible, premium and the renewal date.
const HEALTH_COLUMNS = [
  { header: 'Policy No.', width: 16, get: p => p.policyNo || '', total: t => `Total (${t.count})` },
  { header: 'Insurer', width: 20, get: p => p.insurerName || '' },
  { header: 'Plan Name', width: 26, get: p => p.planName || '' },
  { header: 'Type', width: 10, get: p => HEALTH_TYPE_LABELS[p.policyType] || p.policyType || '' },
  { header: 'Holder', width: 14, get: p => p.holder || '' },
  { header: 'Insured Members', width: 30, get: p => p.insuredMembers || '' },
  { header: 'Nominee', width: 16, get: p => p.nomineeName || '' },
  { header: 'Status', width: 11, get: p => p.status || 'active' },
  { header: 'Sum Insured', width: 15, numFmt: MONEY, get: p => p.sumInsured ?? null, total: t => t.sumInsured },
  { header: 'Deductible', width: 13, numFmt: MONEY, get: p => p.deductible ?? null },
  { header: 'Premium', width: 14, numFmt: MONEY, get: p => p.premiumAmount ?? null, total: t => t.premium },
  { header: 'Commenced', width: 13, numFmt: DATE, get: p => asDate(p.commencementDate) },
  { header: 'Expires', width: 13, numFmt: DATE, get: p => asDate(p.expiryDate) },
  { header: 'Renewal Due', width: 13, numFmt: DATE, get: p => asDate(p.renewalDueDate) },
  { header: 'Due In (Days)', width: 11, align: 'right', get: p => p.daysToRenewal ?? null },
  { header: 'Document', width: 26, get: p => p.documentOriginalName || '' },
  { header: 'Notes', width: 34, get: p => p.notes || '' }
];

// One formatted sheet: title block naming the group head, the rest of the group,
// when it was taken and under which filters, then the table and a totals row.
function buildSheet({ wb, sheetName, title, head, others, scopeLine, columns, rows, totals, note, now }) {
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: {
      orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
    }
  });

  ws.columns = columns.map(c => ({ width: c.width }));
  const lastCol = columns.length;
  const span = (r) => `A${r}:${ws.getColumn(lastCol).letter}${r}`;

  ws.mergeCells(span(1));
  const titleCell = ws.getCell('A1');
  titleCell.value = `${title} — ${head}`;
  titleCell.font = { size: 16, bold: true, color: { argb: INK } };
  ws.getRow(1).height = 22;

  ws.mergeCells(span(2));
  const sub = ws.getCell('A2');
  sub.value = others.length ? `Other investors: ${others.join(', ')}` : 'Sole investor';
  sub.font = { size: 10, color: { argb: 'FF475569' } };

  ws.mergeCells(span(3));
  const meta = ws.getCell('A3');
  meta.value = `Generated ${reportStamp(now)}  ·  ${scopeLine}`;
  meta.font = { size: 9, color: { argb: 'FF64748B' } };

  ws.getRow(4).height = 6;

  const headerRow = ws.getRow(5);
  headerRow.values = columns.map(c => c.header);
  headerRow.height = 20;
  headerRow.eachCell(cell => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: RULE } } };
  });

  // Data rows, in the exact order the screen is showing them.
  rows.forEach((item, idx) => {
    const row = ws.addRow(columns.map(c => c.get(item)));
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const spec = columns[col - 1];
      if (spec.numFmt) cell.numFmt = spec.numFmt;
      cell.font = { size: 10, color: { argb: INK } };
      cell.alignment = { vertical: 'middle', horizontal: spec.align || (spec.numFmt ? 'right' : 'left') };
      cell.border = { bottom: { style: 'hair', color: { argb: RULE } } };
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      if (spec.negRed && typeof cell.value === 'number' && cell.value < 0) {
        cell.font = { size: 10, color: { argb: 'FFB91C1C' } };
      }
    });
  });

  const totalRow = ws.addRow(columns.map(c => (c.total ? c.total(totals) : null)));
  totalRow.eachCell({ includeEmpty: true }, (cell, col) => {
    const spec = columns[col - 1];
    if (spec.numFmt) cell.numFmt = spec.numFmt;
    cell.font = { bold: true, size: 10, color: { argb: INK } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.alignment = { horizontal: spec.align || (spec.numFmt ? 'right' : 'left') };
    cell.border = { top: { style: 'medium', color: { argb: HEAD_FILL } } };
  });

  const spacer = ws.addRow([]);
  ws.mergeCells(span(spacer.number + 1));
  const noteCell = ws.getCell(`A${spacer.number + 1}`);
  noteCell.value = note;
  noteCell.font = { size: 9, italic: true, color: { argb: 'FF64748B' } };

  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + rows.length, column: lastCol } };
  return ws;
}

function newWorkbook(now) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'InvestTrack';
  wb.created = now;
  return wb;
}

const filterText = (filters) =>
  filters.length ? `Filters: ${filters.join('; ')}` : 'No filters applied';

export function buildInvestmentsWorkbook({ rows, group, filters = [], now = new Date() }) {
  const { head, others } = reportHeading(group, rows);
  const wb = newWorkbook(now);
  buildSheet({
    wb, sheetName: 'Investments', title: 'Investment Portfolio', head, others, now,
    scopeLine: `${rows.length} live investment${rows.length === 1 ? '' : 's'}  ·  ${filterText(filters)}`,
    columns: INVESTMENT_COLUMNS, rows, totals: totalsOf(rows),
    note: 'Return is annualized (p.a.) where the term is known, otherwise a simple return. Redeemed / renewed instruments are excluded.'
  });
  return { wb, head };
}

export function buildLicWorkbook({ rows, group, filters = [], now = new Date() }) {
  const { head, others } = reportHeading(group, rows);
  const wb = newWorkbook(now);
  buildSheet({
    wb, sheetName: 'LIC Policies', title: 'LIC Policies', head, others, now,
    scopeLine: `${rows.length} polic${rows.length === 1 ? 'y' : 'ies'}  ·  ${filterText(filters)}`,
    columns: LIC_COLUMNS, rows, totals: licTotals(rows),
    note: 'LIC policies are tracked separately — they are not part of the Investments or Dashboard totals.'
  });
  return { wb, head };
}

export function buildHealthWorkbook({ rows, group, filters = [], now = new Date() }) {
  const { head, others } = reportHeading(group, rows);
  const wb = newWorkbook(now);
  buildSheet({
    wb, sheetName: 'Health Policies', title: 'Health Insurance', head, others, now,
    scopeLine: `${rows.length} polic${rows.length === 1 ? 'y' : 'ies'}  ·  ${filterText(filters)}`,
    columns: HEALTH_COLUMNS, rows, totals: healthTotals(rows),
    note: 'Health policies are tracked separately — they are not part of the Investments or Dashboard totals.'
  });
  return { wb, head };
}

async function download(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename
  );
}

export async function downloadInvestmentsExcel(opts) {
  const now = opts.now || new Date();
  const { wb, head } = buildInvestmentsWorkbook({ ...opts, now });
  await download(wb, `Investments_${head}_${fileStamp(now)}.xlsx`);
}

export async function downloadLicExcel(opts) {
  const now = opts.now || new Date();
  const { wb, head } = buildLicWorkbook({ ...opts, now });
  await download(wb, `LIC-Policies_${head}_${fileStamp(now)}.xlsx`);
}

export async function downloadHealthExcel(opts) {
  const now = opts.now || new Date();
  const { wb, head } = buildHealthWorkbook({ ...opts, now });
  await download(wb, `Health-Policies_${head}_${fileStamp(now)}.xlsx`);
}
