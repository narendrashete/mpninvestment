import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatINR, formatDate, daysLeftClass, daysLeftLabel } from '../lib/format.js';
import HealthPolicyForm from '../components/HealthPolicyForm.jsx';

const TYPE_LABELS = { BASIC: 'Basic', TOPUP: 'Top-up' };
const STATUS_LABELS = { active: 'Active', expired: 'Expired', lapsed: 'Lapsed' };

export default function HealthPolicyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

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

      <div className="card">
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

      {editing && (
        <HealthPolicyForm
          initial={policy}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
        />
      )}
    </>
  );
}
