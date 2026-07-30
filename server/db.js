import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const dbFile = join(dataDir, 'db.json');

const defaultData = {
  investments: [],
  holdings: [],
  // Pick-lists for the Add/Edit Investment form. Holder and name can only be
  // chosen from these — new entries are added on the Masters page.
  masters: { holders: [], investmentNames: [] },
  settings: { maturityWindowDays: 60, lastPriceRefresh: null }
};

const db = new Low(new JSONFile(dbFile), defaultData);
await db.read();
db.data ||= defaultData;
db.data.investments ||= [];
db.data.holdings ||= [];
db.data.settings ||= defaultData.settings;
db.data.masters ||= { holders: [], investmentNames: [] };
db.data.masters.holders ||= [];
db.data.masters.investmentNames ||= [];

export const sortMaster = (list) => list.sort((a, b) => a.localeCompare(b));

// Add a value to a master list if it isn't already there (case-insensitive).
// Returns the canonical stored value.
export function ensureMaster(kind, value) {
  const v = value == null ? '' : String(value).trim();
  if (!v) return null;
  const list = db.data.masters[kind];
  const existing = list.find(x => x.toLowerCase() === v.toLowerCase());
  if (existing) return existing;
  list.push(v);
  sortMaster(list);
  return v;
}

// Back-fill the masters from whatever the investments already use, so existing
// data keeps working and every current holder/name is selectable.
const beforeCount = db.data.masters.holders.length + db.data.masters.investmentNames.length;
for (const inv of db.data.investments) {
  ensureMaster('holders', inv.holder);
  ensureMaster('investmentNames', inv.name);
}
if (db.data.masters.holders.length + db.data.masters.investmentNames.length !== beforeCount) {
  await db.write();
}

export default db;

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
