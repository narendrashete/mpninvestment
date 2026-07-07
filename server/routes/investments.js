import { Router } from 'express';
import db, { newId } from '../db.js';
import { enrich, categorySummary, holderSummary } from '../services/roi.js';

const router = Router();

const TYPES = ['FD', 'SHARES', 'BANK_SHARES', 'BANK_BALANCE'];

function sanitize(body, existing = {}) {
  const inv = { ...existing };
  if (body.type !== undefined) {
    if (!TYPES.includes(body.type)) throw new Error(`type must be one of ${TYPES.join(', ')}`);
    inv.type = body.type;
  }
  for (const f of ['holder', 'name', 'notes']) {
    if (body[f] !== undefined) inv[f] = body[f] === '' ? null : String(body[f]).trim();
  }
  for (const f of ['investmentDate', 'maturityDate']) {
    if (body[f] !== undefined) inv[f] = body[f] || null;
  }
  for (const f of ['rateOfInterest', 'amountInvested', 'maturityValue']) {
    if (body[f] !== undefined) {
      const n = body[f] === '' || body[f] == null ? null : Number(body[f]);
      if (n != null && isNaN(n)) throw new Error(`${f} must be a number`);
      inv[f] = n;
    }
  }
  return inv;
}

// List, enriched with computed values/ROI. Optional ?type= & ?holder= filters.
router.get('/', (req, res) => {
  let list = db.data.investments.map(i => enrich(i, db.data.holdings));
  if (req.query.type) list = list.filter(i => i.type === req.query.type);
  if (req.query.holder) list = list.filter(i => i.holder === req.query.holder);
  res.json(list);
});

// Dashboard aggregate: summaries, maturing-soon, best/worst.
router.get('/dashboard', (req, res) => {
  const windowDays = Number(req.query.windowDays) || db.data.settings.maturityWindowDays || 60;
  const enriched = db.data.investments.map(i => enrich(i, db.data.holdings));

  const totalInvested = enriched.reduce((a, i) => a + (i.amountInvested || 0), 0);
  const totalValue = enriched.reduce((a, i) => a + (i.currentValue || 0), 0);

  const dated = enriched.filter(i => i.daysToMaturity != null && i.type !== 'BANK_BALANCE');
  const maturingSoon = dated
    .filter(i => i.daysToMaturity >= 0 && i.daysToMaturity <= windowDays)
    .sort((a, b) => a.daysToMaturity - b.daysToMaturity);
  const overdue = dated
    .filter(i => i.daysToMaturity < 0)
    .sort((a, b) => b.daysToMaturity - a.daysToMaturity);

  const ranked = enriched
    .filter(i => i.roi != null)
    .sort((a, b) => b.roi - a.roi);

  res.json({
    windowDays,
    totals: {
      invested: totalInvested,
      value: totalValue,
      gain: totalValue - totalInvested,
      simpleReturn: totalInvested ? (totalValue - totalInvested) / totalInvested : null,
      count: enriched.length
    },
    maturingSoon,
    overdue,
    best: ranked.slice(0, 3),
    worst: ranked.slice(-3).reverse(),
    byCategory: categorySummary(enriched),
    byHolder: holderSummary(enriched),
    lastPriceRefresh: db.data.settings.lastPriceRefresh
  });
});

router.get('/:id', (req, res) => {
  const inv = db.data.investments.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Investment not found' });
  const enriched = enrich(inv, db.data.holdings);
  enriched.holdings = db.data.holdings.filter(h => h.investmentId === inv.id);
  res.json(enriched);
});

router.post('/', async (req, res) => {
  try {
    const inv = sanitize(req.body);
    if (!inv.type) return res.status(400).json({ error: 'type is required' });
    if (!inv.name) return res.status(400).json({ error: 'name is required' });
    inv.id = newId('inv');
    db.data.investments.push(inv);
    await db.write();
    res.status(201).json(enrich(inv, db.data.holdings));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const idx = db.data.investments.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Investment not found' });
  try {
    const updated = sanitize(req.body, db.data.investments[idx]);
    updated.id = req.params.id;
    db.data.investments[idx] = updated;
    await db.write();
    res.json(enrich(updated, db.data.holdings));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const idx = db.data.investments.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Investment not found' });
  db.data.investments.splice(idx, 1);
  db.data.holdings = db.data.holdings.filter(h => h.investmentId !== req.params.id);
  await db.write();
  res.json({ ok: true });
});

export default router;
