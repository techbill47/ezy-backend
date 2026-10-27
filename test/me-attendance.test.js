import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { nextTestPhone, startTestApp, testPool } from './helpers.js';

after(() => testPool.end());

async function register(testFetch, { matricule, role = 'student' }) {
  const department = await testPool.query('SELECT id FROM departments WHERE code = $1', ['MIE']);
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
      year: 1,
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

async function createCourse(testFetch, coordinatorToken, code) {
  const response = await testFetch('/api/courses', postJson(coordinatorToken, {
    code, name: `Course ${code}`,
  }));
  assert.equal(response.status, 201);
  return response.json();
}

async function createSession(testFetch, coordinatorToken, courseId, { ended = true } = {}) {
  const response = await testFetch('/api/sessions', postJson(coordinatorToken, {
    courseId, durationMinutes: 60,
  }));
  assert.equal(response.status, 201);
  const session = await response.json();
  if (ended) {
    const endedResponse = await testFetch(`/api/sessions/${session.id}/end`, postJson(coordinatorToken, {}));
    assert.equal(endedResponse.status, 200);
  }
  return session;
}

async function markAttendance(testFetch, token, session) {
  const response = await testFetch('/api/attendance/sync', postJson(token, {
    items: [{ sessionCode: session.code, detectedAt: session.startedAt }],
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].status, 'ok');
}

test('student attendance includes course totals and only the student’s own records', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinator = await register(testFetch, { matricule: 'COORD-HISTORY-001', role: 'coordinator' });
  const student = await register(testFetch, { matricule: 'STUDENT-HISTORY-001' });
  const otherStudent = await register(testFetch, { matricule: 'STUDENT-HISTORY-002' });
  const courseA = await createCourse(testFetch, coordinator, 'MIE 101');
  const courseB = await createCourse(testFetch, coordinator, 'MIE 102');
  await createCourse(testFetch, coordinator, 'MIE 103');

  const sessionA = await createSession(testFetch, coordinator, courseA.id);
  const sessionB1 = await createSession(testFetch, coordinator, courseB.id);
  const sessionB2 = await createSession(testFetch, coordinator, courseB.id);
  await markAttendance(testFetch, student, sessionA);
  await markAttendance(testFetch, student, sessionB1);
  await markAttendance(testFetch, otherStudent, sessionA);

  const activeSession = await createSession(testFetch, coordinator, courseA.id, { ended: false });
  await markAttendance(testFetch, student, activeSession);
  await markAttendance(testFetch, otherStudent, activeSession);

  const response = await testFetch('/api/me/attendance', {
    headers: { authorization: `Bearer ${student}` },
  });
  assert.equal(response.status, 200);
  const history = await response.json();
  assert.deepEqual(history.overall, { attended: 2, totalSessions: 3, percentage: 66.7 });
  assert.deepEqual(history.courses, [
    { courseId: courseA.id, code: 'MIE 101', name: 'Course MIE 101', attended: 1, totalSessions: 1, percentage: 100 },
    { courseId: courseB.id, code: 'MIE 102', name: 'Course MIE 102', attended: 1, totalSessions: 2, percentage: 50 },
    { courseId: (await testPool.query('SELECT id FROM courses WHERE code = $1', ['MIE 103'])).rows[0].id,
      code: 'MIE 103', name: 'Course MIE 103', attended: 0, totalSessions: 0, percentage: 0 },
  ]);
  assert.equal(history.records.length, 3);
  assert.deepEqual(new Set(history.records.map(({ sessionCode }) => sessionCode)),
    new Set([sessionA.code, sessionB1.code, activeSession.code]));
  assert.ok(history.records.every(({ sessionCode }) => sessionCode !== sessionB2.code));
  assert.deepEqual(
    history.records.map(({ detectedAt }) => Date.parse(detectedAt)),
    history.records.map(({ detectedAt }) => Date.parse(detectedAt)).sort((a, b) => b - a),
  );
  assert.ok(history.records.some(({ sessionCode }) => sessionCode === activeSession.code));

  const otherResponse = await testFetch('/api/me/attendance', {
    headers: { authorization: `Bearer ${otherStudent}` },
  });
  assert.equal(otherResponse.status, 200);
  const otherHistory = await otherResponse.json();
  assert.deepEqual(new Set(otherHistory.records.map(({ sessionCode }) => sessionCode)),
    new Set([sessionA.code, activeSession.code]));
  assert.equal(otherHistory.overall.attended, 1);
});

test('coordinators cannot view student attendance history', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinator = await register(testFetch, { matricule: 'COORD-HISTORY-002', role: 'coordinator' });
  const response = await testFetch('/api/me/attendance', {
    headers: { authorization: `Bearer ${coordinator}` },
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Only students have an attendance history.' });
});

test('attendance history requires a Bearer token', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const response = await testFetch('/api/me/attendance');
  assert.equal(response.status, 401);
});
