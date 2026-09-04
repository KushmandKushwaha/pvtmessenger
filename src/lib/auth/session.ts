import { cookies } from "next/headers";
import { query } from "@/lib/db";
import {
  hashSessionToken,
  isValidSessionToken,
  SESSION_COOKIE_NAME,
} from "./anonymous";

export type AuthenticatedSession = {
  sessionId: string;
  userId: string;
  deviceId: string;
  publicId: string;
};

type SessionRow = {
  session_id: string;
  user_id: string;
  device_id: string;
  public_id: string;
};

export async function getCurrentSession(): Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!isValidSessionToken(token)) {
    if (token) cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  const result = await query<SessionRow>(
    `
      SELECT
        s.id AS session_id,
        s.user_id,
        s.device_id,
        u.public_id
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
      LIMIT 1
    `,
    [hashSessionToken(token)],
  );

  const session = result.rows[0];
  if (!session) {
    cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  await query("UPDATE sessions SET last_seen_at = NOW() WHERE id = $1", [session.session_id]);
  await query("UPDATE devices SET last_seen_at = NOW() WHERE id = $1", [session.device_id]);

  return { sessionId: session.session_id, userId: session.user_id, deviceId: session.device_id, publicId: session.public_id };
}
