const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

export function formatINR(v) {
  if (v == null) return '—';
  return inr.format(v);
}

export function formatPct(v, digits = 1) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const TYPE_LABELS = {
  FD: 'Fixed Deposit',
  SHARES: 'Shares / MF',
  BANK_SHARES: 'Bank Shares',
  BANK_BALANCE: 'Bank Balance'
};

export function typeLabel(t) {
  return TYPE_LABELS[t] || t;
}

export function daysLeftClass(days) {
  if (days == null) return '';
  if (days < 0) return 'badge-overdue';
  if (days <= 15) return 'badge-red';
  if (days <= 30) return 'badge-amber';
  return 'badge-green';
}

export function daysLeftLabel(days) {
  if (days == null) return '—';
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'Today';
  return `${days}d left`;
}
