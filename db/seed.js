import pg from 'pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const useTestDatabase = process.argv.includes('--test');
const demoMode = process.argv.includes('--demo');
const resetDemo = process.argv.includes('--reset');
const connectionString = useTestDatabase
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(`Missing required environment variable: ${useTestDatabase ? 'TEST_DATABASE_URL' : 'DATABASE_URL'}`);
}
const sslMode = new URL(connectionString).searchParams.get('sslmode');
const pool = new pg.Pool({
  connectionString,
  ...(sslMode === 'require' ? { ssl: { rejectUnauthorized: false } } : {}),
});

const departments = [
  ['CBE', 'Chemical and Biological Engineering'],
  ['CEA', 'Civil Engineering and Architecture'],
  ['CPE', 'Computer Engineering'],
  ['EEE', 'Electrical and Electronics Engineering'],
  ['MIE', 'Mechanical and Industrial Engineering'],
  ['MME', 'Mining and Mineral Engineering'],
  ['PET', 'Petroleum Engineering'],
];

export async function seedDemo(pool, { reset = false } = {}) {
  const pinHash = await bcrypt.hash('1234', 10);
  const department = await pool.query("SELECT id FROM departments WHERE code = 'MIE'");
  if (!department.rowCount) throw new Error('MIE department is missing; run the department seed first.');
  const departmentId = department.rows[0].id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (reset) {
      await client.query(
        `DELETE FROM attendance
         WHERE student_id IN (SELECT id FROM users WHERE matricule LIKE 'DEMO-%')
            OR session_id IN (SELECT id FROM sessions WHERE started_by IN (SELECT id FROM users WHERE matricule LIKE 'DEMO-%'))
            OR session_id IN (
              SELECT s.id FROM sessions s JOIN courses c ON c.id = s.course_id
              WHERE c.created_by IN (SELECT id FROM users WHERE matricule LIKE 'DEMO-%')
            )`,
      );
      await client.query(
        `DELETE FROM sessions
         WHERE started_by IN (SELECT id FROM users WHERE matricule LIKE 'DEMO-%')
            OR course_id IN (SELECT id FROM courses WHERE created_by IN (SELECT id FROM users WHERE matricule LIKE 'DEMO-%'))`,
      );
      await client.query("DELETE FROM courses WHERE created_by IN (SELECT id FROM users WHERE matricule LIKE 'DEMO-%')");
      await client.query("DELETE FROM users WHERE matricule LIKE 'DEMO-%'");
    }

    const coordinatorResult = await client.query(
      `INSERT INTO users (matricule, full_name, phone, pin_hash, role, department_id, year)
       VALUES ('DEMO-C1', 'Demo Coordinator', '69000000', $1, 'coordinator', $2, 1)
       ON CONFLICT (matricule) DO UPDATE SET pin_hash = EXCLUDED.pin_hash
       RETURNING id`,
      [pinHash, departmentId],
    );
    const coordinatorId = coordinatorResult.rows[0].id;

    const firstNames = ['Amina', 'Boris', 'Carine', 'Daphne', 'Emmanuel', 'Fabrice', 'Grace', 'Hervé', 'Irene', 'Jean', 'Kenza', 'Loïc', 'Marie', 'Nadine', 'Olivier', 'Prisca', 'Roland', 'Sandrine', 'Thierry', 'Yvette'];
    const lastNames = ['Abena', 'Biloa', 'Chimi', 'Djoumessi', 'Etoa', 'Fokou', 'Gwan', 'Happi', 'Idrissou', 'Jiofack', 'Kamdjou', 'Lontsi', 'Mballa', 'Nana', 'Onana', 'Pokam', 'Quenum', 'Simo', 'Tchoumi', 'Yong'];
    for (let index = 1; index <= 20; index += 1) {
      const matricule = `DEMO-S${String(index).padStart(2, '0')}`;
      await client.query(
        `INSERT INTO users (matricule, full_name, phone, pin_hash, role, department_id, year)
         VALUES ($1, $2, $3, $4, 'student', $5, 1)
         ON CONFLICT (matricule) DO UPDATE SET
           full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, pin_hash = EXCLUDED.pin_hash,
           role = 'student', department_id = EXCLUDED.department_id, year = 1`,
        [matricule, `${firstNames[index - 1]} ${lastNames[index - 1]}`, `690000${String(index).padStart(2, '0')}`, pinHash, departmentId],
      );
    }

    const courses = [];
    for (const [code, name] of [['MIE 101', 'Mechanics 1'], ['MIE 102', 'Engineering Drawing']]) {
      const existing = await client.query(
        'SELECT id FROM courses WHERE code = $1 AND department_id = $2 AND year = 1', [code, departmentId],
      );
      if (existing.rowCount) courses.push(existing.rows[0]);
      else {
        const inserted = await client.query(
          `INSERT INTO courses (code, name, department_id, year, created_by)
           VALUES ($1, $2, $3, 1, $4) RETURNING id`,
          [code, name, departmentId, coordinatorId],
        );
        courses.push(inserted.rows[0]);
      }
    }

    const students = await client.query("SELECT id, matricule FROM users WHERE matricule LIKE 'DEMO-S%' ORDER BY matricule");
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const sessionOffsets = [21, 17, 13, 9, 5, 1];
    for (let index = 0; index < 6; index += 1) {
      const course = courses[Math.floor(index / 3)];
      const startedAt = new Date(today.getTime() - sessionOffsets[index] * 86_400_000);
      const existing = await client.query(
        'SELECT id FROM sessions WHERE course_id = $1 AND started_by = $2 AND started_at = $3',
        [course.id, coordinatorId, startedAt],
      );
      let sessionId;
      if (existing.rowCount) sessionId = existing.rows[0].id;
      else {
        const code = `D${index + 2}AMHE`;
        const inserted = await client.query(
          `INSERT INTO sessions (course_id, started_by, code, started_at, ends_at, status)
           VALUES ($1, $2, $3, $4, $5, 'ended') RETURNING id`,
          [course.id, coordinatorId, code, startedAt, new Date(startedAt.getTime() + 60 * 60_000)],
        );
        sessionId = inserted.rows[0].id;
      }
      await client.query(
        `INSERT INTO attendance (session_id, student_id, detected_at)
         VALUES ($1, $2, $3) ON CONFLICT (session_id, student_id) DO NOTHING`,
        [sessionId, coordinatorId, startedAt],
      );
      for (let studentIndex = 0; studentIndex < students.rows.length; studentIndex += 1) {
        const attends = studentIndex < 8
          || (studentIndex < 14 && (studentIndex + index) % 2 === 0)
          || (studentIndex < 17 && (studentIndex + index) % 3 === 0)
          || (studentIndex < 20 && studentIndex === 17 && index === 0);
        if (attends) {
          await client.query(
            `INSERT INTO attendance (session_id, student_id, detected_at)
             VALUES ($1, $2, $3) ON CONFLICT (session_id, student_id) DO NOTHING`,
            [sessionId, students.rows[studentIndex].id, startedAt],
          );
        }
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

try {
  await pool.query(
    `INSERT INTO departments (code, name)
     SELECT code, name FROM unnest($1::text[], $2::text[]) AS d(code, name)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
    [departments.map(([code]) => code), departments.map(([, name]) => name)],
  );
  if (demoMode) {
    await seedDemo(pool, { reset: resetDemo });
    console.log('Demo seed is up to date.');
  } else {
    console.log('Department seed is up to date.');
  }
} finally {
  await pool.end();
}
