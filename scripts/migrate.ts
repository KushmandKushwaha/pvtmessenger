import { closeDb, runMigrations } from '../src/lib/db';

async function main(): Promise<void> {
  try {
    await runMigrations();
    console.log('Database migrations applied successfully.');
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error('Database migration failed.', error);
  process.exitCode = 1;
});
