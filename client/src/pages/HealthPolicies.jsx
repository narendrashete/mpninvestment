import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatINR, formatDate, daysLeftClass, daysLeftLabel } from '../lib/format.js';
import HealthPolicyForm from '../components/HealthPolicyForm.jsx';

const TYPE_LABELS = { BASIC: 'Basic', TOPUP: 'Top-up' };

export default function HealthPolicies() {
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [holderFilter, setHolderFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = () => api.healthPolicies().then(setList).catch(err => setError(err.message));
  useEffect(() => { load(); }, []);

  const holders = useMemo(
    () => [...new Set((list || []).map(p => p.holder).filter(Boolean))].sort(),
    [list]
  );

  const filtered = useMemo(() => {
    let out = list || [];
    if (holderFilter) out = out.filter(p => p.holder === holderFilter);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(p => `${p.planName} ${p.insurerName} ${p.policyNo}`.toLowerCase().includes(q));
    }
    return out;
  }, [list, holderFilter, search]);

  const totals = useMemo(() => ({
    sumInsured: filtered.reduce((a, p) => a + (p.sumInsured || 0), 0),
    premiumAmount: filtered.reduce((a, p) => a + (p.premiumAmount || 0), 0)
  }), [filtered]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!list) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-title">
        <h1>Health Insurance</h1>
        <span className="muted" style={{ fontSize: 13.5 }}>
          Health policies are tracked separately here — they're not counted in the
          Dashboard or Investments totals.
        </span>
      </div>

      <div className="toolbar">
        <select value={holderFilter} onChange={e => setHolderFilter(e.target.value)}>
          <option value="">All holders</option>
          {holders.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <input placeholder="Search policy no. / plan / insurer…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220 }} />
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13.5 }}>
          {filtered.length} shown · Sum Insured {formatINR(totals.sumInsured)} · Premium {formatINR(totals.premiumAmount)}
        </span>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Health Policy</button>
      </div>

      <div className="card table-cards" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Policy No.</th><th>Plan Name</th><th>Type</th><th>Holder</th>
              <th className="num">Sum Insured</th><th className="num">Premium</th>
              <th>Renewal Due</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="clickable" onClick={() => navigate(`/health/${p.id}`)}>
                <td data-label="Policy No.">{p.policyNo}</td>
                <td data-label="Plan Name"><strong>{p.planName}</strong> <span className="muted">({p.insurerName})</span></td>
                <td data-label="Type"><span className="badge badge-type">{TYPE_LABELS[p.policyType] || p.policyType}</span></td>
                <td data-label="Holder">{p.holder || '—'}</td>
                <td className="num" data-label="Sum Insured">{formatINR(p.sumInsured)}</td>
                <td className="num" data-label="Premium">{formatINR(p.premiumAmount)}</td>
                <td data-label="Renewal Due">
                  <div>{formatDate(p.renewalDueDate)}</div>
                  {p.daysToRenewal != null && (
                    <span className={`badge ${daysLeftClass(p.daysToRenewal)}`} style={{ marginTop: 4, display: 'inline-block' }}>
                      {daysLeftLabel(p.daysToRenewal)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="empty">No health policies match.</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <HealthPolicyForm
          initial={null}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </>
  );
}
