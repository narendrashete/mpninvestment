import { useRef, useState } from 'react';
import { api } from '../lib/api.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

// Log-a-premium-payment modal. Purely additive — does not touch the policy's
// nextPremiumDueDate, which stays a manual field edited on the policy itself.
// Can carry multiple attachments (receipt PDF, cheque scan, payment
// screenshot) picked from the file system or captured live with the phone
// camera; they upload together with the payment in one request.
export default function LicPremiumForm({ policyId, defaultAmount, onClose, onSaved }) {
  const [paidOn, setPaidOn] = useState(todayIso());
  const [amount, setAmount] = useState(defaultAmount ?? '');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef(null);
  const cameraInput = useRef(null);

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    setFiles(prev => [...prev, ...picked]);
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await api.addLicPremium(policyId, { paidOn, amount, notes }, files);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Log Premium Payment</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">Paid On
              <input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} required />
            </label>
            <label className="field">Amount (₹)
              <input type="number" step="1" value={amount} onChange={e => setAmount(e.target.value)} required />
            </label>
            <label className="field full">Notes
              <input value={notes} onChange={e => setNotes(e.target.value)} />
            </label>
            <div className="field full">
              Attachments <span className="muted" style={{ fontWeight: 400 }}>(receipt, cheque, payment screenshot — optional)</span>
              <div className="toolbar" style={{ margin: '2px 0 0' }}>
                <button type="button" className="btn btn-sm" onClick={() => fileInput.current?.click()}>+ Attach File</button>
                <button type="button" className="btn btn-sm" onClick={() => cameraInput.current?.click()}>📷 Capture Photo</button>
              </div>
              {files.length > 0 && (
                <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {files.map((f, idx) => (
                    <li key={`${f.name}-${f.lastModified}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                      <span>{f.type.startsWith('image/') ? '🖼️' : '📄'} {f.name}</span>
                      <span className="spacer" />
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => removeFile(idx)}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,image/*"
                multiple
                onChange={addFiles}
                style={{ display: 'none' }}
              />
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={addFiles}
                style={{ display: 'none' }}
              />
            </div>
          </div>
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
