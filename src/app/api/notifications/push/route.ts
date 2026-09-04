import { requireSameOrigin, rateLimitAuthenticated } from "@/lib/http-security";
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { registerPushSubscription, removePushSubscription } from '@/lib/notifications/service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
  if (rateLimit) return rateLimit;
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  try {
    await registerPushSubscription(session.userId, session.deviceId, body as never);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_SUBSCRIPTION') return NextResponse.json({ error: 'Invalid push subscription.' }, { status: 400 });
    if (error instanceof Error && error.message === 'NOT_AUTHORIZED') return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    return NextResponse.json({ error: 'Could not register notification device.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
  if (rateLimit) return rateLimit;
  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint.' }, { status: 400 });
  try { await removePushSubscription(session.userId, session.deviceId, endpoint); return NextResponse.json({ ok: true }); }
  catch (error) { if (error instanceof Error && error.message === 'INVALID_SUBSCRIPTION') return NextResponse.json({ error: 'Invalid subscription.' }, { status: 400 }); return NextResponse.json({ error: 'Could not remove notification device.' }, { status: 500 }); }
}
