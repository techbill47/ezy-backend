import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, test } from 'node:test';
import { startTestApp, testPool } from './helpers.js';

after(() => testPool.end());

test('GET /api/departments returns seeded departments sorted by name', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const response = await testFetch('/api/departments');
  assert.equal(response.status, 200);
  const departments = await response.json();
  assert.ok(departments.length > 0);
  assert.deepEqual(departments.map(({ name }) => name), departments.map(({ name }) => name).sort());
  assert.deepEqual(Object.keys(departments[0]).sort(), ['code', 'id', 'name']);
});

test('running the department seed twice creates no duplicates', async () => {
  const seedArgs = ['db/seed.js', '--test'];
  execFileSync(process.execPath, seedArgs, { cwd: process.cwd(), stdio: 'ignore' });
  execFileSync(process.execPath, seedArgs, { cwd: process.cwd(), stdio: 'ignore' });
  const result = await testPool.query(
    'SELECT count(*)::int AS count, count(DISTINCT code)::int AS unique_count FROM departments',
  );
  assert.equal(result.rows[0].count, result.rows[0].unique_count);
  assert.equal(result.rows[0].count, 7);
});
