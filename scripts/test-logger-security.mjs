import assert from 'node:assert/strict';
import fs from 'node:fs';
const text = fs.readFileSync('src/lib/logger.ts', 'utf8');
assert.match(text, /SENSITIVE_KEY/);
for (const key of ['password', 'token', 'secret', 'authorization', 'cookie', 'ciphertext', 'search.?query']) assert.ok(text.includes(key), `missing redaction key: ${key}`);
assert.match(text, /instanceof Error/);
console.log('Logger redaction checks passed.');
