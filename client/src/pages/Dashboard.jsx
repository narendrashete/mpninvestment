import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatINR, formatPct, formatDate, typeLabel, daysLeftClass, daysLeftLabel } from '../lib/format.js';

const EyeIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.53 18.53 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.53 18.53 0 0 1-2.16 3.19" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <path d="M1 1l22 22" />
  </svg>
);

// Hides a sensitive figure behind dots until its own eye icon is clicked —
// each instance toggles independently, nothing is shared across figures.
function MaskedValue({ children }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="masked-value">
      {visible ? children : <span className="masked-dots">••••••</span>}
      <button
        type="button"
        className="icon-btn eye-btn"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide amount' : 'Show amount'}
        title={visible ? 'Hide amount' : 'Show amount'}
      >
        {visible ? EyeOffIcon : EyeIcon}
      </button>
    </span>
  );
}

function MaturityRow({ inv }) {
  const navigate = useNavigate();
  return (
    <tr className="clickable" onClick={() => navigate(`/investments/${inv.id}`)}>
      <td data-label="Instrument">
        <strong>{inv.name}</strong>
        <div className="muted" style={{ fontSize: 12.5 }}>{typeLabel(inv.type)} · {inv.holder}</div>
      </td>
      <td data-label="Maturity">{formatDate(inv.maturityDate)}</td>
      <td data-label="Due"><span className={`badge ${daysLeftClass(inv.daysToMaturity)}`}>{daysLeftLabel(inv.daysToMaturity)}</span></td>
      <td className="num" data-label="Maturity Value">{formatINR(inv.currentValue)}</td>
    </tr>
  );
}

function HolderBreakdownModal({ holder, onClose }) {
  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ margin: 0 }}>{holder.holder}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="table-cards" style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Category</th><th className="num">Invested</th><th className="num">Value</th><th className="num">ROI</th></tr></thead>
            <tbody>
              {holder.categories.map(c => (
                <tr key={c.type}>
                  <td data-label="Category">{typeLabel(c.type)} <span className="muted">({c.count})</span></td>
                  <td className="num" data-label="Invested">{formatINR(c.invested)}</td>
                  <td className="num" data-label="Value">{formatINR(c.value)}</td>
                  <td className={`num ${c.simpleReturn >= 0 ? 'pos' : 'neg'}`} data-label="ROI">{formatPct(c.simpleReturn)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td data-label="Total">Total ({holder.count})</td>
                <td className="num" data-label="Invested">{formatINR(holder.invested)}</td>
                <td className="num" data-label="Value">{formatINR(holder.value)}</td>
                <td className={`num ${holder.simpleReturn >= 0 ? 'pos' : 'neg'}`} data-label="ROI">{formatPct(holder.simpleReturn)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function PerformerRow({ inv }) {
  const navigate = useNavigate();
  const cls = inv.roi >= 0 ? 'pos' : 'neg';
  return (
    <tr className="clickable" onClick={() => navigate(`/investments/${inv.id}`)}>
      <td data-label="Instrument">
        <strong>{inv.name}</strong>
        <div className="muted" style={{ fontSize: 12.5 }}>{typeLabel(inv.type)} · {inv.holder}</div>
      </td>
      <td className="num" data-label="Invested">{formatINR(inv.amountInvested)}</td>
      <td className={`num ${cls}`} data-label="ROI">
        {formatPct(inv.roi)}{inv.roiIsAnnualized ? <span className="muted"> p.a.</span> : ''}
      </td>
    </tr>
  );
}

function HoldingPerformerRow({ h }) {
  const navigate = useNavigate();
  const cls = h.simpleReturn >= 0 ? 'pos' : 'neg';
  return (
    <tr className="clickable" onClick={() => navigate(`/investments/${h.investmentId}`)}>
      <td data-label="Name">
        <strong>{h.name}</strong>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {h.platform}{h.holder ? ` · ${h.holder}` : ''}
        </div>
      </td>
      <td className="num" data-label="Invested">{formatINR(h.investedAmount)}</td>
      <td className={`num ${cls}`} data-label="Return">{formatPct(h.simpleReturn)}</td>
    </tr>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [windowDays, setWindowDays] = useState(null);
  const [holderDetail, setHolderDetail] = useState(null);

  const load = useCallback(async (days) => {
    try {
      setData(await api.dashboard(days));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    // Render immediately from cached prices, then refresh live prices in the
    // background and reload only if any actually changed. (Blocking the first
    // paint on a full price refresh is what used to make this take minutes.)
    load();
    setRefreshing(true);
    api.refreshPrices()
      .then(r => { if (r.refreshed && r.updated > 0) return load(); })
      .catch(() => {})
      .finally(() => setRefreshing(false));
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

  const { totals, maturingSoon, overdue, best, worst, byCategory, byHolder, topHoldings } = data;
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
        <a className="btn btn-sm" href="/docs/InvestTrack-User-Guide.pdf" target="_blank" rel="noreferrer">
          📄 User Guide
        </a>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="grid grid-cards" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="label">Total Invested</div>
          <div className="value"><MaskedValue>{formatINR(totals.invested)}</MaskedValue></div>
          <div className="sub muted">{totals.count} instruments</div>
        </div>
        <div className="card stat">
          <div className="label">Current / Maturity Value</div>
          <div className="value"><MaskedValue>{formatINR(totals.value)}</MaskedValue></div>
        </div>
        <div className="card stat">
          <div className="label">Overall Gain</div>
          <div className={`value ${gainCls}`}><MaskedValue>{formatINR(totals.gain)}</MaskedValue></div>
          <div className={`sub ${gainCls}`}>{formatPct(totals.simpleReturn)}</div>
        </div>
        {byHolder.map(h => (
          <div className="card stat" key={h.holder}>
            <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {h.holder}
              <button
                type="button"
                className="icon-btn"
                title={`${h.holder}'s category breakdown`}
                aria-label={`${h.holder}'s category breakdown`}
                onClick={() => setHolderDetail(h)}
              >+</button>
            </div>
            <div className="value" style={{ fontSize: 19 }}><MaskedValue>{formatINR(h.value)}</MaskedValue></div>
            <div className={`sub ${h.gain >= 0 ? 'pos' : 'neg'}`}>
              {formatINR(h.gain)} ({formatPct(h.simpleReturn)})
            </div>
          </div>
        ))}
      </div>

      {holderDetail && <HolderBreakdownModal holder={holderDetail} onClose={() => setHolderDetail(null)} />}

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
              <div className="table-cards">
                <table>
                  <thead><tr><th>Instrument</th><th>Maturity</th><th>Due</th><th className="num">Maturity Value</th></tr></thead>
                  <tbody>{maturingSoon.map(i => <MaturityRow key={i.id} inv={i} />)}</tbody>
                </table>
              </div>
            )}

          {overdue.length > 0 && (
            <>
              <h3 style={{ marginTop: 20 }}>Matured / Overdue</h3>
              <div className="table-cards">
                <table>
                  <tbody>{overdue.map(i => <MaturityRow key={i.id} inv={i} />)}</tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <h3>ROI by Category</h3>
            <div className="table-cards">
              <table>
                <thead><tr><th>Category</th><th className="num">Invested</th><th className="num">Value</th><th className="num">ROI</th></tr></thead>
                <tbody>
                  {byCategory.map(c => (
                    <tr key={c.type}>
                      <td data-label="Category">{typeLabel(c.type)} <span className="muted">({c.count})</span></td>
                      <td className="num" data-label="Invested">{formatINR(c.invested)}</td>
                      <td className="num" data-label="Value">{formatINR(c.value)}</td>
                      <td className={`num ${c.simpleReturn >= 0 ? 'pos' : 'neg'}`} data-label="ROI">{formatPct(c.simpleReturn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3>Best Performers <span className="muted" style={{ textTransform: 'none' }}>(annualized where dated)</span></h3>
            <div className="table-cards">
              <table>
                <tbody>{best.map(i => <PerformerRow key={i.id} inv={i} />)}</tbody>
              </table>
            </div>
            <h3 style={{ marginTop: 18 }}>Worst Performers</h3>
            <div className="table-cards">
              <table>
                <tbody>{worst.map(i => <PerformerRow key={i.id} inv={i} />)}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {topHoldings && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Top 5 Comparison <span className="muted" style={{ textTransform: 'none' }}>(MF schemes vs Shares, by return)</span></h3>
          <div className="grid grid-2">
            <div>
              <h4 className="muted" style={{ margin: '0 0 8px' }}>Mutual Fund Schemes</h4>
              {topHoldings.MF.length === 0
                ? <p className="empty">No MF holdings with an invested amount yet.</p>
                : (
                  <div className="table-cards">
                    <table>
                      <tbody>{topHoldings.MF.map(h => <HoldingPerformerRow key={h.id} h={h} />)}</tbody>
                    </table>
                  </div>
                )}
            </div>
            <div>
              <h4 className="muted" style={{ margin: '0 0 8px' }}>Shares</h4>
              {topHoldings.STOCK.length === 0
                ? <p className="empty">No share holdings with an invested amount yet.</p>
                : (
                  <div className="table-cards">
                    <table>
                      <tbody>{topHoldings.STOCK.map(h => <HoldingPerformerRow key={h.id} h={h} />)}</tbody>
                    </table>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
