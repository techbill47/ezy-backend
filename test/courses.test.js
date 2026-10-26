import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { nextTestPhone, startTestApp, testPool } from './helpers.js';

after(() => testPool.end());

async function register(testFetch, { matricule, role = 'student', year = 1, departmentCode = 'MIE' }) {
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

function json(token, body) {
  return {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

test('a coordinator creates a course with normalized code and own class', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const token = await register(testFetch, { matricule: 'COORD-001', role: 'coordinator' });
  const response = await testFetch('/api/courses', json(token, { code: '  cs 101 ', name: 'Intro to Computing' }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    id: (await testPool.query('SELECT id FROM courses')).rows[0].id,
    code: 'CS 101',
    name: 'Intro to Computing',
    departmentId: (await testPool.query("SELECT id FROM departments WHERE code = 'MIE'")).rows[0].id,
    year: 1,
  });
});

test('a student is refused when creating a course', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const token = await register(testFetch, { matricule: 'STUDENT-001' });
  const response = await testFetch('/api/courses', json(token, { code: 'CS 101', name: 'Intro' }));
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /coordinators/i);
});

test('a duplicate course code in the same class returns 409', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const token = await register(testFetch, { matricule: 'COORD-002', role: 'coordinator' });
  assert.equal((await testFetch('/api/courses', json(token, { code: 'CPE 101', name: 'First' }))).status, 201);
  const response = await testFetch('/api/courses', json(token, { code: ' cpe 101 ', name: 'Second' }));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /department and year/i);
});

test('a student only sees courses for their department and year', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const mieCoordinator = await register(testFetch, { matricule: 'COORD-003', role: 'coordinator' });
  const cpeCoordinator = await register(testFetch, {
    matricule: 'COORD-004', role: 'coordinator', departmentCode: 'CPE', year: 2,
  });
  await testFetch('/api/courses', json(mieCoordinator, { code: 'MIE 101', name: 'MIE Year 1' }));
  await testFetch('/api/courses', json(cpeCoordinator, { code: 'CPE 201', name: 'CPE Year 2' }));
  const studentToken = await register(testFetch, { matricule: 'STUDENT-002' });
  const response = await testFetch('/api/courses', {
    headers: { authorization: `Bearer ${studentToken}` },
  });
  assert.equal(response.status, 200);
  const courses = await response.json();
  assert.deepEqual(courses.map(({ code }) => code), ['MIE 101']);
});

test('a student in a different department and year sees none of the other class courses', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const mieCoordinator = await register(testFetch, { matricule: 'COORD-005', role: 'coordinator' });
  const created = await testFetch('/api/courses', json(mieCoordinator, {
    code: 'MIE 101', name: 'MIE Year 1',
  }));
  assert.equal(created.status, 201);

  const otherClassToken = await register(testFetch, {
    matricule: 'STUDENT-005', departmentCode: 'CPE', year: 2,
  });
  const response = await testFetch('/api/courses', {
    headers: { authorization: `Bearer ${otherClassToken}` },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('GET /api/courses requires a token', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const response = await testFetch('/api/courses');
  assert.equal(response.status, 401);
});
