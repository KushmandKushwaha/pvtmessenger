import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL integration smoke test', { skip: !databaseUrl }, async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ now: string }>('SELECT NOW() AS now');
    assert.equal(result.rows.length, 1);
  } finally {
    await client.end();
  }
});
