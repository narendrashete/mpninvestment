import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// One editable master list (holders or investment names). Entries in use can be
// renamed — which cascades to the investments — but not deleted.
function MasterList({ kind, title, placeholder, entries, onChanged, onError }) {
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState(null); // { from, to }
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    onError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const add = (e) => {
    e.preventDefault();
    const value = adding.trim();
    if (!value) return;
    run(async () => { await api.addMaster(kind, value); setAdding(''); });
  };

  const saveRename = (e) => {
    e.preventDefault();
    const { from, to } = editing;
    if (!to.trim()) return;
    run(async () => { await api.renameMaster(kind, from, to.trim()); setEditing(null); });
  };

  const remove = (value) => {
    if (!window.confirm(`Remove "${value}" from ${title}?`)) return;
    run(() => api.deleteMaster(kind, value));
  };

  return (
    <div className="card">
      <h3>{title} <span className="muted">({entries.length})</span></h3>

      <form onSubmit={add} className="toolbar" style={{ marginBottom: 14 }}>
        <input
          value={adding}
          onChange={e => setAdding(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1, minWidth: 160 }}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !adding.trim()}>Add</button>
      </form>

      <div className="table-cards">
        <table>
          <thead><tr><th>{title.replace(/s$/, '')}</th><th className="num">Used by</th><th></th></tr></thead>
          <tbody>
            {entries.map(({ value, inUse }) => (
              <tr key={value}>
                {editing?.from === value ? (
                  <td colSpan={3} data-label="">
                    <form onSubmit={saveRename} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        value={editing.to}
                        onChange={e => setEditing(s => ({ ...s, to: e.target.value }))}
                        autoFocus
                        style={{ flex: 1, minWidth: 140 }}
                      />
                      <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>Save</button>
                      <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td data-label={title.replace(/s$/, '')}><strong>{value}</strong></td>
                    <td className="num" data-label="Used by">
                      {inUse > 0
                        ? <span className="badge badge-type">{inUse}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }} data-label="">
                      <button className="btn btn-sm" onClick={() => setEditing({ from: value, to: value })}>Rename</button>{' '}
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => remove(value)}
                        disabled={inUse > 0}
                        title={inUse > 0 ? 'In use — reassign those investments first' : 'Remove'}
                      >✕</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={3} className="empty">Nothing here yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Masters() {
  const [masters, setMasters] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(
    () => api.masters().then(setMasters).catch(err => setError(err.message)),
    []
  );
  useEffect(() => { load(); }, [load]);

  if (!masters && error) return <div className="error-banner">{error}</div>;
  if (!masters) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-title">
        <h1>Masters</h1>
        <span className="muted" style={{ fontSize: 13.5 }}>
          The only place new holders and investment names are created — the Add Investment
          form picks from these lists. Renaming updates every investment using the old value.
        </span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="grid grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <MasterList
          kind="holders"
          title="Holders"
          placeholder="New holder name"
          entries={masters.holders}
          onChanged={load}
          onError={setError}
        />
        <MasterList
          kind="investmentNames"
          title="Investment Names"
          placeholder="New investment name"
          entries={masters.investmentNames}
          onChanged={load}
          onError={setError}
        />
        <MasterList
          kind="licPlans"
          title="LIC Plan Names"
          placeholder="New LIC plan name"
          entries={masters.licPlans}
          onChanged={load}
          onError={setError}
        />
        <MasterList
          kind="vehicleInsurers"
          title="Vehicle Insurers"
          placeholder="New motor insurer"
          entries={masters.vehicleInsurers}
          onChanged={load}
          onError={setError}
        />
      </div>
    </>
  );
}
