import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatINR, formatPct, formatDate, typeLabel } from '../lib/format.js';

// Details of one closed instrument, opened by clicking its row. Everything about
// where the money went lives here, so the figures never touch the dashboard.
function ClosedDetailModal({ inv, mode, onClose }) {
  const linked = mode === 'redeemed' ? inv.creditedTo : inv.renewedInto;
  const gain = inv.currentValue != null && inv.amountInvested != null
    ? inv.currentValue - inv.amountInvested : null;

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{inv.name}</h2>
          <span className="badge badge-type">{typeLabel(inv.type)}</span>
          <span className="badge badge-overdue">{mode === 'redeemed' ? 'Redeemed' : 'Renewed'}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <dl className="kv">
          <dt>Holder</dt><dd>{inv.holder || '—'}</dd>
          <dt>Rate of Interest</dt><dd>{inv.rateOfInterest != null ? `${inv.rateOfInterest}%` : '—'}</dd>
          <dt>Invested On</dt><dd>{formatDate(inv.investmentDate)}</dd>
          <dt>Maturity Date</dt><dd>{formatDate(inv.maturityDate)}</dd>
          <dt>Amount Invested</dt><dd>{formatINR(inv.amountInvested)}</dd>
          <dt>Maturity Value</dt><dd>{formatINR(inv.maturityValue)}</dd>
          <dt>Gain</dt>
          <dd className={gain == null ? '' : gain >= 0 ? 'pos' : 'neg'}>
            {formatINR(gain)}{inv.simpleReturn != null ? ` (${formatPct(inv.simpleReturn)})` : ''}
          </dd>
          {mode === 'redeemed' ? (
            <>
              <dt>Redeemed On</dt><dd>{formatDate(inv.redeemedOn)}</dd>
              <dt>Amount Received</dt><dd><strong>{formatINR(inv.redeemedAmount)}</strong></dd>
              <dt>Credited To</dt>
              <dd>
                {linked
                  ? <Link to={`/investments/${linked.id}`}>{linked.name}{linked.holder ? ` · ${linked.holder}` : ''}</Link>
                  : <span className="muted">Not credited to any tracked account</span>}
              </dd>
            </>
          ) : (
            <>
              <dt>Renewed On</dt><dd>{formatDate(inv.renewedOn)}</dd>
              <dt>Renewed Into</dt>
              <dd>
                {linked
                  ? <Link to={`/investments/${linked.id}`}>{linked.name}</Link>
                  : <span className="muted">Linked FD no longer exists</span>}
              </dd>
              {linked && (
                <>
                  <dt>New Principal</dt><dd><strong>{formatINR(linked.amountInvested)}</strong></dd>
                  <dt>New Rate</dt><dd>{linked.rateOfInterest != null ? `${linked.rateOfInterest}%` : '—'}</dd>
                  <dt>New Maturity</dt>
                  <dd>{formatDate(linked.maturityDate)}{linked.maturityValue != null ? ` · ${formatINR(linked.maturityValue)}` : ''}</dd>
                </>
              )}
            </>
          )}
          <dt>Notes</dt><dd>{inv.notes || '—'}</dd>
        </dl>

        <div className="actions">
          <Link className="btn" to={`/investments/${inv.id}`}>Open full record</Link>
          <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Closed() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('redeemed');
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    api.closed().then(setData).catch(err => setError(err.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const { redeemed, renewed, totals } = data;
  const rows = tab === 'redeemed' ? redeemed : renewed;

  return (
    <>
      <div className="page-title">
        <h1>Redeemed / Renewed</h1>
        <span className="muted" style={{ fontSize: 13.5 }}>
          Closed records only. These amounts are excluded from the dashboard — the money
          now sits in the bank account it was credited to, or in the renewed FD.
        </span>
      </div>

      <div className="subtabs">
        <button className={tab === 'redeemed' ? 'active' : ''} onClick={() => setTab('redeemed')}>
          Redeemed <span className="muted">({totals.redeemedCount})</span>
        </button>
        <button className={tab === 'renewed' ? 'active' : ''} onClick={() => setTab('renewed')}>
          Renewed <span className="muted">({totals.renewedCount})</span>
        </button>
      </div>

      <div className="grid grid-cards" style={{ marginBottom: 16 }}>
        {tab === 'redeemed' ? (
          <>
            <div className="card stat">
              <div className="label">Redeemed Principal</div>
              <div className="value">{formatINR(totals.redeemedPrincipal)}</div>
              <div className="sub muted">{totals.redeemedCount} instruments closed</div>
            </div>
            <div className="card stat">
              <div className="label">Proceeds Received</div>
              <div className="value">{formatINR(totals.redeemedProceeds)}</div>
            </div>
            <div className="card stat">
              <div className="label">Gain Realised</div>
              <div className={`value ${totals.redeemedProceeds - totals.redeemedPrincipal >= 0 ? 'pos' : 'neg'}`}>
                {formatINR(totals.redeemedProceeds - totals.redeemedPrincipal)}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="card stat">
              <div className="label">Renewed Principal</div>
              <div className="value">{formatINR(totals.renewedPrincipal)}</div>
              <div className="sub muted">{totals.renewedCount} FDs renewed</div>
            </div>
            <div className="card stat">
              <div className="label">Rolled Into New FDs</div>
              <div className="value">{formatINR(totals.renewedInto)}</div>
              <div className="sub muted">counted on the dashboard as the new FDs</div>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <p className="empty">Nothing {tab} yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th><th>Holder</th><th>Name</th>
                <th>{tab === 'redeemed' ? 'Redeemed On' : 'Renewed On'}</th>
                <th className="num">Invested</th>
                <th className="num">{tab === 'redeemed' ? 'Received' : 'New Principal'}</th>
                <th>{tab === 'redeemed' ? 'Credited To' : 'Renewed Into'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(inv => {
                const linked = tab === 'redeemed' ? inv.creditedTo : inv.renewedInto;
                return (
                  <tr key={inv.id} className="clickable" onClick={() => setDetail(inv)}>
                    <td><span className="badge badge-type">{typeLabel(inv.type)}</span></td>
                    <td>{inv.holder || '—'}</td>
                    <td><strong>{inv.name}</strong></td>
                    <td>{formatDate(tab === 'redeemed' ? inv.redeemedOn : inv.renewedOn)}</td>
                    <td className="num">{formatINR(inv.amountInvested)}</td>
                    <td className="num">
                      {formatINR(tab === 'redeemed' ? inv.redeemedAmount : linked?.amountInvested)}
                    </td>
                    <td>{linked ? linked.name : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {detail && <ClosedDetailModal inv={detail} mode={tab} onClose={() => setDetail(null)} />}
    </>
  );
}
