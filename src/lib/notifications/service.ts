import { query } from '@/lib/db';
import type { NotificationPreferences, PushSubscriptionInput } from './types';

const ENDPOINT_MAX = 2048;
const KEY_MAX = 256;

function validateSubscription(input: PushSubscriptionInput): PushSubscriptionInput {
  if (!input || typeof input.endpoint !== 'string' || typeof input.keys?.p256dh !== 'string' || typeof input.keys?.auth !== 'string') {
    throw new Error('INVALID_SUBSCRIPTION');
  }
  if (input.endpoint.length < 1 || input.endpoint.length > ENDPOINT_MAX || !/^https:\/\//i.test(input.endpoint)) throw new Error('INVALID_SUBSCRIPTION');
  if (input.keys.p256dh.length < 1 || input.keys.p256dh.length > KEY_MAX || input.keys.auth.length < 1 || input.keys.auth.length > KEY_MAX) throw new Error('INVALID_SUBSCRIPTION');
  return input;
}

export async function getNotificationPreferences(userId: string, deviceId?: string): Promise<NotificationPreferences & { enabled: boolean }> {
  const result = await query<{ enabled: boolean; new_message: boolean; mentions: boolean }>(
    `SELECT COALESCE(dns.enabled, TRUE) AS enabled,
            COALESCE(dns.new_message, np.new_message, TRUE) AS new_message,
            COALESCE(dns.mentions, np.mentions, TRUE) AS mentions
     FROM (SELECT $1::uuid AS user_id) base
     LEFT JOIN notification_preferences np ON np.user_id = base.user_id
     LEFT JOIN device_notification_settings dns ON dns.device_id = $2`,
    [userId, deviceId ?? null],
  );
  const row = result.rows[0];
  return { enabled: row?.enabled ?? true, newMessage: row?.new_message ?? true, mentions: row?.mentions ?? true };
}

export async function setNotificationPreferences(userId: string, preferences: NotificationPreferences): Promise<NotificationPreferences> {
  const result = await query<{ new_message: boolean; mentions: boolean }>(
    `INSERT INTO notification_preferences (user_id, new_message, mentions)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET new_message = EXCLUDED.new_message, mentions = EXCLUDED.mentions, updated_at = NOW()
     RETURNING new_message, mentions`,
    [userId, preferences.newMessage, preferences.mentions],
  );
  return { newMessage: result.rows[0].new_message, mentions: result.rows[0].mentions };
}

export async function setDeviceNotificationSettings(userId: string, deviceId: string, settings: { enabled: boolean; newMessage: boolean; mentions: boolean }) {
  const result = await query<{ device_id: string }>(
    `INSERT INTO device_notification_settings (device_id, enabled, new_message, mentions)
     SELECT d.id, $3, $4, $5 FROM devices d WHERE d.id = $2 AND d.user_id = $1
     ON CONFLICT (device_id) DO UPDATE SET enabled = EXCLUDED.enabled, new_message = EXCLUDED.new_message, mentions = EXCLUDED.mentions, updated_at = NOW()
     RETURNING device_id`,
    [userId, deviceId, settings.enabled, settings.newMessage, settings.mentions],
  );
  if (!result.rows[0]) throw new Error('NOT_AUTHORIZED');
}

export async function registerPushSubscription(userId: string, deviceId: string, input: PushSubscriptionInput) {
  const value = validateSubscription(input);
  const result = await query<{ id: string }>(
    `INSERT INTO push_subscriptions (device_id, endpoint, p256dh, auth)
     SELECT d.id, $3, $4, $5 FROM devices d WHERE d.id = $1 AND d.user_id = $2
     ON CONFLICT (device_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = NOW()
     RETURNING id`,
    [deviceId, userId, value.endpoint, value.keys.p256dh, value.keys.auth],
  );
  if (!result.rows[0]) throw new Error('NOT_AUTHORIZED');
}

export async function removePushSubscription(userId: string, deviceId: string, endpoint: string) {
  if (typeof endpoint !== 'string' || endpoint.length < 1 || endpoint.length > ENDPOINT_MAX) throw new Error('INVALID_SUBSCRIPTION');
  await query(
    `DELETE FROM push_subscriptions ps USING devices d
     WHERE ps.device_id = d.id AND ps.device_id = $2 AND d.user_id = $1 AND ps.endpoint = $3`,
    [userId, deviceId, endpoint],
  );
}

export async function getNotificationTargets(messageId: string, senderUserId: string, mentionPublicIds: string[]) {
  const result = await query<{ device_id: string; user_id: string; public_id: string; enabled: boolean; new_message: boolean; mentions: boolean; endpoint: string; p256dh: string; auth: string }>(
    `SELECT d.id AS device_id, d.user_id, u.public_id,
            COALESCE(dns.enabled, TRUE) AS enabled,
            COALESCE(dns.new_message, np.new_message, TRUE) AS new_message,
            COALESCE(dns.mentions, np.mentions, TRUE) AS mentions,
            ps.endpoint, ps.p256dh, ps.auth
     FROM messages m
     INNER JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id <> $2
     INNER JOIN devices d ON d.user_id = cm.user_id
     INNER JOIN users u ON u.id = d.user_id
     LEFT JOIN notification_preferences np ON np.user_id = d.user_id
     LEFT JOIN device_notification_settings dns ON dns.device_id = d.id
     LEFT JOIN push_subscriptions ps ON ps.device_id = d.id
     WHERE m.id = $1`,
    [messageId, senderUserId],
  );

  const mentioned = new Set(mentionPublicIds);
  return result.rows.map((row) => ({
    ...row,
    mention: mentioned.has(row.public_id),
  }));
}
