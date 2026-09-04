import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const migration = read('db/migrations/0006_realtime_messaging.sql');
const readMigration = read('db/migrations/0008_message_read_states.sql');
const service = read('src/lib/messages/service.ts');
const protocol = read('src/lib/realtime/protocol.ts');
const gateway = read('scripts/ws-server.ts');
const client = read('src/lib/realtime/client.ts');

const checks = [
  ['message sequence', migration.includes('message_sequence') && migration.includes('messages_conversation_sequence_unique_idx')],
  ['ciphertext storage', migration.includes('octet_length(ciphertext)')],
  ['delivery tracking', migration.includes('message_deliveries') && migration.includes("status IN ('pending', 'delivered')")],
  ['offline pending query', service.includes("md.status = 'pending'")],
  ['membership validation', service.includes('conversation_members') && service.includes('cm.user_id = $2')],
  ['duplicate protection', service.includes('client_message_id') && service.includes('duplicate: true')],
  ['websocket authentication', gateway.includes('verifyRealtimeTicket') && gateway.includes('privacy-messenger-v1')],
  ['websocket event validation', gateway.includes('parseClientEvent') && gateway.includes('validateSendMessageInput')],
  ['delivery acknowledgement', gateway.includes('delivery_ack') && gateway.includes('acknowledgeDeliveryWithState')],
  ['read state schema', readMigration.includes('CREATE TABLE message_reads') && readMigration.includes('PRIMARY KEY (message_id, user_id)')],
  ['read receipt event', protocol.includes('read_receipt') && gateway.includes('markMessageRead')],
  ['sender state sync', gateway.includes('getOutgoingMessageStates') && gateway.includes('outgoingStates')],
  ['no device id in delivery event', !gateway.includes('deviceId: session.deviceId')],
  ['reconnection', client.includes('scheduleReconnect') && client.includes('setTimeout')],
  ['backoff', client.includes('2 ** this.retry')],
  ['no plaintext logging', !gateway.includes('console.log(event') && !gateway.includes('console.log(data')],
  ['no internal sender device ID exposure', !read('src/lib/messages/service.ts').includes('senderDeviceId: row.sender_device_id')],
];
for (const [name, ok] of checks) {
  assert.ok(ok, `Realtime check failed: ${name}`);
}
assert.ok(!/message[^;]*content\s+TEXT/i.test(migration), 'Realtime migration must not add plaintext message content.');
assert.ok(!/console\.(log|info|debug)\([^)]*(message|ciphertext|event|data)/i.test(gateway), 'Realtime gateway must not log message data.');
console.log('Realtime messaging static checks passed.');
