import { query } from '@/lib/db';
import { hashSessionToken, isValidSessionToken } from './anonymous';

export type SocketSession = { sessionId: string; userId: string; deviceId: string; publicId: string };

type Row = { session_id: string; user_id: string; device_id: string; public_id: string };

export async function getSessionByToken(token: string): Promise<SocketSession | null> {
  if (!isValidSessionToken(token)) return null;
  const result = await query<Row>(
    `SELECT s.id AS session_id, s.user_id, s.device_id, u.public_id
     FROM sessions s INNER JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() LIMIT 1`,
    [hashSessionToken(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  await query('UPDATE sessions SET last_seen_at = NOW() WHERE id = $1', [row.session_id]);
  await query('UPDATE devices SET last_seen_at = NOW() WHERE id = $1', [row.device_id]);
  return { sessionId: row.session_id, userId: row.user_id, deviceId: row.device_id, publicId: row.public_id };
}
