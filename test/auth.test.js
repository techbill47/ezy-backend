import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { nextTestPhone, startTestApp, testPool } from './helpers.js';

after(() => testPool.end());

async function registrationPayload(overrides = {}) {
  const department = await testPool.query("SELECT id FROM departments WHERE code = 'MIE'");
  assert.ok(department.rowCount, 'department seed must be applied before tests');
  return {
    matricule: 'STU-001',
    fullName: 'Test Student',
    phone: nextTestPhone(),
    pin: '1234',
    departmentId: department.rows[0].id,
    year: 1,
    role: 'student',
    ...overrides,
  };
}

async function register(testFetch, payload) {
  return testFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

test('registers and logs in, returning a token and safe user object', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const payload = await registrationPayload();
  const registered = await register(testFetch, payload);
  assert.equal(registered.status, 201);
  const created = await registered.json();
  assert.equal(typeof created.token, 'string');
  assert.deepEqual(created.user, {
    id: created.user.id,
    matricule: payload.matricule,
    fullName: payload.fullName,
    phone: payload.phone,
    role: 'student',
    departmentId: payload.departmentId,
    year: payload.year,
  });
  assert.equal(JSON.stringify(created).includes(payload.pin), false);
  assert.equal(JSON.stringify(created).includes('pin_hash'), false);

  const login = await testFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ matricule: payload.matricule, pin: payload.pin }),
  });
  assert.equal(login.status, 200);
  const loggedIn = await login.json();
  assert.equal(typeof loggedIn.token, 'string');
  assert.equal(loggedIn.user.id, created.user.id);
});

test('rejects a duplicate matricule', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const payload = await registrationPayload();
  assert.equal((await register(testFetch, payload)).status, 201);
  const response = await register(testFetch, { ...payload, phone: nextTestPhone() });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /matricule/i);
});

test('normalizes matricule casing on registration and login and rejects casing duplicates', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const payload = await registrationPayload({ matricule: '  demo-s01  ' });
  const registered = await register(testFetch, payload);
  assert.equal(registered.status, 201);
  const created = await registered.json();
  assert.equal(created.user.matricule, 'DEMO-S01');

  const login = await testFetch('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ matricule: ' demo-s01 ', pin: payload.pin }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.matricule, 'DEMO-S01');

  const duplicate = await register(testFetch, { ...payload, matricule: 'demo-s01', phone: nextTestPhone() });
  assert.equal(duplicate.status, 409);
  assert.match((await duplicate.json()).error, /matricule/i);
});

test('allows more than ten successful logins in a row', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const payload = await registrationPayload();
  assert.equal((await register(testFetch, payload)).status, 201);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await testFetch('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matricule: payload.matricule, pin: payload.pin }),
    });
    assert.equal(response.status, 200, `login ${attempt + 1} should succeed`);
  }
});

test('rejects a duplicate phone number', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const payload = await registrationPayload();
  assert.equal((await register(testFetch, payload)).status, 201);
  const response = await register(testFetch, { ...payload, matricule: 'STU-002' });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /phone/i);
});

test('rejects a wrong PIN', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const payload = await registrationPayload();
  assert.equal((await register(testFetch, payload)).status, 201);
  const response = await testFetch('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ matricule: payload.matricule, pin: '9999' }),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Invalid matricule or PIN.' });
});

test('rejects coordinator registration without the coordinator code', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const response = await register(testFetch, await registrationPayload({ role: 'coordinator' }));
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /coordinator code/i);
});

test('registers a coordinator with the correct code', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const response = await register(testFetch, await registrationPayload({
    role: 'coordinator', coordinatorCode: process.env.COORDINATOR_CODE,
  }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.user.role, 'coordinator');
  assert.equal(body.user.pin_hash, undefined);
});

test('requires a token for /api/me', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const response = await testFetch('/api/me');
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /bearer token/i);
});

test('rejects an invalid PIN format', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const response = await register(testFetch, await registrationPayload({ pin: '12a4' }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /4 digits/i);
});
