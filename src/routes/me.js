import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/attendance', requireAuth, async (req, res, next) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students have an attendance history.' });
  }

  try {
    const courseResult = await pool.query(
      `SELECT c.id, c.code, c.name,
              count(s.id) FILTER (
                WHERE s.status = 'ended' OR s.ends_at <= now()
              )::int AS total_sessions,
              count(a.id) FILTER (
                WHERE s.status = 'ended' OR s.ends_at <= now()
              )::int AS attended
       FROM courses c
       LEFT JOIN sessions s ON s.course_id = c.id
       LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = $3
       WHERE c.department_id = $1 AND c.year = $2
       GROUP BY c.id
       ORDER BY c.code`,
      [req.user.department_id, req.user.year, req.user.id],
    );
    const recordResult = await pool.query(
      `SELECT s.code AS session_code, c.code AS course_code, c.name AS course_name,
              a.detected_at, a.synced_at
       FROM attendance a
       JOIN sessions s ON s.id = a.session_id
       JOIN courses c ON c.id = s.course_id
       WHERE a.student_id = $1
       ORDER BY a.detected_at DESC, a.synced_at DESC
       LIMIT 100`,
      [req.user.id],
    );

    const courses = courseResult.rows.map((course) => {
      const percentage = course.total_sessions === 0
        ? 0
        : Math.round((course.attended / course.total_sessions) * 1000) / 10;
      return {
        courseId: course.id,
        code: course.code,
        name: course.name,
        attended: course.attended,
        totalSessions: course.total_sessions,
        percentage,
      };
    });
    const attended = courses.reduce((total, course) => total + course.attended, 0);
    const totalSessions = courses.reduce((total, course) => total + course.totalSessions, 0);
    const overallPercentage = totalSessions === 0
      ? 0
      : Math.round((attended / totalSessions) * 1000) / 10;

    return res.json({
      overall: { attended, totalSessions, percentage: overallPercentage },
      courses,
      records: recordResult.rows.map((record) => ({
        sessionCode: record.session_code,
        courseCode: record.course_code,
        courseName: record.course_name,
        detectedAt: record.detected_at,
        syncedAt: record.synced_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
