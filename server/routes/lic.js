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
const docsDir = join(__dirname, '..', '..', 'data', 'lic-docs');
mkdirSync(docsDir, { recursive: true });
const docPath = (id) => join(docsDir, `${id}.pdf`);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  }
});

const STATUSES = ['active', 'matured', 'surrendered', 'lapsed'];

// Holder and plan name are chosen from the masters — resolve to the stored
// spelling and reject anything not on the list (new entries are added on
// Masters). Holder reuses the same list the Investments form uses.
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
  if (body.planName !== undefined) {
    p.planName = body.planName === '' || body.planName == null
      ? null : fromMaster(group, 'licPlans', body.planName, 'Plan name');
  }
  if (body.policyNo !== undefined) {
    p.policyNo = body.policyNo === '' || body.policyNo == null ? null : String(body.policyNo).trim();
  }
  if (body.notes !== undefined) {
    p.notes = body.notes === '' || body.notes == null ? null : String(body.notes).trim();
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
    p.status = body.status;
  }
  for (const f of ['commencementDate', 'maturityDate', 'nextPremiumDueDate']) {
    if (body[f] !== undefined) p[f] = body[f] || null;
  }
  for (const f of ['sumAssured', 'guaranteedAddition', 'instalmentPremium', 'premiumPayingTermYears', 'policyTermYears', 'ageAtStart']) {
    if (body[f] !== undefined) {
      const n = body[f] === '' || body[f] == null ? null : Number(body[f]);
      if (n != null && isNaN(n)) throw new Error(`${f} must be a number`);
      p[f] = n;
    }
  }
  return p;
}

// List, each policy annotated with days-to-next-premium (same day-diff helper
// the Investments dashboard uses for maturity). Never touches
// db.data.investments — kept fully separate from the Investments/Dashboard
// aggregates by design.
router.get('/', (req, res) => {
  const group = req.user.group;
  const list = db.data.licPolicies
    .filter(p => p.group === group)
    .map(p => ({ ...p, daysToNextPremium: daysToMaturity(p.nextPremiumDueDate) }))
    .sort((a, b) => {
      if (a.daysToNextPremium == null) return 1;
      if (b.daysToNextPremium == null) return -1;
      return a.daysToNextPremium - b.daysToNextPremium;
    });
  res.json(list);
});

router.get('/:id', (req, res) => {
  const policy = db.data.licPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy) return res.status(404).json({ error: 'LIC policy not found' });
  const premiums = db.data.licPremiums
    .filter(x => x.policyId === policy.id)
    .sort((a, b) => String(b.paidOn || '').localeCompare(String(a.paidOn || '')));
  res.json({ ...policy, daysToNextPremium: daysToMaturity(policy.nextPremiumDueDate), premiums });
});

router.post('/', async (req, res) => {
  try {
    const group = req.user.group;
    assertDemoLimit(group, db.data.licPolicies.filter(p => p.group === group).length, 'licPolicies', 'LIC policies');
    const policy = sanitize(group, req.body);
    if (!policy.policyNo) return res.status(400).json({ error: 'policyNo is required' });
    if (!policy.planName) return res.status(400).json({ error: 'planName is required' });
    if (!policy.holder) return res.status(400).json({ error: 'holder is required' });
    policy.id = newId('lic');
    policy.group = group;
    policy.status ||= 'active';
    policy.documentOriginalName = null;
    policy.documentUploadedAt = null;
    db.data.licPolicies.push(policy);
    await db.write();
    res.status(201).json({ ...policy, daysToNextPremium: daysToMaturity(policy.nextPremiumDueDate) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const group = req.user.group;
  const idx = db.data.licPolicies.findIndex(p => p.id === req.params.id && p.group === group);
  if (idx === -1) return res.status(404).json({ error: 'LIC policy not found' });
  try {
    const updated = sanitize(group, req.body, db.data.licPolicies[idx]);
    updated.id = req.params.id;
    updated.group = group;
    db.data.licPolicies[idx] = updated;
    await db.write();
    res.json({ ...updated, daysToNextPremium: daysToMaturity(updated.nextPremiumDueDate) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const idx = db.data.licPolicies.findIndex(p => p.id === req.params.id && p.group === req.user.group);
  if (idx === -1) return res.status(404).json({ error: 'LIC policy not found' });
  db.data.licPolicies.splice(idx, 1);
  db.data.licPremiums = db.data.licPremiums.filter(x => x.policyId !== req.params.id);
  await db.write();
  unlink(docPath(req.params.id), () => {});
  res.json({ ok: true });
});

router.post('/:id/document', upload.single('document'), async (req, res) => {
  const policy = db.data.licPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy) return res.status(404).json({ error: 'LIC policy not found' });
  if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });
  if (req.user.group === 'DEMO') {
    const existingBytes = db.data.licPolicies
      .filter(p => p.group === 'DEMO' && p.id !== policy.id && p.documentOriginalName)
      .reduce((a, p) => {
        const path = docPath(p.id);
        return a + (existsSync(path) ? statSync(path).size : 0);
      }, 0);
    if (existingBytes + req.file.buffer.length > DEMO_LIMITS.licDocBytes) {
      const capMb = Math.round(DEMO_LIMITS.licDocBytes / (1024 * 1024));
      return res.status(429).json({ error: `Demo storage limit reached (${capMb}MB of uploaded PDFs) — the demo sandbox resets nightly, try again after the reset.` });
    }
  }
  writeFileSync(docPath(policy.id), req.file.buffer);
  policy.documentOriginalName = req.file.originalname;
  policy.documentUploadedAt = new Date().toISOString();
  await db.write();
  res.status(201).json({ ...policy, daysToNextPremium: daysToMaturity(policy.nextPremiumDueDate) });
});

router.get('/:id/document', (req, res) => {
  const policy = db.data.licPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy || !policy.documentOriginalName) return res.status(404).json({ error: 'No document uploaded for this policy' });
  const path = docPath(policy.id);
  if (!existsSync(path)) return res.status(404).json({ error: 'No document uploaded for this policy' });
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${policy.documentOriginalName.replace(/"/g, '')}"`);
  createReadStream(path).pipe(res);
});

router.delete('/:id/document', async (req, res) => {
  const policy = db.data.licPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy) return res.status(404).json({ error: 'LIC policy not found' });
  policy.documentOriginalName = null;
  policy.documentUploadedAt = null;
  await db.write();
  unlink(docPath(policy.id), () => {});
  res.json({ ...policy, daysToNextPremium: daysToMaturity(policy.nextPremiumDueDate) });
});

// Log a premium payment. Does not touch nextPremiumDueDate — that stays a
// manual field the user edits themselves via PUT /:id.
router.post('/:id/premiums', async (req, res) => {
  const policy = db.data.licPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy) return res.status(404).json({ error: 'LIC policy not found' });
  const amount = req.body.amount === '' || req.body.amount == null ? null : Number(req.body.amount);
  if (!amount || isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
  const paidOn = req.body.paidOn || new Date().toISOString().slice(0, 10);
  const payment = {
    id: newId('licpay'),
    policyId: policy.id,
    paidOn,
    amount,
    notes: (req.body.notes && String(req.body.notes).trim()) || null
  };
  db.data.licPremiums.push(payment);
  await db.write();
  const premiums = db.data.licPremiums
    .filter(x => x.policyId === policy.id)
    .sort((a, b) => String(b.paidOn || '').localeCompare(String(a.paidOn || '')));
  res.status(201).json({ payment, premiums });
});

router.delete('/:id/premiums/:paymentId', async (req, res) => {
  const policy = db.data.licPolicies.find(p => p.id === req.params.id && p.group === req.user.group);
  if (!policy) return res.status(404).json({ error: 'LIC policy not found' });
  const idx = db.data.licPremiums.findIndex(x => x.id === req.params.paymentId && x.policyId === policy.id);
  if (idx === -1) return res.status(404).json({ error: 'Premium payment not found' });
  db.data.licPremiums.splice(idx, 1);
  await db.write();
  res.json({ ok: true });
});

export default router;
