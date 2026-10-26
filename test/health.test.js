import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { startTestApp, testPool } from './helpers.js';

after(() => testPool.end());

test('health responds successfully and the test database is reachable', async (t) => {
  const result = await testPool.query('SELECT current_database() AS name');
  assert.match(result.rows[0].name, /test/i);

  const { fetch: testFetch } = await startTestApp(t);
  const response = await testFetch('/health');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.time, 'string');
  assert.ok(Number.isFinite(Date.parse(body.time)));
});
