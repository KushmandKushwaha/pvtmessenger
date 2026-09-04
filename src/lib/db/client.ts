import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

import { logger } from '../logger';

const globalForDb = globalThis as unknown as {
  dbPool?: Pool;
};

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to initialize the database client.');
  }

  return databaseUrl;
}

/**
 * Lazily initializes the PostgreSQL pool. This prevents Next.js build-time
 * route collection from requiring deployment-only database configuration.
 * DATABASE_URL is still mandatory whenever the application actually uses DB.
 */
export function getDb(): Pool {
  if (globalForDb.dbPool) return globalForDb.dbPool;

  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'privacy-messenger',
  });

  pool.on('error', (error) => {
    logger.error('Unexpected PostgreSQL pool error', { error });
  });

  // Reuse the pool across warm server instances, including production.
  // This also lets graceful-shutdown code close the active pool cleanly.
  globalForDb.dbPool = pool;

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  return getDb().query<T>(text, values);
}

export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getDb().connect();

  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  const pool = globalForDb.dbPool;
  if (!pool) return;

  await pool.end();
  delete globalForDb.dbPool;
}
