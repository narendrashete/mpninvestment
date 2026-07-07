import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

// Add-holding modal for a SHARES platform: search mutual fund schemes via
// mfapi (AMFI) or stocks via Yahoo, pick one, enter units.
export default function HoldingForm({ investmentId, onClose, onSaved }) {
  const [kind, setKind] = useState('MF');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [units, setUnits] = useState('');
  const [investedAmount, setInvestedAmount] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const debounce = useRef(null);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (query.trim().length < 3 || selected) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = kind === 'MF' ? await api.searchMf(query) : await api.searchStock(query);
        setResults(res);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(debounce.current);
  }, [query, kind, selected]);

  const pick = (r) => {
    setSelected(r);
    setQuery(kind === 'MF' ? r.schemeName : `${r.symbol} — ${r.name}`);
    setResults([]);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!selected) { setError('Search and select a scheme/stock first.'); return; }
    setSaving(true);
    setError(null);
    try {
      const saved = await api.createHolding({
        investmentId,
        kind,
        schemeCode: kind === 'MF' ? selected.schemeCode : undefined,
        symbol: kind === 'STOCK' ? selected.symbol : undefined,
        displayName: kind === 'MF' ? selected.schemeName : selected.name,
        units,
        investedAmount: investedAmount || null
      });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Add Holding</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field full">Instrument type
              <select value={kind} onChange={e => { setKind(e.target.value); setSelected(null); setQuery(''); }}>
                <option value="MF">Mutual Fund (NAV from AMFI)</option>
                <option value="STOCK">Stock / ETF (price from Yahoo Finance)</option>
              </select>
            </label>
            <label className="field full">
              {kind === 'MF' ? 'Search scheme name (exactly as shown in your AMC portal/app)' : 'Search company name or NSE symbol'}
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setSelected(null); }}
                placeholder={kind === 'MF' ? 'e.g. Parag Parikh Flexi Cap Direct Growth' : 'e.g. RELIANCE or Tata Motors'}
                autoFocus
              />
              {searching && <span className="muted" style={{ fontSize: 12 }}>Searching…</span>}
              {results.length > 0 && (
                <div className="search-results">
                  {results.map(r => (
                    <div className="item" key={r.schemeCode || r.symbol} onClick={() => pick(r)}>
                      {kind === 'MF'
                        ? <>{r.schemeName} <span className="muted">({r.schemeCode})</span></>
                        : <><strong>{r.symbol}</strong> — {r.name} <span className="muted">({r.exchange})</span></>}
                    </div>
                  ))}
                </div>
              )}
            </label>
            <label className="field">Units held
              <input type="number" step="any" min="0" value={units} onChange={e => setUnits(e.target.value)} required />
            </label>
            <label className="field">Amount invested (₹, optional)
              <input type="number" step="1" value={investedAmount} onChange={e => setInvestedAmount(e.target.value)} />
            </label>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !selected}>
              {saving ? 'Adding…' : 'Add & fetch price'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
