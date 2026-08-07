import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatPct, formatDate } from '../lib/format.js';

const PLAN_LABELS = { DIRECT: 'Direct', REGULAR: 'Regular' };
const OPTION_LABELS = { GROWTH: 'Growth', IDCW: 'IDCW' };

// Benchmarks one held MF scheme against the rest of its AMFI category. The first
// load for a category is slow (the server has to pull each peer's NAV history),
// so the loading copy says so rather than looking hung.
export default function CompareModal({ holding, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    api.compareHolding(holding.id)
      .then(d => { if (live) setData(d); })
      .catch(err => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [holding.id]);

  const heldName = holding.displayName || holding.schemeCode;

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0 }}>{data ? data.category : 'Category comparison'}</h2>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              {data
                ? `${PLAN_LABELS[data.plan] || data.plan} · ${OPTION_LABELS[data.option] || data.option} · ranked by 1-year return`
                : heldName}
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {!data && !error && (
          <p className="muted">
            Building this category's benchmark from AMFI data — this can take up to a minute the
            first time, then it's cached for the rest of the day.
          </p>
        )}

        {data && data.top.length === 0 && (
          <p className="empty">
            No peer schemes with a full year of NAV history were found in this category.
          </p>
        )}

        {data && data.top.length > 0 && (
          <>
            <div className="table-cards" style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th className="num">#</th><th>Scheme</th>
                    <th className="num">NAV</th><th className="num">1Y Return</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top.map((s, i) => (
                    <tr key={s.schemeCode} style={s.isYours ? { fontWeight: 700 } : undefined}>
                      <td className="num" data-label="#">{i + 1}</td>
                      <td data-label="Scheme">
                        {s.schemeName}
                        {s.isYours && <span className="badge badge-type" style={{ marginLeft: 6 }}>Yours</span>}
                        <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
                          AMFI code {s.schemeCode}{s.navDate ? ` · as of ${formatDate(s.navDate)}` : ''}
                        </div>
                      </td>
                      <td className="num" data-label="NAV">
                        {s.nav != null ? s.nav.toLocaleString('en-IN', { maximumFractionDigits: 4 }) : '—'}
                      </td>
                      <td className={`num ${s.oneYearReturn >= 0 ? 'pos' : 'neg'}`} data-label="1Y Return">
                        {formatPct(s.oneYearReturn)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="muted" style={{ fontSize: 13, marginTop: 14, marginBottom: 0 }}>
              {data.yourScheme.rank
                ? <>Your scheme ranks <strong>#{data.yourScheme.rank}</strong> of {data.totalInCategory} in this category at {formatPct(data.yourScheme.oneYearReturn)}.</>
                : <>Your scheme isn't ranked here — it needs a full year of NAV history to be comparable. {data.totalInCategory} peer schemes were ranked.</>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
