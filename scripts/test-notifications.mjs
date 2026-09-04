import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync('db/migrations/0010_notifications.sql', 'utf8');
assert.match(migration, /notification_preferences/);
assert.match(migration, /device_notification_settings/);
assert.match(migration, /push_subscriptions/);
assert.match(migration, /REFERENCES users\(id\) ON DELETE CASCADE/);
assert.match(migration, /REFERENCES devices\(id\) ON DELETE CASCADE/);

const service = fs.readFileSync('src/lib/notifications/service.ts', 'utf8');
assert.match(service, /d\.user_id = \$1/);
assert.match(service, /NOT_AUTHORIZED/);
assert.match(service, /mention/);

const push = fs.readFileSync('src/lib/notifications/push.ts', 'utf8');
assert.doesNotMatch(push, /message\.ciphertext|message\.content/);
assert.match(push, /generic: true/);

const sw = fs.readFileSync('public/push-sw.js', 'utf8');
assert.doesNotMatch(sw, /ciphertext|content/);
assert.match(sw, /New message/);
assert.match(sw, /You were mentioned/);

const ws = fs.readFileSync('scripts/ws-server.ts', 'utf8');
assert.match(ws, /getNotificationTargets/);
assert.match(ws, /sendPrivacyPreservingPush/);
assert.doesNotMatch(ws, /logger\.(info|debug|warn|error)\([^\n]*(ciphertext|content)/i);

console.log('Notification privacy, preference, push, and mention checks passed.');
