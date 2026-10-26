import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool } from '../src/db.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = await readFile(resolve(here, '../db/schema.sql'), 'utf8');

try {
  await pool.query(schema);
  console.log('Database schema is up to date.');
} finally {
  await pool.end();
}
