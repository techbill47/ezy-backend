import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { startTestApp, testPool } from './helpers.js';

after(() => testPool.end());

test('returns a clear error for malformed JSON', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const response = await testFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{bad json',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid JSON body.' });
});

test('returns not found for unknown routes', async (t) => {
  const { fetch: testFetch } = await startTestApp(t);
  const response = await testFetch('/this-route-does-not-exist');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Not found.' });
});
