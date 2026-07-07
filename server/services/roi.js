const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (isNaN(from) || isNaN(to)) return null;
  return Math.round((to - from) / MS_PER_DAY);
}

export function daysToMaturity(maturityDateIso, today = new Date()) {
  if (!maturityDateIso) return null;
  const mat = new Date(maturityDateIso);
  if (isNaN(mat)) return null;
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((mat - todayMid) / MS_PER_DAY);
}

// Current value of an investment: live holdings sum for SHARES with holdings,
// otherwise the manually maintained maturityValue.
export function currentValue(investment, holdings) {
  if (investment.type === 'SHARES') {
    const own = holdings.filter(h => h.investmentId === investment.id);
    if (own.length > 0) {
      return own.reduce((sum, h) => sum + (h.units || 0) * (h.lastPrice || 0), 0);
    }
  }
  return investment.maturityValue ?? null;
}

export function simpleReturn(invested, value) {
  if (!invested || value == null) return null;
  return (value - invested) / invested;
}

// Single-flow annualized return: (V/P)^(365/days) - 1.
// For FDs the value is the maturity value over the full term; for shares it is
// the live value since the investment date. Terms under 30 days are not
// annualized (the exponent explodes) — simple return is used instead.
export function annualizedReturn(invested, value, startIso, endIso) {
  const days = daysBetween(startIso, endIso);
  if (!invested || value == null || !days || days < 30) return null;
  if (value <= 0) return null;
  return Math.pow(value / invested, 365 / days) - 1;
}

// Enrich one investment with computed fields, given all holdings.
export function enrich(investment, holdings, today = new Date()) {
  const value = currentValue(investment, holdings);
  const invested = investment.amountInvested;
  const own = investment.type === 'SHARES'
    ? holdings.filter(h => h.investmentId === investment.id)
    : [];
  const todayIso = today.toISOString().slice(0, 10);

  // FDs measure return over the full term; shares & balances measure to date.
  const endIso = investment.type === 'FD' && investment.maturityDate
    ? investment.maturityDate
    : todayIso;

  const simple = simpleReturn(invested, value);
  const annualized = annualizedReturn(invested, value, investment.investmentDate, endIso);

  return {
    ...investment,
    currentValue: value,
    hasLiveHoldings: own.length > 0,
    holdingsCount: own.length,
    simpleReturn: simple,
    annualizedReturn: annualized,
    // ranking metric: annualized when available, else simple
    roi: annualized ?? simple,
    roiIsAnnualized: annualized != null,
    daysToMaturity: daysToMaturity(investment.maturityDate, today)
  };
}

export function categorySummary(enriched) {
  const byType = {};
  for (const inv of enriched) {
    const t = inv.type;
    byType[t] ||= { type: t, count: 0, invested: 0, value: 0 };
    byType[t].count++;
    byType[t].invested += inv.amountInvested || 0;
    byType[t].value += inv.currentValue || 0;
  }
  for (const s of Object.values(byType)) {
    s.gain = s.value - s.invested;
    s.simpleReturn = s.invested ? s.gain / s.invested : null;
    // invested-weighted average of per-instrument ROI (annualized where known)
    const withRoi = enriched.filter(i => i.type === s.type && i.roi != null && i.amountInvested);
    const wSum = withRoi.reduce((a, i) => a + i.amountInvested, 0);
    s.weightedRoi = wSum
      ? withRoi.reduce((a, i) => a + i.roi * i.amountInvested, 0) / wSum
      : null;
  }
  return Object.values(byType);
}

export function holderSummary(enriched) {
  const byHolder = {};
  for (const inv of enriched) {
    const h = inv.holder || 'Unknown';
    byHolder[h] ||= { holder: h, count: 0, invested: 0, value: 0 };
    byHolder[h].count++;
    byHolder[h].invested += inv.amountInvested || 0;
    byHolder[h].value += inv.currentValue || 0;
  }
  for (const s of Object.values(byHolder)) {
    s.gain = s.value - s.invested;
    s.simpleReturn = s.invested ? s.gain / s.invested : null;
  }
  return Object.values(byHolder);
}
