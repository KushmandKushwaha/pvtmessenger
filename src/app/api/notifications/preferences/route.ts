import { requireSameOrigin, rateLimitAuthenticated } from "@/lib/http-security";
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { getNotificationPreferences, setDeviceNotificationSettings, setNotificationPreferences } from '@/lib/notifications/service';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
  if (rateLimit) return rateLimit;
  return NextResponse.json({ preferences: await getNotificationPreferences(session.userId, session.deviceId) });
}

export async function PATCH(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
  if (rateLimit) return rateLimit;
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const value = body as Record<string, unknown>;
  if (typeof value.newMessage !== 'boolean' || typeof value.mentions !== 'boolean' || typeof value.enabled !== 'boolean') return NextResponse.json({ error: 'Invalid notification preferences.' }, { status: 400 });
  await setNotificationPreferences(session.userId, { newMessage: value.newMessage, mentions: value.mentions });
  await setDeviceNotificationSettings(session.userId, session.deviceId, { enabled: value.enabled, newMessage: value.newMessage, mentions: value.mentions });
  return NextResponse.json({ ok: true });
}
