import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const routeFiles = [...walk('src/app/api')].filter((p) => p.endsWith('route.ts'));

function* walk(rel) {
  const dir = path.join(root, rel);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(rel, entry.name);
    if (entry.isDirectory()) yield* walk(next);
    else yield next;
  }
}

const auth = read('src/lib/auth/anonymous.ts');
assert.match(auth, /randomBytes\(32\)/);
assert.match(auth, /SESSION_COOKIE_SECURE/);
assert.match(auth, /NODE_ENV === "production"/);

const authRoute = read('src/app/api/auth/anonymous/route.ts');
assert.match(authRoute, /requireSameOrigin/);
assert.match(authRoute, /TRUST_PROXY/);
assert.match(authRoute, /trustedProxy/);
assert.match(authRoute, /untrusted-client/);

const ws = read('scripts/ws-server.ts');
assert.match(ws, /if \(!origin \|\| origin !== allowedOrigin\)/);
assert.match(ws, /MAX_CONNECTIONS_PER_USER/);
assert.match(ws, /MAX_CONNECTIONS_PER_DEVICE/);
assert.match(ws, /EVENT_RATE_LIMIT/);
assert.match(ws, /UPGRADE_RATE_LIMIT/);
assert.match(ws, /verifyRealtimeTicket/);
assert.doesNotMatch(ws, /request\.headers\.cookie/);
assert.match(ws, /remoteAddress/);
assert.doesNotMatch(ws, /console\.log/);

const logger = read('src/lib/logger.ts');
assert.match(logger, /SENSITIVE_KEY/);
assert.match(logger, /instanceof Error/);

const config = read('next.config.ts');
for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy']) assert.match(config, new RegExp(header.replaceAll('-', '\\-')));

const security = read('src/lib/http-security.ts');
assert.match(security, /Origin/);
assert.match(security, /Cross-site request rejected/);

for (const file of routeFiles) {
  const text = read(file);
  if (/export async function (POST|PATCH|PUT|DELETE)\(/.test(text)) {
    assert.match(text, /requireSameOrigin\(request\)/, `missing same-origin guard: ${file}`);
  }
}

for (const file of routeFiles) {
  const text = read(file);
  assert.doesNotMatch(text, /console\.log\(/, `direct console logging in API route: ${file}`);
}

const storage = read('src/lib/storage/s3.ts');
assert.match(storage, /ServerSideEncryption: 'AES256'/);
assert.doesNotMatch(storage, /ACL:/);

const attachmentRoute = read('src/app/api/attachments/[attachmentId]/route.ts');
assert.match(attachmentRoute, /transformToWebStream/);

const attachment = read('src/app/api/attachments/route.ts');
assert.match(attachment, /MAX_ATTACHMENT_BYTES/);
assert.match(attachment, /validateAttachmentBytes/);
assert.match(attachment, /form\.getAll\('file'\)\.length !== 1/);

const dbClient = read('src/lib/db/client.ts');
assert.match(dbClient, /application_name/);
assert.doesNotMatch(dbClient, /password.*console|console.*password/i);

const env = read('src/lib/env.ts');
assert.match(env, /NEXT_PUBLIC_APP_URL must use HTTPS in production/);
assert.match(env, /APP_ORIGIN must use HTTPS in production/);

const gitignore = read('.gitignore');
assert.match(gitignore, /\.env/);
assert.match(gitignore, /!\.env\.example/);

const securityDoc = read('SECURITY.md');
for (const item of ['E2EE is not implemented', 'In-memory rate limiting is per process', 'PostgreSQL least privilege']) {
  assert.match(securityDoc, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

console.log('Security review regression checks passed.');

const profileService = read('src/lib/profile/service.ts');
assert.match(profileService, /avatars\/\$\{userId\}\//);
assert.match(profileService, /INVALID_AVATAR_REFERENCE/);

console.log('Profile storage-reference isolation checks passed.');
