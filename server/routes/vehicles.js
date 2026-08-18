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

// The policy schedule PDF — one per policy, keyed by policy id, exactly like
// the LIC/Health policy documents.
const docsDir = join(__dirname, '..', '..', 'data', 'vehicle-docs');
mkdirSync(docsDir, { recursive: true });
const docPath = (policyId) => join(docsDir, `${policyId}.pdf`);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  }
});

// Premium payment attachments (receipt PDF, cheque scan, payment screenshot).
// A payment can carry several, so each is stored under its own id.
const premiumDocsDir = join(__dirname, '..', '..', 'data', 'vehicle-premium-docs');
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
    id: newId('vehpayatt'),
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

function demoPremiumDocBytes() {
  const demoPolicyIds = new Set(db.data.vehiclePolicies.filter(p => p.group === 'DEMO').map(p => p.id));
  let total = 0;
  for (const pay of db.data.vehiclePremiums) {
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
  if (demoPremiumDocBytes() + newBytes > DEMO_LIMITS.vehiclePremiumDocBytes) {
    const capMb = Math.round(DEMO_LIMITS.vehiclePremiumDocBytes / (1024 * 1024));
    throw new Error(`Demo storage limit reached (${capMb}MB of uploaded receipts) — the demo sandbox resets nightly, try again after the reset.`);
  }
}

const VEHICLE_CLASSES = ['CAR_4W', 'SCOOTER_2W', 'BIKE_2W', 'COMMERCIAL', 'OTHER'];
const VEHICLE_STATUSES = ['owned', 'sold', 'scrapped'];
// Indian motor cover splits three ways. A vehicle commonly carries a
// standalone OD *and* a separate multi-year third-party policy from a
// different insurer at the same time — that's why policies hang off the
// vehicle rather than being the top-level record.
const POLICY_TYPES = ['COMPREHENSIVE', 'OD_ONLY', 'TP_ONLY'];
const POLICY_STATUSES = ['active', 'expired', 'renewed', 'cancelled'];

const todayIso = () => new Date().toISOString().slice(0, 10);

// Holder and insurer are chosen from the masters — resolve to the stored
// spelling and reject anything not on the list (new entries are added on the
// Masters page). Same contract as lic.js / health.js.
function fromMaster(group, kind, value, label) {
  const v = String(value).trim();
  const match = db.data.masters[group][kind].find(x => x.toLowerCase() === v.toLowerCase());
  if (!match) throw new Error(`${label} "${v}" is not in the master list — add it on the Masters page first.`);
  return match;
}

// "MH05FP6134", "MH-05-FP-6134" and "mh05 fp 6134" are the same car. Compare
// on this normalised form but store exactly what was typed — the two-level
// model falls apart if one vehicle ends up with two records.
const normalizeReg = (v) => String(v || '').toUpperCase().replace(/[\s-]/g, '');

const VEHICLE_TEXT = [
  'make', 'model', 'fuelType', 'engineNo', 'chassisNo', 'bodyType', 'colour',
  'rtoLocation', 'rtoCode', 'zone', 'fastagId', 'soldTo', 'notes'
];
const VEHICLE_NUM = ['yearOfManufacture', 'cubicCapacity', 'seatingCapacity'];

function sanitizeVehicle(group, body, existing = {}) {
  const v = { ...existing };
  if (body.registrationNo !== undefined) {
    const reg = String(body.registrationNo ?? '').trim();
    v.registrationNo = reg || null;
  }
  if (body.holder !== undefined) {
    v.holder = body.holder === '' || body.holder == null
      ? null : fromMaster(group, 'holders', body.holder, 'Holder');
  }
  if (body.vehicleClass !== undefined) {
    if (!VEHICLE_CLASSES.includes(body.vehicleClass)) {
      throw new Error(`vehicleClass must be one of ${VEHICLE_CLASSES.join(', ')}`);
    }
    v.vehicleClass = body.vehicleClass;
  }
  if (body.status !== undefined) {
    if (!VEHICLE_STATUSES.includes(body.status)) {
      throw new Error(`status must be one of ${VEHICLE_STATUSES.join(', ')}`);
    }
    v.status = body.status;
  }
  for (const f of VEHICLE_TEXT) {
    if (body[f] !== undefined) v[f] = body[f] === '' || body[f] == null ? null : String(body[f]).trim();
  }
  for (const f of ['registrationDate', 'soldOn']) {
    if (body[f] !== undefined) v[f] = body[f] || null;
  }
  for (const f of VEHICLE_NUM) {
    if (body[f] !== undefined) {
      const n = body[f] === '' || body[f] == null ? null : Number(body[f]);
      if (n != null && isNaN(n)) throw new Error(`${f} must be a number`);
      v[f] = n;
    }
  }
  return v;
}

const POLICY_TEXT = [
  'policyNo', 'uin', 'proposalNo', 'pointOfSale', 'financierType', 'financierName',
  'financierBranch', 'paymentMode', 'paymentRefNo', 'paymentBank', 'notes'
];
const POLICY_DATE = ['startDate', 'endDate', 'issuedOn', 'proposalDate'];
const POLICY_NUM = [
  'idvTotal', 'idvVehicle', 'idvElectrical', 'idvNonElectrical', 'idvCngKit',
  'grossPremium', 'basicPremium', 'addOnPremium', 'netOdPremium', 'netTpPremium',
  'cgst', 'sgst', 'igst', 'ncbPercent', 'compulsoryDeductible', 'voluntaryDeductible',
  'paymentAmount'
];

function sanitizePolicy(group, body, existing = {}) {
  const p = { ...existing };
  if (body.insurerName !== undefined) {
    p.insurerName = body.insurerName === '' || body.insurerName == null
      ? null : fromMaster(group, 'vehicleInsurers', body.insurerName, 'Insurer');
  }
  if (body.policyType !== undefined) {
    if (!POLICY_TYPES.includes(body.policyType)) {
      throw new Error(`policyType must be one of ${POLICY_TYPES.join(', ')}`);
    }
    p.policyType = body.policyType;
  }
  if (body.status !== undefined) {
    if (!POLICY_STATUSES.includes(body.status)) {
      throw new Error(`status must be one of ${POLICY_STATUSES.join(', ')}`);
    }
    p.status = body.status;
  }
  for (const f of POLICY_TEXT) {
    if (body[f] !== undefined) p[f] = body[f] === '' || body[f] == null ? null : String(body[f]).trim();
  }
  for (const f of POLICY_DATE) {
    if (body[f] !== undefined) p[f] = body[f] || null;
  }
  for (const f of POLICY_NUM) {
    if (body[f] !== undefined) {
      const n = body[f] === '' || body[f] == null ? null : Number(body[f]);
      if (n != null && isNaN(n)) throw new Error(`${f} must be a number`);
      p[f] = n;
    }
  }
  if (p.startDate && p.endDate && p.endDate < p.startDate) {
    throw new Error('endDate cannot be before startDate');
  }
  return p;
}

// Sum that stays null when nothing contributes — third-party-only policies
// carry no IDV, so a car with separate OD and TP cover must not be counted as
// insured for its value twice.
function sumOrNull(values) {
  const nums = values.filter(v => v != null && !isNaN(v));
  return nums.length ? nums.reduce((a, v) => a + v, 0) : null;
}

const premiumsFor = (policyId) => db.data.vehiclePremiums
  .filter(x => x.policyId === policyId)
  .sort((a, b) => String(b.paidOn || '').localeCompare(String(a.paidOn || '')));

const policyBrief = (p) => (p
  ? { id: p.id, policyNo: p.policyNo, insurerName: p.insurerName, policyType: p.policyType, startDate: p.startDate, endDate: p.endDate }
  : null);

function enrichPolicy(policy) {
  const byId = (id) => (id ? db.data.vehiclePolicies.find(x => x.id === id) : null);
  return {
    ...policy,
    daysToExpiry: daysToMaturity(policy.endDate),
    closed: policy.status !== 'active',
    renewedFrom: policyBrief(byId(policy.renewedFromId)),
    renewedInto: policyBrief(byId(policy.renewedToId)),
    premiums: premiumsFor(policy.id)
  };
}

// A vehicle's headline figures come from its *active* policies only — renewed
// and expired ones are records, not live cover. The compact `policies` array
// rides along so the list page can export at policy grain without a second
// round trip; the full detail view rebuilds it with premiums attached.
function enrichVehicle(vehicle) {
  const policies = db.data.vehiclePolicies.filter(p => p.vehicleId === vehicle.id);
  const active = policies.filter(p => p.status === 'active');
  const nextExpiryDate = active
    .map(p => p.endDate)
    .filter(Boolean)
    .sort()[0] || null;
  return {
    ...vehicle,
    policyCount: policies.length,
    activePolicyCount: active.length,
    activeInsurers: [...new Set(active.map(p => p.insurerName).filter(Boolean))],
    activePolicyTypes: [...new Set(active.map(p => p.policyType).filter(Boolean))],
    totalIdv: sumOrNull(active.map(p => p.idvTotal)),
    // Deliberately "premium paid", not "annual premium" — a third-party policy
    // often runs three years, so annualising it would be a lie.
    premiumPaid: active.reduce((a, p) => a + (p.grossPremium || 0), 0),
    nextExpiryDate,
    daysToExpiry: daysToMaturity(nextExpiryDate),
    policies: policies.map(p => ({
      ...p,
      daysToExpiry: daysToMaturity(p.endDate),
      closed: p.status !== 'active'
    }))
  };
}

const findVehicle = (req) => db.data.vehicles.find(v => v.id === req.params.id && v.group === req.user.group);
const findPolicy = (vehicle, policyId) =>
  db.data.vehiclePolicies.find(p => p.id === policyId && p.vehicleId === vehicle.id);

// ---------------------------------------------------------------- vehicles

// List, sorted by whichever cover lapses first (nulls last) — the same
// comparator the LIC and Health lists use. Never touches db.data.investments:
// vehicle policies are kept out of the Investments/Dashboard aggregates by
// design, exactly like LIC and Health.
router.get('/', (req, res) => {
  const list = db.data.vehicles
    .filter(v => v.group === req.user.group)
    .map(enrichVehicle)
    .sort((a, b) => {
      if (a.daysToExpiry == null) return 1;
      if (b.daysToExpiry == null) return -1;
      return a.daysToExpiry - b.daysToExpiry;
    });
  res.json(list);
});

router.get('/:id', (req, res) => {
  const vehicle = findVehicle(req);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const policies = db.data.vehiclePolicies
    .filter(p => p.vehicleId === vehicle.id)
    .map(enrichPolicy)
    .sort((a, b) => {
      // Live cover first, soonest to lapse at the top; closed records after,
      // most recent first.
      if (a.closed !== b.closed) return a.closed ? 1 : -1;
      return a.closed
        ? String(b.endDate || '').localeCompare(String(a.endDate || ''))
        : String(a.endDate || '').localeCompare(String(b.endDate || ''));
    });
  res.json({ ...enrichVehicle(vehicle), policies });
});

router.post('/', async (req, res) => {
  try {
    const group = req.user.group;
    assertDemoLimit(group, db.data.vehicles.filter(v => v.group === group).length, 'vehicles', 'vehicles');
    const vehicle = sanitizeVehicle(group, req.body);
    if (!vehicle.registrationNo) return res.status(400).json({ error: 'registrationNo is required' });
    if (!vehicle.holder) return res.status(400).json({ error: 'holder is required' });
    if (!vehicle.vehicleClass) return res.status(400).json({ error: 'vehicleClass is required' });
    const reg = normalizeReg(vehicle.registrationNo);
    if (db.data.vehicles.some(v => v.group === group && normalizeReg(v.registrationNo) === reg)) {
      return res.status(409).json({ error: `Vehicle ${vehicle.registrationNo} is already on the list.` });
    }
    vehicle.id = newId('veh');
    vehicle.group = group;
    vehicle.status ||= 'owned';
    db.data.vehicles.push(vehicle);
    await db.write();
    res.status(201).json(enrichVehicle(vehicle));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const group = req.user.group;
  const idx = db.data.vehicles.findIndex(v => v.id === req.params.id && v.group === group);
  if (idx === -1) return res.status(404).json({ error: 'Vehicle not found' });
  try {
    const updated = sanitizeVehicle(group, req.body, db.data.vehicles[idx]);
    if (!updated.registrationNo) return res.status(400).json({ error: 'registrationNo is required' });
    const reg = normalizeReg(updated.registrationNo);
    if (db.data.vehicles.some(v => v.group === group && v.id !== req.params.id && normalizeReg(v.registrationNo) === reg)) {
      return res.status(409).json({ error: `Vehicle ${updated.registrationNo} is already on the list.` });
    }
    updated.id = req.params.id;
    updated.group = group;
    db.data.vehicles[idx] = updated;
    await db.write();
    res.json(enrichVehicle(updated));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Deleting a vehicle takes its whole history with it — every policy, every
// logged payment, and every file on disk.
router.delete('/:id', async (req, res) => {
  const idx = db.data.vehicles.findIndex(v => v.id === req.params.id && v.group === req.user.group);
  if (idx === -1) return res.status(404).json({ error: 'Vehicle not found' });
  const policies = db.data.vehiclePolicies.filter(p => p.vehicleId === req.params.id);
  const policyIds = new Set(policies.map(p => p.id));
  const removedPremiums = db.data.vehiclePremiums.filter(x => policyIds.has(x.policyId));

  db.data.vehicles.splice(idx, 1);
  db.data.vehiclePolicies = db.data.vehiclePolicies.filter(p => p.vehicleId !== req.params.id);
  db.data.vehiclePremiums = db.data.vehiclePremiums.filter(x => !policyIds.has(x.policyId));
  await db.write();

  policies.forEach(p => unlink(docPath(p.id), () => {}));
  removedPremiums.forEach(unlinkAttachments);
  res.json({ ok: true, removedPolicies: policies.length, removedPremiums: removedPremiums.length });
});

// ---------------------------------------------------------------- policies

router.post('/:id/policies', async (req, res) => {
  const vehicle = findVehicle(req);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  try {
    const group = req.user.group;
    assertDemoLimit(group, db.data.vehiclePolicies.filter(p => p.group === group).length, 'vehiclePolicies', 'vehicle policies');
    const policy = sanitizePolicy(group, req.body);
    if (!policy.policyNo) return res.status(400).json({ error: 'policyNo is required' });
    if (!policy.insurerName) return res.status(400).json({ error: 'insurerName is required' });
    if (!policy.policyType) return res.status(400).json({ error: 'policyType is required' });
    policy.id = newId('vehpol');
    policy.group = group;
    policy.vehicleId = vehicle.id;
    policy.status ||= 'active';
    policy.renewedFromId ??= null;
    policy.renewedToId = null;
    policy.renewedOn = null;
    policy.documentOriginalName = null;
    policy.documentUploadedAt = null;
    db.data.vehiclePolicies.push(policy);
    await db.write();
    res.status(201).json(enrichPolicy(policy));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/policies/:policyId', async (req, res) => {
  const vehicle = findVehicle(req);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const idx = db.data.vehiclePolicies.findIndex(p => p.id === req.params.policyId && p.vehicleId === vehicle.id);
  if (idx === -1) return res.status(404).json({ error: 'Policy not found' });
  try {
    const updated = sanitizePolicy(req.user.group, req.body, db.data.vehiclePolicies[idx]);
    updated.id = req.params.policyId;
    updated.group = req.user.group;
    updated.vehicleId = vehicle.id;
    db.data.vehiclePolicies[idx] = updated;
    await db.write();
    res.json(enrichPolicy(updated));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/policies/:policyId', async (req, res) => {
  const vehicle = findVehicle(req);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const idx = db.data.vehiclePolicies.findIndex(p => p.id === req.params.policyId && p.vehicleId === vehicle.id);
  if (idx === -1) return res.status(404).json({ error: 'Policy not found' });
  const removedPremiums = db.data.vehiclePremiums.filter(x => x.policyId === req.params.policyId);

  db.data.vehiclePolicies.splice(idx, 1);
  db.data.vehiclePremiums = db.data.vehiclePremiums.filter(x => x.policyId !== req.params.policyId);
  // Repair the renewal chain so neither neighbour is left pointing at a record
  // that no longer exists.
  for (const p of db.data.vehiclePolicies) {
    if (p.renewedToId === req.params.policyId) { p.renewedToId = null; p.renewedOn = null; }
    if (p.renewedFromId === req.params.policyId) p.renewedFromId = null;
  }
  await db.write();

  unlink(docPath(req.params.policyId), () => {});
  removedPremiums.forEach(unlinkAttachments);
  res.json({ ok: true, removedPremiums: removedPremiums.length });
});

// Renew: close the old policy and create a fresh one (its own record) linked
// back to it, exactly like an FD renewal. Motor cover runs to 23:59 of
// endDate, so the new policy starts the *day after* the old one ends — unlike
// an FD renewal, which starts on the old maturity date itself.
router.post('/:id/policies/:policyId/renew', async (req, res) => {
  const vehicle = findVehicle(req);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const old = findPolicy(vehicle, req.params.policyId);
  if (!old) return res.status(404).json({ error: 'Policy not found' });
  if (old.status === 'renewed') return res.status(400).json({ error: 'This policy was already renewed.' });
  if (old.status === 'cancelled') return res.status(400).json({ error: 'This policy was cancelled.' });

  try {
    const group = req.user.group;
    assertDemoLimit(group, db.data.vehiclePolicies.filter(p => p.group === group).length, 'vehiclePolicies', 'vehicle policies');
    const b = req.body;
    const dayAfter = (iso) => {
      if (!iso) return null;
      const d = new Date(`${iso}T00:00:00Z`);
      if (isNaN(d)) return null;
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    };
    const yearMinusDay = (iso) => {
      if (!iso) return null;
      const d = new Date(`${iso}T00:00:00Z`);
      if (isNaN(d)) return null;
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    };

    // Carry the old policy forward, then let the body override anything.
    const carried = {
      insurerName: old.insurerName,
      policyType: old.policyType,
      idvTotal: old.idvTotal,
      ncbPercent: old.ncbPercent,
      compulsoryDeductible: old.compulsoryDeductible,
      voluntaryDeductible: old.voluntaryDeductible,
      financierType: old.financierType,
      financierName: old.financierName,
      financierBranch: old.financierBranch
    };
    const start = b.startDate || dayAfter(old.endDate) || todayIso();
    const renewed = sanitizePolicy(group, { ...carried, ...b });
    renewed.startDate = start;
    renewed.endDate = b.endDate || yearMinusDay(start);
    if (renewed.endDate && renewed.endDate < renewed.startDate) {
      throw new Error('endDate cannot be before startDate');
    }
    if (!renewed.policyNo) throw new Error('policyNo is required');
    if (!renewed.grossPremium || renewed.grossPremium <= 0) {
      throw new Error('grossPremium must be a positive number');
    }
    renewed.id = newId('vehpol');
    renewed.group = group;
    renewed.vehicleId = vehicle.id;
    renewed.status = 'active';
    renewed.renewedFromId = old.id;
    renewed.renewedToId = null;
    renewed.renewedOn = null;
    renewed.documentOriginalName = null;
    renewed.documentUploadedAt = null;
    db.data.vehiclePolicies.push(renewed);

    old.status = 'renewed';
    old.renewedOn = start;
    old.renewedToId = renewed.id;
    await db.write();
    res.status(201).json({ renewed: enrichPolicy(renewed), original: enrichPolicy(old) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// -------------------------------------------------------- policy document

router.post('/:id/policies/:policyId/document', upload.single('document'), async (req, res) => {
  const vehicle = findVehicle(req);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const policy = findPolicy(vehicle, req.params.policyId);
  if (!policy) return res.status(404).json({ error: 'Policy not found' });
  if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });
  if (req.user.group === 'DEMO') {
    const existingBytes = db.data.vehiclePolicies
      .filter(p => p.group === 'DEMO' && p.id !== policy.id && p.documentOriginalName)
      .reduce((a, p) => {
        const path = docPath(p.id);
        return a + (existsSync(path) ? statSync(path).size : 0);
      }, 0);
    if (existingBytes + req.file.buffer.length > DEMO_LIMITS.vehicleDocBytes) {
      const capMb = Math.round(DEMO_LIMITS.vehicleDocBytes / (1024 * 1024));
      return res.status(429).json({ error: `Demo storage limit reached (${capMb}MB of uploaded PDFs) — the demo sandbox resets nightly, try again after the reset.` });
    }
  }
  writeFileSync(docPath(policy.id), req.file.buffer);
  policy.documentOriginalName = req.file.originalname;
  policy.documentUploadedAt = new Date().toISOString();
  await db.write();
  res.status(201).json(enrichPolicy(policy));
});

router.get('/:id/policies/:policyId/document', (req, res) => {
  const vehicle = findVehicle(req);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const policy = findPolicy(vehicle, req.params.policyId);
  if (!policy || !policy.documentOriginalName) return res.status(404).json({ error: 'No document uploaded for this policy' });
  const path = docPath(policy.id);
  if (!existsSync(path)) return res.status(404).json({ error: 'No document uploaded for this policy' });
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${policy.documentOriginalName.replace(/"/g, '')}"`);
  createReadStream(path).pipe(res);
});

router.delete('/:id/policies/:policyId/document', async (req, res) => {
  const vehicle = findVehicle(req);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const policy = findPolicy(vehicle, req.params.policyId);
  if (!policy) return res.status(404).json({ error: 'Policy not found' });
  policy.documentOriginalName = null;
  policy.documentUploadedAt = null;
  await db.write();
  unlink(docPath(policy.id), () => {});
  res.json(enrichPolicy(policy));
});

// --------------------------------------------------------------- premiums

// Log a premium payment. Does not touch the policy's dates — those stay
// manual fields edited via PUT. Optionally carries one or more attachments
// (receipt PDF, cheque scan, payment screenshot) in the same multipart
// request, field name "attachments".
router.post('/:id/policies/:policyId/premiums', uploadReceipts.array('attachments', 5), async (req, res) => {
  const vehicle = findVehicle(req);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const policy = findPolicy(vehicle, req.params.policyId);
  if (!policy) return res.status(404).json({ error: 'Policy not found' });
  const amount = req.body.amount === '' || req.body.amount == null ? null : Number(req.body.amount);
  if (!amount || isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
  const files = req.files || [];
  try {
    assertDemoAttachmentBudget(req.user.group, files);
  } catch (err) {
    return res.status(429).json({ error: err.message });
  }
  const text = (v) => (v && String(v).trim()) || null;
  const payment = {
    id: newId('vehpay'),
    policyId: policy.id,
    paidOn: req.body.paidOn || todayIso(),
    amount,
    notes: text(req.body.notes),
    paymentMode: text(req.body.paymentMode),
    referenceNo: text(req.body.referenceNo),
    bankName: text(req.body.bankName),
    attachments: files.map(saveAttachment)
  };
  db.data.vehiclePremiums.push(payment);
  await db.write();
  res.status(201).json({ payment, premiums: premiumsFor(policy.id) });
});

router.post('/:id/policies/:policyId/premiums/:paymentId/attachments', uploadReceipts.array('attachments', 5), async (req, res) => {
  const vehicle = findVehicle(req);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const policy = findPolicy(vehicle, req.params.policyId);
  if (!policy) return res.status(404).json({ error: 'Policy not found' });
  const payment = db.data.vehiclePremiums.find(x => x.id === req.params.paymentId && x.policyId === policy.id);
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
  res.status(201).json({ payment, premiums: premiumsFor(policy.id) });
});

router.get('/:id/policies/:policyId/premiums/:paymentId/attachments/:attachmentId', (req, res) => {
  const vehicle = findVehicle(req);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const policy = findPolicy(vehicle, req.params.policyId);
  if (!policy) return res.status(404).json({ error: 'Policy not found' });
  const payment = db.data.vehiclePremiums.find(x => x.id === req.params.paymentId && x.policyId === policy.id);
  const att = payment?.attachments?.find(a => a.id === req.params.attachmentId);
  if (!att) return res.status(404).json({ error: 'Attachment not found' });
  const path = attachmentPath(att);
  if (!existsSync(path)) return res.status(404).json({ error: 'Attachment not found' });
  res.set('Content-Type', att.mimeType || 'application/octet-stream');
  res.set('Content-Disposition', `inline; filename="${(att.originalName || 'attachment').replace(/"/g, '')}"`);
  createReadStream(path).pipe(res);
});

router.delete('/:id/policies/:policyId/premiums/:paymentId/attachments/:attachmentId', async (req, res) => {
  const vehicle = findVehicle(req);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const policy = findPolicy(vehicle, req.params.policyId);
  if (!policy) return res.status(404).json({ error: 'Policy not found' });
  const payment = db.data.vehiclePremiums.find(x => x.id === req.params.paymentId && x.policyId === policy.id);
  if (!payment) return res.status(404).json({ error: 'Premium payment not found' });
  const idx = (payment.attachments || []).findIndex(a => a.id === req.params.attachmentId);
  if (idx === -1) return res.status(404).json({ error: 'Attachment not found' });
  const [att] = payment.attachments.splice(idx, 1);
  await db.write();
  unlink(attachmentPath(att), () => {});
  res.json({ payment, premiums: premiumsFor(policy.id) });
});

router.delete('/:id/policies/:policyId/premiums/:paymentId', async (req, res) => {
  const vehicle = findVehicle(req);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const policy = findPolicy(vehicle, req.params.policyId);
  if (!policy) return res.status(404).json({ error: 'Policy not found' });
  const idx = db.data.vehiclePremiums.findIndex(x => x.id === req.params.paymentId && x.policyId === policy.id);
  if (idx === -1) return res.status(404).json({ error: 'Premium payment not found' });
  const [payment] = db.data.vehiclePremiums.splice(idx, 1);
  await db.write();
  unlinkAttachments(payment);
  res.json({ ok: true });
});

export default router;
