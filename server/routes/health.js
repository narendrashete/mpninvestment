import { Router } from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, unlink, createReadStream, existsSync, writeFileSync, statSync } from 'node:fs';
import multer from 'multer';
import db, { newId } from '../db.js';
import { daysToMaturity } from '../services/roi.js';
import { assertDemoLimit, DEMO_LIMITS } from '../demoLimits.js';

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsDir = join(__dirname, '..', '..', 'data', 'health-docs');
mkdirSync(docsDir, { recursive: true });
const docPath = (id) => join(docsDir, `${id}.pdf`);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  }
});

// Premium payment attachments (receipt PDF, cheque scan, payment screenshot).
// Unlike the single policy document, a payment can carry several files, so
// each is stored under its own id rather than keyed by the payment id.
const premiumDocsDir = join(__dirname, '..', '..', 'data', 'health-premium-docs');
mkdirSync(premiumDocsDir, { recursive: true });
const EXT_BY_MIME = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif'
};
function extFor(file) {
  return EXT_BY_MIME[file.mimetype] || (file.originalname.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '.bin');
}
const attachmentPath = (att) => join(premiumDocsDir, `${att.id}${att.ext}`);

const uploadReceipts = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/'));
  }
});

function saveAttachment(file) {
  const att = {
    id: newId('healthpayatt'),
    originalName: file.originalname,
    mimeType: file.mimetype,
    ext: extFor(file),
    uploadedAt: new Date().toISOString()
  };
  writeFileSync(attachmentPath(att), file.buffer);
  return att;
}

function unlinkAttachments(payment) {
  for (const att of payment?.attachments || []) unlink(attachmentPath(att), () => {});
}

// Total bytes of premium attachments currently on disk for the DEMO group,
// used to enforce DEMO_LIMITS.healthPremiumDocBytes the same way document
// uploads enforce healthDocBytes.
function demoPremiumDocBytes() {
  const demoPolicyIds = new Set(db.data.healthPolicies.filter(p => p.group === 'DEMO').map(p => p.id));
  let total = 0;
  for (const pay of db.data.healthPremiums) {
    if (!demoPolicyIds.has(pay.policyId)) continue;
    for (const att of pay.attachments || []) {
      const path = attachmentPath(att);
      if (existsSync(path)) total += statSync(path).size;
    }
  }
  return total;
}

function assertDemoAttachmentBudget(group, files) {
  if (group !== 'DEMO' || !files.length) return;
  const newBytes = files.reduce((a, f) => a + f.buffer.length, 0);
  if (demoPremiumDocBytes() + newBytes > DEMO_LIMITS.healthPremiumDocBytes) {
    const capMb = Math.round(DEMO_LIMITS.healthPremiumDocBytes / (1024 * 1024));
    throw new Error(`Demo storage limit reached (${capMb}MB of uploaded receipts) — the demo sandbox resets nightly, try again after the reset.`);
  }
}

const POLICY_TYPES = ['BASIC', 'TOPUP'];
const STATUSES = ['active', 'expired', 'lapsed'];

// Holder is chosen from the masters, same list the Investments/LIC forms use.
// Insurer/Plan Name are free text — health policies are few enough in number
// that a Masters pick-list isn't worth the extra panel.
function fromMaster(group, kind, value, label) {
  const v = String(value).trim();
  const match = db.data.masters[group][kind].find(x => x.toLowerCase() === v.toLowerCase());
  if (!match) throw new Error(`${label} "${v}" is not in the master list — add it on the Masters page first.`);
  return match;
}

function sanitize(group, body, existing = {}) {
  const p = { ...existing };
  if (body.holder !== undefined) {
    p.holder = body.holder === '' || body.holder == null
      ? null : fromMaster(group, 'holders', body.holder, 'Holder');
  }
  if (body.policyType !== undefined) {
    if (!POLICY_TYPES.includes(body.policyType)) throw new Error(`policyType must be one of ${POLICY_TYPES.join(', ')}`);
    p.policyType = body.policyType;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
    p.status = body.status;
  }
  for (const f of ['insurerName', 'planName', 'policyNo', 'insuredMembers', 'nomineeName', 'notes']) {
    if (body[f] !== undefined) p[f] = body[f] === '' || body[f] == null ? null : String(body[f]).trim();
  }
  for (const f of ['commencementDate', 'expiryDate', 'renewalDueDate']) {
    if (body[f] !== undefined) p[f] = body[f] || null;
  }
  for (const f of ['sumInsured', 'deductible', 'premiumAmount']) {
    if (body[f] !== undefined) {
      const n = body[f] === '' || body[f] == null ? null : Number(body[f]);
      if (n != null && isNaN(n)) throw new Error(`${f} must be a number`);
      p[f] = n;
    }
  }
  return p;
}

// List, each policy annotated with days-to-renewal (same day-diff helper the
// Investments dashboard uses for maturity). Never touches db.data.investments
// — kept fully separate from the Investments/Dashboard aggregates by design.
router.get('/', (req, res) => {
  const group = req.user.group;
  const list = db.data.healthPolicies
    .filter(p => p.group === group)
    .map(p => ({ ...p, daysToRenewal: daysToMaturity(p.renewalDueDate) }))
    .sort((a, b) => {
      if (a.daysToRenewal == null) return 1;
      if (b.daysToRenewal == null) return -1;
      return a.daysToRenewal - b.daysToRenewal;
    });
  res.json(list);
});

router.get('/:id', (req, res) => {
  const policy = db.data.healthPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy) return res.status(404).json({ error: 'Health policy not found' });
  const premiums = db.data.healthPremiums
    .filter(x => x.policyId === policy.id)
    .sort((a, b) => String(b.paidOn || '').localeCompare(String(a.paidOn || '')));
  res.json({ ...policy, daysToRenewal: daysToMaturity(policy.renewalDueDate), premiums });
});

router.post('/', async (req, res) => {
  try {
    const group = req.user.group;
    assertDemoLimit(group, db.data.healthPolicies.filter(p => p.group === group).length, 'healthPolicies', 'health policies');
    const policy = sanitize(group, req.body);
    if (!policy.policyNo) return res.status(400).json({ error: 'policyNo is required' });
    if (!policy.holder) return res.status(400).json({ error: 'holder is required' });
    if (!policy.policyType) return res.status(400).json({ error: 'policyType is required' });
    policy.id = newId('health');
    policy.group = group;
    policy.status ||= 'active';
    policy.documentOriginalName = null;
    policy.documentUploadedAt = null;
    db.data.healthPolicies.push(policy);
    await db.write();
    res.status(201).json({ ...policy, daysToRenewal: daysToMaturity(policy.renewalDueDate) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const group = req.user.group;
  const idx = db.data.healthPolicies.findIndex(p => p.id === req.params.id && p.group === group);
  if (idx === -1) return res.status(404).json({ error: 'Health policy not found' });
  try {
    const updated = sanitize(group, req.body, db.data.healthPolicies[idx]);
    updated.id = req.params.id;
    updated.group = group;
    db.data.healthPolicies[idx] = updated;
    await db.write();
    res.json({ ...updated, daysToRenewal: daysToMaturity(updated.renewalDueDate) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const idx = db.data.healthPolicies.findIndex(p => p.id === req.params.id && p.group === req.user.group);
  if (idx === -1) return res.status(404).json({ error: 'Health policy not found' });
  const removedPremiums = db.data.healthPremiums.filter(x => x.policyId === req.params.id);
  db.data.healthPolicies.splice(idx, 1);
  db.data.healthPremiums = db.data.healthPremiums.filter(x => x.policyId !== req.params.id);
  await db.write();
  unlink(docPath(req.params.id), () => {});
  removedPremiums.forEach(unlinkAttachments);
  res.json({ ok: true });
});

router.post('/:id/document', upload.single('document'), async (req, res) => {
  const policy = db.data.healthPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy) return res.status(404).json({ error: 'Health policy not found' });
  if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });
  if (req.user.group === 'DEMO') {
    const existingBytes = db.data.healthPolicies
      .filter(p => p.group === 'DEMO' && p.id !== policy.id && p.documentOriginalName)
      .reduce((a, p) => {
        const path = docPath(p.id);
        return a + (existsSync(path) ? statSync(path).size : 0);
      }, 0);
    if (existingBytes + req.file.buffer.length > DEMO_LIMITS.healthDocBytes) {
      const capMb = Math.round(DEMO_LIMITS.healthDocBytes / (1024 * 1024));
      return res.status(429).json({ error: `Demo storage limit reached (${capMb}MB of uploaded PDFs) — the demo sandbox resets nightly, try again after the reset.` });
    }
  }
  writeFileSync(docPath(policy.id), req.file.buffer);
  policy.documentOriginalName = req.file.originalname;
  policy.documentUploadedAt = new Date().toISOString();
  await db.write();
  res.status(201).json({ ...policy, daysToRenewal: daysToMaturity(policy.renewalDueDate) });
});

router.get('/:id/document', (req, res) => {
  const policy = db.data.healthPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy || !policy.documentOriginalName) return res.status(404).json({ error: 'No document uploaded for this policy' });
  const path = docPath(policy.id);
  if (!existsSync(path)) return res.status(404).json({ error: 'No document uploaded for this policy' });
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${policy.documentOriginalName.replace(/"/g, '')}"`);
  createReadStream(path).pipe(res);
});

router.delete('/:id/document', async (req, res) => {
  const policy = db.data.healthPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy) return res.status(404).json({ error: 'Health policy not found' });
  policy.documentOriginalName = null;
  policy.documentUploadedAt = null;
  await db.write();
  unlink(docPath(policy.id), () => {});
  res.json({ ...policy, daysToRenewal: daysToMaturity(policy.renewalDueDate) });
});

// Log a premium payment. Does not touch renewalDueDate — that stays a manual
// field the user edits themselves via PUT /:id. Optionally carries one or
// more attachments (receipt PDF, cheque scan, payment screenshot) in the
// same multipart request, field name "attachments".
router.post('/:id/premiums', uploadReceipts.array('attachments', 5), async (req, res) => {
  const policy = db.data.healthPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy) return res.status(404).json({ error: 'Health policy not found' });
  const amount = req.body.amount === '' || req.body.amount == null ? null : Number(req.body.amount);
  if (!amount || isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
  const paidOn = req.body.paidOn || new Date().toISOString().slice(0, 10);
  const files = req.files || [];
  try {
    assertDemoAttachmentBudget(req.user.group, files);
  } catch (err) {
    return res.status(429).json({ error: err.message });
  }
  const payment = {
    id: newId('healthpay'),
    policyId: policy.id,
    paidOn,
    amount,
    notes: (req.body.notes && String(req.body.notes).trim()) || null,
    attachments: files.map(saveAttachment)
  };
  db.data.healthPremiums.push(payment);
  await db.write();
  const premiums = db.data.healthPremiums
    .filter(x => x.policyId === policy.id)
    .sort((a, b) => String(b.paidOn || '').localeCompare(String(a.paidOn || '')));
  res.status(201).json({ payment, premiums });
});

// Add more attachments to an already-logged payment (e.g. the cheque scan
// wasn't at hand when the payment was first logged).
router.post('/:id/premiums/:paymentId/attachments', uploadReceipts.array('attachments', 5), async (req, res) => {
  const policy = db.data.healthPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy) return res.status(404).json({ error: 'Health policy not found' });
  const payment = db.data.healthPremiums.find(x => x.id === req.params.paymentId && x.policyId === policy.id);
  if (!payment) return res.status(404).json({ error: 'Premium payment not found' });
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'A PDF or image file is required' });
  try {
    assertDemoAttachmentBudget(req.user.group, files);
  } catch (err) {
    return res.status(429).json({ error: err.message });
  }
  payment.attachments ||= [];
  payment.attachments.push(...files.map(saveAttachment));
  await db.write();
  const premiums = db.data.healthPremiums
    .filter(x => x.policyId === policy.id)
    .sort((a, b) => String(b.paidOn || '').localeCompare(String(a.paidOn || '')));
  res.status(201).json({ payment, premiums });
});

router.get('/:id/premiums/:paymentId/attachments/:attachmentId', (req, res) => {
  const policy = db.data.healthPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy) return res.status(404).json({ error: 'Health policy not found' });
  const payment = db.data.healthPremiums.find(x => x.id === req.params.paymentId && x.policyId === policy.id);
  const att = payment?.attachments?.find(a => a.id === req.params.attachmentId);
  if (!att) return res.status(404).json({ error: 'Attachment not found' });
  const path = attachmentPath(att);
  if (!existsSync(path)) return res.status(404).json({ error: 'Attachment not found' });
  res.set('Content-Type', att.mimeType || 'application/octet-stream');
  res.set('Content-Disposition', `inline; filename="${(att.originalName || 'attachment').replace(/"/g, '')}"`);
  createReadStream(path).pipe(res);
});

router.delete('/:id/premiums/:paymentId/attachments/:attachmentId', async (req, res) => {
  const policy = db.data.healthPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy) return res.status(404).json({ error: 'Health policy not found' });
  const payment = db.data.healthPremiums.find(x => x.id === req.params.paymentId && x.policyId === policy.id);
  if (!payment) return res.status(404).json({ error: 'Premium payment not found' });
  const idx = (payment.attachments || []).findIndex(a => a.id === req.params.attachmentId);
  if (idx === -1) return res.status(404).json({ error: 'Attachment not found' });
  const [att] = payment.attachments.splice(idx, 1);
  await db.write();
  unlink(attachmentPath(att), () => {});
  const premiums = db.data.healthPremiums
    .filter(x => x.policyId === policy.id)
    .sort((a, b) => String(b.paidOn || '').localeCompare(String(a.paidOn || '')));
  res.json({ payment, premiums });
});

router.delete('/:id/premiums/:paymentId', async (req, res) => {
  const policy = db.data.healthPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy) return res.status(404).json({ error: 'Health policy not found' });
  const idx = db.data.healthPremiums.findIndex(x => x.id === req.params.paymentId && x.policyId === policy.id);
  if (idx === -1) return res.status(404).json({ error: 'Premium payment not found' });
  const [payment] = db.data.healthPremiums.splice(idx, 1);
  await db.write();
  unlinkAttachments(payment);
  res.json({ ok: true });
});

export default router;
