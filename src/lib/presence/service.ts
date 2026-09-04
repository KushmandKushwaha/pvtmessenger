import { query } from "@/lib/db";

export type PresenceRecord = {
  publicId: string;
  username: string | null;
  online: boolean;
  lastSeenAt: string | null;
};

export async function markDeviceLastSeen(deviceId: string, at = new Date()): Promise<void> {
  await query(`UPDATE devices SET last_seen_at = $2 WHERE id = $1`, [deviceId, at]);
}

export async function getConversationPresence(userId: string): Promise<PresenceRecord[]> {
  const result = await query<{
    public_id: string;
    username: string | null;
    last_seen_at: string | null;
  }>(
    `
      SELECT u.public_id,
             u.username,
             MAX(d.last_seen_at) AS last_seen_at
      FROM conversation_members mine
      INNER JOIN conversation_members members
        ON members.conversation_id = mine.conversation_id
      INNER JOIN users u
        ON u.id = members.user_id
      LEFT JOIN devices d
        ON d.user_id = u.id
      WHERE mine.user_id = $1
      GROUP BY u.id, u.public_id, u.username
      ORDER BY u.public_id ASC
    `,
    [userId],
  );

  return result.rows.map((row) => ({
    publicId: row.public_id,
    username: row.username,
    online: false,
    lastSeenAt: row.last_seen_at,
  }));
}

export async function getConversationMemberIdentities(
  conversationPublicId: string,
): Promise<Array<{ publicId: string; username: string | null }>> {
  const result = await query<{ public_id: string; username: string | null }>(
    `
      SELECT u.public_id, u.username
      FROM conversation_members cm
      INNER JOIN conversations c ON c.id = cm.conversation_id
      INNER JOIN users u ON u.id = cm.user_id
      WHERE c.public_id = $1
      ORDER BY cm.joined_at ASC
    `,
    [conversationPublicId],
  );
  return result.rows.map((row) => ({ publicId: row.public_id, username: row.username }));
}
