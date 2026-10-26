import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const batchSchema = z.object({ items: z.array(z.unknown()).max(100) });
const itemSchema = z.object({
  sessionCode: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/),
  detectedAt: z.string().datetime({ offset: true }),
});

router.post('/sync', requireAuth, async (req, res, next) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students can sync attendance.' });
  }
  const batch = batchSchema.safeParse(req.body);
  if (!batch.success) {
    return res.status(400).json({ error: batch.error.issues[0]?.message ?? 'Invalid attendance batch.' });
  }

  try {
    const results = [];
    for (const rawItem of batch.data.items) {
      const parsed = itemSchema.safeParse(rawItem);
      const suppliedCode = rawItem && typeof rawItem === 'object' && typeof rawItem.sessionCode === 'string'
        ? rawItem.sessionCode
        : null;
      if (!parsed.success) {
        results.push({
          sessionCode: suppliedCode,
          status: 'rejected',
          reason: parsed.error.issues[0]?.message ?? 'Invalid attendance item.',
        });
        continue;
      }

      const { sessionCode, detectedAt } = parsed.data;
      const sessionResult = await pool.query(
        `SELECT s.id, s.started_at, s.ends_at, c.department_id, c.year
         FROM sessions s JOIN courses c ON c.id = s.course_id
         WHERE s.code = $1
         ORDER BY (s.status = 'active') DESC, s.started_at DESC
         LIMIT 1`,
        [sessionCode],
      );
      if (!sessionResult.rowCount) {
        results.push({ sessionCode, status: 'rejected', reason: 'Unknown session code.' });
        continue;
      }

      const session = sessionResult.rows[0];
      if (session.department_id !== req.user.department_id || session.year !== req.user.year) {
        results.push({ sessionCode, status: 'rejected', reason: 'This session is for a different department or year.' });
        continue;
      }
      const detectedTime = Date.parse(detectedAt);
      if (detectedTime < new Date(session.started_at).getTime() - 5 * 60_000
        || detectedTime > new Date(session.ends_at).getTime() + 5 * 60_000) {
        results.push({ sessionCode, status: 'rejected', reason: 'Detection time is outside the allowed session window.' });
        continue;
      }

      const inserted = await pool.query(
        `INSERT INTO attendance (session_id, student_id, detected_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (session_id, student_id) DO NOTHING
         RETURNING id`,
        [session.id, req.user.id, detectedAt],
      );
      results.push({ sessionCode, status: inserted.rowCount ? 'ok' : 'duplicate' });
    }
    return res.json({ results });
  } catch (error) {
    return next(error);
  }
});

export default router;
