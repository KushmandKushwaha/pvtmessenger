import { requireSameOrigin, rateLimitAuthenticated } from "@/lib/http-security";
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { deleteMessage } from '@/lib/messages/features';
import { logger } from '@/lib/logger';
export const runtime = 'nodejs';
export async function DELETE(request: Request, context: { params: Promise<{ messageId: string }> }) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
    if (rateLimit) return rateLimit;
    const { messageId } = await context.params; const result = await deleteMessage(session.userId, messageId);
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'NOT_AUTHORIZED') return NextResponse.json({ error: 'Message cannot be deleted.' }, { status: 403 });
    if (code === 'INVALID_INPUT') return NextResponse.json({ error: 'Invalid message ID.' }, { status: 400 });
    logger.error('Message deletion failed', { error: code }); return NextResponse.json({ error: 'Could not delete message.' }, { status: 500 });
  }
}
