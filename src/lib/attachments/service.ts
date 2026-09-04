import { randomBytes } from 'node:crypto';
import { query, withTransaction } from '@/lib/db';
import { deletePrivateObject, putPrivateObject } from '@/lib/storage/s3';
import { type ValidatedAttachment } from './validation';

export type AttachmentMetadata = {
  id: string;
  byteSize: number;
  mediaType: string;
  filename: string;
  createdAt: string;
};

type AttachmentRow = {
  id: string;
  public_id: string;
  message_id: string;
  storage_key: string;
  byte_size: string;
  media_type: string;
  original_filename: string;
  created_at: string;
};

function mapAttachment(row: AttachmentRow): AttachmentMetadata {
  return {
    id: row.public_id,
    byteSize: Number(row.byte_size),
    mediaType: row.media_type,
    filename: row.original_filename,
    createdAt: row.created_at,
  };
}

function makeStorageKey(): string {
  return `attachments/${new Date().toISOString().slice(0, 10)}/${randomBytes(24).toString('base64url')}`;
}

async function getAuthorizedAttachment(publicId: string, userId: string) {
  const result = await query<AttachmentRow>(
    `SELECT a.id, a.public_id, a.message_id, a.storage_key, a.byte_size, a.media_type,
            a.original_filename, a.created_at
     FROM attachments a
     INNER JOIN messages m ON m.id = a.message_id
     INNER JOIN conversation_members cm
       ON cm.conversation_id = m.conversation_id AND cm.user_id = $2
     WHERE a.public_id = $1
     LIMIT 1`,
    [publicId, userId],
  );
  return result.rows[0] ?? null;
}

export async function uploadAttachment(userId: string, input: ValidatedAttachment, bytes: Buffer) {
  const authorizedMessage = await query<{ message_id: string }>(
    `SELECT m.id AS message_id
     FROM messages m
     INNER JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
     INNER JOIN devices sender_device ON sender_device.id = m.sender_device_id
     WHERE m.id = $1 AND cm.user_id = $2 AND sender_device.user_id = $2
     LIMIT 1`,
    [input.messageId, userId],
  );
  if (!authorizedMessage.rows[0]) throw new Error('NOT_AUTHORIZED');

  const storageKey = makeStorageKey();
  await putPrivateObject(storageKey, bytes, input.mediaType);

  try {
    const result = await query<AttachmentRow>(
      `INSERT INTO attachments (message_id, storage_key, byte_size, media_type, original_filename)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, public_id, message_id, storage_key, byte_size, media_type, original_filename, created_at`,
      [input.messageId, storageKey, bytes.byteLength, input.mediaType, input.originalFilename],
    );
    return mapAttachment(result.rows[0]);
  } catch (error) {
    try { await deletePrivateObject(storageKey); } catch { /* best-effort cleanup */ }
    throw error;
  }
}

export async function getAttachmentForUser(publicId: string, userId: string) {
  return getAuthorizedAttachment(publicId, userId);
}

export async function deleteAttachment(userId: string, publicId: string) {
  const result = await withTransaction(async (client) => {
    const attachment = await client.query<AttachmentRow>(
      `SELECT a.id, a.public_id, a.message_id, a.storage_key, a.byte_size, a.media_type,
              a.original_filename, a.created_at
       FROM attachments a
       INNER JOIN messages m ON m.id = a.message_id
       WHERE a.public_id = $1
         AND EXISTS (
           SELECT 1 FROM conversation_members cm
           WHERE cm.conversation_id = m.conversation_id AND cm.user_id = $2
         )
         AND EXISTS (
           SELECT 1 FROM devices d
           WHERE d.id = m.sender_device_id AND d.user_id = $2
         )
       FOR UPDATE OF a
       LIMIT 1`,
      [publicId, userId],
    );
    const row = attachment.rows[0];
    if (!row) throw new Error('NOT_AUTHORIZED');
    await client.query('DELETE FROM attachments WHERE id = $1', [row.id]);
    return row;
  });

  await deletePrivateObject(result.storage_key);
  return mapAttachment(result);
}
