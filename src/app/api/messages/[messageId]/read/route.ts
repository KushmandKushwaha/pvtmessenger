import { requireSameOrigin, rateLimitAuthenticated } from "@/lib/http-security";
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { markMessageRead } from '@/lib/messages/service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export async function POST(request: Request, context: { params: Promise<{ messageId: string }> }) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
    if (rateLimit) return rateLimit;
    const { messageId } = await context.params;
    if (!UUID.test(messageId)) return NextResponse.json({ error: 'Invalid message ID.' }, { status: 400 });
    const receipt = await markMessageRead(session.userId, session.deviceId, messageId);
    if (!receipt) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
    return NextResponse.json({ receipt });
  } catch (error) {
    logger.error('Message read-state update failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return NextResponse.json({ error: 'Could not update read state.' }, { status: 500 });
  }
}
