import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const dbFile = join(dataDir, 'db.json');

// Investment groups — each bound to its own login and never merged together
// anywhere in the app (dashboard, lists, masters). MPN = Mrunal/Narendra/
// Nivedita (the original data); RPS = Ramchandra & Smita Shete; DEMO = mock
// data (Aditya/Neha/Yash) for demoing the app, never real financial data.
export const GROUPS = ['MPN', 'RPS', 'DEMO'];

export const emptyMasters = () => ({ holders: [], investmentNames: [], licPlans: [], vehicleInsurers: [] });

const defaultData = {
  investments: [],
  holdings: [],
  // LIC policies are a separate kind of holding — no current value/ROI, never
  // rolled into the Investments/Dashboard aggregates. licPremiums is a flat
  // log of payment dates, foreign-keyed by policyId (mirrors holdings).
  licPolicies: [],
  licPremiums: [],
  // Health insurance policies — same isolation as LIC (no ROI, excluded from
  // Investments/Dashboard), but also carry a stored PDF of the original policy
  // document (see server/routes/health.js and data/health-docs/).
  healthPolicies: [],
  // Premium payment log for health policies, same shape and purpose as
  // licPremiums — foreign-keyed by policyId.
  healthPremiums: [],
  // Motor insurance. Unlike LIC/Health a vehicle outlives its policies and can
  // carry several at once (a Standalone OD and a multi-year Third Party from a
  // different insurer), so the vehicle is its own record and policies hang off
  // it by vehicleId. vehiclePremiums is the payment log, foreign-keyed by
  // policyId exactly like licPremiums.
  vehicles: [],
  vehiclePolicies: [],
  vehiclePremiums: [],
  // Pick-lists for the Add/Edit Investment form, one per group. Holder and
  // name can only be chosen from the logged-in user's group list — new
  // entries are added on the Masters page.
  masters: { MPN: emptyMasters(), RPS: emptyMasters() },
  settings: { maturityWindowDays: 60, lastPriceRefresh: null }
};

const db = new Low(new JSONFile(dbFile), defaultData);
await db.read();
db.data ||= defaultData;
db.data.investments ||= [];
db.data.holdings ||= [];
db.data.licPolicies ||= [];
db.data.licPremiums ||= [];
db.data.healthPolicies ||= [];
db.data.healthPremiums ||= [];
db.data.vehicles ||= [];
db.data.vehiclePolicies ||= [];
db.data.vehiclePremiums ||= [];
db.data.settings ||= defaultData.settings;

// Migrate the old flat masters shape ({ holders: [], investmentNames: [] })
// into the MPN group, so pre-existing pick-lists aren't lost when groups were
// introduced.
if (Array.isArray(db.data.masters?.holders)) {
  db.data.masters = {
    MPN: { holders: db.data.masters.holders, investmentNames: db.data.masters.investmentNames || [] },
    RPS: emptyMasters()
  };
}
db.data.masters ||= {};
for (const g of GROUPS) {
  db.data.masters[g] ||= emptyMasters();
  db.data.masters[g].holders ||= [];
  db.data.masters[g].investmentNames ||= [];
  db.data.masters[g].licPlans ||= [];
  db.data.masters[g].vehicleInsurers ||= [];
}

export const sortMaster = (list) => list.sort((a, b) => a.localeCompare(b));

// Add a value to a group's master list if it isn't already there
// (case-insensitive). Returns the canonical stored value.
export function ensureMaster(group, kind, value) {
  const v = value == null ? '' : String(value).trim();
  if (!v) return null;
  const list = db.data.masters[group][kind];
  const existing = list.find(x => x.toLowerCase() === v.toLowerCase());
  if (existing) return existing;
  list.push(v);
  sortMaster(list);
  return v;
}

// Every investment must belong to a group — anything pre-existing (from
// before groups existed) is MPN.
let changed = false;
for (const inv of db.data.investments) {
  if (!inv.group) { inv.group = 'MPN'; changed = true; }
}

// Back-fill the masters from whatever the investments already use, so existing
// data keeps working and every current holder/name is selectable.
const beforeCount = GROUPS.reduce((a, g) => a + db.data.masters[g].holders.length + db.data.masters[g].investmentNames.length, 0);
for (const inv of db.data.investments) {
  ensureMaster(inv.group, 'holders', inv.holder);
  ensureMaster(inv.group, 'investmentNames', inv.name);
}
const afterCount = GROUPS.reduce((a, g) => a + db.data.masters[g].holders.length + db.data.masters[g].investmentNames.length, 0);
if (changed || beforeCount !== afterCount) {
  await db.write();
}

export default db;

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
