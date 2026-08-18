import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import {
  formatINR, formatDate, daysLeftClass, daysLeftLabel,
  VEHICLE_CLASS_LABELS, VEHICLE_POLICY_TYPE_LABELS
} from '../lib/format.js';
import VehicleForm from '../components/VehicleForm.jsx';

export default function Vehicles() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [error, setError] = useState(null);
  const [group, setGroup] = useState(null);
  const [holderFilter, setHolderFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);

  const load = useCallback(() => api.vehicles().then(setList).catch(err => setError(err.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.me().then(me => setGroup(me?.group)).catch(() => {}); }, []);

  const holders = useMemo(
    () => [...new Set(list.map(v => v.holder).filter(Boolean))].sort(),
    [list]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(v => {
      if (holderFilter && v.holder !== holderFilter) return false;
      if (classFilter && v.vehicleClass !== classFilter) return false;
      if (!q) return true;
      return `${v.registrationNo} ${v.make} ${v.model} ${v.activeInsurers.join(' ')}`.toLowerCase().includes(q);
    });
  }, [list, holderFilter, classFilter, search]);

  const totals = useMemo(() => ({
    activePolicies: filtered.reduce((a, v) => a + v.activePolicyCount, 0),
    idv: filtered.reduce((a, v) => a + (v.totalIdv || 0), 0),
    premium: filtered.reduce((a, v) => a + (v.premiumPaid || 0), 0)
  }), [filtered]);

  const filterLabels = useMemo(() => {
    const f = [];
    if (holderFilter) f.push(`Holder: ${holderFilter}`);
    if (classFilter) f.push(`Type: ${VEHICLE_CLASS_LABELS[classFilter] || classFilter}`);
    if (search.trim()) f.push(`Search: "${search.trim()}"`);
    return f;
  }, [holderFilter, classFilter, search]);

  const runExport = async (kind) => {
    setExporting(kind);
    setExportError(null);
    try {
      const opts = { rows: filtered, group, filters: filterLabels };
      if (kind === 'excel') {
        const { downloadVehiclesExcel } = await import('../lib/exportExcel.js');
        await downloadVehiclesExcel(opts);
      } else {
        const { downloadVehiclesPdf } = await import('../lib/exportPdf.js');
        downloadVehiclesPdf(opts);
      }
    } catch (err) {
      setExportError(`Export failed: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <>
      <div className="page-title">
        <h1>Vehicles</h1>
        <p className="muted">
          Vehicles and their motor insurance. A vehicle can carry more than one policy at once —
          a standalone own-damage cover and a separate multi-year third-party policy, often from
          different insurers. Tracked separately: never counted in the Dashboard or Investments totals.
        </p>
      </div>

      {exportError && <div className="error-banner">{exportError}</div>}

      <div className="toolbar">
        <select value={holderFilter} onChange={e => setHolderFilter(e.target.value)}>
          <option value="">All holders</option>
          {holders.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select value={classFilter} onChange={e => setClassFilter(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(VEHICLE_CLASS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input
          placeholder="Search registration, make, model, insurer…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {filtered.length} vehicle{filtered.length === 1 ? '' : 's'} · {totals.activePolicies} active
          {' '}polic{totals.activePolicies === 1 ? 'y' : 'ies'} · IDV {formatINR(totals.idv)} · premium {formatINR(totals.premium)}
        </span>
        <button
          className="btn btn-sm"
          onClick={() => runExport('excel')}
          disabled={!filtered.length || exporting != null}
          title="Download these vehicles and their policies as an Excel workbook"
        >
          {exporting === 'excel' ? 'Preparing…' : '⤓ Excel'}
        </button>
        <button
          className="btn btn-sm"
          onClick={() => runExport('pdf')}
          disabled={!filtered.length || exporting != null}
          title="Download a one-page vehicle insurance reckoner"
        >
          {exporting === 'pdf' ? 'Preparing…' : '⤓ PDF'}
        </button>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Vehicle</button>
      </div>

      <div className="card table-cards" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Registration No.</th>
              <th>Vehicle</th>
              <th>Type</th>
              <th>Holder</th>
              <th>Active Cover</th>
              <th className="num">Total IDV</th>
              <th className="num">Premium</th>
              <th>Next Expiry</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="empty">No vehicles match.</td></tr>
            ) : filtered.map(v => (
              <tr key={v.id} className="clickable" onClick={() => navigate(`/vehicles/${v.id}`)}>
                <td data-label="Registration No."><strong>{v.registrationNo}</strong></td>
                <td data-label="Vehicle">
                  {v.make || v.model ? `${v.make || ''} ${v.model || ''}`.trim() : '—'}
                  {(v.yearOfManufacture || v.fuelType) && (
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {[v.yearOfManufacture, v.fuelType].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </td>
                <td data-label="Type">{VEHICLE_CLASS_LABELS[v.vehicleClass] || v.vehicleClass}</td>
                <td data-label="Holder">{v.holder || '—'}</td>
                <td data-label="Active Cover">
                  {v.activePolicyCount === 0 ? (
                    <span className="badge badge-overdue">No active cover</span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {v.activePolicyTypes.map(t => (
                        <span key={t} className="badge badge-type">
                          {VEHICLE_POLICY_TYPE_LABELS[t] || t}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="num" data-label="Total IDV">{formatINR(v.totalIdv)}</td>
                <td className="num" data-label="Premium">{formatINR(v.premiumPaid)}</td>
                <td data-label="Next Expiry">
                  {formatDate(v.nextExpiryDate)}
                  {v.daysToExpiry != null && (
                    <> <span className={`badge ${daysLeftClass(v.daysToExpiry)}`}>{daysLeftLabel(v.daysToExpiry)}</span></>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <VehicleForm
          initial={null}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </>
  );
}
