import 'dotenv/config';
import pg from 'pg';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !/test/i.test(testDatabaseUrl)) {
  throw new Error('Refusing to run tests: TEST_DATABASE_URL must contain "test".');
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL === testDatabaseUrl) {
  throw new Error('Refusing to run tests: DATABASE_URL and TEST_DATABASE_URL must differ.');
}
// The app's database module reads DATABASE_URL, so point it at the validated
// test database before dynamically importing the app in a test.
process.env.DATABASE_URL = testDatabaseUrl;

const sslMode = new URL(testDatabaseUrl).searchParams.get('sslmode');
export const testPool = new pg.Pool({
  connectionString: testDatabaseUrl,
  ...(sslMode === 'require' ? { ssl: { rejectUnauthorized: false } } : {}),
});

export async function clearTestData() {
  await testPool.query('TRUNCATE TABLE attendance, sessions, courses, users RESTART IDENTITY CASCADE');
}

export async function startTestApp(t, { clear = true } = {}) {
  if (clear) await clearTestData();
  const { app } = await import('../src/app.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(async () => {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    baseUrl,
    fetch: (path, options) => fetch(new URL(path, baseUrl), options),
  };
}
