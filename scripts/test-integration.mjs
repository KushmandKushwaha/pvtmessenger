if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required for integration tests.');
  process.exit(2);
}
const { spawnSync } = await import('node:child_process');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/integration/**/*.test.ts'], { stdio: 'inherit', shell: false });
process.exit(result.status ?? 1);
