import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatINR, formatDate, daysLeftClass, daysLeftLabel } from '../lib/format.js';
import LicPolicyForm from '../components/LicPolicyForm.jsx';

export default function LicPolicies() {
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [holderFilter, setHolderFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = () => api.licPolicies().then(setList).catch(err => setError(err.message));
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
      out = out.filter(p => `${p.planName} ${p.policyNo}`.toLowerCase().includes(q));
    }
    return out;
  }, [list, holderFilter, search]);

  const totals = useMemo(() => ({
    sumAssured: filtered.reduce((a, p) => a + (p.sumAssured || 0), 0),
    instalmentPremium: filtered.reduce((a, p) => a + (p.instalmentPremium || 0), 0)
  }), [filtered]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!list) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-title">
        <h1>LIC Policies</h1>
        <span className="muted" style={{ fontSize: 13.5 }}>
          Life insurance policies are tracked separately here — they're not counted
          in the Dashboard or Investments totals.
        </span>
      </div>

      <div className="toolbar">
        <select value={holderFilter} onChange={e => setHolderFilter(e.target.value)}>
          <option value="">All holders</option>
          {holders.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <input placeholder="Search policy no. / plan…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 200 }} />
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13.5 }}>
          {filtered.length} shown · Sum Assured {formatINR(totals.sumAssured)} · Premium {formatINR(totals.instalmentPremium)}
        </span>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add LIC Policy</button>
      </div>

      <div className="card table-cards" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Policy No.</th><th>Plan Name</th><th>Holder</th>
              <th className="num">Sum Assured</th><th className="num">Instalment Premium</th>
              <th>Policy Term</th><th>Maturity Date</th><th>Next Premium Due</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="clickable" onClick={() => navigate(`/lic/${p.id}`)}>
                <td data-label="Policy No.">
                  {p.policyNo}
                  {p.documentOriginalName && (
                    <span
                      title={`Policy document attached: ${p.documentOriginalName}`}
                      style={{ marginLeft: 6 }}
                    >📎</span>
                  )}
                </td>
                <td data-label="Plan Name"><strong>{p.planName}</strong></td>
                <td data-label="Holder">{p.holder || '—'}</td>
                <td className="num" data-label="Sum Assured">{formatINR(p.sumAssured)}</td>
                <td className="num" data-label="Instalment Premium">{formatINR(p.instalmentPremium)}</td>
                <td data-label="Policy Term">{p.policyTermYears != null ? `${p.policyTermYears} Yrs` : '—'}</td>
                <td data-label="Maturity Date">{formatDate(p.maturityDate)}</td>
                <td data-label="Next Premium Due">
                  {p.daysToNextPremium != null
                    ? <span className={`badge ${daysLeftClass(p.daysToNextPremium)}`}>{daysLeftLabel(p.daysToNextPremium)}</span>
                    : '—'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="empty">No LIC policies match.</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <LicPolicyForm
          initial={null}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </>
  );
}
