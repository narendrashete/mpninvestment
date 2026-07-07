import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatINR, formatPct, formatDate, typeLabel, daysLeftClass, daysLeftLabel } from '../lib/format.js';
import InvestmentForm from '../components/InvestmentForm.jsx';
import HoldingForm from '../components/HoldingForm.jsx';

export default function InvestmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [addingHolding, setAddingHolding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () => api.investment(id).then(setInv).catch(err => setError(err.message)),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!inv) return <p className="muted">Loading…</p>;

  const isShares = inv.type === 'SHARES';
  const gain = inv.currentValue != null && inv.amountInvested != null
    ? inv.currentValue - inv.amountInvested : null;

  const del = async () => {
    if (!window.confirm(`Delete "${inv.name}" (${typeLabel(inv.type)}, ${inv.holder})? This cannot be undone.`)) return;
    await api.deleteInvestment(inv.id);
    navigate('/investments');
  };

  const delHolding = async (h) => {
    if (!window.confirm(`Remove holding "${h.displayName || h.symbol || h.schemeCode}"?`)) return;
    await api.deleteHolding(h.id);
    load();
  };

  const editUnits = async (h) => {
    const val = window.prompt(`Units held for ${h.displayName || h.symbol}:`, h.units);
    if (val == null || val === '') return;
    try {
      await api.updateHolding(h.id, { units: val });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const refreshPrices = async () => {
    setRefreshing(true);
    try {
      await api.refreshPrices(true);
      await load();
    } catch (err) {
      setError(`Refresh failed: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <p style={{ margin: '0 0 10px' }}><Link to="/investments">← All investments</Link></p>

      <div className="detail-header">
        <h1>{inv.name}</h1>
        <span className="badge badge-type">{typeLabel(inv.type)}</span>
        {inv.daysToMaturity != null && inv.type !== 'BANK_BALANCE' && (
          <span className={`badge ${daysLeftClass(inv.daysToMaturity)}`}>{daysLeftLabel(inv.daysToMaturity)}</span>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => setEditing(true)}>Edit</button>
        <button className="btn btn-danger" onClick={del}>Delete</button>
      </div>
      <p className="muted" style={{ margin: '0 0 18px' }}>Holder: {inv.holder || '—'}</p>

      <div className="grid grid-cards" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="label">Amount Invested</div>
          <div className="value">{formatINR(inv.amountInvested)}</div>
        </div>
        <div className="card stat">
          <div className="label">{isShares ? (inv.hasLiveHoldings ? 'Live Value' : 'Current Value (manual)') : 'Maturity Value'}</div>
          <div className="value">{formatINR(inv.currentValue)}</div>
        </div>
        <div className="card stat">
          <div className="label">Gain</div>
          <div className={`value ${gain >= 0 ? 'pos' : 'neg'}`}>{formatINR(gain)}</div>
          <div className={`sub ${gain >= 0 ? 'pos' : 'neg'}`}>{formatPct(inv.simpleReturn)}</div>
        </div>
        <div className="card stat">
          <div className="label">Annualized Return</div>
          <div className="value">{inv.annualizedReturn != null ? `${formatPct(inv.annualizedReturn)} p.a.` : '—'}</div>
        </div>
      </div>

      <div className="card">
        <h3>Details</h3>
        <dl className="kv">
          <dt>Rate of Interest</dt><dd>{inv.rateOfInterest != null ? `${inv.rateOfInterest}%` : '—'}</dd>
          <dt>Investment Date</dt><dd>{formatDate(inv.investmentDate)}</dd>
          <dt>Maturity Date</dt><dd>{formatDate(inv.maturityDate)}</dd>
          <dt>Notes</dt><dd>{inv.notes || '—'}</dd>
        </dl>
      </div>

      {isShares && (
        <>
          <div className="section-title">
            <h2>Holdings {inv.holdings.length > 0 && <span className="muted">({inv.holdings.length})</span>}</h2>
            <div style={{ display: 'flex', gap: 10 }}>
              {inv.holdings.length > 0 && (
                <button className="btn" onClick={refreshPrices} disabled={refreshing}>
                  {refreshing ? 'Refreshing…' : '↻ Refresh prices'}
                </button>
              )}
              <button className="btn btn-primary" onClick={() => setAddingHolding(true)}>+ Add Holding</button>
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            {inv.holdings.length === 0 ? (
              <p className="empty">
                No live holdings yet — the manual current value ({formatINR(inv.maturityValue)}) is used.<br />
                Add each scheme/stock with its units to track live value automatically.
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Scheme / Stock</th><th className="num">Units</th>
                    <th className="num">Last Price/NAV</th><th>As Of</th>
                    <th className="num">Value</th><th className="num">Invested</th><th className="num">Gain</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {inv.holdings.map(h => {
                    const value = (h.units || 0) * (h.lastPrice || 0);
                    const hGain = h.investedAmount ? value - h.investedAmount : null;
                    return (
                      <tr key={h.id}>
                        <td>
                          <strong>{h.displayName || h.symbol || h.schemeCode}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {h.kind === 'MF' ? `AMFI code ${h.schemeCode}` : h.symbol}
                            {h.isin ? ` · ISIN ${h.isin}` : ''}
                          </div>
                        </td>
                        <td className="num">{h.units}</td>
                        <td className="num">{h.lastPrice != null ? h.lastPrice.toLocaleString('en-IN', { maximumFractionDigits: 4 }) : '—'}</td>
                        <td>{formatDate(h.lastPriceDate)}</td>
                        <td className="num"><strong>{formatINR(value)}</strong></td>
                        <td className="num">{formatINR(h.investedAmount)}</td>
                        <td className={`num ${hGain == null ? '' : hGain >= 0 ? 'pos' : 'neg'}`}>{formatINR(hGain)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-sm" onClick={() => editUnits(h)}>Units</button>{' '}
                          <button className="btn btn-sm btn-danger" onClick={() => delHolding(h)}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {editing && (
        <InvestmentForm
          initial={inv}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
        />
      )}
      {addingHolding && (
        <HoldingForm
          investmentId={inv.id}
          onClose={() => setAddingHolding(false)}
          onSaved={() => { setAddingHolding(false); load(); }}
        />
      )}
    </>
  );
}
