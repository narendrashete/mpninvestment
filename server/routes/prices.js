import { Router } from 'express';
import db from '../db.js';
import { searchSchemes } from '../services/mfapi.js';
import { getQuote, searchStocks } from '../services/yahoo.js';
import { fetchPrice } from './holdings.js';

const router = Router();

const REFRESH_THROTTLE_MS = 15 * 60 * 1000;

router.get('/search/mf', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 3) return res.json([]);
  try {
    res.json(await searchSchemes(q));
  } catch (err) {
    res.status(502).json({ error: `Mutual fund search failed: ${err.message}` });
  }
});

router.get('/search/stock', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  try {
    res.json(await searchStocks(q));
  } catch (err) {
    res.status(502).json({ error: `Stock search failed: ${err.message}` });
  }
});

// Validate a stock symbol / get one quote
router.get('/quote/:symbol', async (req, res) => {
  try {
    const q = await getQuote(req.params.symbol);
    if (!q) return res.status(404).json({ error: 'No quote found' });
    res.json(q);
  } catch (err) {
    res.status(502).json({ error: `Quote failed: ${err.message}` });
  }
});

// Refresh all holdings' prices. ?force=1 bypasses the 15-min throttle.
router.post('/refresh', async (req, res) => {
  const last = db.data.settings.lastPriceRefresh;
  const force = req.query.force === '1';
  if (!force && last && Date.now() - new Date(last).getTime() < REFRESH_THROTTLE_MS) {
    return res.json({ refreshed: false, throttled: true, lastPriceRefresh: last });
  }

  const results = { updated: 0, skipped: 0, failed: [] };
  for (const holding of db.data.holdings) {
    if (holding.kind === 'OTHER') { results.skipped++; continue; }
    try {
      const p = await fetchPrice(holding);
      if (p) {
        holding.lastPrice = p.price;
        holding.lastPriceDate = p.date;
        holding.displayName ||= p.name;
        holding.isin ||= p.isin || null;
        results.updated++;
      } else {
        results.failed.push(holding.displayName || holding.symbol || holding.schemeCode);
      }
    } catch (err) {
      results.failed.push(`${holding.displayName || holding.symbol || holding.schemeCode}: ${err.message}`);
    }
  }

  if (results.updated > 0 || db.data.holdings.length === 0) {
    db.data.settings.lastPriceRefresh = new Date().toISOString();
  }
  await db.write();
  res.json({ refreshed: true, ...results, lastPriceRefresh: db.data.settings.lastPriceRefresh });
});

export default router;
