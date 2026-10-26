import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const result = await pool.query('SELECT id, code, name FROM departments ORDER BY name');
  res.json(result.rows);
});

export default router;
