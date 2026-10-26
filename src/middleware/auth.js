import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';

export async function requireAuth(req, res, next) {
  const authorization = req.get('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'A valid Bearer token is required.' });

  try {
    const payload = jwt.verify(match[1], config.jwtSecret);
    const result = await pool.query(
      `SELECT id, matricule, full_name, phone, role, department_id, year
       FROM users WHERE id = $1`,
      [payload.sub],
    );
    if (!result.rowCount) return res.status(401).json({ error: 'The user for this token no longer exists.' });
    req.user = result.rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function serializeUser(user) {
  return {
    id: user.id,
    matricule: user.matricule,
    fullName: user.full_name,
    phone: user.phone,
    role: user.role,
    departmentId: user.department_id,
    year: user.year,
  };
}
