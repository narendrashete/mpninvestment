import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatINR, formatPct, formatDate, typeLabel, daysLeftClass, daysLeftLabel } from '../lib/format.js';

function MaturityRow({ inv }) {
  const navigate = useNavigate();
  return (
    <tr className="clickable" onClick={() => navigate(`/investments/${inv.id}`)}>
      <td>
        <strong>{inv.name}</strong>
        <div className="muted" style={{ fontSize: 12.5 }}>{typeLabel(inv.type)} · {inv.holder}</div>
      </td>
      <td>{formatDate(inv.maturityDate)}</td>
      <td><span className={`badge ${daysLeftClass(inv.daysToMaturity)}`}>{daysLeftLabel(inv.daysToMaturity)}</span></td>
      <td className="num">{formatINR(inv.currentValue)}</td>
    </tr>
  );
}

function PerformerRow({ inv }) {
  const navigate = useNavigate();
  const cls = inv.roi >= 0 ? 'pos' : 'neg';
  return (
    <tr className="clickable" onClick={() => navigate(`/investments/${inv.id}`)}>
      <td>
        <strong>{inv.name}</strong>
        <div className="muted" style={{ fontSize: 12.5 }}>{typeLabel(inv.type)} · {inv.holder}</div>
      </td>
      <td className="num">{formatINR(inv.amountInvested)}</td>
      <td className={`num ${cls}`}>
        {formatPct(inv.roi)}{inv.roiIsAnnualized ? <span className="muted"> p.a.</span> : ''}
      </td>
    </tr>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [windowDays, setWindowDays] = useState(null);

  const load = useCallback(async (days) => {
    try {
      setData(await api.dashboard(days));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    // auto-refresh live prices (server throttles to 15 min), then load
    api.refreshPrices().catch(() => {}).finally(() => load());
  }, [load]);

  const changeWindow = async (days) => {
    setWindowDays(days);
    await api.updateSettings({ maturityWindowDays: days }).catch(() => {});
    load(days);
  };

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      const r = await api.refreshPrices(true);
      if (r.failed?.length) setError(`Some prices failed to refresh: ${r.failed.join('; ')}`);
      await load(windowDays);
    } catch (err) {
      setError(`Price refresh failed: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  if (!data && !error) return <p className="muted">Loading…</p>;
  if (!data) return <div className="error-banner">{error}</div>;

  const { totals, maturingSoon, overdue, best, worst, byCategory, byHolder } = data;
  const gainCls = totals.gain >= 0 ? 'pos' : 'neg';

  return (
    <>
      <div className="page-title">
        <h1>Dashboard</h1>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 13 }}>
          Prices updated: {data.lastPriceRefresh ? new Date(data.lastPriceRefresh).toLocaleString('en-IN') : 'never'}
        </span>
        <button className="btn btn-sm" onClick={refreshNow} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : '↻ Refresh prices'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="grid grid-cards" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="label">Total Invested</div>
          <div className="value">{formatINR(totals.invested)}</div>
          <div className="sub muted">{totals.count} instruments</div>
        </div>
        <div className="card stat">
          <div className="label">Current / Maturity Value</div>
          <div className="value">{formatINR(totals.value)}</div>
        </div>
        <div className="card stat">
          <div className="label">Overall Gain</div>
          <div className={`value ${gainCls}`}>{formatINR(totals.gain)}</div>
          <div className={`sub ${gainCls}`}>{formatPct(totals.simpleReturn)}</div>
        </div>
        {byHolder.map(h => (
          <div className="card stat" key={h.holder}>
            <div className="label">{h.holder}</div>
            <div className="value" style={{ fontSize: 19 }}>{formatINR(h.value)}</div>
            <div className={`sub ${h.gain >= 0 ? 'pos' : 'neg'}`}>
              {formatINR(h.gain)} ({formatPct(h.simpleReturn)})
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center' }}>
            Maturing within
            <select
              value={windowDays ?? data.windowDays}
              onChange={e => changeWindow(Number(e.target.value))}
              style={{ margin: '0 8px', padding: '3px 6px', fontSize: 13 }}
            >
              {[15, 30, 60, 90, 180].map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </h3>
          {maturingSoon.length === 0
            ? <p className="empty">Nothing maturing in the next {windowDays ?? data.windowDays} days.</p>
            : (
              <table>
                <thead><tr><th>Instrument</th><th>Maturity</th><th>Due</th><th className="num">Maturity Value</th></tr></thead>
                <tbody>{maturingSoon.map(i => <MaturityRow key={i.id} inv={i} />)}</tbody>
              </table>
            )}

          {overdue.length > 0 && (
            <>
              <h3 style={{ marginTop: 20 }}>Matured / Overdue</h3>
              <table>
                <tbody>{overdue.map(i => <MaturityRow key={i.id} inv={i} />)}</tbody>
              </table>
            </>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <h3>ROI by Category</h3>
            <table>
              <thead><tr><th>Category</th><th className="num">Invested</th><th className="num">Value</th><th className="num">ROI</th></tr></thead>
              <tbody>
                {byCategory.map(c => (
                  <tr key={c.type}>
                    <td>{typeLabel(c.type)} <span className="muted">({c.count})</span></td>
                    <td className="num">{formatINR(c.invested)}</td>
                    <td className="num">{formatINR(c.value)}</td>
                    <td className={`num ${c.simpleReturn >= 0 ? 'pos' : 'neg'}`}>{formatPct(c.simpleReturn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Best Performers <span className="muted" style={{ textTransform: 'none' }}>(annualized where dated)</span></h3>
            <table>
              <tbody>{best.map(i => <PerformerRow key={i.id} inv={i} />)}</tbody>
            </table>
            <h3 style={{ marginTop: 18 }}>Worst Performers</h3>
            <table>
              <tbody>{worst.map(i => <PerformerRow key={i.id} inv={i} />)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
