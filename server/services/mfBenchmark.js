// Market benchmarking for a held MF scheme: the top performers in that scheme's
// own AMFI category, ranked by 1-year NAV growth.
//
// Everything else in this app is derived from the user's own records; this is the
// one place that reads the wider market. mfapi.in has no "schemes by category"
// and no "category performance" endpoint, and /mf/{code} returns a scheme's
// entire NAV history (no date-range parameter), so one ranking costs dozens of
// large downloads. Hence: a cheap name search to bound the candidate pool, an
// exact category check to make it correct, and a 24h disk cache so the cost is
// paid once a day per category.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { searchAllSchemes, schemeDetail } from './mfapi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, '..', '..', 'data', 'mf-benchmarks.json');

// NAVs publish once a day, so anything fresher than this is wasted work.
const TTL_MS = 24 * 60 * 60 * 1000;
// Ceiling on how many candidates get their full history downloaded.
const MAX_CANDIDATES = 80;
// Concurrent mfapi requests. The price-refresh loop fires an unbounded
// Promise.all, which is fine for a handful of holdings but would mean 80
// simultaneous 15s requests here — not something to aim at a free API.
const BATCH_SIZE = 8;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- pure helpers (no network — unit-testable on their own) ------------------

// Direct and Regular plans of the same fund differ by the expense ratio, so
// their returns aren't comparable. Benchmarks must be like-for-like: HDFC demat
// holdings are Regular while the other platforms here are Direct.
export function planOf(schemeName) {
  return /\bdirect\b/i.test(schemeName || '') ? 'DIRECT' : 'REGULAR';
}

// A growth plan compounds NAV; an IDCW plan pays out and so shows a structurally
// lower NAV growth. Ranking one against the other would be meaningless.
export function optionOf(schemeName) {
  return /idcw|dividend|divreinop|\bdiv\b/i.test(schemeName || '') ? 'IDCW' : 'GROWTH';
}

// "Equity Scheme - Flexi Cap Fund" -> "Flexi Cap Fund", which is what actually
// appears in scheme names and so is what the name search can match on.
export function categoryKeyword(schemeCategory) {
  const c = String(schemeCategory || '').trim();
  if (!c) return '';
  const dash = c.indexOf(' - ');
  return (dash === -1 ? c : c.slice(dash + 3)).trim();
}

// mfapi dates are DD-MM-YYYY.
export function parseNavDate(s) {
  const [d, m, y] = String(s || '').split('-');
  if (!d || !m || !y) return null;
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  return isNaN(date) ? null : date;
}

// Trailing 12-month return from mfapi's newest-first NAV series. Walks back to
// the first quote on or before (latest - 365d). Returns null when the history is
// too short — a fund with 6 months of data would otherwise be ranked on a
// partial period and flatter itself against full-year peers.
export function oneYearReturn(navRows) {
  if (!Array.isArray(navRows) || navRows.length < 2) return null;

  const latest = navRows[0];
  const latestDate = parseNavDate(latest?.date);
  const latestNav = parseFloat(latest?.nav);
  if (!latestDate || !isFinite(latestNav) || latestNav <= 0) return null;

  const target = latestDate.getTime() - 365 * MS_PER_DAY;
  // Tolerate a short gap around the anniversary (holidays, non-trading days),
  // but reject a series that simply doesn't reach back a year.
  const oldestAllowed = target - 30 * MS_PER_DAY;

  for (const row of navRows) {
    const d = parseNavDate(row?.date);
    if (!d) continue;
    if (d.getTime() <= target) {
      if (d.getTime() < oldestAllowed) return null;
      const nav = parseFloat(row?.nav);
      if (!isFinite(nav) || nav <= 0) return null;
      return latestNav / nav - 1;
    }
  }
  return null;
}

// --- cache ------------------------------------------------------------------

async function readCache() {
  try {
    const raw = await readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Missing or corrupt cache is not an error — it just means a cold build.
    return {};
  }
}

async function writeCache(cache) {
  try {
    await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    // A cache that can't be written costs speed, not correctness.
    console.warn(`Could not write MF benchmark cache: ${err.message}`);
  }
}

// --- orchestration ----------------------------------------------------------

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}

// Build the full ranked list for one category/plan/option combination.
async function buildRanking(category, plan, option) {
  const keyword = categoryKeyword(category);
  if (!keyword) throw new Error(`Scheme category "${category}" could not be parsed`);

  const candidates = (await searchAllSchemes(keyword))
    .filter(c => c?.schemeCode && c?.schemeName)
    .filter(c => planOf(c.schemeName) === plan && optionOf(c.schemeName) === option)
    .slice(0, MAX_CANDIDATES);

  const detailed = await inBatches(candidates, BATCH_SIZE, async (c) => {
    try {
      const d = await schemeDetail(c.schemeCode);
      // The name search is only a pre-filter. AMFI renames funds (CLAUDE.md
      // notes "...Pure Value Fund" becoming "...Value Fund"), so a plausible
      // name match can be the wrong category — the meta is authoritative.
      if (d?.meta?.scheme_category !== category) return null;
      const ret = oneYearReturn(d?.data);
      if (ret == null) return null;
      const latest = d.data[0];
      return {
        schemeCode: String(c.schemeCode),
        schemeName: d.meta.scheme_name || c.schemeName,
        nav: parseFloat(latest.nav),
        navDate: parseNavDate(latest.date)?.toISOString().slice(0, 10) || null,
        oneYearReturn: ret
      };
    } catch {
      // One unreachable scheme shouldn't sink the whole ranking.
      return null;
    }
  });

  return detailed.filter(Boolean).sort((a, b) => b.oneYearReturn - a.oneYearReturn);
}

// Top `n` schemes in the same category/plan/option as the given held scheme,
// plus where that scheme itself ranks. Throws on network failure so the route
// can surface a 502.
export async function topInCategory(schemeCode, n = 5) {
  const own = await schemeDetail(schemeCode);
  const category = own?.meta?.scheme_category;
  const ownName = own?.meta?.scheme_name || '';
  if (!category) throw new Error(`No AMFI category found for scheme ${schemeCode}`);

  const plan = planOf(ownName);
  const option = optionOf(ownName);
  const key = `${category}|${plan}|${option}`;

  const cache = await readCache();
  const hit = cache[key];
  let ranking;
  let builtAt;
  let cached = false;

  if (hit && Date.now() - new Date(hit.builtAt).getTime() < TTL_MS && Array.isArray(hit.ranking)) {
    ({ ranking, builtAt } = hit);
    cached = true;
  } else {
    ranking = await buildRanking(category, plan, option);
    builtAt = new Date().toISOString();
    cache[key] = { builtAt, ranking };
    await writeCache(cache);
  }

  const code = String(schemeCode);
  const idx = ranking.findIndex(r => r.schemeCode === code);
  const ownRow = idx === -1 ? null : ranking[idx];

  return {
    category,
    plan,
    option,
    window: '1Y',
    builtAt,
    cached,
    totalInCategory: ranking.length,
    yourScheme: {
      schemeCode: code,
      schemeName: ownName,
      // Falls back to computing from the scheme's own history when it didn't
      // survive the ranking (e.g. under a year old, so not directly comparable).
      oneYearReturn: ownRow ? ownRow.oneYearReturn : oneYearReturn(own?.data),
      rank: idx === -1 ? null : idx + 1
    },
    top: ranking.slice(0, n).map(r => ({ ...r, isYours: r.schemeCode === code }))
  };
}
