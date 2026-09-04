import { requireSameOrigin, rateLimitAuthenticated } from "@/lib/http-security";
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { editMessage } from '@/lib/messages/features';
import { logger } from '@/lib/logger';
export const runtime = 'nodejs';
export async function PATCH(request: Request, context: { params: Promise<{ messageId: string }> }) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
    if (rateLimit) return rateLimit;
    const { messageId } = await context.params; const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.ciphertext !== 'string' || typeof body.encryptionVersion !== 'number') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    const searchContent = body.searchContent;
    if (searchContent !== undefined && (typeof searchContent !== 'string' || searchContent.length > 65_536 || /[\u0000]/u.test(searchContent))) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    const message = await editMessage(session.userId, messageId, { ciphertext: body?.ciphertext, encryptionVersion: body?.encryptionVersion, searchContent });
    return NextResponse.json({ message });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'NOT_AUTHORIZED' || code === 'NOT_EDITABLE') return NextResponse.json({ error: 'Message cannot be edited.' }, { status: 403 });
    if (code === 'INVALID_INPUT' || code === 'INVALID_CIPHERTEXT') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    logger.error('Message edit failed', { error: code }); return NextResponse.json({ error: 'Could not edit message.' }, { status: 500 });
  }
}
