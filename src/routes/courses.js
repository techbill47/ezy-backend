import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const createCourseSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
});
const courseIdSchema = z.string().uuid();
const maxSchema = z.coerce.number().finite().min(1).max(100);

router.use(requireAuth);

router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT id, code, name, department_id, year
     FROM courses WHERE department_id = $1 AND year = $2
     ORDER BY code`,
    [req.user.department_id, req.user.year],
  );
  res.json(result.rows.map((course) => ({
    id: course.id,
    code: course.code,
    name: course.name,
    departmentId: course.department_id,
    year: course.year,
  })));
});

router.get('/:id/marks', async (req, res, next) => {
  const parsedId = courseIdSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'Course id must be a valid UUID.' });
  const parsedMax = req.query.max === undefined ? { success: true, data: 10 } : maxSchema.safeParse(req.query.max);
  if (!parsedMax.success) return res.status(400).json({ error: 'max must be a number from 1 to 100.' });
  if (req.user.role !== 'coordinator') {
    return res.status(403).json({ error: 'Only coordinators can view attendance marks.' });
  }

  try {
    const courseResult = await pool.query(
      'SELECT id, code, name, department_id, year FROM courses WHERE id = $1',
      [parsedId.data],
    );
    if (!courseResult.rowCount) return res.status(404).json({ error: 'Course not found.' });
    const course = courseResult.rows[0];
    if (course.department_id !== req.user.department_id || course.year !== req.user.year) {
      return res.status(403).json({ error: 'This course is for a different department or year.' });
    }

    const result = await pool.query(
      `WITH session_counts AS (
         SELECT count(*)::int AS total_sessions
         FROM sessions
         WHERE course_id = $1 AND (status = 'ended' OR ends_at <= now())
       ), attendance_counts AS (
         SELECT a.student_id, count(DISTINCT a.session_id)::int AS attended
         FROM attendance a
         JOIN sessions s ON s.id = a.session_id
         WHERE s.course_id = $1 AND (s.status = 'ended' OR s.ends_at <= now())
         GROUP BY a.student_id
       )
       SELECT u.matricule, u.full_name, coalesce(ac.attended, 0)::int AS attended,
              sc.total_sessions
       FROM users u
       CROSS JOIN session_counts sc
       LEFT JOIN attendance_counts ac ON ac.student_id = u.id
       WHERE u.department_id = $2 AND u.year = $3 AND u.role = 'student'
       ORDER BY u.matricule`,
      [course.id, course.department_id, course.year],
    );
    const totalSessions = result.rows[0]?.total_sessions ?? 0;
    const max = parsedMax.data;
    const students = result.rows.map((student) => {
      const percentage = totalSessions === 0
        ? 0
        : Math.round((student.attended / totalSessions) * 10_000) / 100;
      const marks = Math.round((percentage / 100 * max + Number.EPSILON) * 100) / 100;
      return {
        matricule: student.matricule,
        fullName: student.full_name,
        attended: student.attended,
        percentage,
        marks,
      };
    });
    return res.json({
      course: {
        id: course.id,
        code: course.code,
        name: course.name,
        departmentId: course.department_id,
        year: course.year,
      },
      max,
      totalSessions,
      students,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  if (req.user.role !== 'coordinator') {
    return res.status(403).json({ error: 'Only coordinators can create courses.' });
  }
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid course details.' });
  }
  const code = parsed.data.code.toUpperCase();
  try {
    const result = await pool.query(
      `INSERT INTO courses (code, name, department_id, year, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, code, name, department_id, year`,
      [code, parsed.data.name, req.user.department_id, req.user.year, req.user.id],
    );
    const course = result.rows[0];
    return res.status(201).json({
      id: course.id,
      code: course.code,
      name: course.name,
      departmentId: course.department_id,
      year: course.year,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A course with this code already exists for this department and year.' });
    }
    return next(error);
  }
});

export default router;
