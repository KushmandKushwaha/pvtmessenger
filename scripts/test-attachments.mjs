import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('db/migrations/0007_attachment_security.sql', 'utf8');
const validation = readFileSync('src/lib/attachments/validation.ts', 'utf8');
const service = readFileSync('src/lib/attachments/service.ts', 'utf8');
const route = readFileSync('src/app/api/attachments/[attachmentId]/route.ts', 'utf8');
const storage = readFileSync('src/lib/storage/s3.ts', 'utf8');

assert.match(migration, /CREATE UNIQUE INDEX attachments_public_id_unique_idx/);
assert.match(migration, /original_filename/);
assert.match(validation, /MAX_ATTACHMENT_BYTES = 10 \* 1024 \* 1024/);
assert.match(validation, /application\/pdf/);
assert.match(validation, /image\/png/);
assert.match(validation, /sanitizeFilename/);
assert.match(validation, /validateAttachmentBytes/);
assert.match(validation, /%PDF-/);
assert.match(validation, /RIFF/);
assert.match(service, /conversation_members cm/);
assert.match(service, /NOT_AUTHORIZED/);
assert.match(service, /sender_device\.user_id = \$2/);
assert.match(route, /getAttachmentForUser\(attachmentId, session\.userId\)/);
assert.doesNotMatch(route, /attachment\.messageId/);
assert.match(route, /deleteAttachment\(session\.userId, attachmentId\)/);
assert.match(storage, /ServerSideEncryption: 'AES256'/);
assert.doesNotMatch(storage, /NEXT_PUBLIC_S3/);
assert.doesNotMatch(service, /logger\.(info|debug|warn).*content|logger\.(info|debug|warn).*bytes/);

console.log('Attachment security/static checks passed.');
