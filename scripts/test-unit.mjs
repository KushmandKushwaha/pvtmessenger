import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/unit/**/*.test.ts'], { stdio: 'inherit', shell: false });
process.exit(result.status ?? 1);
