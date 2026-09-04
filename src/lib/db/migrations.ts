import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { withTransaction } from './client';

const migrationsDirectory = path.join(process.cwd(), 'db', 'migrations');

export async function runMigrations(): Promise<void> {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  await withTransaction(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    const applied = new Set(appliedResult.rows.map((row) => row.version));

    for (const file of files) {
      const version = file.slice(0, file.indexOf('_'));

      if (applied.has(version)) {
        continue;
      }

      const sql = await readFile(path.join(migrationsDirectory, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    }
  });
}
