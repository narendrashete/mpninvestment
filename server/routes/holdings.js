import { Router } from 'express';
import db, { newId } from '../db.js';
import { latestNav } from '../services/mfapi.js';
import { getQuote } from '../services/yahoo.js';

const router = Router();

async function fetchPrice(holding) {
  if (holding.kind === 'OTHER') {
    // No live feed (SGBs, unlisted/suspended scrips) — price stays whatever was entered manually.
    return null;
  } else if (holding.kind === 'MF') {
    const nav = await latestNav(holding.schemeCode);
    if (nav) return { price: nav.nav, date: nav.date, name: nav.schemeName, isin: nav.isin };
  } else {
    const q = await getQuote(holding.symbol);
    if (q) return { price: q.price, date: q.date, name: q.name, symbol: q.symbol };
  }
  return null;
}

router.post('/', async (req, res) => {
  const { investmentId, kind, schemeCode, symbol, displayName, units, investedAmount, lastPrice, lastPriceDate, isin } = req.body;
  const parent = db.data.investments.find(i => i.id === investmentId);
  if (!parent) return res.status(400).json({ error: 'investmentId does not exist' });
  if (parent.type !== 'SHARES') return res.status(400).json({ error: 'Holdings can only be added to SHARES investments' });
  if (!['MF', 'STOCK', 'OTHER'].includes(kind)) return res.status(400).json({ error: 'kind must be MF, STOCK or OTHER' });
  if (kind === 'MF' && !schemeCode) return res.status(400).json({ error: 'schemeCode is required for MF holdings' });
  if (kind === 'STOCK' && !symbol) return res.status(400).json({ error: 'symbol is required for STOCK holdings' });
  // OTHER = no live feed (SGBs, unlisted/suspended scrips) — price entered manually
  if (kind === 'OTHER' && (!displayName || !Number(lastPrice))) {
    return res.status(400).json({ error: 'OTHER holdings need displayName and a manual lastPrice' });
  }
  const u = Number(units);
  if (!u || u <= 0) return res.status(400).json({ error: 'units must be a positive number' });

  const holding = {
    id: newId('hld'),
    investmentId,
    kind,
    schemeCode: kind === 'MF' ? String(schemeCode) : null,
    symbol: kind === 'STOCK' ? String(symbol).trim().toUpperCase() : null,
    displayName: displayName || null,
    isin: isin || null,
    units: u,
    investedAmount: investedAmount ? Number(investedAmount) : null,
    manualPrice: kind === 'OTHER',
    lastPrice: lastPrice != null ? Number(lastPrice) : null,
    lastPriceDate: lastPriceDate || (lastPrice != null ? new Date().toISOString().slice(0, 10) : null)
  };

  // Fetch the live price immediately so the holding is usable right away;
  // failure is not fatal (offline etc.) — a caller-supplied lastPrice stays
  // as fallback until a refresh succeeds.
  if (kind !== 'OTHER') {
    try {
      const p = await fetchPrice(holding);
      if (p) {
        holding.lastPrice = p.price;
        holding.lastPriceDate = p.date;
        holding.displayName ||= p.name;
        holding.isin ||= p.isin || null;
        if (p.symbol) holding.symbol = p.symbol;
      }
    } catch (err) {
      console.warn(`Price fetch failed for new holding: ${err.message}`);
    }
  }

  db.data.holdings.push(holding);
  await db.write();
  res.status(201).json(holding);
});

router.put('/:id', async (req, res) => {
  const holding = db.data.holdings.find(h => h.id === req.params.id);
  if (!holding) return res.status(404).json({ error: 'Holding not found' });
  const { units, investedAmount, displayName, isin } = req.body;
  if (units !== undefined) {
    const u = Number(units);
    if (!u || u <= 0) return res.status(400).json({ error: 'units must be a positive number' });
    holding.units = u;
  }
  if (investedAmount !== undefined) holding.investedAmount = investedAmount ? Number(investedAmount) : null;
  if (displayName !== undefined) holding.displayName = displayName || holding.displayName;
  if (isin !== undefined) holding.isin = isin || null;
  await db.write();
  res.json(holding);
});

router.delete('/:id', async (req, res) => {
  const idx = db.data.holdings.findIndex(h => h.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Holding not found' });
  db.data.holdings.splice(idx, 1);
  await db.write();
  res.json({ ok: true });
});

export default router;
export { fetchPrice };
