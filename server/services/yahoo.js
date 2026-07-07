// Stock quotes via Yahoo Finance's public chart/search endpoints, called
// directly with fetch. The yahoo-finance2 library's cookie+crumb flow gets
// rate-limited ("Too Many Requests") while these endpoints respond fine.
// NSE symbols use the .NS suffix (e.g. RELIANCE.NS), BSE uses .BO; a bare
// symbol is tried as .NS first, then .BO.
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Yahoo ${res.status} for ${url}`);
  return res.json();
}

async function quoteOne(symbol) {
  const data = await getJson(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
  );
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || meta.regularMarketPrice == null) return null;
  return {
    symbol: meta.symbol,
    name: meta.longName || meta.shortName || meta.symbol,
    price: meta.regularMarketPrice,
    currency: meta.currency,
    date: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  };
}

// Resolve a user-entered symbol to a live quote, trying Indian suffixes.
export async function getQuote(rawSymbol) {
  const symbol = rawSymbol.trim().toUpperCase();
  const candidates = symbol.includes('.') ? [symbol] : [`${symbol}.NS`, `${symbol}.BO`, symbol];
  let lastErr = null;
  for (const c of candidates) {
    try {
      const q = await quoteOne(c);
      if (q) return q;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

export async function searchStocks(query) {
  const data = await getJson(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`
  );
  // NSE (NSI) and BSE listings first — this is an Indian portfolio
  const rank = (ex) => (ex === 'NSI' ? 0 : ex === 'BSE' ? 1 : 2);
  return (data.quotes || [])
    .filter(q => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
    .map(q => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      exchange: q.exchange
    }))
    .sort((a, b) => rank(a.exchange) - rank(b.exchange));
}
