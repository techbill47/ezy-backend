import pg from 'pg';
import { config } from './config.js';

const sslMode = new URL(config.databaseUrl).searchParams.get('sslmode');
const ssl = sslMode === 'require' ? { rejectUnauthorized: false } : undefined;

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ...(ssl ? { ssl } : {}),
});
