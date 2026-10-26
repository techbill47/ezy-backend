import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import 'dotenv/config';

const useTestDatabase = process.argv.includes('--test');
const connectionString = useTestDatabase
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(`Missing required environment variable: ${useTestDatabase ? 'TEST_DATABASE_URL' : 'DATABASE_URL'}`);
}
const sslMode = new URL(connectionString).searchParams.get('sslmode');
const pool = new pg.Pool({
  connectionString,
  ...(sslMode === 'require' ? { ssl: { rejectUnauthorized: false } } : {}),
});

const here = dirname(fileURLToPath(import.meta.url));
const schema = await readFile(resolve(here, '../db/schema.sql'), 'utf8');

try {
  await pool.query(schema);
  console.log('Database schema is up to date.');
} finally {
  await pool.end();
}
