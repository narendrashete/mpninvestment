import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatINR, formatDate, daysLeftClass, daysLeftLabel } from '../lib/format.js';
import HealthPolicyForm from '../components/HealthPolicyForm.jsx';
import HealthPremiumForm from '../components/HealthPremiumForm.jsx';

const TYPE_LABELS = { BASIC: 'Basic', TOPUP: 'Top-up' };
const STATUS_LABELS = { active: 'Active', expired: 'Expired', lapsed: 'Lapsed' };

export default function HealthPolicyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loggingPremium, setLoggingPremium] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);
  const attachmentInput = useRef(null);
  const [attachTargetId, setAttachTargetId] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const load = useCallback(
    () => api.healthPolicy(id).then(setPolicy).catch(err => setError(err.message)),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!policy) return <p className="muted">Loading…</p>;

  const del = async () => {
    if (!window.confirm(`Delete policy ${policy.policyNo} (${policy.planName}, ${policy.holder})? This cannot be undone.`)) return;
    await api.deleteHealthPolicy(policy.id);
    navigate('/health');
  };

  const pickFile = () => fileInput.current?.click();

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadHealthDocument(policy.id, file);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = async () => {
    if (!window.confirm('Remove the uploaded policy document? You can upload a new one afterwards.')) return;
    await api.deleteHealthDocument(policy.id);
    load();
  };

  const delPremium = async (payment) => {
    if (!window.confirm(`Remove the ${formatINR(payment.amount)} payment logged on ${formatDate(payment.paidOn)}?`)) return;
    await api.deleteHealthPremium(policy.id, payment.id);
    load();
  };

  const pickAttachment = (paymentId) => {
    setAttachTargetId(paymentId);
    attachmentInput.current?.click();
  };

  const uploadAttachments = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const targetId = attachTargetId;
    if (!picked.length || !targetId) return;
    setUploadingAttachment(true);
    setError(null);
    try {
      await api.addHealthPremiumAttachments(policy.id, targetId, picked);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingAttachment(false);
      setAttachTargetId(null);
    }
  };

  const removeAttachment = async (paymentId, attachmentId) => {
    if (!window.confirm('Remove this attachment?')) return;
    await api.deleteHealthPremiumAttachment(policy.id, paymentId, attachmentId);
    load();
  };

  return (
    <>
      <p style={{ margin: '0 0 10px' }}><Link to="/health">← All health policies</Link></p>

      <div className="detail-header">
        <h1>{policy.planName}</h1>
        <span className="badge badge-type">{policy.policyNo}</span>
        <span className="badge badge-type">{TYPE_LABELS[policy.policyType] || policy.policyType}</span>
        <span className="badge badge-type">{STATUS_LABELS[policy.status] || policy.status}</span>
        {policy.daysToRenewal != null && (
          <span className={`badge ${daysLeftClass(policy.daysToRenewal)}`}>{daysLeftLabel(policy.daysToRenewal)}</span>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => setEditing(true)}>Edit</button>
        <button className="btn btn-danger" onClick={del}>Delete</button>
      </div>
      <p className="muted" style={{ margin: '0 0 18px' }}>{policy.insurerName} · Holder: {policy.holder || '—'}</p>

      <div className="grid grid-cards" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="label">Sum Insured</div>
          <div className="value">{formatINR(policy.sumInsured)}</div>
        </div>
        <div className="card stat">
          <div className="label">Deductible</div>
          <div className="value">{formatINR(policy.deductible)}</div>
        </div>
        <div className="card stat">
          <div className="label">Premium</div>
          <div className="value">{formatINR(policy.premiumAmount)}</div>
        </div>
        <div className="card stat">
          <div className="label">Renewal Due</div>
          <div className="value">{formatDate(policy.renewalDueDate)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Details</h3>
        <dl className="kv">
          <dt>Insured Members</dt><dd>{policy.insuredMembers || '—'}</dd>
          <dt>Commencement Date</dt><dd>{formatDate(policy.commencementDate)}</dd>
          <dt>Expiry Date</dt><dd>{formatDate(policy.expiryDate)}</dd>
          <dt>Nominee</dt><dd>{policy.nomineeName || '—'}</dd>
          <dt>Notes</dt><dd>{policy.notes || '—'}</dd>
        </dl>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Policy Document</h3>
        {policy.documentOriginalName ? (
          <div className="toolbar" style={{ marginTop: 4 }}>
            <a href={api.healthDocumentUrl(policy.id)} target="_blank" rel="noreferrer">
              📄 {policy.documentOriginalName}
            </a>
            <span className="muted" style={{ fontSize: 12.5 }}>
              Uploaded {formatDate(policy.documentUploadedAt)}
            </span>
            <div className="spacer" />
            <button className="btn btn-sm" onClick={pickFile} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Replace'}
            </button>
            <button className="btn btn-sm btn-danger" onClick={removeDocument}>Remove</button>
          </div>
        ) : (
          <div className="toolbar" style={{ marginTop: 4 }}>
            <span className="muted">No document uploaded yet.</span>
            <div className="spacer" />
            <button className="btn btn-primary btn-sm" onClick={pickFile} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload PDF'}
            </button>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          onChange={uploadFile}
          style={{ display: 'none' }}
        />
      </div>

      <div className="section-title">
        <h2>Premiums Paid {policy.premiums?.length > 0 && <span className="muted">({policy.premiums.length})</span>}</h2>
        <button className="btn btn-primary" onClick={() => setLoggingPremium(true)}>+ Log Premium Payment</button>
      </div>

      <div className="card table-cards" style={{ padding: 0 }}>
        {!policy.premiums?.length ? (
          <p className="empty">No premium payments logged yet — payments are tracked going forward from here.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Paid On</th><th className="num">Amount</th><th>Notes</th><th>Attachments</th><th></th></tr>
            </thead>
            <tbody>
              {policy.premiums.map(pay => (
                <tr key={pay.id}>
                  <td data-label="Paid On">{formatDate(pay.paidOn)}</td>
                  <td className="num" data-label="Amount">{formatINR(pay.amount)}</td>
                  <td data-label="Notes">{pay.notes || '—'}</td>
                  <td data-label="Attachments">
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                      {(pay.attachments || []).map(att => (
                        <span key={att.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                          <a
                            href={api.healthPremiumAttachmentUrl(policy.id, pay.id, att.id)}
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
                            onClick={() => removeAttachment(pay.id, att.id)}
                          >✕</button>
                        </span>
                      ))}
                      <button
                        className="btn btn-sm"
                        onClick={() => pickAttachment(pay.id)}
                        disabled={uploadingAttachment}
                      >
                        {uploadingAttachment && attachTargetId === pay.id ? 'Uploading…' : '+ Add'}
                      </button>
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }} data-label="">
                    <button className="btn btn-sm btn-danger" onClick={() => delPremium(pay)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <input
          ref={attachmentInput}
          type="file"
          accept="application/pdf,image/*"
          multiple
          onChange={uploadAttachments}
          style={{ display: 'none' }}
        />
      </div>

      {editing && (
        <HealthPolicyForm
          initial={policy}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
        />
      )}
      {loggingPremium && (
        <HealthPremiumForm
          policyId={policy.id}
          defaultAmount={policy.premiumAmount}
          onClose={() => setLoggingPremium(false)}
          onSaved={() => { setLoggingPremium(false); load(); }}
        />
      )}
    </>
  );
}
