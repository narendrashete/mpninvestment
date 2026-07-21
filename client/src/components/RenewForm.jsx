import { useState } from 'react';
import { api } from '../lib/api.js';

// Renew a matured FD: closes the old one and creates a fresh FD (a separate
// record) linked back to it. Principal defaults to the old maturity value.
export default function RenewForm({ inv, onClose, onSaved }) {
  const [form, setForm] = useState({
    amountInvested: inv.maturityValue ?? inv.amountInvested ?? '',
    rateOfInterest: inv.rateOfInterest ?? '',
    investmentDate: inv.maturityDate || new Date().toISOString().slice(0, 10),
    maturityDate: '',
    maturityValue: '',
    notes: ''
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await api.renewInvestment(inv.id, form);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Renew {inv.name}</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Creates a new FD and closes this one. The old FD stays as a record, linked to the new one.
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">New principal (₹)
              <input type="number" step="1" value={form.amountInvested} onChange={set('amountInvested')} required />
            </label>
            <label className="field">Rate of Interest (%)
              <input type="number" step="0.01" value={form.rateOfInterest} onChange={set('rateOfInterest')} />
            </label>
            <label className="field">New investment date
              <input type="date" value={form.investmentDate} onChange={set('investmentDate')} />
            </label>
            <label className="field">New maturity date
              <input type="date" value={form.maturityDate} onChange={set('maturityDate')} />
            </label>
            <label className="field full">Maturity Value (₹) — entered manually
              <input type="number" step="1" value={form.maturityValue} onChange={set('maturityValue')} />
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
