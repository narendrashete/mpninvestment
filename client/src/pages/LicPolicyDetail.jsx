import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatINR, formatDate, daysLeftClass, daysLeftLabel } from '../lib/format.js';
import LicPolicyForm from '../components/LicPolicyForm.jsx';
import LicPremiumForm from '../components/LicPremiumForm.jsx';

const STATUS_LABELS = { active: 'Active', matured: 'Matured', surrendered: 'Surrendered', lapsed: 'Lapsed' };

export default function LicPolicyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loggingPremium, setLoggingPremium] = useState(false);

  const load = useCallback(
    () => api.licPolicy(id).then(setPolicy).catch(err => setError(err.message)),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!policy) return <p className="muted">Loading…</p>;

  const del = async () => {
    if (!window.confirm(`Delete policy ${policy.policyNo} (${policy.planName}, ${policy.holder})? This cannot be undone.`)) return;
    await api.deleteLicPolicy(policy.id);
    navigate('/lic');
  };

  const delPremium = async (payment) => {
    if (!window.confirm(`Remove the ${formatINR(payment.amount)} payment logged on ${formatDate(payment.paidOn)}?`)) return;
    await api.deleteLicPremium(policy.id, payment.id);
    load();
  };

  return (
    <>
      <p style={{ margin: '0 0 10px' }}><Link to="/lic">← All LIC policies</Link></p>

      <div className="detail-header">
        <h1>{policy.planName}</h1>
        <span className="badge badge-type">{policy.policyNo}</span>
        <span className="badge badge-type">{STATUS_LABELS[policy.status] || policy.status}</span>
        {policy.daysToNextPremium != null && (
          <span className={`badge ${daysLeftClass(policy.daysToNextPremium)}`}>{daysLeftLabel(policy.daysToNextPremium)}</span>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => setEditing(true)}>Edit</button>
        <button className="btn btn-danger" onClick={del}>Delete</button>
      </div>
      <p className="muted" style={{ margin: '0 0 18px' }}>Holder: {policy.holder || '—'}</p>

      <div className="grid grid-cards" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="label">Sum Assured</div>
          <div className="value">{formatINR(policy.sumAssured)}</div>
        </div>
        <div className="card stat">
          <div className="label">Guaranteed Addition</div>
          <div className="value">{formatINR(policy.guaranteedAddition)}</div>
        </div>
        <div className="card stat">
          <div className="label">Instalment Premium</div>
          <div className="value">{formatINR(policy.instalmentPremium)}</div>
        </div>
        <div className="card stat">
          <div className="label">Next Premium Due</div>
          <div className="value">{formatDate(policy.nextPremiumDueDate)}</div>
        </div>
      </div>

      <div className="card">
        <h3>Details</h3>
        <dl className="kv">
          <dt>Age at Start</dt><dd>{policy.ageAtStart ?? '—'}</dd>
          <dt>Premium Paying Term</dt><dd>{policy.premiumPayingTermYears != null ? `${policy.premiumPayingTermYears} Yrs` : '—'}</dd>
          <dt>Policy Term</dt><dd>{policy.policyTermYears != null ? `${policy.policyTermYears} Yrs` : '—'}</dd>
          <dt>Commencement Date</dt><dd>{formatDate(policy.commencementDate)}</dd>
          <dt>Maturity Date</dt><dd>{formatDate(policy.maturityDate)}</dd>
          <dt>Notes</dt><dd>{policy.notes || '—'}</dd>
        </dl>
      </div>

      <div className="section-title">
        <h2>Premiums Paid {policy.premiums.length > 0 && <span className="muted">({policy.premiums.length})</span>}</h2>
        <button className="btn btn-primary" onClick={() => setLoggingPremium(true)}>+ Log Premium Payment</button>
      </div>

      <div className="card table-cards" style={{ padding: 0 }}>
        {policy.premiums.length === 0 ? (
          <p className="empty">No premium payments logged yet — payments are tracked going forward from here.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Paid On</th><th className="num">Amount</th><th>Notes</th><th></th></tr>
            </thead>
            <tbody>
              {policy.premiums.map(pay => (
                <tr key={pay.id}>
                  <td data-label="Paid On">{formatDate(pay.paidOn)}</td>
                  <td className="num" data-label="Amount">{formatINR(pay.amount)}</td>
                  <td data-label="Notes">{pay.notes || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }} data-label="">
                    <button className="btn btn-sm btn-danger" onClick={() => delPremium(pay)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <LicPolicyForm
          initial={policy}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
        />
      )}
      {loggingPremium && (
        <LicPremiumForm
          policyId={policy.id}
          defaultAmount={policy.instalmentPremium}
          onClose={() => setLoggingPremium(false)}
          onSaved={() => { setLoggingPremium(false); load(); }}
        />
      )}
    </>
  );
}
