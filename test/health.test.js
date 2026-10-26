import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import pg from 'pg';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const appDatabaseUrl = process.env.DATABASE_URL;

if (!testDatabaseUrl || !/test/i.test(testDatabaseUrl)) {
  throw new Error('Refusing to run tests: TEST_DATABASE_URL must contain "test".');
}
if (appDatabaseUrl && appDatabaseUrl === testDatabaseUrl) {
  throw new Error('Refusing to run tests: DATABASE_URL and TEST_DATABASE_URL must differ.');
}

const testPool = new pg.Pool({ connectionString: testDatabaseUrl });
after(() => testPool.end());

test('health responds successfully and the test database is reachable', async () => {
  const result = await testPool.query('SELECT current_database() AS name');
  assert.match(result.rows[0].name, /test/i);

  const { app } = await import('../src/app.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(typeof body.time, 'string');
    assert.ok(Number.isFinite(Date.parse(body.time)));
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
  }
});
