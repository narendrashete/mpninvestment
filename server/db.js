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
  settings: { maturityWindowDays: 60, lastPriceRefresh: null }
};

const db = new Low(new JSONFile(dbFile), defaultData);
await db.read();
db.data ||= defaultData;
db.data.investments ||= [];
db.data.holdings ||= [];
db.data.settings ||= defaultData.settings;

export default db;

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
