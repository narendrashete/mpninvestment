import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.data.settings);
});

router.put('/', async (req, res) => {
  const { maturityWindowDays } = req.body;
  if (maturityWindowDays !== undefined) {
    const n = Number(maturityWindowDays);
    if (!n || n < 1 || n > 365) return res.status(400).json({ error: 'maturityWindowDays must be 1-365' });
    db.data.settings.maturityWindowDays = n;
  }
  await db.write();
  res.json(db.data.settings);
});

export default router;
