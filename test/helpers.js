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

let phoneSequence = 0;
export function nextTestPhone() {
  phoneSequence += 1;
  return `6${String(phoneSequence).padStart(8, '0')}`;
}

const fetchBlockedPorts = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69,
  77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119,
  123, 135, 137, 139, 143, 179, 389, 427, 465, 512, 513, 514, 515, 526,
  530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566,
  6665, 6666, 6667, 6668, 6669, 6697, 10080,
]);

async function closeServer(server) {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function listenOnFetchSafePort(app) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const port = server.address().port;
    if (!fetchBlockedPorts.has(port)) return server;
    await closeServer(server);
  }
  throw new Error('Could not allocate a fetch-safe test port after 20 attempts.');
}

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
  const server = await listenOnFetchSafePort(app);
  t.after(async () => {
    await closeServer(server);
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    baseUrl,
    fetch: (path, options) => fetch(new URL(path, baseUrl), options),
  };
}
