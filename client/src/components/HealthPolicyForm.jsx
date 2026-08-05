import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const POLICY_TYPE_OPTIONS = [
  { value: 'BASIC', label: 'Basic' },
  { value: 'TOPUP', label: 'Top-up' }
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'lapsed', label: 'Lapsed' }
];

const EMPTY = {
  holder: '', policyType: 'BASIC', insurerName: '', planName: '', policyNo: '',
  insuredMembers: '', sumInsured: '', deductible: '', premiumAmount: '',
  commencementDate: '', expiryDate: '', renewalDueDate: '',
  nomineeName: '', status: 'active', notes: ''
};

// Add/edit modal. `initial` = existing health policy to edit, or null to create.
export default function HealthPolicyForm({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    initial
      ? Object.fromEntries(Object.keys(EMPTY).map(k => [k, initial[k] ?? '']))
      : EMPTY
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // Holder comes from the masters — new entries are added on the Masters page.
  // Insurer/plan name are free text (see CLAUDE.md-adjacent plan notes) — there
  // are only ever a handful of health policies across the family.
  const [masters, setMasters] = useState(null);

  useEffect(() => {
    api.masters()
      .then(m => setMasters({ holders: m.holders.map(h => h.value) }))
      .catch(err => setError(err.message));
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = initial
        ? await api.updateHealthPolicy(initial.id, form)
        : await api.createHealthPolicy(form);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{initial ? 'Edit Health Policy' : 'Add Health Policy'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">Holder
              <select value={form.holder} onChange={set('holder')} required disabled={!masters}>
                <option value="">{masters ? '— select holder —' : 'Loading…'}</option>
                {(masters?.holders || []).map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
            <label className="field">Policy Type
              <select value={form.policyType} onChange={set('policyType')} required>
                {POLICY_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <p className="field full muted" style={{ margin: '-6px 0 0', fontSize: 12.5 }}>
              New holders are added on the <Link to="/masters" onClick={onClose}>Masters</Link> page.
            </p>
            <label className="field">Insurer Name
              <input value={form.insurerName} onChange={set('insurerName')} placeholder="e.g. Niva Bupa" required />
            </label>
            <label className="field">Plan Name
              <input value={form.planName} onChange={set('planName')} placeholder="e.g. ReAssure 2.0" required />
            </label>
            <label className="field">Policy No.
              <input value={form.policyNo} onChange={set('policyNo')} required />
            </label>
            <label className="field">Status
              <select value={form.status} onChange={set('status')}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className="field full">Insured Members
              <input value={form.insuredMembers} onChange={set('insuredMembers')} placeholder="Comma-separated names" />
            </label>
            <label className="field">Sum Insured (₹)
              <input type="number" step="1" value={form.sumInsured} onChange={set('sumInsured')} />
            </label>
            <label className="field">Deductible (₹)
              <input type="number" step="1" value={form.deductible} onChange={set('deductible')} />
            </label>
            <label className="field">Premium Amount (₹)
              <input type="number" step="1" value={form.premiumAmount} onChange={set('premiumAmount')} />
            </label>
            <label className="field">Commencement Date
              <input type="date" value={form.commencementDate} onChange={set('commencementDate')} />
            </label>
            <label className="field">Expiry Date
              <input type="date" value={form.expiryDate} onChange={set('expiryDate')} />
            </label>
            <label className="field">Renewal Due Date
              <input type="date" value={form.renewalDueDate} onChange={set('renewalDueDate')} />
            </label>
            <label className="field">Nominee
              <input value={form.nomineeName} onChange={set('nomineeName')} />
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
