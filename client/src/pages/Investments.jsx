import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatINR, formatPct, formatDate, typeLabel, TYPE_LABELS, daysLeftClass, daysLeftLabel } from '../lib/format.js';
import InvestmentForm from '../components/InvestmentForm.jsx';

export default function Investments() {
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [holderFilter, setHolderFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = () => api.investments().then(setList).catch(err => setError(err.message));
  useEffect(() => { load(); }, []);

  const holders = useMemo(
    () => [...new Set((list || []).map(i => i.holder).filter(Boolean))].sort(),
    [list]
  );

  const filtered = useMemo(() => {
    let out = list || [];
    if (typeFilter) out = out.filter(i => i.type === typeFilter);
    if (holderFilter) out = out.filter(i => i.holder === holderFilter);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(i => `${i.name} ${i.holder}`.toLowerCase().includes(q));
    }
    return out;
  }, [list, typeFilter, holderFilter, search]);

  const totals = useMemo(() => ({
    invested: filtered.reduce((a, i) => a + (i.amountInvested || 0), 0),
    value: filtered.reduce((a, i) => a + (i.currentValue || 0), 0)
  }), [filtered]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!list) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-title"><h1>Investments</h1></div>

      <div className="toolbar">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={holderFilter} onChange={e => setHolderFilter(e.target.value)}>
          <option value="">All holders</option>
          {holders.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <input placeholder="Search name…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 200 }} />
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13.5 }}>
          {filtered.length} shown · {formatINR(totals.invested)} → {formatINR(totals.value)}
        </span>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Investment</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Type</th><th>Holder</th><th>Name</th><th className="num">Rate %</th>
              <th>Invested On</th><th>Maturity</th><th>Due</th>
              <th className="num">Invested</th><th className="num">Value</th><th className="num">ROI</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(inv => (
              <tr key={inv.id} className="clickable" onClick={() => navigate(`/investments/${inv.id}`)}>
                <td><span className="badge badge-type">{typeLabel(inv.type)}</span></td>
                <td>{inv.holder || '—'}</td>
                <td>
                  <strong>{inv.name}</strong>
                  {inv.hasLiveHoldings && <span className="muted" style={{ fontSize: 12 }}> · {inv.holdingsCount} live holding{inv.holdingsCount > 1 ? 's' : ''}</span>}
                </td>
                <td className="num">{inv.rateOfInterest ?? '—'}</td>
                <td>{formatDate(inv.investmentDate)}</td>
                <td>{formatDate(inv.maturityDate)}</td>
                <td>
                  {inv.daysToMaturity != null && inv.type !== 'BANK_BALANCE'
                    ? <span className={`badge ${daysLeftClass(inv.daysToMaturity)}`}>{daysLeftLabel(inv.daysToMaturity)}</span>
                    : '—'}
                </td>
                <td className="num">{formatINR(inv.amountInvested)}</td>
                <td className="num">{formatINR(inv.currentValue)}</td>
                <td className={`num ${inv.roi == null ? '' : inv.roi >= 0 ? 'pos' : 'neg'}`}>
                  {formatPct(inv.roi)}{inv.roiIsAnnualized ? <span className="muted"> p.a.</span> : ''}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={10} className="empty">No investments match.</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <InvestmentForm
          initial={null}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </>
  );
}
