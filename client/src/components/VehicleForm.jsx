import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { VEHICLE_CLASS_LABELS, VEHICLE_STATUS_LABELS } from '../lib/format.js';

const EMPTY = {
  registrationNo: '', vehicleClass: 'CAR_4W', holder: '', make: '', model: '',
  yearOfManufacture: '', fuelType: '', rtoLocation: '', rtoCode: '', status: 'owned',
  // "More details" — everything below is on the RC/policy but rarely looked up.
  engineNo: '', chassisNo: '', cubicCapacity: '', seatingCapacity: '', bodyType: '',
  colour: '', zone: '', registrationDate: '', fastagId: '', notes: ''
};

const MORE_KEYS = [
  'engineNo', 'chassisNo', 'cubicCapacity', 'seatingCapacity', 'bodyType',
  'colour', 'zone', 'registrationDate', 'fastagId', 'notes'
];

// Add/edit modal. `initial` = existing vehicle to edit, or null to create.
export default function VehicleForm({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    initial
      ? Object.fromEntries(Object.keys(EMPTY).map(k => [k, initial[k] ?? '']))
      : EMPTY
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // Holder comes from the masters — new entries are added on the Masters page.
  const [masters, setMasters] = useState(null);

  useEffect(() => {
    api.masters()
      .then(m => setMasters({ holders: m.holders.map(h => h.value) }))
      .catch(err => setError(err.message));
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Open the extra block straight away when editing a vehicle that already
  // has any of it filled in, so those values aren't hidden behind a click.
  const moreFilled = MORE_KEYS.some(k => form[k] !== '' && form[k] != null);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = initial
        ? await api.updateVehicle(initial.id, form)
        : await api.createVehicle(form);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{initial ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">Registration No.
              <input value={form.registrationNo} onChange={set('registrationNo')} placeholder="e.g. MH05FP6134" required />
            </label>
            <label className="field">Vehicle Type
              <select value={form.vehicleClass} onChange={set('vehicleClass')} required>
                {Object.entries(VEHICLE_CLASS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field">Holder
              <select value={form.holder} onChange={set('holder')} required disabled={!masters}>
                <option value="">{masters ? '— select holder —' : 'Loading…'}</option>
                {(masters?.holders || []).map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
            <label className="field">Status
              <select value={form.status} onChange={set('status')}>
                {Object.entries(VEHICLE_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <p className="field full muted" style={{ margin: '-6px 0 0', fontSize: 12.5 }}>
              New holders are added on the <Link to="/masters" onClick={onClose}>Masters</Link> page.
            </p>
            <label className="field">Make
              <input value={form.make} onChange={set('make')} placeholder="e.g. Maruti Suzuki" />
            </label>
            <label className="field">Model / Variant
              <input value={form.model} onChange={set('model')} placeholder="e.g. XL6 ZETA CNG 1.5L SMT BS6" />
            </label>
            <label className="field">Year of Manufacture
              <input type="number" step="1" value={form.yearOfManufacture} onChange={set('yearOfManufacture')} />
            </label>
            <label className="field">Fuel Type
              <input value={form.fuelType} onChange={set('fuelType')} placeholder="e.g. CNG/Petrol" />
            </label>
            <label className="field">RTO Location
              <input value={form.rtoLocation} onChange={set('rtoLocation')} placeholder="e.g. KALYAN" />
            </label>
            <label className="field">RTO Code
              <input value={form.rtoCode} onChange={set('rtoCode')} placeholder="e.g. MH-05" />
            </label>
          </div>

          <details className="more-details" open={moreFilled}>
            <summary>More details</summary>
            <div className="form-grid">
              <label className="field">Engine No.
                <input value={form.engineNo} onChange={set('engineNo')} />
              </label>
              <label className="field">Chassis No. / VIN
                <input value={form.chassisNo} onChange={set('chassisNo')} />
              </label>
              <label className="field">Cubic Capacity (cc)
                <input type="number" step="1" value={form.cubicCapacity} onChange={set('cubicCapacity')} />
              </label>
              <label className="field">Seating Capacity
                <input type="number" step="1" value={form.seatingCapacity} onChange={set('seatingCapacity')} />
              </label>
              <label className="field">Type of Body
                <input value={form.bodyType} onChange={set('bodyType')} placeholder="e.g. MUV" />
              </label>
              <label className="field">Colour
                <input value={form.colour} onChange={set('colour')} />
              </label>
              <label className="field">Zone
                <input value={form.zone} onChange={set('zone')} placeholder="e.g. B" />
              </label>
              <label className="field">Registration Date
                <input type="date" value={form.registrationDate} onChange={set('registrationDate')} />
              </label>
              <label className="field">FASTag ID
                <input value={form.fastagId} onChange={set('fastagId')} />
              </label>
              <label className="field full">Notes
                <input value={form.notes} onChange={set('notes')} />
              </label>
            </div>
          </details>

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
