import { pool } from '../src/db.js';

const departments = [
  ['CBE', 'Chemical and Biological Engineering'],
  ['CEA', 'Civil Engineering and Architecture'],
  ['CPE', 'Computer Engineering'],
  ['EEE', 'Electrical and Electronics Engineering'],
  ['MIE', 'Mechanical and Industrial Engineering'],
  ['MME', 'Mining and Mineral Engineering'],
  ['PET', 'Petroleum Engineering'],
];

try {
  await pool.query(
    `INSERT INTO departments (code, name)
     SELECT code, name FROM unnest($1::text[], $2::text[]) AS d(code, name)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
    [departments.map(([code]) => code), departments.map(([, name]) => name)],
  );
  console.log('Department seed is up to date.');
} finally {
  await pool.end();
}
