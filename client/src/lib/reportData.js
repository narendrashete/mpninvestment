// Shaping shared by the Excel and PDF exports on the Investments page. Both
// work off the same filtered rows the table is showing, so a report can never
// disagree with what's on screen.
import { TYPE_LABELS, VEHICLE_CLASS_LABELS, VEHICLE_POLICY_TYPE_LABELS } from './format.js';

export const CATEGORY_ORDER = ['FD', 'SHARES', 'BANK_SHARES', 'BANK_BALANCE'];

// Every group has one head investor; the rest of the group is reported under
// them. Only the head is fixed here — the other names come from the data.
const GROUP_HEADS = { MPN: 'Narendra', RPS: 'Ramchandra', DEMO: 'Aditya' };

export function reportHeading(group, rows) {
  const holders = [...new Set(rows.map(r => r.holder).filter(Boolean))].sort();
  const head = GROUP_HEADS[group] || holders[0] || '—';
  return { head, others: holders.filter(h => h !== head) };
}

export function totalsOf(rows) {
  const invested = rows.reduce((a, r) => a + (r.amountInvested || 0), 0);
  const value = rows.reduce((a, r) => a + (r.currentValue || 0), 0);
  return {
    count: rows.length,
    invested,
    value,
    gain: value - invested,
    simpleReturn: invested ? (value - invested) / invested : null
  };
}

// One row per category present, in a fixed display order.
export function categoryBreakdown(rows) {
  return CATEGORY_ORDER
    .map(type => ({ type, label: TYPE_LABELS[type], rows: rows.filter(r => r.type === type) }))
    .filter(c => c.rows.length > 0)
    .map(c => ({ ...c, ...totalsOf(c.rows) }));
}

// Investor × category matrix: the head first, then everyone else.
export function investorBreakdown(group, rows) {
  const { head } = reportHeading(group, rows);
  const holders = [...new Set(rows.map(r => r.holder || 'Unknown'))]
    .sort((a, b) => (a === head ? -1 : b === head ? 1 : a.localeCompare(b)));
  const types = CATEGORY_ORDER.filter(t => rows.some(r => r.type === t));

  return {
    types,
    holders: holders.map(h => {
      const own = rows.filter(r => (r.holder || 'Unknown') === h);
      return {
        holder: h,
        isHead: h === head,
        byType: Object.fromEntries(types.map(t => [t, totalsOf(own.filter(r => r.type === t))])),
        ...totalsOf(own)
      };
    })
  };
}

// FDs first by soonest maturity — undated ones last, so the top of the list is
// always what needs attention next.
export function fdsByMaturity(rows) {
  return rows
    .filter(r => r.type === 'FD')
    .sort((a, b) => String(a.maturityDate || '9999').localeCompare(String(b.maturityDate || '9999')));
}

// ---- LIC policies. No current value or ROI (see CLAUDE.md), so these report on
// cover, premium outgo and the two dates that matter: next premium and maturity.
export function licTotals(rows) {
  const num = (r, f) => r[f] || 0;
  return {
    count: rows.length,
    sumAssured: rows.reduce((a, r) => a + num(r, 'sumAssured'), 0),
    premium: rows.reduce((a, r) => a + num(r, 'instalmentPremium'), 0),
    payout: rows.reduce((a, r) => a + num(r, 'sumAssured') + num(r, 'guaranteedAddition'), 0)
  };
}

export function licByHolder(group, rows) {
  const { head } = reportHeading(group, rows);
  return [...new Set(rows.map(r => r.holder || 'Unknown'))]
    .sort((a, b) => (a === head ? -1 : b === head ? 1 : a.localeCompare(b)))
    .map(h => ({
      holder: h,
      isHead: h === head,
      ...licTotals(rows.filter(r => (r.holder || 'Unknown') === h))
    }));
}

export function licByPlan(rows) {
  return [...new Set(rows.map(r => r.planName || 'Unknown'))]
    .sort()
    .map(plan => ({ plan, ...licTotals(rows.filter(r => (r.planName || 'Unknown') === plan)) }));
}

// Undated policies sort last in both ladders — a missing date shouldn't look urgent.
const byDate = (field) => (a, b) =>
  String(a[field] || '9999').localeCompare(String(b[field] || '9999'));

export function licByNextPremium(rows) {
  return rows.slice().sort(byDate('nextPremiumDueDate'));
}

export function licByMaturity(rows) {
  return rows.slice().sort(byDate('maturityDate'));
}

// ---- Health policies. Like LIC there's no market value — what matters is how
// much cover each person carries (basic plus any top-up) and when it renews.
export const HEALTH_TYPE_LABELS = { BASIC: 'Basic', TOPUP: 'Top-up' };

export function healthTotals(rows) {
  return {
    count: rows.length,
    sumInsured: rows.reduce((a, r) => a + (r.sumInsured || 0), 0),
    premium: rows.reduce((a, r) => a + (r.premiumAmount || 0), 0)
  };
}

export function healthByHolder(group, rows) {
  const { head } = reportHeading(group, rows);
  return [...new Set(rows.map(r => r.holder || 'Unknown'))]
    .sort((a, b) => (a === head ? -1 : b === head ? 1 : a.localeCompare(b)))
    .map(h => {
      const own = rows.filter(r => (r.holder || 'Unknown') === h);
      return {
        holder: h,
        isHead: h === head,
        basic: healthTotals(own.filter(r => r.policyType === 'BASIC')).sumInsured,
        topup: healthTotals(own.filter(r => r.policyType === 'TOPUP')).sumInsured,
        ...healthTotals(own)
      };
    });
}

export function healthByType(rows) {
  return ['BASIC', 'TOPUP']
    .filter(t => rows.some(r => r.policyType === t))
    .map(type => ({
      type,
      label: HEALTH_TYPE_LABELS[type],
      ...healthTotals(rows.filter(r => r.policyType === type))
    }));
}

export function healthByInsurer(rows) {
  return [...new Set(rows.map(r => r.insurerName || 'Unknown'))]
    .sort()
    .map(insurer => ({ insurer, ...healthTotals(rows.filter(r => (r.insurerName || 'Unknown') === insurer)) }));
}

export function healthByRenewal(rows) {
  return rows.slice().sort(byDate('renewalDueDate'));
}

export function reportStamp(now = new Date()) {
  return now.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

export function fileStamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Vehicle policies. The page works in vehicles, but a report wants one
// row per policy — a car with separate own-damage and third-party cover is
// two contracts, with two insurers and two expiry dates. flattenVehicles()
// joins each policy back to its vehicle so every table below shares one grain.
export { VEHICLE_CLASS_LABELS, VEHICLE_POLICY_TYPE_LABELS };

export function flattenVehicles(vehicles) {
  return vehicles.flatMap(v => (v.policies || []).map(p => ({
    ...p,
    vehicleId: v.id,
    registrationNo: v.registrationNo,
    vehicleLabel: [v.make, v.model].filter(Boolean).join(' ') || '—',
    vehicleClass: v.vehicleClass,
    yearOfManufacture: v.yearOfManufacture,
    fuelType: v.fuelType,
    holder: v.holder
  })));
}

// Only live cover counts toward the headline figures — renewed and expired
// policies are records, not protection.
export const activePolicies = (rows) => rows.filter(r => !r.closed);

export function vehicleTotals(rows) {
  const live = activePolicies(rows);
  return {
    count: rows.length,
    activeCount: live.length,
    vehicles: new Set(rows.map(r => r.vehicleId)).size,
    // Third-party-only cover carries no IDV, so summing nulls away keeps a car
    // with both an OD and a TP policy from being counted at value twice.
    totalIdv: live.reduce((a, r) => a + (r.idvTotal || 0), 0),
    premium: live.reduce((a, r) => a + (r.grossPremium || 0), 0)
  };
}

export function vehiclesByHolder(group, rows) {
  const { head } = reportHeading(group, rows);
  return [...new Set(rows.map(r => r.holder || 'Unknown'))]
    .sort((a, b) => (a === head ? -1 : b === head ? 1 : a.localeCompare(b)))
    .map(h => {
      const own = rows.filter(r => (r.holder || 'Unknown') === h);
      return {
        holder: h,
        isHead: h === head,
        vehicles: new Set(own.map(r => r.vehicleId)).size,
        ...vehicleTotals(own)
      };
    });
}

export function vehiclesByClass(rows) {
  return Object.keys(VEHICLE_CLASS_LABELS)
    .filter(c => rows.some(r => r.vehicleClass === c))
    .map(vehicleClass => ({
      vehicleClass,
      label: VEHICLE_CLASS_LABELS[vehicleClass],
      vehicles: new Set(rows.filter(r => r.vehicleClass === vehicleClass).map(r => r.vehicleId)).size,
      ...vehicleTotals(rows.filter(r => r.vehicleClass === vehicleClass))
    }));
}

export function vehiclesByPolicyType(rows) {
  return Object.keys(VEHICLE_POLICY_TYPE_LABELS)
    .filter(t => rows.some(r => r.policyType === t))
    .map(policyType => ({
      policyType,
      label: VEHICLE_POLICY_TYPE_LABELS[policyType],
      ...vehicleTotals(rows.filter(r => r.policyType === policyType))
    }));
}

export function vehiclesByInsurer(rows) {
  return [...new Set(rows.map(r => r.insurerName || 'Unknown'))]
    .sort()
    .map(insurer => ({ insurer, ...vehicleTotals(rows.filter(r => (r.insurerName || 'Unknown') === insurer)) }));
}

export function vehiclePoliciesByExpiry(rows) {
  return rows.slice().sort(byDate('endDate'));
}

// One line per vehicle for the fleet table — this is where a car carrying both
// an OD and a TP policy reads as a single "Standalone OD + Third Party" entry.
export function vehicleFleet(vehicles) {
  return vehicles.slice().sort((a, b) => {
    if (a.daysToExpiry == null) return 1;
    if (b.daysToExpiry == null) return -1;
    return a.daysToExpiry - b.daysToExpiry;
  });
}

export const activeCoverLabel = (v) => (v.activePolicyTypes || [])
  .map(t => VEHICLE_POLICY_TYPE_LABELS[t] || t)
  .join(' + ') || 'None';
