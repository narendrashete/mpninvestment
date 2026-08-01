import { Router } from 'express';
import db, { ensureMaster, sortMaster } from '../db.js';

const router = Router();

// Master pick-lists. `field` is the investment field each list feeds, which is
// also what a rename has to cascade to and what a delete has to check for use.
const KINDS = {
  holders: { field: 'holder', label: 'Holder' },
  investmentNames: { field: 'name', label: 'Investment name' }
};

function kindOf(req, res) {
  const kind = req.params.kind;
  if (!KINDS[kind]) {
    res.status(400).json({ error: `kind must be one of ${Object.keys(KINDS).join(', ')}` });
    return null;
  }
  return kind;
}

const usageCount = (group, field, value) =>
  db.data.investments.filter(i => i.group === group && i[field] === value).length;

function withUsage(group, kind) {
  const { field } = KINDS[kind];
  return db.data.masters[group][kind].map(value => ({ value, inUse: usageCount(group, field, value) }));
}

// Both lists, each entry with how many investments currently use it — scoped
// to the logged-in user's group.
router.get('/', (req, res) => {
  const group = req.user.group;
  res.json({
    holders: withUsage(group, 'holders'),
    investmentNames: withUsage(group, 'investmentNames')
  });
});

router.post('/:kind', async (req, res) => {
  const kind = kindOf(req, res);
  if (!kind) return;
  const group = req.user.group;
  const value = String(req.body.value ?? '').trim();
  if (!value) return res.status(400).json({ error: `${KINDS[kind].label} cannot be empty` });
  const before = db.data.masters[group][kind].length;
  const stored = ensureMaster(group, kind, value);
  if (db.data.masters[group][kind].length === before) {
    return res.status(409).json({ error: `"${stored}" is already in the list` });
  }
  await db.write();
  res.status(201).json({ value: stored, list: withUsage(group, kind) });
});

// Rename, cascading to every investment in this group using the old value so
// nothing is orphaned by an edit here.
router.put('/:kind', async (req, res) => {
  const kind = kindOf(req, res);
  if (!kind) return;
  const group = req.user.group;
  const from = String(req.body.from ?? '').trim();
  const to = String(req.body.to ?? '').trim();
  if (!to) return res.status(400).json({ error: `${KINDS[kind].label} cannot be empty` });

  const list = db.data.masters[group][kind];
  const idx = list.indexOf(from);
  if (idx === -1) return res.status(404).json({ error: `"${from}" is not in the list` });
  if (from === to) return res.json({ value: to, list: withUsage(group, kind), updated: 0 });

  const clash = list.find(x => x !== from && x.toLowerCase() === to.toLowerCase());
  if (clash) return res.status(409).json({ error: `"${clash}" is already in the list` });

  const { field } = KINDS[kind];
  let updated = 0;
  for (const inv of db.data.investments) {
    if (inv.group === group && inv[field] === from) { inv[field] = to; updated++; }
  }
  list[idx] = to;
  sortMaster(list);
  await db.write();
  res.json({ value: to, list: withUsage(group, kind), updated });
});

// Delete — refused while any investment in this group still uses the value,
// since holder and name are only ever chosen from these lists.
router.delete('/:kind', async (req, res) => {
  const kind = kindOf(req, res);
  if (!kind) return;
  const group = req.user.group;
  const value = String(req.body.value ?? '').trim();
  const list = db.data.masters[group][kind];
  const idx = list.indexOf(value);
  if (idx === -1) return res.status(404).json({ error: `"${value}" is not in the list` });

  const used = usageCount(group, KINDS[kind].field, value);
  if (used > 0) {
    return res.status(409).json({
      error: `"${value}" is used by ${used} investment${used > 1 ? 's' : ''} — reassign those first.`
    });
  }
  list.splice(idx, 1);
  await db.write();
  res.json({ ok: true, list: withUsage(group, kind) });
});

export default router;
