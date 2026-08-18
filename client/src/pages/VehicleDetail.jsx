import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import {
  formatINR, formatDate, daysLeftClass, daysLeftLabel,
  VEHICLE_CLASS_LABELS, VEHICLE_STATUS_LABELS,
  VEHICLE_POLICY_TYPE_LABELS, VEHICLE_POLICY_STATUS_LABELS
} from '../lib/format.js';
import VehicleForm from '../components/VehicleForm.jsx';
import VehiclePolicyForm from '../components/VehiclePolicyForm.jsx';
import VehiclePremiumForm from '../components/VehiclePremiumForm.jsx';
import VehicleRenewForm from '../components/VehicleRenewForm.jsx';

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [addingPolicy, setAddingPolicy] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [renewing, setRenewing] = useState(null);
  const [loggingFor, setLoggingFor] = useState(null);
  const [tab, setTab] = useState('active');
  // Uploads are keyed by which policy/payment the hidden input was opened for,
  // since one page holds every policy on the vehicle.
  const docInput = useRef(null);
  const attachmentInput = useRef(null);
  const [docTarget, setDocTarget] = useState(null);
  const [attachTarget, setAttachTarget] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(
    () => api.vehicle(id).then(setVehicle).catch(err => setError(err.message)),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!vehicle) return <p className="muted">Loading…</p>;

  const active = vehicle.policies.filter(p => !p.closed);
  const past = vehicle.policies.filter(p => p.closed);
  const shown = tab === 'active' ? active : past;

  const del = async () => {
    const bits = [];
    if (vehicle.policyCount) bits.push(`${vehicle.policyCount} polic${vehicle.policyCount === 1 ? 'y' : 'ies'}`);
    const payments = vehicle.policies.reduce((a, p) => a + p.premiums.length, 0);
    if (payments) bits.push(`${payments} logged payment${payments === 1 ? '' : 's'}`);
    const tail = bits.length ? ` This also deletes its ${bits.join(', ')} and every uploaded document.` : '';
    if (!window.confirm(`Delete ${vehicle.registrationNo} (${[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'vehicle'})?${tail} This cannot be undone.`)) return;
    await api.deleteVehicle(vehicle.id);
    navigate('/vehicles');
  };

  const delPolicy = async (policy) => {
    const n = policy.premiums.length;
    const tail = n ? ` Its ${n} logged payment${n === 1 ? '' : 's'} and attachments go with it.` : '';
    if (!window.confirm(`Delete policy ${policy.policyNo} (${policy.insurerName})?${tail} This cannot be undone.`)) return;
    await api.deleteVehiclePolicy(vehicle.id, policy.id);
    load();
  };

  const delPremium = async (policy, payment) => {
    if (!window.confirm(`Remove the ${formatINR(payment.amount)} payment logged on ${formatDate(payment.paidOn)}?`)) return;
    await api.deleteVehiclePremium(vehicle.id, policy.id, payment.id);
    load();
  };

  const pickDoc = (policyId) => { setDocTarget(policyId); docInput.current?.click(); };
  const uploadDoc = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = docTarget;
    if (!file || !target) return;
    setBusy(`doc:${target}`);
    setError(null);
    try {
      await api.uploadVehicleDocument(vehicle.id, target, file);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
      setDocTarget(null);
    }
  };
  const removeDoc = async (policy) => {
    if (!window.confirm('Remove the uploaded policy document? You can upload a new one afterwards.')) return;
    await api.deleteVehicleDocument(vehicle.id, policy.id);
    load();
  };

  const pickAttachment = (policyId, paymentId) => {
    setAttachTarget({ policyId, paymentId });
    attachmentInput.current?.click();
  };
  const uploadAttachments = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const target = attachTarget;
    if (!picked.length || !target) return;
    setBusy(`att:${target.paymentId}`);
    setError(null);
    try {
      await api.addVehiclePremiumAttachments(vehicle.id, target.policyId, target.paymentId, picked);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
      setAttachTarget(null);
    }
  };
  const removeAttachment = async (policyId, paymentId, attachmentId) => {
    if (!window.confirm('Remove this attachment?')) return;
    await api.deleteVehiclePremiumAttachment(vehicle.id, policyId, paymentId, attachmentId);
    load();
  };

  const title = [vehicle.make, vehicle.model].filter(Boolean).join(' ');

  return (
    <>
      <p style={{ margin: '0 0 10px' }}><Link to="/vehicles">← All vehicles</Link></p>

      <div className="detail-header">
        <h1>{vehicle.registrationNo}</h1>
        <span className="badge badge-type">{VEHICLE_CLASS_LABELS[vehicle.vehicleClass] || vehicle.vehicleClass}</span>
        {vehicle.fuelType && <span className="badge badge-type">{vehicle.fuelType}</span>}
        {vehicle.status && vehicle.status !== 'owned' && (
          <span className="badge badge-type">{VEHICLE_STATUS_LABELS[vehicle.status] || vehicle.status}</span>
        )}
        {vehicle.activePolicyCount === 0 && <span className="badge badge-overdue">No active cover</span>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => setEditing(true)}>Edit</button>
        <button className="btn btn-danger" onClick={del}>Delete</button>
      </div>
      <p className="muted" style={{ margin: '0 0 18px' }}>
        {[title, vehicle.yearOfManufacture].filter(Boolean).join(' · ') || '—'} · Holder: {vehicle.holder || '—'}
      </p>

      <div className="grid grid-cards" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="label">Active Policies</div>
          <div className="value">{vehicle.activePolicyCount}</div>
          {vehicle.activeInsurers.length > 0 && <div className="sub">{vehicle.activeInsurers.join(' · ')}</div>}
        </div>
        <div className="card stat">
          <div className="label">Total IDV</div>
          <div className="value">{formatINR(vehicle.totalIdv)}</div>
          <div className="sub">own-damage cover</div>
        </div>
        <div className="card stat">
          <div className="label">Premium Paid</div>
          <div className="value">{formatINR(vehicle.premiumPaid)}</div>
          <div className="sub">across active policies</div>
        </div>
        <div className="card stat">
          <div className="label">Next Expiry</div>
          <div className="value">{formatDate(vehicle.nextExpiryDate)}</div>
          {vehicle.daysToExpiry != null && <div className="sub">{daysLeftLabel(vehicle.daysToExpiry)}</div>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Vehicle Details</h3>
        <dl className="kv">
          <dt>Make</dt><dd>{vehicle.make || '—'}</dd>
          <dt>Model / Variant</dt><dd>{vehicle.model || '—'}</dd>
          <dt>Year of Manufacture</dt><dd>{vehicle.yearOfManufacture ?? '—'}</dd>
          <dt>Fuel Type</dt><dd>{vehicle.fuelType || '—'}</dd>
          <dt>Engine No.</dt><dd>{vehicle.engineNo || '—'}</dd>
          <dt>Chassis No. / VIN</dt><dd>{vehicle.chassisNo || '—'}</dd>
          <dt>Cubic Capacity</dt><dd>{vehicle.cubicCapacity != null ? `${vehicle.cubicCapacity} cc` : '—'}</dd>
          <dt>Seating Capacity</dt><dd>{vehicle.seatingCapacity ?? '—'}</dd>
          <dt>Type of Body</dt><dd>{vehicle.bodyType || '—'}</dd>
          <dt>Colour</dt><dd>{vehicle.colour || '—'}</dd>
          <dt>RTO</dt><dd>{[vehicle.rtoLocation, vehicle.rtoCode].filter(Boolean).join(' · ') || '—'}</dd>
          <dt>Zone</dt><dd>{vehicle.zone || '—'}</dd>
          <dt>Registration Date</dt><dd>{formatDate(vehicle.registrationDate)}</dd>
          <dt>FASTag ID</dt><dd>{vehicle.fastagId || '—'}</dd>
          <dt>Notes</dt><dd>{vehicle.notes || '—'}</dd>
        </dl>
      </div>

      <div className="section-title">
        <h2>Policies {vehicle.policyCount > 0 && <span className="muted">({vehicle.policyCount})</span>}</h2>
        <button className="btn btn-primary" onClick={() => setAddingPolicy(true)}>+ Add Policy</button>
      </div>

      <div className="subtabs">
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
          Active <span className="muted">({active.length})</span>
        </button>
        <button className={tab === 'past' ? 'active' : ''} onClick={() => setTab('past')}>
          Past &amp; Renewed <span className="muted">({past.length})</span>
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="card">
          <p className="empty">
            {tab === 'active'
              ? 'No active policy on this vehicle — add one to start tracking its cover.'
              : 'No past or renewed policies yet.'}
          </p>
        </div>
      ) : shown.map(policy => (
        <div className="card" key={policy.id} style={{ marginBottom: 16 }}>
          <div className="detail-header" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>{policy.insurerName}</h3>
            <span className="badge badge-type">{VEHICLE_POLICY_TYPE_LABELS[policy.policyType] || policy.policyType}</span>
            <span className="badge badge-type">{VEHICLE_POLICY_STATUS_LABELS[policy.status] || policy.status}</span>
            {!policy.closed && policy.daysToExpiry != null && (
              <span className={`badge ${daysLeftClass(policy.daysToExpiry)}`}>{daysLeftLabel(policy.daysToExpiry)}</span>
            )}
            <span style={{ flex: 1 }} />
            {!policy.closed && (
              <button className="btn btn-sm btn-primary" onClick={() => setRenewing(policy)}>Renew</button>
            )}
            <button className="btn btn-sm" onClick={() => setEditingPolicy(policy)}>Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => delPolicy(policy)}>Delete</button>
          </div>

          <dl className="kv">
            <dt>Policy No.</dt><dd>{policy.policyNo}</dd>
            <dt>Period of Insurance</dt>
            <dd>{formatDate(policy.startDate)} → {formatDate(policy.endDate)}</dd>
            <dt>Total IDV</dt><dd>{formatINR(policy.idvTotal)}</dd>
            <dt>Gross Premium</dt><dd>{formatINR(policy.grossPremium)}</dd>
            <dt>No Claim Bonus</dt><dd>{policy.ncbPercent != null ? `${policy.ncbPercent}%` : '—'}</dd>
            {policy.compulsoryDeductible != null && (
              <>
                <dt>Compulsory Deductible</dt><dd>{formatINR(policy.compulsoryDeductible)}</dd>
              </>
            )}
            {policy.uin && (<><dt>UIN</dt><dd>{policy.uin}</dd></>)}
            {policy.notes && (<><dt>Notes</dt><dd>{policy.notes}</dd></>)}
          </dl>

          {(policy.renewedFrom || policy.renewedInto) && (
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
              {policy.renewedFrom && <>← Renewed from <strong>{policy.renewedFrom.policyNo}</strong> ({formatDate(policy.renewedFrom.startDate)} → {formatDate(policy.renewedFrom.endDate)})</>}
              {policy.renewedFrom && policy.renewedInto && <br />}
              {policy.renewedInto && <>Renewed into <strong>{policy.renewedInto.policyNo}</strong> ({formatDate(policy.renewedInto.startDate)} → {formatDate(policy.renewedInto.endDate)}) →</>}
            </p>
          )}

          <div className="toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
            {policy.documentOriginalName ? (
              <>
                <a href={api.vehicleDocumentUrl(vehicle.id, policy.id)} target="_blank" rel="noreferrer">
                  📄 {policy.documentOriginalName}
                </a>
                <span className="muted" style={{ fontSize: 12.5 }}>Uploaded {formatDate(policy.documentUploadedAt)}</span>
                <div className="spacer" />
                <button className="btn btn-sm" onClick={() => pickDoc(policy.id)} disabled={busy === `doc:${policy.id}`}>
                  {busy === `doc:${policy.id}` ? 'Uploading…' : 'Replace'}
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => removeDoc(policy)}>Remove</button>
              </>
            ) : (
              <>
                <span className="muted">No policy document uploaded yet.</span>
                <div className="spacer" />
                <button className="btn btn-sm" onClick={() => pickDoc(policy.id)} disabled={busy === `doc:${policy.id}`}>
                  {busy === `doc:${policy.id}` ? 'Uploading…' : 'Upload PDF'}
                </button>
              </>
            )}
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>
            <h2 style={{ fontSize: 15 }}>
              Premiums Paid {policy.premiums.length > 0 && <span className="muted">({policy.premiums.length})</span>}
            </h2>
            <button className="btn btn-sm btn-primary" onClick={() => setLoggingFor(policy)}>+ Log Premium Payment</button>
          </div>

          <div className="table-cards" style={{ padding: 0 }}>
            {policy.premiums.length === 0 ? (
              <p className="empty">No premium payments logged against this policy yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Paid On</th>
                    <th className="num">Amount</th>
                    <th>Payment</th>
                    <th>Notes</th>
                    <th>Attachments</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {policy.premiums.map(pay => (
                    <tr key={pay.id}>
                      <td data-label="Paid On">{formatDate(pay.paidOn)}</td>
                      <td className="num" data-label="Amount">{formatINR(pay.amount)}</td>
                      <td data-label="Payment">
                        {[pay.paymentMode, pay.referenceNo, pay.bankName].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td data-label="Notes">{pay.notes || '—'}</td>
                      <td data-label="Attachments">
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                          {(pay.attachments || []).map(att => (
                            <span key={att.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              <a
                                href={api.vehiclePremiumAttachmentUrl(vehicle.id, policy.id, pay.id, att.id)}
                                target="_blank"
                                rel="noreferrer"
                                title={att.originalName}
                              >
                                {att.mimeType?.startsWith('image/') ? '🖼️' : '📄'}
                              </a>
                              <button
                                className="btn btn-sm btn-danger"
                                style={{ padding: '0 5px', fontSize: 11 }}
                                title="Remove attachment"
                                onClick={() => removeAttachment(policy.id, pay.id, att.id)}
                              >✕</button>
                            </span>
                          ))}
                          <button
                            className="btn btn-sm"
                            onClick={() => pickAttachment(policy.id, pay.id)}
                            disabled={busy === `att:${pay.id}`}
                          >
                            {busy === `att:${pay.id}` ? 'Uploading…' : '+ Add'}
                          </button>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }} data-label="">
                        <button className="btn btn-sm btn-danger" onClick={() => delPremium(policy, pay)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ))}

      <input ref={docInput} type="file" accept="application/pdf" onChange={uploadDoc} style={{ display: 'none' }} />
      <input ref={attachmentInput} type="file" accept="application/pdf,image/*" multiple onChange={uploadAttachments} style={{ display: 'none' }} />

      {editing && (
        <VehicleForm
          initial={vehicle}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
        />
      )}
      {addingPolicy && (
        <VehiclePolicyForm
          vehicleId={vehicle.id}
          initial={null}
          onClose={() => setAddingPolicy(false)}
          onSaved={() => { setAddingPolicy(false); setTab('active'); load(); }}
        />
      )}
      {editingPolicy && (
        <VehiclePolicyForm
          vehicleId={vehicle.id}
          initial={editingPolicy}
          onClose={() => setEditingPolicy(null)}
          onSaved={() => { setEditingPolicy(null); load(); }}
        />
      )}
      {renewing && (
        <VehicleRenewForm
          vehicleId={vehicle.id}
          policy={renewing}
          onClose={() => setRenewing(null)}
          onSaved={() => { setRenewing(null); setTab('active'); load(); }}
        />
      )}
      {loggingFor && (
        <VehiclePremiumForm
          vehicleId={vehicle.id}
          policyId={loggingFor.id}
          defaultAmount={loggingFor.grossPremium}
          defaults={{ paymentMode: loggingFor.paymentMode, bankName: loggingFor.paymentBank }}
          onClose={() => setLoggingFor(null)}
          onSaved={() => { setLoggingFor(null); load(); }}
        />
      )}
    </>
  );
}
