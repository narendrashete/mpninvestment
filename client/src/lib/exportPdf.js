import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TYPE_LABELS } from './format.js';
import {
  reportHeading, totalsOf, categoryBreakdown, investorBreakdown, fdsByMaturity,
  licTotals, licByHolder, licByPlan, licByNextPremium, licByMaturity,
  healthTotals, healthByHolder, healthByType, healthByInsurer, healthByRenewal,
  HEALTH_TYPE_LABELS, flattenVehicles, vehicleTotals, vehiclesByHolder,
  vehiclesByPolicyType, vehiclesByInsurer, vehiclePoliciesByExpiry,
  vehicleFleet, activeCoverLabel, VEHICLE_POLICY_TYPE_LABELS,
  reportStamp, fileStamp, saveBlob
} from './reportData.js';

// A4 portrait, laid out as two columns so the whole reckoner lands on one page:
// summaries and the non-FD categories on the left, the FD maturity ladder on
// the right. Long tables still paginate rather than being cut off.
const PAGE_W = 210, PAGE_H = 297;
const M = 8, GAP = 4;
const COL_W = (PAGE_W - 2 * M - GAP) / 2;
const LEFT_X = M, RIGHT_X = M + COL_W + GAP;

const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const RULE = [203, 213, 225];
const RED = [185, 28, 28];
const AMBER = [180, 83, 9];
const GREEN = [21, 128, 61];

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const money = (v) => (v == null ? '—' : inr.format(Math.round(v)));
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
// Fixed 3-letter months — en-IN gives "Sept", which overflows the date column.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
};
const dueLabel = (d) => (d == null ? '—' : d < 0 ? `-${-d}d` : d === 0 ? 'today' : `${d}d`);
const dueColor = (d) => (d == null ? INK : d < 0 ? RED : d <= 30 ? RED : d <= 90 ? AMBER : INK);

const TABLE = {
  theme: 'grid',
  styles: {
    font: 'helvetica', fontSize: 6.6, textColor: INK, lineColor: RULE, lineWidth: 0.1,
    cellPadding: { top: 1, bottom: 1, left: 1.2, right: 1.2 }, overflow: 'linebreak'
  },
  headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.4, cellPadding: { top: 1.2, bottom: 1.2, left: 1.2, right: 1.2 } },
  footStyles: { fillColor: [226, 232, 240], textColor: INK, fontStyle: 'bold', fontSize: 6.6 },
  alternateRowStyles: { fillColor: [248, 250, 252] }
};

function sectionTitle(doc, x, y, title) {
  doc.setFillColor(30, 41, 59);
  doc.rect(x, y - 2.6, 1.2, 3.4, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...INK);
  doc.text(title.toUpperCase(), x + 3, y);
  return y + 2.2;
}

function drawHeader(doc, { title, head, others, scope, now }) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, PAGE_W, 21, 'F');

  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(13);
  doc.text(title, M, 9);

  doc.setFontSize(10.5);
  doc.text(head, M, 16);
  const headW = doc.getTextWidth(head);
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(148, 163, 184);
  const role = others.length ? `group head  ·  with ${others.join(', ')}` : 'sole investor';
  doc.text(role, M + headW + 3, 16);

  doc.setFontSize(7).setTextColor(226, 232, 240);
  doc.text(`Generated ${reportStamp(now)}`, PAGE_W - M, 9, { align: 'right' });
  doc.setTextColor(148, 163, 184);
  doc.text(scope, PAGE_W - M, 16, { align: 'right' });
}

const scopeLine = (count, noun, filters) =>
  `${count} ${noun}${count === 1 ? '' : 's'}` + (filters.length ? ` · ${filters.join(' · ')}` : ' · no filters');

function drawTiles(doc, tiles, y) {
  const w = (PAGE_W - 2 * M - 3 * 3) / 4;
  tiles.forEach(([label, value, color], i) => {
    const x = M + i * (w + 3);
    doc.setFillColor(248, 250, 252).setDrawColor(...RULE).setLineWidth(0.2);
    doc.roundedRect(x, y, w, 13, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x + 2.5, y + 4.5);
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...color);
    doc.text(value, x + 2.5, y + 10.2);
  });
  return y + 13;
}

function table(doc, opts) {
  const columnStyles = opts.columnStyles || {};
  const hook = opts.didParseCell;
  autoTable(doc, {
    ...TABLE,
    ...opts,
    styles: { ...TABLE.styles, ...(opts.styles || {}) },
    didParseCell: (data) => {
      // columnStyles only reach body cells, so a numeric column's alignment has
      // to be copied onto its header and its totals row by hand.
      const halign = columnStyles[data.column.index]?.halign;
      if (halign && data.section !== 'body') data.cell.styles.halign = halign;
      hook?.(data);
    }
  });
  return doc.lastAutoTable.finalY;
}

function drawFooter(doc, note) {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...RULE).setLineWidth(0.2);
    doc.line(M, PAGE_H - 10, PAGE_W - M, PAGE_H - 10);
    doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(...MUTED);
    doc.text(note, M, PAGE_H - 6.5);
    doc.text(`Page ${p} of ${pages}`, PAGE_W - M, PAGE_H - 6.5, { align: 'right' });
  }
}

export function buildInvestmentsPdf({ rows, group, filters = [], now = new Date() }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const { head, others } = reportHeading(group, rows);
  const totals = totalsOf(rows);

  drawHeader(doc, {
    title: 'Investment Ready Reckoner',
    head, others, now,
    scope: scopeLine(rows.length, 'live investment', filters)
  });
  let y = drawTiles(doc, [
    ['Amount Invested', `Rs ${money(totals.invested)}`, INK],
    ['Current Value', `Rs ${money(totals.value)}`, INK],
    ['Gain / Loss', `Rs ${money(totals.gain)}`, totals.gain >= 0 ? GREEN : RED],
    ['Overall Return', pct(totals.simpleReturn), totals.gain >= 0 ? GREEN : RED]
  ], 25);

  // ---- Left column: category totals, investor split, then the non-FD holdings
  let ly = sectionTitle(doc, LEFT_X, y + 8, 'Category summary');
  const cats = categoryBreakdown(rows);
  ly = table(doc, {
    startY: ly, margin: { left: LEFT_X }, tableWidth: COL_W,
    head: [['Category', '#', 'Invested', 'Value', 'Return']],
    body: cats.map(c => [c.label, c.count, money(c.invested), money(c.value), pct(c.simpleReturn)]),
    foot: [['Total', totals.count, money(totals.invested), money(totals.value), pct(totals.simpleReturn)]],
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold' }, 1: { cellWidth: 8, halign: 'right' },
      2: { halign: 'right' }, 3: { halign: 'right' }, 4: { cellWidth: 14, halign: 'right' }
    }
  });

  const investors = investorBreakdown(group, rows);
  ly = sectionTitle(doc, LEFT_X, ly + 7, 'Investor-wise value');
  ly = table(doc, {
    startY: ly, margin: { left: LEFT_X }, tableWidth: COL_W,
    styles: { fontSize: 6.2 },
    head: [['Investor', ...investors.types.map(t => TYPE_LABELS[t]), 'Total']],
    body: investors.holders.map(h => [
      h.holder + (h.isHead ? ' *' : ''),
      ...investors.types.map(t => money(h.byType[t].value || null)),
      money(h.value)
    ]),
    foot: [[
      'All investors',
      ...investors.types.map(t => money(rows.filter(r => r.type === t).reduce((a, r) => a + (r.currentValue || 0), 0))),
      money(totals.value)
    ]],
    columnStyles: Object.fromEntries([
      [0, { cellWidth: 19, fontStyle: 'bold' }],
      ...investors.types.map((_, i) => [i + 1, { halign: 'right' }]),
      [investors.types.length + 1, { halign: 'right', fontStyle: 'bold' }]
    ])
  });

  for (const cat of cats.filter(c => c.type !== 'FD')) {
    ly = sectionTitle(doc, LEFT_X, ly + 7, cat.label);
    ly = table(doc, {
      startY: ly, margin: { left: LEFT_X }, tableWidth: COL_W,
      head: [['Investment', 'Holder', 'Invested', 'Value']],
      body: cat.rows
        .slice()
        .sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0))
        .map(r => [r.name, r.holder || '—', money(r.amountInvested), money(r.currentValue)]),
      foot: [[`Total (${cat.count})`, '', money(cat.invested), money(cat.value)]],
      columnStyles: {
        0: { cellWidth: 39 }, 1: { cellWidth: 16 },
        2: { halign: 'right' }, 3: { halign: 'right' }
      }
    });
  }

  // ---- Right column: the FD ladder, soonest maturity first
  const fds = fdsByMaturity(rows);
  let ry = sectionTitle(doc, RIGHT_X, y + 8, 'Fixed deposits by maturity date');
  if (fds.length === 0) {
    doc.setFont('helvetica', 'italic').setFontSize(7).setTextColor(...MUTED);
    doc.text('No fixed deposits in the current selection.', RIGHT_X, ry + 4);
  } else {
    const fdTotals = totalsOf(fds);
    ry = table(doc, {
      startY: ry, margin: { left: RIGHT_X, right: M }, tableWidth: COL_W,
      head: [['Holder', 'Bank / FD', 'Rate %', 'Matures', 'Due', 'Invested', 'Maturity']],
      body: fds.map(f => [
        f.holder || '—', f.name, f.rateOfInterest == null ? '—' : String(f.rateOfInterest),
        shortDate(f.maturityDate), dueLabel(f.daysToMaturity),
        money(f.amountInvested), money(f.currentValue)
      ]),
      foot: [[`Total (${fds.length})`, '', '', '', '', money(fdTotals.invested), money(fdTotals.value)]],
      columnStyles: {
        0: { cellWidth: 15 }, 1: { cellWidth: 21.5 }, 2: { cellWidth: 8.5, halign: 'right' },
        3: { cellWidth: 13.5, halign: 'center' }, 4: { cellWidth: 9.5, halign: 'right' },
        5: { cellWidth: 13.5, halign: 'right' }, 6: { cellWidth: 13.5, halign: 'right' }
      },
      didParseCell: (data) => {
        // Colour the due column so what's overdue or close is obvious at a glance.
        if (data.section === 'body' && data.column.index === 4) {
          const days = fds[data.row.index].daysToMaturity;
          data.cell.styles.textColor = dueColor(days);
          if (days != null && days <= 30) data.cell.styles.fontStyle = 'bold';
        }
      }
    });
  }

  drawFooter(doc, 'InvestTrack · excludes redeemed / renewed instruments · * group head · returns are value vs invested · a negative "Due" is days overdue');
  return { doc, head };
}

// LIC policies carry no market value, so this reckoner is about cover, premium
// outgo and the two dates that matter — next premium and maturity. Far fewer
// rows than the investments report, so it runs full width in one column.
export function buildLicPdf({ rows, group, filters = [], now = new Date() }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const { head, others } = reportHeading(group, rows);
  const totals = licTotals(rows);
  const FULL_W = PAGE_W - 2 * M;
  const nextDue = licByNextPremium(rows).find(p => p.nextPremiumDueDate);

  drawHeader(doc, {
    title: 'LIC Policy Ready Reckoner',
    head, others, now,
    scope: scopeLine(rows.length, 'policy', filters).replace('policys', 'policies')
  });
  let y = drawTiles(doc, [
    ['Policies', String(totals.count), INK],
    ['Total Sum Assured', `Rs ${money(totals.sumAssured)}`, INK],
    ['Instalment Premium', `Rs ${money(totals.premium)}`, INK],
    ['Next Premium Due', nextDue ? `${shortDate(nextDue.nextPremiumDueDate)} · ${dueLabel(nextDue.daysToNextPremium)}` : '—',
      nextDue ? dueColor(nextDue.daysToNextPremium) : MUTED]
  ], 25);

  // ---- Investor and plan splits, side by side
  const holderRows = licByHolder(group, rows);
  let ly = sectionTitle(doc, LEFT_X, y + 8, 'Investor-wise cover');
  ly = table(doc, {
    startY: ly, margin: { left: LEFT_X }, tableWidth: COL_W,
    head: [['Investor', '#', 'Sum Assured', 'Premium']],
    body: holderRows.map(h => [h.holder + (h.isHead ? ' *' : ''), h.count, money(h.sumAssured), money(h.premium)]),
    foot: [['All investors', totals.count, money(totals.sumAssured), money(totals.premium)]],
    columnStyles: {
      0: { cellWidth: 27, fontStyle: 'bold' }, 1: { cellWidth: 8, halign: 'right' },
      2: { halign: 'right' }, 3: { halign: 'right' }
    }
  });

  let ry = sectionTitle(doc, RIGHT_X, y + 8, 'Plan-wise cover');
  ry = table(doc, {
    startY: ry, margin: { left: RIGHT_X, right: M }, tableWidth: COL_W,
    head: [['Plan', '#', 'Sum Assured', 'Premium']],
    body: licByPlan(rows).map(p => [p.plan, p.count, money(p.sumAssured), money(p.premium)]),
    foot: [['All plans', totals.count, money(totals.sumAssured), money(totals.premium)]],
    columnStyles: {
      0: { cellWidth: 33, fontStyle: 'bold' }, 1: { cellWidth: 8, halign: 'right' },
      2: { halign: 'right' }, 3: { halign: 'right' }
    }
  });

  // ---- Every policy, ordered by the premium that falls due next
  const due = licByNextPremium(rows);
  let by = sectionTitle(doc, LEFT_X, Math.max(ly, ry) + 8, 'Policies by next premium due');
  by = table(doc, {
    startY: by, margin: { left: M, right: M }, tableWidth: FULL_W,
    head: [['Policy No.', 'Plan', 'Holder', 'Status', 'Sum Assured', 'Premium', 'Term', 'Commenced', 'Matures', 'Next Due', 'In']],
    body: due.map(p => [
      p.policyNo || '—', p.planName || '—', p.holder || '—', p.status || 'active',
      money(p.sumAssured), money(p.instalmentPremium),
      p.policyTermYears == null ? '—' : `${p.policyTermYears}y`,
      shortDate(p.commencementDate), shortDate(p.maturityDate),
      shortDate(p.nextPremiumDueDate), dueLabel(p.daysToNextPremium)
    ]),
    foot: [[`Total (${totals.count})`, '', '', '', money(totals.sumAssured), money(totals.premium), '', '', '', '', '']],
    columnStyles: {
      0: { cellWidth: 21 }, 1: { cellWidth: 33 }, 2: { cellWidth: 17 }, 3: { cellWidth: 13 },
      4: { cellWidth: 20, halign: 'right' }, 5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 10, halign: 'right' }, 7: { cellWidth: 17, halign: 'center' },
      8: { cellWidth: 17, halign: 'center' }, 9: { cellWidth: 17, halign: 'center' },
      10: { cellWidth: 11, halign: 'right' }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 10) {
        const days = due[data.row.index].daysToNextPremium;
        data.cell.styles.textColor = dueColor(days);
        if (days != null && days <= 30) data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  // ---- What pays out, and when
  const maturing = licByMaturity(rows);
  by = sectionTitle(doc, LEFT_X, by + 8, 'Maturity ladder');
  table(doc, {
    startY: by, margin: { left: LEFT_X }, tableWidth: COL_W,
    head: [['Policy No.', 'Holder', 'Matures', 'Sum Assured', 'With GA']],
    body: maturing.map(p => [
      p.policyNo || '—', p.holder || '—', shortDate(p.maturityDate),
      money(p.sumAssured), money((p.sumAssured || 0) + (p.guaranteedAddition || 0))
    ]),
    foot: [[`Total (${totals.count})`, '', '', money(totals.sumAssured), money(totals.payout)]],
    columnStyles: {
      0: { cellWidth: 22 }, 1: { cellWidth: 16 }, 2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 21, halign: 'right' }, 4: { cellWidth: 21, halign: 'right' }
    }
  });

  drawFooter(doc, 'InvestTrack · LIC policies are tracked separately and are not part of the Investments or Dashboard totals · * group head · "With GA" adds the guaranteed addition to the sum assured');
  return { doc, head };
}

// Health policies: cover per person (basic plus any top-up) and the renewal
// dates that must not be missed. Same one-column shape as the LIC reckoner.
export function buildHealthPdf({ rows, group, filters = [], now = new Date() }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const { head, others } = reportHeading(group, rows);
  const totals = healthTotals(rows);
  const FULL_W = PAGE_W - 2 * M;
  const renewals = healthByRenewal(rows);
  const nextRenewal = renewals.find(p => p.renewalDueDate);

  drawHeader(doc, {
    title: 'Health Insurance Ready Reckoner',
    head, others, now,
    scope: scopeLine(rows.length, 'policy', filters).replace('policys', 'policies')
  });
  let y = drawTiles(doc, [
    ['Policies', String(totals.count), INK],
    ['Total Sum Insured', `Rs ${money(totals.sumInsured)}`, INK],
    ['Annual Premium', `Rs ${money(totals.premium)}`, INK],
    ['Next Renewal Due', nextRenewal ? `${shortDate(nextRenewal.renewalDueDate)} · ${dueLabel(nextRenewal.daysToRenewal)}` : '—',
      nextRenewal ? dueColor(nextRenewal.daysToRenewal) : MUTED]
  ], 25);

  // ---- Who is covered for how much, and split by basic vs top-up
  const holderRows = healthByHolder(group, rows);
  let ly = sectionTitle(doc, LEFT_X, y + 8, 'Cover per person');
  ly = table(doc, {
    startY: ly, margin: { left: LEFT_X }, tableWidth: COL_W,
    head: [['Insured', '#', 'Basic', 'Top-up', 'Total Cover']],
    body: holderRows.map(h => [
      h.holder + (h.isHead ? ' *' : ''), h.count,
      h.basic ? money(h.basic) : '—', h.topup ? money(h.topup) : '—', money(h.sumInsured)
    ]),
    foot: [[
      'All insured', totals.count,
      money(holderRows.reduce((a, h) => a + h.basic, 0)),
      money(holderRows.reduce((a, h) => a + h.topup, 0)),
      money(totals.sumInsured)
    ]],
    columnStyles: {
      0: { cellWidth: 22, fontStyle: 'bold' }, 1: { cellWidth: 7, halign: 'right' },
      2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' }
    }
  });

  let ry = sectionTitle(doc, RIGHT_X, y + 8, 'Cover by policy type');
  ry = table(doc, {
    startY: ry, margin: { left: RIGHT_X, right: M }, tableWidth: COL_W,
    head: [['Type', '#', 'Sum Insured', 'Premium']],
    body: healthByType(rows).map(t => [t.label, t.count, money(t.sumInsured), money(t.premium)]),
    foot: [['All types', totals.count, money(totals.sumInsured), money(totals.premium)]],
    columnStyles: {
      0: { cellWidth: 26, fontStyle: 'bold' }, 1: { cellWidth: 8, halign: 'right' },
      2: { halign: 'right' }, 3: { halign: 'right' }
    }
  });

  // ---- Every policy, ordered by the renewal that falls due next
  let by = sectionTitle(doc, LEFT_X, Math.max(ly, ry) + 8, 'Policies by renewal due');
  by = table(doc, {
    startY: by, margin: { left: M, right: M }, tableWidth: FULL_W,
    head: [['Policy No.', 'Insurer', 'Plan', 'Type', 'Holder', 'Insured Members', 'Sum Insured', 'Deductible', 'Premium', 'Renewal Due', 'In']],
    body: renewals.map(p => [
      p.policyNo || '—', p.insurerName || '—', p.planName || '—',
      HEALTH_TYPE_LABELS[p.policyType] || p.policyType || '—', p.holder || '—',
      p.insuredMembers || '—', money(p.sumInsured),
      p.deductible ? money(p.deductible) : '—', money(p.premiumAmount),
      shortDate(p.renewalDueDate), dueLabel(p.daysToRenewal)
    ]),
    foot: [[`Total (${totals.count})`, '', '', '', '', '', money(totals.sumInsured), '', money(totals.premium), '', '']],
    columnStyles: {
      0: { cellWidth: 19 }, 1: { cellWidth: 21 }, 2: { cellWidth: 24 }, 3: { cellWidth: 10 },
      4: { cellWidth: 14 }, 5: { cellWidth: 31 }, 6: { cellWidth: 17, halign: 'right' },
      7: { cellWidth: 15, halign: 'right' }, 8: { cellWidth: 15, halign: 'right' },
      9: { cellWidth: 17, halign: 'center' }, 10: { cellWidth: 11, halign: 'right' }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 10) {
        const days = renewals[data.row.index].daysToRenewal;
        data.cell.styles.textColor = dueColor(days);
        if (days != null && days <= 30) data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  // ---- How the cover is spread across insurers
  by = sectionTitle(doc, LEFT_X, by + 8, 'Cover by insurer');
  table(doc, {
    startY: by, margin: { left: LEFT_X }, tableWidth: COL_W,
    head: [['Insurer', '#', 'Sum Insured', 'Premium']],
    body: healthByInsurer(rows).map(i => [i.insurer, i.count, money(i.sumInsured), money(i.premium)]),
    foot: [['All insurers', totals.count, money(totals.sumInsured), money(totals.premium)]],
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold' }, 1: { cellWidth: 8, halign: 'right' },
      2: { halign: 'right' }, 3: { halign: 'right' }
    }
  });

  drawFooter(doc, 'InvestTrack · health policies are tracked separately and are not part of the Investments or Dashboard totals · * group head · a negative "In" is days overdue');
  return { doc, head };
}

// `rows` are vehicles; the reckoner works at policy grain because that's what
// expires. A car carrying separate own-damage and third-party cover therefore
// contributes two lines to the expiry ladder and one line to the fleet table.
export function buildVehiclesPdf({ rows, group, filters = [], now = new Date() }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const { head, others } = reportHeading(group, rows);
  const policies = flattenVehicles(rows);
  const totals = vehicleTotals(policies);
  const FULL_W = PAGE_W - 2 * M;
  const expiries = vehiclePoliciesByExpiry(policies);
  const nextExpiry = expiries.find(p => !p.closed && p.endDate);

  drawHeader(doc, {
    title: 'Vehicle Insurance Ready Reckoner',
    head, others, now,
    scope: scopeLine(policies.length, 'policy', filters).replace('policys', 'policies')
  });
  let y = drawTiles(doc, [
    ['Vehicles', String(totals.vehicles), INK],
    ['Total IDV', `Rs ${money(totals.totalIdv)}`, INK],
    ['Premium Paid', `Rs ${money(totals.premium)}`, INK],
    ['Next Expiry', nextExpiry ? `${shortDate(nextExpiry.endDate)} · ${dueLabel(nextExpiry.daysToExpiry)}` : '—',
      nextExpiry ? dueColor(nextExpiry.daysToExpiry) : MUTED]
  ], 25);

  // ---- Who owns what, and how much cover it carries
  const holderRows = vehiclesByHolder(group, policies);
  let ly = sectionTitle(doc, LEFT_X, y + 8, 'Cover per person');
  ly = table(doc, {
    startY: ly, margin: { left: LEFT_X }, tableWidth: COL_W,
    head: [['Owner', 'Vehicles', 'Live', 'Total IDV', 'Premium']],
    body: holderRows.map(h => [
      h.holder + (h.isHead ? ' *' : ''), h.vehicles, h.activeCount,
      money(h.totalIdv), money(h.premium)
    ]),
    foot: [['All owners', totals.vehicles, totals.activeCount, money(totals.totalIdv), money(totals.premium)]],
    columnStyles: {
      0: { cellWidth: 24, fontStyle: 'bold' }, 1: { cellWidth: 12, halign: 'right' },
      2: { cellWidth: 8, halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold' }, 4: { halign: 'right' }
    }
  });

  let ry = sectionTitle(doc, RIGHT_X, y + 8, 'Cover by type');
  ry = table(doc, {
    startY: ry, margin: { left: RIGHT_X, right: M }, tableWidth: COL_W,
    head: [['Cover', '#', 'Total IDV', 'Premium']],
    body: vehiclesByPolicyType(policies).map(t => [t.label, t.count, money(t.totalIdv), money(t.premium)]),
    foot: [['All cover', totals.count, money(totals.totalIdv), money(totals.premium)]],
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' }, 1: { cellWidth: 8, halign: 'right' },
      2: { halign: 'right' }, 3: { halign: 'right' }
    }
  });

  // ---- Every policy, soonest to lapse at the top
  let by = sectionTitle(doc, LEFT_X, Math.max(ly, ry) + 8, 'Policies by expiry');
  by = table(doc, {
    startY: by, margin: { left: M, right: M }, tableWidth: FULL_W,
    head: [['Registration', 'Vehicle', 'Insurer', 'Cover', 'Owner', 'Total IDV', 'Premium', 'Expires', 'In']],
    body: expiries.map(p => [
      p.registrationNo || '—', p.vehicleLabel || '—', p.insurerName || '—',
      VEHICLE_POLICY_TYPE_LABELS[p.policyType] || p.policyType || '—', p.holder || '—',
      p.idvTotal ? money(p.idvTotal) : '—', money(p.grossPremium),
      shortDate(p.endDate), p.closed ? '—' : dueLabel(p.daysToExpiry)
    ]),
    foot: [[`Total (${totals.count})`, '', '', '', '', money(totals.totalIdv), money(totals.premium), '', '']],
    columnStyles: {
      0: { cellWidth: 18 }, 1: { cellWidth: 46 }, 2: { cellWidth: 38 }, 3: { cellWidth: 16 },
      4: { cellWidth: 14 }, 5: { cellWidth: 18, halign: 'right' }, 6: { cellWidth: 16, halign: 'right' },
      7: { cellWidth: 17, halign: 'center' }, 8: { cellWidth: 11, halign: 'right' }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 8) {
        const row = expiries[data.row.index];
        if (row.closed) { data.cell.styles.textColor = MUTED; return; }
        data.cell.styles.textColor = dueColor(row.daysToExpiry);
        if (row.daysToExpiry != null && row.daysToExpiry <= 30) data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  // ---- How the cover is spread across insurers
  let by2 = sectionTitle(doc, LEFT_X, by + 8, 'Cover by insurer');
  by2 = table(doc, {
    startY: by2, margin: { left: LEFT_X }, tableWidth: COL_W,
    head: [['Insurer', '#', 'Total IDV', 'Premium']],
    body: vehiclesByInsurer(policies).map(i => [i.insurer, i.count, money(i.totalIdv), money(i.premium)]),
    foot: [['All insurers', totals.count, money(totals.totalIdv), money(totals.premium)]],
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold' }, 1: { cellWidth: 8, halign: 'right' },
      2: { halign: 'right' }, 3: { halign: 'right' }
    }
  });

  // ---- The fleet: one line per vehicle, so concurrent cover reads as one row
  const fleet = vehicleFleet(rows);
  let ry2 = sectionTitle(doc, RIGHT_X, by + 8, 'Vehicles');
  table(doc, {
    startY: ry2, margin: { left: RIGHT_X, right: M }, tableWidth: COL_W,
    head: [['Registration', 'Vehicle', 'Active Cover', 'Next Expiry']],
    body: fleet.map(v => [
      v.registrationNo || '—',
      [v.make, v.model].filter(Boolean).join(' ') || '—',
      activeCoverLabel(v),
      v.nextExpiryDate ? `${shortDate(v.nextExpiryDate)} · ${dueLabel(v.daysToExpiry)}` : '—'
    ]),
    columnStyles: {
      0: { cellWidth: 20, fontStyle: 'bold' }, 1: { cellWidth: 30 },
      2: { cellWidth: 26 }, 3: { cellWidth: 19, halign: 'right' }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        data.cell.styles.textColor = dueColor(fleet[data.row.index].daysToExpiry);
      }
    }
  });

  drawFooter(doc, 'InvestTrack · vehicle policies are tracked separately and are not part of the Investments or Dashboard totals · * group head · one row per policy — a vehicle with separate own-damage and third-party cover appears twice · totals count live cover only · a negative "In" is days overdue');
  return { doc, head };
}

export function downloadVehiclesPdf(opts) {
  const now = opts.now || new Date();
  const { doc, head } = buildVehiclesPdf({ ...opts, now });
  saveBlob(doc.output('blob'), `Vehicle-Reckoner_${head}_${fileStamp(now)}.pdf`);
}

export function downloadHealthPdf(opts) {
  const now = opts.now || new Date();
  const { doc, head } = buildHealthPdf({ ...opts, now });
  saveBlob(doc.output('blob'), `Health-Reckoner_${head}_${fileStamp(now)}.pdf`);
}

export function downloadLicPdf(opts) {
  const now = opts.now || new Date();
  const { doc, head } = buildLicPdf({ ...opts, now });
  saveBlob(doc.output('blob'), `LIC-Reckoner_${head}_${fileStamp(now)}.pdf`);
}

export function downloadInvestmentsPdf(opts) {
  const now = opts.now || new Date();
  const { doc, head } = buildInvestmentsPdf({ ...opts, now });
  saveBlob(doc.output('blob'), `Investment-Reckoner_${head}_${fileStamp(now)}.pdf`);
}
