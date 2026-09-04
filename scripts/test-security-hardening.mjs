import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const csrf = read('src/lib/http-security.ts');
assert.match(csrf, /Origin/);
assert.match(csrf, /Cross-site request rejected/);
assert.match(csrf, /getReader/);
assert.match(csrf, /maxBytes/);

const config = read('next.config.ts');
for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy']) {
  assert.match(config, new RegExp(header.replaceAll('-', '\\-')));
}

const cookie = read('src/lib/auth/anonymous.ts');
assert.match(cookie, /SESSION_COOKIE_SECURE/);
assert.match(cookie, /NODE_ENV === "production"/);

const signup = read('src/app/api/auth/anonymous/route.ts');
assert.match(signup, /requireSameOrigin/);
assert.match(signup, /secure: SESSION_COOKIE_SECURE/);

const ws = read('scripts/ws-server.ts');
assert.match(ws, /if \(!origin \|\| origin !== allowedOrigin\)/);
assert.match(ws, /MAX_CONNECTIONS_PER_USER/);
assert.match(ws, /EVENT_RATE_LIMIT/);

const env = read('src/lib/env.ts');
assert.match(env, /NEXT_PUBLIC_APP_URL must use HTTPS in production/);
assert.match(env, /APP_ORIGIN must use HTTPS in production/);

for (const file of fs.readdirSync(path.join(root, 'src/app/api'), { recursive: true })) {
  if (!String(file).endsWith('route.ts')) continue;
  const text = read(path.join('src/app/api', file));
  if (/export async function (POST|PATCH|PUT|DELETE)\(/.test(text)) {
    assert.match(text, /requireSameOrigin\(request\)/, `missing CSRF guard: ${file}`);
  }
}

console.log('Security hardening static checks passed.');
