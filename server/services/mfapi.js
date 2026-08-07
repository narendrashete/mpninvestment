// Mutual fund NAVs via mfapi.in (free, AMFI-backed, no API key).
const BASE = 'https://api.mfapi.in';

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`mfapi ${res.status} for ${url}`);
  return res.json();
}

// Returns [{ schemeCode, schemeName }]
export async function searchSchemes(query) {
  const data = await getJson(`${BASE}/mf/search?q=${encodeURIComponent(query)}`);
  return (Array.isArray(data) ? data : []).slice(0, 25);
}

// Same search, uncapped — the category benchmark needs every name match as its
// candidate pool, not the 25 the Add-Holding picker shows.
export async function searchAllSchemes(query) {
  const data = await getJson(`${BASE}/mf/search?q=${encodeURIComponent(query)}`);
  return Array.isArray(data) ? data : [];
}

// Full scheme record: { meta: { scheme_name, scheme_category, ... }, data: [{ date, nav }] }.
// `data` is the entire NAV history, newest first — mfapi has no date-range
// parameter, so the whole series comes down even when only two points are used.
// This is the only endpoint that exposes scheme_category.
export async function schemeDetail(schemeCode) {
  return getJson(`${BASE}/mf/${schemeCode}`);
}

// Returns { nav: number, date: 'YYYY-MM-DD', schemeName, isin } or null
export async function latestNav(schemeCode) {
  const data = await getJson(`${BASE}/mf/${schemeCode}/latest`);
  const row = data?.data?.[0];
  if (!row) return null;
  // mfapi dates are DD-MM-YYYY
  const [d, m, y] = row.date.split('-');
  return {
    nav: parseFloat(row.nav),
    date: `${y}-${m}-${d}`,
    schemeName: data?.meta?.scheme_name || null,
    isin: data?.meta?.isin_growth || data?.meta?.isin_div_reinvestment || null
  };
}
