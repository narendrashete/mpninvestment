import { useState } from 'react';
import { api } from '../lib/api.js';
import { TYPE_LABELS } from '../lib/format.js';

const EMPTY = {
  type: 'FD', holder: '', name: '', rateOfInterest: '',
  investmentDate: '', maturityDate: '', amountInvested: '', maturityValue: '', notes: ''
};

// Add/edit modal. `initial` = existing investment to edit, or null to create.
export default function InvestmentForm({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    initial
      ? Object.fromEntries(Object.keys(EMPTY).map(k => [k, initial[k] ?? '']))
      : EMPTY
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const isShares = form.type === 'SHARES';
  const isBank = form.type === 'BANK_BALANCE';
  // A bank account is a single balance — keep invested and value in lock-step so
  // it always shows a clean 0% gain and never double-counts.
  const setBalance = (e) => setForm(f => ({ ...f, amountInvested: e.target.value, maturityValue: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = initial
        ? await api.updateInvestment(initial.id, form)
        : await api.createInvestment(form);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{initial ? 'Edit Investment' : 'Add Investment'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">Type
              <select value={form.type} onChange={set('type')}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field">Holder
              <input value={form.holder} onChange={set('holder')} placeholder="e.g. Narendra" />
            </label>
            <label className="field full">{isBank ? 'Bank / Account Name' : 'Name of Investment'}
              <input value={form.name} onChange={set('name')} required placeholder="e.g. HDFC, UTI MF, SBI" />
            </label>
            {isBank ? (
              <label className="field full">Balance (₹)
                <input type="number" step="1" value={form.maturityValue} onChange={setBalance} required />
              </label>
            ) : (
              <>
                <label className="field">Rate of Interest (%)
                  <input type="number" step="0.01" value={form.rateOfInterest} onChange={set('rateOfInterest')} />
                </label>
                <label className="field">Amount Invested (₹)
                  <input type="number" step="1" value={form.amountInvested} onChange={set('amountInvested')} required />
                </label>
                <label className="field">Investment Date
                  <input type="date" value={form.investmentDate} onChange={set('investmentDate')} />
                </label>
                <label className="field">Maturity Date
                  <input type="date" value={form.maturityDate} onChange={set('maturityDate')} />
                </label>
                <label className="field full">
                  {isShares ? 'Current Value (₹) — used until you add live holdings' : 'Maturity Value (₹) — entered manually'}
                  <input type="number" step="1" value={form.maturityValue} onChange={set('maturityValue')} />
                </label>
              </>
            )}
            <label className="field full">Notes{isBank ? ' (e.g. account number)' : ''}
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
