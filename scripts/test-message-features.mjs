import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const migration = read('db/migrations/0009_message_features.sql');
const service = read('src/lib/messages/features.ts');
const protocol = read('src/lib/realtime/protocol.ts');
const ws = read('scripts/ws-server.ts');
const client = read('src/lib/realtime/client.ts');

for (const name of ['parent_message_id', 'forwarded_from_message_id', 'message_reactions']) {
  if (!migration.includes(name)) throw new Error(`Missing schema feature: ${name}`);
}

const initialMigration = read('db/migrations/0001_initial.sql');

for (const name of ['edited_at', 'deleted_at']) {
  if (!initialMigration.includes(name)) {
    throw new Error(`Missing message schema feature: ${name}`);
  }
}
for (const name of ['replyToMessage', 'editMessage', 'deleteMessage', 'addReaction', 'removeReaction', 'forwardMessage']) {
  if (!service.includes(`export async function ${name}`)) throw new Error(`Missing operation: ${name}`);
}
if (!service.includes('sender_user_id !== userId')) throw new Error('Edit/delete ownership check missing.');
if (!service.includes('INNER JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = $2')) throw new Error('Conversation authorization check missing.');
if (!service.includes('destinationConversationId')) throw new Error('Forward destination authorization missing.');
if (!service.includes('ciphertext: string')) throw new Error('Ciphertext-compatible feature payload missing.');
if (service.includes('console.log') || service.includes('logger.info') || service.includes('logger.debug')) throw new Error('Potential message-content logging introduced.');
for (const event of ['reply_message', 'edit_message', 'delete_message', 'reaction', 'forward_message']) {
  if (!protocol.includes(`type: '${event}'`)) throw new Error(`Missing realtime event: ${event}`);
}
for (const method of ['replyMessage', 'editMessage', 'deleteMessage', 'react', 'forwardMessage']) {
  if (!client.includes(`${method}(`)) throw new Error(`Missing client method: ${method}`);
}
if (!ws.includes('broadcastConversationMessage')) throw new Error('Feature realtime broadcast missing.');
if (!read('src/lib/messages/client-actions.ts').includes('copyDecryptedMessageText')) throw new Error('Local copy action missing.');
console.log('Message feature authorization/E2EE-compatibility checks passed.');

if (!service.includes('m.deleted_at IS NULL')) throw new Error('Deleted-message authorization guard missing.');
if (!service.includes('ON CONFLICT DO NOTHING')) throw new Error('Reaction idempotency missing.');
if (!service.includes('message_deliveries')) throw new Error('Forwarded/reply delivery queue integration missing.');
if (!read('src/lib/messages/client-actions.ts').includes('navigator.clipboard.writeText')) throw new Error('Copy must remain client-local.');
console.log('Edge-case and local-copy checks passed.');
