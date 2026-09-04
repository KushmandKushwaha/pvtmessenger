import webpush from 'web-push';
import { query } from '@/lib/db';

let configured = false;
function configure() {
  if (configured) return true;
  const subject = process.env.WEB_PUSH_SUBJECT?.trim();
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export async function sendPrivacyPreservingPush(target: { subscriptionId?: string; endpoint: string; p256dh: string; auth: string; notificationType: 'new_message' | 'mention'; conversationId: string; messageId: string }) {
  if (!configure()) return;
  const payload = JSON.stringify({
    type: 'notification',
    notificationType: target.notificationType,
    conversationId: target.conversationId,
    messageId: target.messageId,
    generic: true,
  });
  try {
    await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, { TTL: 300 });
  } catch (error: unknown) {
    const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number((error as { statusCode?: unknown }).statusCode) : 0;
    if (statusCode === 404 || statusCode === 410) {
      await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [target.endpoint]);
      return;
    }
    // Never log subscription keys, endpoints, payloads, or message identifiers.
  }
}
