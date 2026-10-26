import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const createCourseSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

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
