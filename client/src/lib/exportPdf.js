import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TYPE_LABELS } from './format.js';
import {
  reportHeading, totalsOf, categoryBreakdown, investorBreakdown,
  fdsByMaturity, reportStamp, fileStamp, saveBlob
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

function drawHeader(doc, { head, others, rows, filters, now }) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, PAGE_W, 21, 'F');

  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(13);
  doc.text('Investment Ready Reckoner', M, 9);

  doc.setFontSize(10.5);
  doc.text(head, M, 16);
  const headW = doc.getTextWidth(head);
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(148, 163, 184);
  const role = others.length ? `group head  ·  with ${others.join(', ')}` : 'sole investor';
  doc.text(role, M + headW + 3, 16);

  doc.setFontSize(7).setTextColor(226, 232, 240);
  doc.text(`Generated ${reportStamp(now)}`, PAGE_W - M, 9, { align: 'right' });
  doc.setTextColor(148, 163, 184);
  const scope = `${rows.length} live investment${rows.length === 1 ? '' : 's'}`
    + (filters.length ? ` · ${filters.join(' · ')}` : ' · no filters');
  doc.text(scope, PAGE_W - M, 16, { align: 'right' });
}

function drawTiles(doc, totals, y) {
  const tiles = [
    ['Amount Invested', `Rs ${money(totals.invested)}`, INK],
    ['Current Value', `Rs ${money(totals.value)}`, INK],
    ['Gain / Loss', `Rs ${money(totals.gain)}`, totals.gain >= 0 ? GREEN : RED],
    ['Overall Return', pct(totals.simpleReturn), totals.gain >= 0 ? GREEN : RED]
  ];
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
  autoTable(doc, { ...TABLE, ...opts, styles: { ...TABLE.styles, ...(opts.styles || {}) } });
  return doc.lastAutoTable.finalY;
}

export function buildInvestmentsPdf({ rows, group, filters = [], now = new Date() }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const { head, others } = reportHeading(group, rows);
  const totals = totalsOf(rows);

  drawHeader(doc, { head, others, rows, filters, now });
  let y = drawTiles(doc, totals, 25);

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

  // ---- Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...RULE).setLineWidth(0.2);
    doc.line(M, PAGE_H - 10, PAGE_W - M, PAGE_H - 10);
    doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(...MUTED);
    doc.text(
      'InvestTrack · excludes redeemed / renewed instruments · * group head · returns are value vs invested · a negative "Due" is days overdue',
      M, PAGE_H - 6.5
    );
    doc.text(`Page ${p} of ${pages}`, PAGE_W - M, PAGE_H - 6.5, { align: 'right' });
  }

  return { doc, head };
}

export function downloadInvestmentsPdf(opts) {
  const now = opts.now || new Date();
  const { doc, head } = buildInvestmentsPdf({ ...opts, now });
  saveBlob(doc.output('blob'), `Investment-Reckoner_${head}_${fileStamp(now)}.pdf`);
}
