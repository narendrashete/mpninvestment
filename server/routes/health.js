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
  res.json({ ...policy, daysToRenewal: daysToMaturity(policy.renewalDueDate) });
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
  db.data.healthPolicies.splice(idx, 1);
  await db.write();
  unlink(docPath(req.params.id), () => {});
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

export default router;
