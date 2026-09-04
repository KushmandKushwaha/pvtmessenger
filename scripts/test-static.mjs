import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const excluded = new Set(['test-all.mjs', 'test-static.mjs', 'test-unit.mjs', 'test-integration.mjs']);
const files = (await readdir(join(root, 'scripts')))
  .filter((file) => file.startsWith('test-') && file.endsWith('.mjs') && !excluded.has(file))
  .sort();

files.push('check-migration.mjs');

if (files.length === 0) {
  console.error('No project verification scripts were found.');
  process.exit(1);
}

for (const file of files) {
  console.log(`\n>>> node scripts/${file}`);
  const result = spawnSync(process.execPath, [`scripts/${file}`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
