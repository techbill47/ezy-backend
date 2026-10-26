import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { nextTestPhone, startTestApp, testPool } from './helpers.js';

after(() => testPool.end());

async function register(testFetch, { matricule, role = 'student', departmentCode = 'MIE', year = 1 }) {
  const department = await testPool.query('SELECT id FROM departments WHERE code = $1', [departmentCode]);
  assert.ok(department.rowCount);
  const response = await testFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      matricule,
      fullName: `Name ${matricule}`,
      phone: nextTestPhone(),
      pin: '1234',
      departmentId: department.rows[0].id,
      year,
      role,
      ...(role === 'coordinator' ? { coordinatorCode: process.env.COORDINATOR_CODE } : {}),
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).token;
}

function postJson(token, body) {
  return {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function createCourse(testFetch, token, { code = 'MIE 101', name = 'Test Course' } = {}) {
  const response = await testFetch('/api/courses', postJson(token, { code, name }));
  assert.equal(response.status, 201);
  return response.json();
}

async function startSession(testFetch, token, courseId, durationMinutes = 60) {
  return testFetch('/api/sessions', postJson(token, { courseId, durationMinutes }));
}

test('a coordinator starts a session with a valid code and is marked present', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinatorToken = await register(testFetch, { matricule: 'COORD-SESSION-001', role: 'coordinator' });
  const course = await createCourse(testFetch, coordinatorToken);
  const response = await startSession(testFetch, coordinatorToken, course.id, 30);
  assert.equal(response.status, 201);
  const session = await response.json();
  assert.match(session.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(session.courseId, course.id);
  assert.equal(session.courseCode, course.code);
  assert.equal(session.courseName, course.name);
  assert.equal(session.status, 'active');
  assert.ok(Number.isFinite(Date.parse(session.startedAt)));
  assert.ok(Number.isFinite(Date.parse(session.endsAt)));
  assert.equal(Date.parse(session.endsAt) - Date.parse(session.startedAt), 30 * 60_000);

  const attendance = await testPool.query(
    `SELECT a.id FROM attendance a JOIN users u ON u.id = a.student_id
     WHERE a.session_id = $1 AND u.role = 'coordinator'`,
    [session.id],
  );
  assert.equal(attendance.rowCount, 1);
});

test('a coordinator cannot start a second active session', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const token = await register(testFetch, { matricule: 'COORD-SESSION-002', role: 'coordinator' });
  const course = await createCourse(testFetch, token);
  assert.equal((await startSession(testFetch, token, course.id)).status, 201);
  const response = await startSession(testFetch, token, course.id);
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /active session/i);
});

test('a student cannot start a session', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinatorToken = await register(testFetch, { matricule: 'COORD-SESSION-003', role: 'coordinator' });
  const course = await createCourse(testFetch, coordinatorToken);
  const studentToken = await register(testFetch, { matricule: 'STUDENT-SESSION-003' });
  const response = await startSession(testFetch, studentToken, course.id);
  assert.equal(response.status, 403);
});

test('a coordinator cannot start a session for another class course', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const mieToken = await register(testFetch, { matricule: 'COORD-SESSION-004', role: 'coordinator' });
  const course = await createCourse(testFetch, mieToken);
  const cpeToken = await register(testFetch, {
    matricule: 'COORD-SESSION-005', role: 'coordinator', departmentCode: 'CPE', year: 2,
  });
  const response = await startSession(testFetch, cpeToken, course.id);
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /department and year/i);
});

test('ending a session is idempotent and active lookup returns null', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const token = await register(testFetch, { matricule: 'COORD-SESSION-006', role: 'coordinator' });
  const course = await createCourse(testFetch, token);
  const started = await startSession(testFetch, token, course.id);
  const session = await started.json();

  const ended = await testFetch(`/api/sessions/${session.id}/end`, postJson(token, {}));
  assert.equal(ended.status, 200);
  assert.equal((await ended.json()).status, 'ended');
  const endedAgain = await testFetch(`/api/sessions/${session.id}/end`, postJson(token, {}));
  assert.equal(endedAgain.status, 200);
  assert.equal((await endedAgain.json()).status, 'ended');

  const active = await testFetch('/api/sessions/active', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(active.status, 200);
  assert.equal(await active.json(), null);
});

test('a different coordinator cannot end another coordinator session', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const ownerToken = await register(testFetch, { matricule: 'COORD-SESSION-007', role: 'coordinator' });
  const course = await createCourse(testFetch, ownerToken);
  const session = await (await startSession(testFetch, ownerToken, course.id)).json();
  const strangerToken = await register(testFetch, { matricule: 'COORD-SESSION-008', role: 'coordinator' });

  const response = await testFetch(`/api/sessions/${session.id}/end`, postJson(strangerToken, {}));
  assert.equal(response.status, 403);
  const stored = await testPool.query('SELECT status FROM sessions WHERE id = $1', [session.id]);
  assert.equal(stored.rows[0].status, 'active');
});

test('active lookup automatically ends expired sessions', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const token = await register(testFetch, { matricule: 'COORD-SESSION-009', role: 'coordinator' });
  const course = await createCourse(testFetch, token);
  const session = await (await startSession(testFetch, token, course.id)).json();
  await testPool.query("UPDATE sessions SET ends_at = now() - interval '1 second' WHERE id = $1", [session.id]);

  const response = await testFetch('/api/sessions/active', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.equal(await response.json(), null);
  const stored = await testPool.query('SELECT status FROM sessions WHERE id = $1', [session.id]);
  assert.equal(stored.rows[0].status, 'ended');
});
