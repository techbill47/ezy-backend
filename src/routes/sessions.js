import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const startSchema = z.object({
  courseId: z.string().uuid(),
  durationMinutes: z.number().int().min(1).max(240),
});
const uuidSchema = z.string().uuid();
const sessionCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateSessionCode() {
  return Array.from({ length: 6 }, () => sessionCodeAlphabet[randomInt(sessionCodeAlphabet.length)]).join('');
}

function serializeSession(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    code: row.code,
    startedAt: row.started_at,
    endsAt: row.ends_at,
    status: row.status,
    courseCode: row.course_code,
    courseName: row.course_name,
  };
}

const sessionSelect = `
  SELECT s.id, s.course_id, s.started_by, s.code, s.started_at, s.ends_at, s.status,
         c.code AS course_code, c.name AS course_name
  FROM sessions s JOIN courses c ON c.id = s.course_id
`;

router.use(requireAuth);

router.post('/', async (req, res, next) => {
  if (req.user.role !== 'coordinator') {
    return res.status(403).json({ error: 'Only coordinators can start sessions.' });
  }
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid session details.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    await client.query(
      `UPDATE sessions SET status = 'ended'
       WHERE started_by = $1 AND status = 'active' AND ends_at <= now()`,
      [req.user.id],
    );
    const current = await client.query(
      "SELECT id FROM sessions WHERE started_by = $1 AND status = 'active' LIMIT 1",
      [req.user.id],
    );
    if (current.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You already have an active session.' });
    }

    const courseResult = await client.query(
      'SELECT id, code, name, department_id, year FROM courses WHERE id = $1',
      [parsed.data.courseId],
    );
    if (!courseResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Course not found.' });
    }
    const course = courseResult.rows[0];
    if (course.department_id !== req.user.department_id || course.year !== req.user.year) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'The course must belong to your department and year.' });
    }

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + parsed.data.durationMinutes * 60_000);
    let inserted;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await client.query('SAVEPOINT insert_session');
      try {
        inserted = await client.query(
          `INSERT INTO sessions (course_id, started_by, code, started_at, ends_at, status)
           VALUES ($1, $2, $3, $4, $5, 'active')
           RETURNING id, course_id, code, started_at, ends_at, status`,
          [course.id, req.user.id, generateSessionCode(), startedAt, endsAt],
        );
        await client.query('RELEASE SAVEPOINT insert_session');
        break;
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT insert_session');
        if (error.code !== '23505' || error.constraint !== 'sessions_active_code_unique' || attempt === 7) {
          throw error;
        }
      }
    }
    const session = inserted.rows[0];
    await client.query(
      `INSERT INTO attendance (session_id, student_id, detected_at)
       VALUES ($1, $2, $3) ON CONFLICT (session_id, student_id) DO NOTHING`,
      [session.id, req.user.id, startedAt],
    );
    await client.query('COMMIT');
    return res.status(201).json(serializeSession({ ...session, course_code: course.code, course_name: course.name }));
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.post('/:id/end', async (req, res, next) => {
  const parsedId = uuidSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'Session id must be a valid UUID.' });
  if (req.user.role !== 'coordinator') {
    return res.status(403).json({ error: 'Only the coordinator who started the session can end it.' });
  }
  try {
    const found = await pool.query(`${sessionSelect} WHERE s.id = $1`, [parsedId.data]);
    if (!found.rowCount) return res.status(404).json({ error: 'Session not found.' });
    if (found.rows[0].started_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the coordinator who started the session can end it.' });
    }
    if (found.rows[0].status !== 'ended') {
      await pool.query("UPDATE sessions SET status = 'ended' WHERE id = $1", [parsedId.data]);
    }
    const result = await pool.query(`${sessionSelect} WHERE s.id = $1`, [parsedId.data]);
    return res.json(serializeSession(result.rows[0]));
  } catch (error) {
    return next(error);
  }
});

router.get('/active', async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE sessions s SET status = 'ended'
       FROM courses c
       WHERE s.course_id = c.id AND c.department_id = $1 AND c.year = $2
         AND s.status = 'active' AND s.ends_at <= now()`,
      [req.user.department_id, req.user.year],
    );
    const result = await pool.query(
      `${sessionSelect}
       WHERE s.status = 'active' AND c.department_id = $1 AND c.year = $2
       ORDER BY s.started_at DESC LIMIT 1`,
      [req.user.department_id, req.user.year],
    );
    return res.json(result.rowCount ? serializeSession(result.rows[0]) : null);
  } catch (error) {
    return next(error);
  }
});

export default router;
