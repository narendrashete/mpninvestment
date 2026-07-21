import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatINR } from '../lib/format.js';

// Redeem a matured FD / Bank Share. The proceeds can be credited to a Bank
// Balance account (which then goes up by that amount), or left uncredited.
export default function RedeemForm({ inv, onClose, onSaved }) {
  const [amount, setAmount] = useState(inv.maturityValue ?? inv.amountInvested ?? '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [toAccountId, setToAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.investments({ type: 'BANK_BALANCE' })
      .then(list => setAccounts(list.filter(a => !a.closed)))
      .catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await api.redeemInvestment(inv.id, { amount, date, toAccountId: toAccountId || null });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const target = accounts.find(a => a.id === toAccountId);

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Redeem {inv.name}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">Amount received (₹)
              <input type="number" step="1" value={amount} onChange={e => setAmount(e.target.value)} required />
            </label>
            <label className="field">Redemption date
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </label>
            <label className="field full">Credit proceeds to
              <select value={toAccountId} onChange={e => setToAccountId(e.target.value)}>
                <option value="">— Don't credit any account —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.holder ? ` · ${a.holder}` : ''} (balance {formatINR(a.currentValue)})
                  </option>
                ))}
              </select>
            </label>
            {target && (
              <p className="muted full" style={{ margin: 0, fontSize: 13 }}>
                {target.name} balance becomes {formatINR((target.currentValue || 0) + Number(amount || 0))}.
              </p>
            )}
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Redeeming…' : 'Redeem'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
