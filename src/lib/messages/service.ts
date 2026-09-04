import type { PoolClient } from 'pg';
import { query, withTransaction } from '@/lib/db';
import { decodeCiphertext, type SendMessageInput } from './validation';

export type MessageEnvelope = {
  id: string;
  conversationId: string;
  clientMessageId: string;
  ciphertext: string;
  encryptionVersion: number;
  sequence: string;
  createdAt: string;
};

function toBase64(value: Buffer) {
  return value.toString('base64url');
}

function mapMessage(row: {
  id: string; conversation_id: string; sender_device_id: string; client_message_id: string;
  ciphertext: Buffer; encryption_version: number; sequence: string; created_at: string;
}): MessageEnvelope {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    clientMessageId: row.client_message_id,
    ciphertext: toBase64(row.ciphertext),
    encryptionVersion: row.encryption_version,
    sequence: row.sequence,
    createdAt: row.created_at,
  };
}

export async function sendMessage(userId: string, deviceId: string, input: SendMessageInput): Promise<{ message: MessageEnvelope; duplicate: boolean; senderDeviceId: string }> {
  const ciphertext = decodeCiphertext(input.ciphertext);
  return withTransaction(async (client) => {
    const membership = await client.query<{ conversation_id: string }>(
      `SELECT c.id AS conversation_id
       FROM conversations c
       INNER JOIN conversation_members cm ON cm.conversation_id = c.id
       WHERE c.public_id = $1 AND cm.user_id = $2
       LIMIT 1`,
      [input.conversationId, userId],
    );
    if (!membership.rows[0]) throw new Error('NOT_MEMBER');
    const conversationId = membership.rows[0].conversation_id;

    const existing = await client.query<{
      id: string; conversation_id: string; sender_device_id: string; client_message_id: string;
      ciphertext: Buffer; encryption_version: number; sequence: string; created_at: string;
    }>(
      `SELECT id, conversation_id, sender_device_id, client_message_id, ciphertext, encryption_version, sequence, created_at
       FROM messages WHERE conversation_id = $1 AND client_message_id = $2 LIMIT 1`,
      [conversationId, input.clientMessageId],
    );
    if (existing.rows[0]) return { message: mapMessage(existing.rows[0]), duplicate: true, senderDeviceId: existing.rows[0].sender_device_id };

    const sequenceResult = await client.query<{ message_sequence: string }>(
      `UPDATE conversations SET message_sequence = message_sequence + 1, updated_at = NOW()
       WHERE id = $1 RETURNING message_sequence`,
      [conversationId],
    );
    const sequence = sequenceResult.rows[0]?.message_sequence;
    if (!sequence) throw new Error('CONVERSATION_NOT_FOUND');

    const inserted = await client.query<{
      id: string; conversation_id: string; sender_device_id: string; client_message_id: string;
      ciphertext: Buffer; encryption_version: number; sequence: string; created_at: string;
    }>(
      `INSERT INTO messages (conversation_id, sender_device_id, client_message_id, ciphertext, encryption_version, sequence, search_content)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, conversation_id, sender_device_id, client_message_id, ciphertext, encryption_version, sequence, created_at`,
      [conversationId, deviceId, input.clientMessageId, ciphertext, input.encryptionVersion, sequence, input.searchContent ?? null],
    );
    const message = mapMessage(inserted.rows[0]);

    await createDeliveryRows(client, message.id, conversationId, deviceId);
    return { message, duplicate: false, senderDeviceId: deviceId };
  });
}

async function createDeliveryRows(client: PoolClient, messageId: string, conversationId: string, senderDeviceId: string) {
  await client.query(
    `INSERT INTO message_deliveries (message_id, device_id)
     SELECT $1, d.id
     FROM conversation_members cm
     INNER JOIN devices d ON d.user_id = cm.user_id
     WHERE cm.conversation_id = $2 AND d.id <> $3
     ON CONFLICT DO NOTHING`,
    [messageId, conversationId, senderDeviceId],
  );
}

export async function getPendingMessages(deviceId: string, limit = 100): Promise<MessageEnvelope[]> {
  const result = await query<{
    id: string; conversation_id: string; sender_device_id: string; client_message_id: string;
    ciphertext: Buffer; encryption_version: number; sequence: string; created_at: string;
  }>(
    `SELECT m.id, m.conversation_id, m.sender_device_id, m.client_message_id,
            m.ciphertext, m.encryption_version, m.sequence, m.created_at
     FROM message_deliveries md
     INNER JOIN messages m ON m.id = md.message_id
     WHERE md.device_id = $1 AND md.status = 'pending'
       AND EXISTS (
         SELECT 1
         FROM conversation_members cm
         INNER JOIN devices d2 ON d2.user_id = cm.user_id
         WHERE cm.conversation_id = m.conversation_id AND d2.id = $1
       )
     ORDER BY m.created_at ASC, m.id ASC
     LIMIT $2`,
    [deviceId, limit],
  );
  return result.rows.map(mapMessage);
}

export type DeliveryState = {
  messageId: string;
  recipientPublicId: string;
  status: 'delivered';
  deliveredAt: string;
};

export type ReadReceipt = {
  messageId: string;
  readerPublicId: string;
  readAt: string;
};

export type DeliveryAcknowledgement = {
  state: DeliveryState;
  newlyDeliveredForRecipient: boolean;
};

export async function acknowledgeDeliveryWithState(deviceId: string, messageId: string): Promise<DeliveryAcknowledgement | null> {
  return withTransaction(async (client) => {
    const result = await client.query<{
      message_id: string;
      delivered_at: string;
      recipient_public_id: string;
      previously_delivered: boolean;
    }>(
      `WITH target AS (
         SELECT md.message_id, md.device_id, md.status,
                d.user_id AS recipient_user_id,
                m.sender_device_id
         FROM message_deliveries md
         INNER JOIN devices d ON d.id = md.device_id
         INNER JOIN messages m ON m.id = md.message_id
         WHERE md.message_id = $1 AND md.device_id = $2
         FOR UPDATE
       ), prior AS (
         SELECT EXISTS (
           SELECT 1
           FROM message_deliveries other
           INNER JOIN devices other_device ON other_device.id = other.device_id
           WHERE other.message_id = $1
             AND other_device.user_id = (SELECT recipient_user_id FROM target)
             AND other.status = 'delivered'
         ) AS previously_delivered
       ), updated AS (
         UPDATE message_deliveries md
         SET status = 'delivered', delivered_at = COALESCE(md.delivered_at, NOW())
         FROM target
         WHERE md.message_id = target.message_id
           AND md.device_id = target.device_id
           AND md.status = 'pending'
         RETURNING md.message_id, md.delivered_at, target.recipient_user_id
       )
       SELECT updated.message_id, updated.delivered_at,
              u.public_id AS recipient_public_id,
              prior.previously_delivered
       FROM updated
       INNER JOIN users u ON u.id = updated.recipient_user_id
       CROSS JOIN prior`,
      [messageId, deviceId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      state: {
        messageId: row.message_id,
        recipientPublicId: row.recipient_public_id,
        status: 'delivered',
        deliveredAt: row.delivered_at,
      },
      newlyDeliveredForRecipient: !row.previously_delivered,
    };
  });
}

export async function markMessageRead(userId: string, deviceId: string, messageId: string): Promise<ReadReceipt | null> {
  return withTransaction(async (client) => {
    const result = await client.query<{
      message_id: string;
      reader_public_id: string;
      read_at: string;
    }>(
      `WITH target AS (
         SELECT m.id, m.conversation_id
         FROM messages m
         INNER JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = $1
         INNER JOIN devices sender_device ON sender_device.id = m.sender_device_id
         INNER JOIN devices reader_device ON reader_device.id = $2 AND reader_device.user_id = $1
         WHERE m.id = $3
           AND sender_device.user_id <> $1
         LIMIT 1
       ), delivered AS (
         UPDATE message_deliveries md
         SET status = 'delivered', delivered_at = COALESCE(md.delivered_at, NOW())
         FROM target
         WHERE md.message_id = target.id AND md.device_id = $2 AND md.status = 'pending'
       )
       INSERT INTO message_reads (message_id, user_id)
       SELECT target.id, $1 FROM target
       ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = message_reads.read_at
       RETURNING message_id,
                 (SELECT public_id FROM users WHERE id = $1) AS reader_public_id,
                 read_at`,
      [userId, deviceId, messageId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { messageId: row.message_id, readerPublicId: row.reader_public_id, readAt: row.read_at };
  });
}

export async function getReadReceiptsForMessage(messageId: string, userId: string): Promise<ReadReceipt[]> {
  const result = await query<{ message_id: string; reader_public_id: string; read_at: string }>(
    `SELECT mr.message_id, u.public_id AS reader_public_id, mr.read_at
     FROM message_reads mr
     INNER JOIN users u ON u.id = mr.user_id
     INNER JOIN messages m ON m.id = mr.message_id
     INNER JOIN conversation_members viewer ON viewer.conversation_id = m.conversation_id AND viewer.user_id = $2
     WHERE mr.message_id = $1
     ORDER BY mr.read_at ASC`,
    [messageId, userId],
  );
  return result.rows.map((row) => ({ messageId: row.message_id, readerPublicId: row.reader_public_id, readAt: row.read_at }));
}

export async function getOutgoingMessageStates(userId: string, limit = 100): Promise<Array<{ messageId: string; deliveredTo: string[]; readBy: string[] }>> {
  const result = await query<{ message_id: string; delivered_to: string[]; read_by: string[] }>(
    `SELECT m.id AS message_id,
            COALESCE((
              SELECT ARRAY_AGG(DISTINCT u.public_id ORDER BY u.public_id)
              FROM message_deliveries md
              INNER JOIN devices d ON d.id = md.device_id
              INNER JOIN users u ON u.id = d.user_id
              WHERE md.message_id = m.id AND md.status = 'delivered' AND d.user_id <> $1
            ), ARRAY[]::TEXT[]) AS delivered_to,
            COALESCE((
              SELECT ARRAY_AGG(u2.public_id ORDER BY u2.public_id)
              FROM message_reads mr
              INNER JOIN users u2 ON u2.id = mr.user_id
              WHERE mr.message_id = m.id AND mr.user_id <> $1
            ), ARRAY[]::TEXT[]) AS read_by
     FROM messages m
     INNER JOIN devices sender_device ON sender_device.id = m.sender_device_id AND sender_device.user_id = $1
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map((row) => ({ messageId: row.message_id, deliveredTo: row.delivered_to, readBy: row.read_by }));
}
