import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'matured', label: 'Matured' },
  { value: 'surrendered', label: 'Surrendered' },
  { value: 'lapsed', label: 'Lapsed' }
];

const EMPTY = {
  holder: '', planName: '', policyNo: '',
  sumAssured: '', guaranteedAddition: '', instalmentPremium: '',
  premiumPayingTermYears: '', policyTermYears: '',
  commencementDate: '', maturityDate: '', ageAtStart: '',
  nextPremiumDueDate: '', status: 'active', notes: ''
};

// Add/edit modal. `initial` = existing LIC policy to edit, or null to create.
export default function LicPolicyForm({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    initial
      ? Object.fromEntries(Object.keys(EMPTY).map(k => [k, initial[k] ?? '']))
      : EMPTY
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // Holder and plan name come from the masters — new entries are added there, not here.
  const [masters, setMasters] = useState(null);

  useEffect(() => {
    api.masters()
      .then(m => setMasters({
        holders: m.holders.map(h => h.value),
        licPlans: m.licPlans.map(n => n.value)
      }))
      .catch(err => setError(err.message));
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = initial
        ? await api.updateLicPolicy(initial.id, form)
        : await api.createLicPolicy(form);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{initial ? 'Edit LIC Policy' : 'Add LIC Policy'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">Holder
              <select value={form.holder} onChange={set('holder')} required disabled={!masters}>
                <option value="">{masters ? '— select holder —' : 'Loading…'}</option>
                {(masters?.holders || []).map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
            <label className="field">Plan Name
              <select value={form.planName} onChange={set('planName')} required disabled={!masters}>
                <option value="">{masters ? '— select plan —' : 'Loading…'}</option>
                {(masters?.licPlans || []).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <p className="field full muted" style={{ margin: '-6px 0 0', fontSize: 12.5 }}>
              Holders and plan names come from the masters — add a new one on the{' '}
              <Link to="/masters" onClick={onClose}>Masters</Link> page.
            </p>
            <label className="field">Policy No.
              <input value={form.policyNo} onChange={set('policyNo')} required />
            </label>
            <label className="field">Status
              <select value={form.status} onChange={set('status')}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className="field">Sum Assured (₹)
              <input type="number" step="1" value={form.sumAssured} onChange={set('sumAssured')} />
            </label>
            <label className="field">Guaranteed Addition (₹)
              <input type="number" step="1" value={form.guaranteedAddition} onChange={set('guaranteedAddition')} />
            </label>
            <label className="field">Instalment Premium (₹)
              <input type="number" step="1" value={form.instalmentPremium} onChange={set('instalmentPremium')} />
            </label>
            <label className="field">Age at Start
              <input type="number" step="1" value={form.ageAtStart} onChange={set('ageAtStart')} />
            </label>
            <label className="field">Premium Paying Term (yrs)
              <input type="number" step="1" value={form.premiumPayingTermYears} onChange={set('premiumPayingTermYears')} />
            </label>
            <label className="field">Policy Term (yrs)
              <input type="number" step="1" value={form.policyTermYears} onChange={set('policyTermYears')} />
            </label>
            <label className="field">Commencement Date
              <input type="date" value={form.commencementDate} onChange={set('commencementDate')} />
            </label>
            <label className="field">Maturity Date
              <input type="date" value={form.maturityDate} onChange={set('maturityDate')} />
            </label>
            <label className="field full">Next Premium Due Date
              <input type="date" value={form.nextPremiumDueDate} onChange={set('nextPremiumDueDate')} />
            </label>
            <label className="field full">Notes
              <input value={form.notes} onChange={set('notes')} />
            </label>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
