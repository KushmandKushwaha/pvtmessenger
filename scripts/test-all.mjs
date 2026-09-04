import { spawnSync } from 'node:child_process';

// Run Node-based checks directly instead of spawning npm.cmd recursively.
// This avoids Windows spawnSync/npm.cmd EINVAL and nested npm runner issues.
const node = process.execPath;

const commands = [
  ['node', ['scripts/test-static.mjs']],
  ['node', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['node', ['node_modules/eslint/bin/eslint.js', '.']],
  ['node', ['scripts/test-unit.mjs']],
  ['node', ['scripts/test-integration.mjs']],
  ['node', ['node_modules/playwright/cli.js', 'test']],
  ['node', ['node_modules/next/dist/bin/next', 'build']],
];

for (const [kind, args] of commands) {
  const display = kind === 'node' && args[0]?.startsWith('scripts/')
    ? `>>> node ${args.join(' ')}`
    : `>>> ${node} ${args.join(' ')}`;
  console.log(`\n${display}`);

  const result = spawnSync(node, args, { stdio: 'inherit', shell: false });

  if (result.error) {
    console.error(`Failed to start command: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
