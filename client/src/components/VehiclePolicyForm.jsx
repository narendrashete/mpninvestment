import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { VEHICLE_POLICY_TYPE_LABELS, VEHICLE_POLICY_STATUS_LABELS } from '../lib/format.js';

const EMPTY = {
  insurerName: '', policyNo: '', policyType: 'COMPREHENSIVE', status: 'active',
  startDate: '', endDate: '', idvTotal: '', grossPremium: '', ncbPercent: '',
  // "More details" — the rest of the schedule.
  uin: '', issuedOn: '', proposalNo: '', proposalDate: '', pointOfSale: '',
  idvVehicle: '', idvElectrical: '', idvNonElectrical: '', idvCngKit: '',
  basicPremium: '', addOnPremium: '', netOdPremium: '', netTpPremium: '',
  cgst: '', sgst: '', igst: '',
  compulsoryDeductible: '', voluntaryDeductible: '',
  financierType: '', financierName: '', financierBranch: '',
  paymentMode: '', paymentRefNo: '', paymentBank: '', paymentAmount: '', notes: ''
};

const MORE_KEYS = Object.keys(EMPTY).filter(k => ![
  'insurerName', 'policyNo', 'policyType', 'status', 'startDate', 'endDate',
  'idvTotal', 'grossPremium', 'ncbPercent'
].includes(k));

// Add/edit modal for one policy on a vehicle. `vehicleId` is a prop, never a
// form field — a policy can't be moved to a different car here.
export default function VehiclePolicyForm({ vehicleId, initial, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    initial
      ? Object.fromEntries(Object.keys(EMPTY).map(k => [k, initial[k] ?? '']))
      : EMPTY
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [masters, setMasters] = useState(null);

  useEffect(() => {
    api.masters()
      .then(m => setMasters({ insurers: m.vehicleInsurers.map(x => x.value) }))
      .catch(err => setError(err.message));
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const moreFilled = MORE_KEYS.some(k => form[k] !== '' && form[k] != null);
  // Masters loaded but nothing on the list yet — the select would otherwise
  // just sit empty with no clue why, which is exactly what leaves someone stuck.
  const noInsurers = masters != null && masters.insurers.length === 0;
  // A third-party-only policy insures no vehicle value, so the IDV block and
  // the own-damage add-ons don't apply to it.
  const isTpOnly = form.policyType === 'TP_ONLY';

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = initial
        ? await api.updateVehiclePolicy(vehicleId, initial.id, form)
        : await api.createVehiclePolicy(vehicleId, form);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{initial ? 'Edit Policy' : 'Add Policy'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">Insurer
              <select value={form.insurerName} onChange={set('insurerName')} required disabled={!masters || noInsurers}>
                <option value="">{!masters ? 'Loading…' : noInsurers ? 'No insurers on file yet' : '— select insurer —'}</option>
                {(masters?.insurers || []).map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label className="field">Policy Type
              <select value={form.policyType} onChange={set('policyType')} required>
                {Object.entries(VEHICLE_POLICY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {noInsurers ? (
              <p className="field full notice-banner" style={{ margin: '-6px 0 0' }}>
                No vehicle insurers on file yet, so there's nothing to pick — add one (e.g. "HDFC ERGO",
                "Reliance General Insurance") on the <Link to="/masters" onClick={onClose}>Masters page</Link>,
                then come back here to add this policy.
              </p>
            ) : (
              <p className="field full muted" style={{ margin: '-6px 0 0', fontSize: 12.5 }}>
                New insurers are added on the <Link to="/masters" onClick={onClose}>Masters</Link> page.
              </p>
            )}
            <label className="field">Policy No.
              <input value={form.policyNo} onChange={set('policyNo')} required />
            </label>
            <label className="field">Status
              <select value={form.status} onChange={set('status')}>
                {Object.entries(VEHICLE_POLICY_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field">Cover Starts
              <input type="date" value={form.startDate} onChange={set('startDate')} />
            </label>
            <label className="field">Cover Ends
              <input type="date" value={form.endDate} onChange={set('endDate')} />
            </label>
            {!isTpOnly && (
              <label className="field">Total IDV (₹)
                <input type="number" step="1" value={form.idvTotal} onChange={set('idvTotal')} />
              </label>
            )}
            <label className="field">Gross Premium (₹)
              <input type="number" step="0.01" value={form.grossPremium} onChange={set('grossPremium')} />
            </label>
            <label className="field">No Claim Bonus (%)
              <input type="number" step="1" value={form.ncbPercent} onChange={set('ncbPercent')} />
            </label>
          </div>

          <details className="more-details" open={moreFilled}>
            <summary>More details</summary>
            <div className="form-grid">
              <h4>Policy identity</h4>
              <label className="field">UIN
                <input value={form.uin} onChange={set('uin')} />
              </label>
              <label className="field">Policy Issued On
                <input type="date" value={form.issuedOn} onChange={set('issuedOn')} />
              </label>
              <label className="field">Proposal No.
                <input value={form.proposalNo} onChange={set('proposalNo')} />
              </label>
              <label className="field">Proposal Date
                <input type="date" value={form.proposalDate} onChange={set('proposalDate')} />
              </label>
              <label className="field full">Point of Sale
                <input value={form.pointOfSale} onChange={set('pointOfSale')} />
              </label>

              {!isTpOnly && <h4>Insured Declared Value</h4>}
              {!isTpOnly && (
                <>
                  <label className="field">IDV — Vehicle (₹)
                    <input type="number" step="1" value={form.idvVehicle} onChange={set('idvVehicle')} />
                  </label>
                  <label className="field">IDV — CNG/LPG Kit (₹)
                    <input type="number" step="1" value={form.idvCngKit} onChange={set('idvCngKit')} />
                  </label>
                  <label className="field">IDV — Electrical Accessories (₹)
                    <input type="number" step="1" value={form.idvElectrical} onChange={set('idvElectrical')} />
                  </label>
                  <label className="field">IDV — Non-Electrical (₹)
                    <input type="number" step="1" value={form.idvNonElectrical} onChange={set('idvNonElectrical')} />
                  </label>
                </>
              )}

              <h4>Premium breakdown</h4>
              <label className="field">Basic Premium (₹)
                <input type="number" step="0.01" value={form.basicPremium} onChange={set('basicPremium')} />
              </label>
              {!isTpOnly && (
                <label className="field">Add-ons (₹)
                  <input type="number" step="0.01" value={form.addOnPremium} onChange={set('addOnPremium')}
                         placeholder="zero-dep + engine protect + …" />
                </label>
              )}
              {!isTpOnly && (
                <label className="field">Net Own Damage Premium (₹)
                  <input type="number" step="0.01" value={form.netOdPremium} onChange={set('netOdPremium')} />
                </label>
              )}
              <label className="field">Net Third-Party Premium (₹)
                <input type="number" step="0.01" value={form.netTpPremium} onChange={set('netTpPremium')} />
              </label>
              <label className="field">CGST (₹)
                <input type="number" step="0.01" value={form.cgst} onChange={set('cgst')} />
              </label>
              <label className="field">SGST (₹)
                <input type="number" step="0.01" value={form.sgst} onChange={set('sgst')} />
              </label>
              <label className="field">IGST (₹)
                <input type="number" step="0.01" value={form.igst} onChange={set('igst')} />
              </label>

              <h4>Deductibles</h4>
              <label className="field">Compulsory Deductible (₹)
                <input type="number" step="1" value={form.compulsoryDeductible} onChange={set('compulsoryDeductible')} />
              </label>
              <label className="field">Voluntary Excess (₹)
                <input type="number" step="1" value={form.voluntaryDeductible} onChange={set('voluntaryDeductible')} />
              </label>

              <h4>Financier</h4>
              <label className="field">Financier Type
                <input value={form.financierType} onChange={set('financierType')} placeholder="e.g. Not Financed" />
              </label>
              <label className="field">Financier Name
                <input value={form.financierName} onChange={set('financierName')} />
              </label>
              <label className="field full">Financier Branch
                <input value={form.financierBranch} onChange={set('financierBranch')} />
              </label>

              <h4>Payment, as printed on the schedule</h4>
              <label className="field">Payment Mode
                <input value={form.paymentMode} onChange={set('paymentMode')} placeholder="e.g. Auto Debit" />
              </label>
              <label className="field">Cheque / Transaction No.
                <input value={form.paymentRefNo} onChange={set('paymentRefNo')} />
              </label>
              <label className="field">Bank Name
                <input value={form.paymentBank} onChange={set('paymentBank')} />
              </label>
              <label className="field">Amount (₹)
                <input type="number" step="0.01" value={form.paymentAmount} onChange={set('paymentAmount')} />
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
