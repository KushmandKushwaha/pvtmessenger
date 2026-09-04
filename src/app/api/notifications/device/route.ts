import { requireSameOrigin, rateLimitAuthenticated } from "@/lib/http-security";
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { getNotificationPreferences, setDeviceNotificationSettings } from '@/lib/notifications/service';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
  if (rateLimit) return rateLimit;
  return NextResponse.json({ settings: await getNotificationPreferences(session.userId, session.deviceId) });
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
  if (typeof value.enabled !== 'boolean' || typeof value.newMessage !== 'boolean' || typeof value.mentions !== 'boolean') return NextResponse.json({ error: 'Invalid device notification settings.' }, { status: 400 });
  try {
    await setDeviceNotificationSettings(session.userId, session.deviceId, { enabled: value.enabled, newMessage: value.newMessage, mentions: value.mentions });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_AUTHORIZED') return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    return NextResponse.json({ error: 'Could not update notification settings.' }, { status: 500 });
  }
}
