import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db.js';
import { serializeUser } from '../middleware/auth.js';

const router = Router();
const registerSchema = z.object({
  matricule: z.string().trim().min(1),
  fullName: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits.'),
  departmentId: z.number().int().positive(),
  year: z.number().int().min(1).max(5),
  role: z.enum(['student', 'coordinator']),
  coordinatorCode: z.string().optional(),
});
const loginSchema = z.object({
  matricule: z.string().trim().min(1),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits.'),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

function issueToken(user) {
  return jwt.sign({}, config.jwtSecret, { subject: user.id, expiresIn: '30d' });
}

router.post('/register', async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid registration details.' });
  }
  const input = parsed.data;
  if (input.role === 'coordinator' && input.coordinatorCode !== config.coordinatorCode) {
    return res.status(403).json({ error: 'A valid coordinator code is required.' });
  }

  try {
    const department = await pool.query('SELECT id FROM departments WHERE id = $1', [input.departmentId]);
    if (!department.rowCount) return res.status(400).json({ error: 'Department does not exist.' });
    const pinHash = await bcrypt.hash(input.pin, 10);
    const result = await pool.query(
      `INSERT INTO users (matricule, full_name, phone, pin_hash, role, department_id, year)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, matricule, full_name, phone, role, department_id, year`,
      [input.matricule, input.fullName, input.phone, pinHash, input.role, input.departmentId, input.year],
    );
    const user = result.rows[0];
    return res.status(201).json({ token: issueToken(user), user: serializeUser(user) });
  } catch (error) {
    if (error.code === '23505') {
      const field = error.constraint?.includes('phone') ? 'phone number' : 'matricule';
      return res.status(409).json({ error: `A user with this ${field} already exists.` });
    }
    return next(error);
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid login details.' });
  }
  const result = await pool.query(
    `SELECT id, matricule, full_name, phone, pin_hash, role, department_id, year
     FROM users WHERE matricule = $1`,
    [parsed.data.matricule],
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(parsed.data.pin, user.pin_hash))) {
    return res.status(401).json({ error: 'Invalid matricule or PIN.' });
  }
  return res.json({ token: issueToken(user), user: serializeUser(user) });
});

export default router;
