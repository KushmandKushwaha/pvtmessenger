import { requireSameOrigin, rateLimitAuthenticated } from "@/lib/http-security";
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { addReaction, getReactions, removeReaction } from '@/lib/messages/features';
import { logger } from '@/lib/logger';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ messageId: string }> }) {
  try { const session = await getCurrentSession(); if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 }); const { messageId } = await context.params; return NextResponse.json({ reactions: await getReactions(session.userId, messageId) }); }
  catch (error) { const code = error instanceof Error ? error.message : 'UNKNOWN'; if (code === 'NOT_AUTHORIZED') return NextResponse.json({ error: 'Message not found.' }, { status: 404 }); if (code === 'INVALID_INPUT') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); logger.error('Reaction lookup failed', { error: code }); return NextResponse.json({ error: 'Could not load reactions.' }, { status: 500 }); }
}
export async function POST(request: Request, context: { params: Promise<{ messageId: string }> }) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  try { const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
    if (rateLimit) return rateLimit; const { messageId } = await context.params; const body = await request.json(); if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.reaction !== 'string') return NextResponse.json({ error: 'Invalid reaction.' }, { status: 400 }); await addReaction(session.userId, messageId, body?.reaction); return NextResponse.json({ ok: true }, { status: 201 }); }
  catch (error) { const code = error instanceof Error ? error.message : 'UNKNOWN'; if (code === 'NOT_AUTHORIZED') return NextResponse.json({ error: 'Message not found.' }, { status: 404 }); if (code === 'INVALID_INPUT' || code === 'INVALID_REACTION') return NextResponse.json({ error: 'Invalid reaction.' }, { status: 400 }); logger.error('Reaction add failed', { error: code }); return NextResponse.json({ error: 'Could not add reaction.' }, { status: 500 }); }
}
export async function DELETE(request: Request, context: { params: Promise<{ messageId: string }> }) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  try { const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
    if (rateLimit) return rateLimit; const { messageId } = await context.params; const body = await request.json(); if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.reaction !== 'string') return NextResponse.json({ error: 'Invalid reaction.' }, { status: 400 }); await removeReaction(session.userId, messageId, body?.reaction); return NextResponse.json({ ok: true }); }
  catch (error) { const code = error instanceof Error ? error.message : 'UNKNOWN'; if (code === 'NOT_AUTHORIZED') return NextResponse.json({ error: 'Message not found.' }, { status: 404 }); if (code === 'INVALID_INPUT' || code === 'INVALID_REACTION') return NextResponse.json({ error: 'Invalid reaction.' }, { status: 400 }); logger.error('Reaction removal failed', { error: code }); return NextResponse.json({ error: 'Could not remove reaction.' }, { status: 500 }); }
}
