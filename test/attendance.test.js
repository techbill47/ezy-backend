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

async function makeSession(testFetch, coordinatorToken, { courseCode = 'MIE 101' } = {}) {
  const courseResponse = await testFetch('/api/courses', postJson(coordinatorToken, {
    code: courseCode, name: `Course ${courseCode}`,
  }));
  assert.equal(courseResponse.status, 201);
  const course = await courseResponse.json();
  const sessionResponse = await testFetch('/api/sessions', postJson(coordinatorToken, {
    courseId: course.id, durationMinutes: 60,
  }));
  assert.equal(sessionResponse.status, 201);
  return { course, session: await sessionResponse.json() };
}

async function sync(testFetch, token, items) {
  const response = await testFetch('/api/attendance/sync', postJson(token, { items }));
  assert.equal(response.status, 200);
  return (await response.json()).results;
}

async function unusedSessionCode() {
  for (const code of ['AAAAAA', 'BBBBBB', 'CCCCCC', 'DDDDDD']) {
    const found = await testPool.query('SELECT 1 FROM sessions WHERE code = $1 LIMIT 1', [code]);
    if (!found.rowCount) return code;
  }
  assert.fail('Expected an unused test session code.');
}

test('attendance sync accepts an ended session and safely reports a duplicate', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinatorToken = await register(testFetch, { matricule: 'COORD-ATT-001', role: 'coordinator' });
  const { session } = await makeSession(testFetch, coordinatorToken);
  const ended = await testFetch(`/api/sessions/${session.id}/end`, postJson(coordinatorToken, {}));
  assert.equal(ended.status, 200);
  const studentToken = await register(testFetch, { matricule: 'STUDENT-ATT-001' });
  const item = { sessionCode: session.code, detectedAt: session.startedAt };

  assert.deepEqual(await sync(testFetch, studentToken, [item]), [{ sessionCode: session.code, status: 'ok' }]);
  assert.deepEqual(await sync(testFetch, studentToken, [item]), [{ sessionCode: session.code, status: 'duplicate' }]);
  const rows = await testPool.query('SELECT count(*)::int AS count FROM attendance WHERE session_id = $1', [session.id]);
  assert.equal(rows.rows[0].count, 2); // coordinator plus one student row
});

test('attendance sync rejects a student from another class', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinatorToken = await register(testFetch, { matricule: 'COORD-ATT-002', role: 'coordinator' });
  const { session } = await makeSession(testFetch, coordinatorToken);
  const otherStudentToken = await register(testFetch, {
    matricule: 'STUDENT-ATT-002', departmentCode: 'CPE', year: 2,
  });
  const [result] = await sync(testFetch, otherStudentToken, [{
    sessionCode: session.code, detectedAt: session.startedAt,
  }]);
  assert.equal(result.status, 'rejected');
  assert.match(result.reason, /different department or year/i);
});

test('attendance sync rejects a detection outside the allowed time window', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinatorToken = await register(testFetch, { matricule: 'COORD-ATT-003', role: 'coordinator' });
  const { session } = await makeSession(testFetch, coordinatorToken);
  const studentToken = await register(testFetch, { matricule: 'STUDENT-ATT-003' });
  const detectedAt = new Date(Date.parse(session.startedAt) - 6 * 60_000).toISOString();
  const [result] = await sync(testFetch, studentToken, [{ sessionCode: session.code, detectedAt }]);
  assert.equal(result.status, 'rejected');
  assert.match(result.reason, /outside the allowed session window/i);
});

test('attendance sync rejects an unknown code', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const studentToken = await register(testFetch, { matricule: 'STUDENT-ATT-004' });
  const [result] = await sync(testFetch, studentToken, [{
    sessionCode: await unusedSessionCode(), detectedAt: new Date().toISOString(),
  }]);
  assert.equal(result.status, 'rejected');
  assert.match(result.reason, /unknown session code/i);
});

test('one sync batch returns a result for every valid, invalid, and rejected item', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinatorToken = await register(testFetch, { matricule: 'COORD-ATT-005', role: 'coordinator' });
  const { session } = await makeSession(testFetch, coordinatorToken);
  const studentToken = await register(testFetch, { matricule: 'STUDENT-ATT-005' });
  const unknownCode = await unusedSessionCode();
  const [ok, unknown, invalidDate] = await sync(testFetch, studentToken, [
    { sessionCode: session.code, detectedAt: session.startedAt },
    { sessionCode: unknownCode, detectedAt: session.startedAt },
    { sessionCode: session.code, detectedAt: 'yesterday' },
  ]);
  assert.deepEqual([ok.status, unknown.status, invalidDate.status], ['ok', 'rejected', 'rejected']);
  assert.equal(invalidDate.sessionCode, session.code);
  assert.match(invalidDate.reason, /datetime|ISO/i);
});

test('a coordinator report includes the coordinator and absent students', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinatorToken = await register(testFetch, { matricule: 'COORD-ATT-006', role: 'coordinator' });
  const { course, session } = await makeSession(testFetch, coordinatorToken);
  const presentToken = await register(testFetch, { matricule: 'STUDENT-ATT-006A' });
  const absentToken = await register(testFetch, { matricule: 'STUDENT-ATT-006B' });
  await sync(testFetch, presentToken, [{ sessionCode: session.code, detectedAt: session.startedAt }]);
  assert.ok(absentToken);

  const response = await testFetch(`/api/sessions/${session.id}/report`, {
    headers: { authorization: `Bearer ${coordinatorToken}` },
  });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.deepEqual(report.course, {
    id: course.id,
    code: course.code,
    name: course.name,
    departmentId: course.departmentId,
    year: course.year,
  });
  const coordinator = report.students.find(({ matricule }) => matricule === 'COORD-ATT-006');
  const present = report.students.find(({ matricule }) => matricule === 'STUDENT-ATT-006A');
  const absent = report.students.find(({ matricule }) => matricule === 'STUDENT-ATT-006B');
  assert.equal(coordinator.present, true);
  assert.equal(present.present, true);
  assert.ok(present.markedAt);
  assert.equal(absent.present, false);
  assert.equal(absent.markedAt, null);
  assert.deepEqual(report.students.map(({ matricule }) => matricule),
    report.students.map(({ matricule }) => matricule).sort());
});

test('a student cannot view the attendance report', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinatorToken = await register(testFetch, { matricule: 'COORD-ATT-007', role: 'coordinator' });
  const { session } = await makeSession(testFetch, coordinatorToken);
  const studentToken = await register(testFetch, { matricule: 'STUDENT-ATT-007' });
  const response = await testFetch(`/api/sessions/${session.id}/report`, {
    headers: { authorization: `Bearer ${studentToken}` },
  });
  assert.equal(response.status, 403);
});
