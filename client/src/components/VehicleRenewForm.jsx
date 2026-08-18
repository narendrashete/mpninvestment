import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDate, VEHICLE_POLICY_TYPE_LABELS } from '../lib/format.js';

// Motor cover runs to 23:59 of the end date, so the replacement policy starts
// the *next* day — unlike an FD renewal, which starts on the maturity date
// itself.
function dayAfter(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d)) return '';
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function yearMinusDay(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d)) return '';
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Renew modal: creates the next policy as its own record, linked back to this
// one. A renewal often switches insurer, so that stays editable.
export default function VehicleRenewForm({ vehicleId, policy, onClose, onSaved }) {
  const start = dayAfter(policy.endDate);
  const [form, setForm] = useState({
    insurerName: policy.insurerName || '',
    policyType: policy.policyType || 'COMPREHENSIVE',
    policyNo: '',
    startDate: start,
    endDate: yearMinusDay(start),
    idvTotal: policy.idvTotal ?? '',
    grossPremium: '',
    ncbPercent: policy.ncbPercent ?? '',
    notes: ''
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [masters, setMasters] = useState(null);

  useEffect(() => {
    api.masters()
      .then(m => setMasters({ insurers: m.vehicleInsurers.map(x => x.value) }))
      .catch(err => setError(err.message));
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const isTpOnly = form.policyType === 'TP_ONLY';

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await api.renewVehiclePolicy(vehicleId, policy.id, form);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Renew Policy</h2>
        <p className="muted" style={{ margin: '-10px 0 16px', fontSize: 13 }}>
          Creates a new policy and closes this one. The old policy
          ({VEHICLE_POLICY_TYPE_LABELS[policy.policyType] || policy.policyType}, expiring{' '}
          {formatDate(policy.endDate)}) stays as a record, linked to the new one.
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">Insurer
              <select value={form.insurerName} onChange={set('insurerName')} required disabled={!masters}>
                <option value="">{masters ? '— select insurer —' : 'Loading…'}</option>
                {(masters?.insurers || []).map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label className="field">Policy Type
              <select value={form.policyType} onChange={set('policyType')} required>
                {Object.entries(VEHICLE_POLICY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field">New Policy No.
              <input value={form.policyNo} onChange={set('policyNo')} required />
            </label>
            <label className="field">Gross Premium (₹)
              <input type="number" step="0.01" value={form.grossPremium} onChange={set('grossPremium')} required />
            </label>
            <label className="field">Cover Starts
              <input type="date" value={form.startDate} onChange={set('startDate')} required />
            </label>
            <label className="field">Cover Ends
              <input type="date" value={form.endDate} onChange={set('endDate')} />
            </label>
            {!isTpOnly && (
              <label className="field">Total IDV (₹)
                <input type="number" step="1" value={form.idvTotal} onChange={set('idvTotal')} />
              </label>
            )}
            <label className="field">No Claim Bonus (%)
              <input type="number" step="1" value={form.ncbPercent} onChange={set('ncbPercent')} />
            </label>
            <label className="field full">Notes
              <input value={form.notes} onChange={set('notes')} />
            </label>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Renewing…' : 'Renew'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
