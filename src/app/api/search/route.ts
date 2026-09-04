import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { logger } from '@/lib/logger';
import { checkSearchRateLimit, search } from '@/lib/search/service';
import { validateSearchRequest } from '@/lib/search/validation';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const rate = checkSearchRateLimit(session.userId);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many search requests.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      });
    }

    const input = validateSearchRequest(new URL(request.url).searchParams);
    const result = await search(session.userId, input);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    const clientErrors = new Set([
      'INVALID_TYPE', 'EMPTY_QUERY', 'QUERY_TOO_LONG', 'INVALID_LIMIT', 'INVALID_CURSOR',
      'INVALID_CONVERSATION_ID', 'INVALID_USERNAME', 'INVALID_DATE',
    ]);
    if (clientErrors.has(code)) return NextResponse.json({ error: 'Invalid search request.' }, { status: 400 });
    logger.error('Search request failed', { error: code });
    return NextResponse.json({ error: 'Could not perform search.' }, { status: 500 });
  }
}
