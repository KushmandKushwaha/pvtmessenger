import { query, withTransaction } from '@/lib/db';
import type { PoolClient } from 'pg';
import { decodeCiphertext } from './validation';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const CLIENT_MESSAGE_ID = UUID;

export type FeatureMessage = {
  id: string;
  conversationId: string;
  parentMessageId: string | null;
  forwardedFromMessageId: string | null;
  ciphertext: string;
  encryptionVersion: number;
  sequence: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  parent_message_id: string | null;
  forwarded_from_message_id: string | null;
  ciphertext: Buffer;
  encryption_version: number;
  sequence: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

function mapMessage(row: MessageRow): FeatureMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    parentMessageId: row.parent_message_id,
    forwardedFromMessageId: row.forwarded_from_message_id,
    ciphertext: row.ciphertext.toString('base64url'),
    encryptionVersion: row.encryption_version,
    sequence: row.sequence,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
  };
}

function validateUuid(value: string) {
  return UUID.test(value);
}

function validateClientMessageId(value: unknown): value is string {
  return typeof value === 'string' && CLIENT_MESSAGE_ID.test(value);
}

function validateEncryptionVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 32767;
}

function decodeFeatureCiphertext(value: unknown): Buffer {
  if (typeof value !== 'string') throw new Error('INVALID_INPUT');
  return decodeCiphertext(value);
}

function normalizeReaction(value: unknown) {
  if (typeof value !== 'string') throw new Error('INVALID_REACTION');
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || normalized.length > 32 || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new Error('INVALID_REACTION');
  return normalized;
}

async function getAuthorizedMessage(clientOrQuery: typeof query | PoolClient, messageId: string, userId: string) {
  const execute: typeof query = typeof clientOrQuery === 'function'
    ? clientOrQuery
    : clientOrQuery.query.bind(clientOrQuery);
  const result = await execute<{ id: string; conversation_id: string; sender_user_id: string }>(
    `SELECT m.id, m.conversation_id, sd.user_id AS sender_user_id
     FROM messages m
     INNER JOIN devices sd ON sd.id = m.sender_device_id
     INNER JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = $2
     WHERE m.id = $1 AND m.deleted_at IS NULL
     LIMIT 1`,
    [messageId, userId],
  );
  return result.rows[0] ?? null;
}

export async function replyToMessage(userId: string, deviceId: string, input: {
  messageId: string;
  clientMessageId: string;
  ciphertext: string;
  encryptionVersion: number;
  searchContent?: string;
}): Promise<FeatureMessage> {
  if (!validateUuid(input.messageId) || !validateClientMessageId(input.clientMessageId) || !validateEncryptionVersion(input.encryptionVersion)) throw new Error('INVALID_INPUT');
  const ciphertext = decodeFeatureCiphertext(input.ciphertext);
  return withTransaction(async (client) => {
    const parent = await getAuthorizedMessage(client, input.messageId, userId);
    if (!parent) throw new Error('NOT_AUTHORIZED');
    return insertFeatureMessage(client, {
      conversationId: parent.conversation_id,
      deviceId,
      clientMessageId: input.clientMessageId,
      ciphertext,
      encryptionVersion: input.encryptionVersion,
      parentMessageId: parent.id,
      forwardedFromMessageId: null,
      searchContent: input.searchContent ?? null,
    });
  });
}

export async function editMessage(userId: string, messageId: string, input: { ciphertext: string; encryptionVersion: number; searchContent?: string }): Promise<FeatureMessage> {
  if (!validateUuid(messageId) || !validateEncryptionVersion(input.encryptionVersion)) throw new Error('INVALID_INPUT');
  const ciphertext = decodeFeatureCiphertext(input.ciphertext);
  return withTransaction(async (client) => {
    const target = await getAuthorizedMessage(client, messageId, userId);
    if (!target || target.sender_user_id !== userId) throw new Error('NOT_AUTHORIZED');
    const result = await client.query<MessageRow>(
      `UPDATE messages
       SET ciphertext = $2, encryption_version = $3, search_content = $4, edited_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, conversation_id, parent_message_id, forwarded_from_message_id,
                 ciphertext, encryption_version, sequence, created_at, edited_at, deleted_at`,
      [messageId, ciphertext, input.encryptionVersion, input.searchContent ?? null],
    );
    if (!result.rows[0]) throw new Error('NOT_EDITABLE');
    return mapMessage(result.rows[0]);
  });
}

export async function deleteMessage(userId: string, messageId: string): Promise<{ messageId: string; deletedAt: string }> {
  if (!validateUuid(messageId)) throw new Error('INVALID_INPUT');
  return withTransaction(async (client) => {
    const target = await getAuthorizedMessage(client, messageId, userId);
    if (!target || target.sender_user_id !== userId) throw new Error('NOT_AUTHORIZED');
    const result = await client.query<{ id: string; deleted_at: string }>(
      `UPDATE messages SET deleted_at = COALESCE(deleted_at, NOW()), search_content = NULL WHERE id = $1 RETURNING id, deleted_at`,
      [messageId],
    );
    if (!result.rows[0]) throw new Error('NOT_FOUND');
    return { messageId: result.rows[0].id, deletedAt: result.rows[0].deleted_at };
  });
}

export async function addReaction(userId: string, messageId: string, reaction: string): Promise<void> {
  if (!validateUuid(messageId)) throw new Error('INVALID_INPUT');
  const normalized = normalizeReaction(reaction);
  const authorized = await getAuthorizedMessage(query, messageId, userId);
  if (!authorized) throw new Error('NOT_AUTHORIZED');
  await query(
    `INSERT INTO message_reactions (message_id, user_id, reaction)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [messageId, userId, normalized],
  );
}

export async function removeReaction(userId: string, messageId: string, reaction: string): Promise<void> {
  if (!validateUuid(messageId)) throw new Error('INVALID_INPUT');
  const normalized = normalizeReaction(reaction);
  const authorized = await getAuthorizedMessage(query, messageId, userId);
  if (!authorized) throw new Error('NOT_AUTHORIZED');
  await query(
    `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND reaction = $3`,
    [messageId, userId, normalized],
  );
}

export async function getReactions(userId: string, messageId: string) {
  if (!validateUuid(messageId)) throw new Error('INVALID_INPUT');
  const authorized = await getAuthorizedMessage(query, messageId, userId);
  if (!authorized) throw new Error('NOT_AUTHORIZED');
  const result = await query<{ reaction: string; user_public_id: string; created_at: string }>(
    `SELECT mr.reaction, u.public_id AS user_public_id, mr.created_at
     FROM message_reactions mr
     INNER JOIN users u ON u.id = mr.user_id
     WHERE mr.message_id = $1
     ORDER BY mr.created_at ASC, mr.user_id ASC, mr.reaction ASC`,
    [messageId],
  );
  return result.rows.map((row) => ({ reaction: row.reaction, userPublicId: row.user_public_id, createdAt: row.created_at }));
}

export async function forwardMessage(userId: string, deviceId: string, input: {
  sourceMessageId: string;
  destinationConversationId: string;
  clientMessageId: string;
  ciphertext: string;
  encryptionVersion: number;
  searchContent?: string;
}): Promise<FeatureMessage> {
  if (!validateUuid(input.sourceMessageId) || !validateClientMessageId(input.clientMessageId) || typeof input.destinationConversationId !== 'string' || !validateEncryptionVersion(input.encryptionVersion)) throw new Error('INVALID_INPUT');
  const ciphertext = decodeFeatureCiphertext(input.ciphertext);
  return withTransaction(async (client) => {
    const source = await getAuthorizedMessage(client, input.sourceMessageId, userId);
    if (!source) throw new Error('SOURCE_NOT_AUTHORIZED');

    const destination = await client.query<{ id: string }>(
      `SELECT c.id
       FROM conversations c
       INNER JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $2
       WHERE c.public_id = $1
       LIMIT 1`,
      [input.destinationConversationId, userId],
    );
    if (!destination.rows[0]) throw new Error('DESTINATION_NOT_AUTHORIZED');

    return insertFeatureMessage(client, {
      conversationId: destination.rows[0].id,
      deviceId,
      clientMessageId: input.clientMessageId,
      ciphertext,
      encryptionVersion: input.encryptionVersion,
      parentMessageId: null,
      forwardedFromMessageId: source.id,
      searchContent: input.searchContent ?? null,
    });
  });
}

async function insertFeatureMessage(client: PoolClient, input: {
  conversationId: string;
  deviceId: string;
  clientMessageId: string;
  ciphertext: Buffer;
  encryptionVersion: number;
  parentMessageId: string | null;
  forwardedFromMessageId: string | null;
  searchContent: string | null;
}): Promise<FeatureMessage> {
  const duplicate = await client.query<MessageRow>(
    `SELECT id, conversation_id, parent_message_id, forwarded_from_message_id,
            ciphertext, encryption_version, sequence, created_at, edited_at, deleted_at
     FROM messages WHERE conversation_id = $1 AND client_message_id = $2 LIMIT 1`,
    [input.conversationId, input.clientMessageId],
  );
  if (duplicate.rows[0]) return mapMessage(duplicate.rows[0]);

  const sequence = await client.query<{ message_sequence: string }>(
    `UPDATE conversations SET message_sequence = message_sequence + 1, updated_at = NOW()
     WHERE id = $1 RETURNING message_sequence`, [input.conversationId],
  );
  const value = sequence.rows[0]?.message_sequence;
  if (!value) throw new Error('CONVERSATION_NOT_FOUND');

  const inserted = await client.query<MessageRow>(
    `INSERT INTO messages
       (conversation_id, sender_device_id, client_message_id, ciphertext, encryption_version, sequence,
        parent_message_id, forwarded_from_message_id, search_content)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, conversation_id, parent_message_id, forwarded_from_message_id,
               ciphertext, encryption_version, sequence, created_at, edited_at, deleted_at`,
    [input.conversationId, input.deviceId, input.clientMessageId, input.ciphertext,
      input.encryptionVersion, value, input.parentMessageId, input.forwardedFromMessageId, input.searchContent],
  );
  const message = mapMessage(inserted.rows[0]);
  await client.query(
    `INSERT INTO message_deliveries (message_id, device_id)
     SELECT $1, d.id
     FROM conversation_members cm
     INNER JOIN devices d ON d.user_id = cm.user_id
     WHERE cm.conversation_id = $2 AND d.id <> $3
     ON CONFLICT DO NOTHING`,
    [message.id, input.conversationId, input.deviceId],
  );
  return message;
}
