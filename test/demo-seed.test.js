import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, test } from 'node:test';
import bcrypt from 'bcryptjs';
import { clearTestData, testPool } from './helpers.js';

after(() => testPool.end());

test('demo seed is idempotent and uses the test database when explicitly requested', async () => {
  await clearTestData();
  const args = ['db/seed.js', '--demo', '--test'];
  execFileSync(process.execPath, args, { cwd: process.cwd(), stdio: 'ignore' });
  const firstCounts = await testPool.query(
    `SELECT (SELECT count(*)::int FROM users WHERE matricule LIKE 'DEMO-%') AS users,
            (SELECT count(*)::int FROM courses WHERE code IN ('MIE 101', 'MIE 102')) AS courses,
            (SELECT count(*)::int FROM sessions WHERE started_by IN (SELECT id FROM users WHERE matricule = 'DEMO-C1')) AS sessions,
            (SELECT count(*)::int FROM attendance WHERE session_id IN
              (SELECT id FROM sessions WHERE started_by IN (SELECT id FROM users WHERE matricule = 'DEMO-C1'))) AS attendance`,
  );
  execFileSync(process.execPath, args, { cwd: process.cwd(), stdio: 'ignore' });
  const secondCounts = await testPool.query(
    `SELECT (SELECT count(*)::int FROM users WHERE matricule LIKE 'DEMO-%') AS users,
            (SELECT count(*)::int FROM courses WHERE code IN ('MIE 101', 'MIE 102')) AS courses,
            (SELECT count(*)::int FROM sessions WHERE started_by IN (SELECT id FROM users WHERE matricule = 'DEMO-C1')) AS sessions,
            (SELECT count(*)::int FROM attendance WHERE session_id IN
              (SELECT id FROM sessions WHERE started_by IN (SELECT id FROM users WHERE matricule = 'DEMO-C1'))) AS attendance`,
  );
  assert.deepEqual(secondCounts.rows, firstCounts.rows);
  assert.deepEqual(secondCounts.rows[0], { users: 21, courses: 2, sessions: 6, attendance: 79 });
  const coordinator = await testPool.query("SELECT pin_hash FROM users WHERE matricule = 'DEMO-C1'");
  assert.equal(await bcrypt.compare('1234', coordinator.rows[0].pin_hash), true);
  const sessions = await testPool.query("SELECT code, status, EXTRACT(EPOCH FROM (ends_at - started_at)) AS duration_seconds FROM sessions");
  assert.equal(sessions.rowCount, 6);
  for (const session of sessions.rows) {
    assert.match(session.code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(session.status, 'ended');
    assert.equal(Number(session.duration_seconds), 3600);
  }
});
