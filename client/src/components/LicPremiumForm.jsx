import { useState } from 'react';
import { api } from '../lib/api.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

// Log-a-premium-payment modal. Purely additive — does not touch the policy's
// nextPremiumDueDate, which stays a manual field edited on the policy itself.
export default function LicPremiumForm({ policyId, defaultAmount, onClose, onSaved }) {
  const [paidOn, setPaidOn] = useState(todayIso());
  const [amount, setAmount] = useState(defaultAmount ?? '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await api.addLicPremium(policyId, { paidOn, amount, notes });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Log Premium Payment</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">Paid On
              <input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} required />
            </label>
            <label className="field">Amount (₹)
              <input type="number" step="1" value={amount} onChange={e => setAmount(e.target.value)} required />
            </label>
            <label className="field full">Notes
              <input value={notes} onChange={e => setNotes(e.target.value)} />
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
