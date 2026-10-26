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

async function createCourse(testFetch, token, code = 'MIE 101') {
  const response = await testFetch('/api/courses', postJson(token, { code, name: `Course ${code}` }));
  assert.equal(response.status, 201);
  return response.json();
}

async function createEndedSession(testFetch, token, courseId) {
  const response = await testFetch('/api/sessions', postJson(token, { courseId, durationMinutes: 60 }));
  assert.equal(response.status, 201);
  const session = await response.json();
  const ended = await testFetch(`/api/sessions/${session.id}/end`, postJson(token, {}));
  assert.equal(ended.status, 200);
  return session;
}

async function markAttendance(testFetch, studentToken, session) {
  const response = await testFetch('/api/attendance/sync', postJson(studentToken, {
    items: [{ sessionCode: session.code, detectedAt: session.startedAt }],
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].status, 'ok');
}

test('marks include 100%, 50%, and 0% students with the requested conversion', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinator = await register(testFetch, { matricule: 'COORD-MARK-001', role: 'coordinator' });
  const course = await createCourse(testFetch, coordinator);
  const full = await register(testFetch, { matricule: 'STUDENT-MARK-001' });
  const half = await register(testFetch, { matricule: 'STUDENT-MARK-002' });
  await register(testFetch, { matricule: 'STUDENT-MARK-003' });

  const first = await createEndedSession(testFetch, coordinator, course.id);
  await markAttendance(testFetch, full, first);
  await markAttendance(testFetch, half, first);
  const second = await createEndedSession(testFetch, coordinator, course.id);
  await markAttendance(testFetch, full, second);

  const response = await testFetch(`/api/courses/${course.id}/marks?max=10`, {
    headers: { authorization: `Bearer ${coordinator}` },
  });
  assert.equal(response.status, 200);
  const marks = await response.json();
  assert.equal(marks.totalSessions, 2);
  assert.equal(marks.max, 10);
  assert.deepEqual(marks.students.map(({ matricule, attended, percentage, marks: value }) => ({
    matricule, attended, percentage, marks: value,
  })), [
    { matricule: 'STUDENT-MARK-001', attended: 2, percentage: 100, marks: 10 },
    { matricule: 'STUDENT-MARK-002', attended: 1, percentage: 50, marks: 5 },
    { matricule: 'STUDENT-MARK-003', attended: 0, percentage: 0, marks: 0 },
  ]);
});

test('marks use 10 by default and include all students when no sessions were held', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinator = await register(testFetch, { matricule: 'COORD-MARK-002', role: 'coordinator' });
  const course = await createCourse(testFetch, coordinator);
  await register(testFetch, { matricule: 'STUDENT-MARK-004' });

  const response = await testFetch(`/api/courses/${course.id}/marks`, {
    headers: { authorization: `Bearer ${coordinator}` },
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.max, 10);
  assert.equal(result.totalSessions, 0);
  assert.equal(result.students.length, 1);
  assert.deepEqual(result.students[0], {
    matricule: 'STUDENT-MARK-004', fullName: 'Name STUDENT-MARK-004',
    attended: 0, percentage: 0, marks: 0,
  });
});

test('invalid marks maximum returns 400', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinator = await register(testFetch, { matricule: 'COORD-MARK-003', role: 'coordinator' });
  const course = await createCourse(testFetch, coordinator);
  for (const max of ['0', '101', 'abc']) {
    const response = await testFetch(`/api/courses/${course.id}/marks?max=${max}`, {
      headers: { authorization: `Bearer ${coordinator}` },
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /max must be/i);
  }
});

test('students and coordinators of other classes cannot view marks', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const coordinator = await register(testFetch, { matricule: 'COORD-MARK-004', role: 'coordinator' });
  const course = await createCourse(testFetch, coordinator);
  const student = await register(testFetch, { matricule: 'STUDENT-MARK-005' });
  const otherCoordinator = await register(testFetch, {
    matricule: 'COORD-MARK-005', role: 'coordinator', departmentCode: 'CPE', year: 2,
  });
  for (const token of [student, otherCoordinator]) {
    const response = await testFetch(`/api/courses/${course.id}/marks?max=10`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 403);
  }
});
