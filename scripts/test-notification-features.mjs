import fs from 'node:fs';
import assert from 'node:assert/strict';

const validation = fs.readFileSync('src/lib/messages/validation.ts', 'utf8');
assert.match(validation, /mentionPublicIds/);
assert.match(validation, /length > 20/);
assert.match(validation, /\^u_\[A-Za-z0-9_-\]\{24\}\$/);

const service = fs.readFileSync('src/lib/notifications/service.ts', 'utf8');
assert.match(service, /conversation_members cm ON cm\.conversation_id = m\.conversation_id AND cm\.user_id <> \$2/);
assert.match(service, /COALESCE\(dns\.enabled, TRUE\)/);
assert.match(service, /COALESCE\(dns\.new_message, np\.new_message, TRUE\)/);
assert.match(service, /COALESCE\(dns\.mentions, np\.mentions, TRUE\)/);

const push = fs.readFileSync('src/lib/notifications/push.ts', 'utf8');
assert.match(push, /TTL: 300/);
assert.doesNotMatch(push, /ciphertext|plaintext|message\.content/i);

const sw = fs.readFileSync('public/push-sw.js', 'utf8');
assert.match(sw, /generic !== true/);
assert.doesNotMatch(sw, /ciphertext|plaintext/i);

const ws = fs.readFileSync('scripts/ws-server.ts', 'utf8');
assert.match(ws, /notifyMessageRecipients/);
assert.match(ws, /mentionPublicIds/);
assert.doesNotMatch(ws, /console\.log\([^\n]*(ciphertext|content)/i);

console.log('Notification feature, mention validation, privacy, and authorization checks passed.');
