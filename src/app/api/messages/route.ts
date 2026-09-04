import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { getPendingMessages } from '@/lib/messages/service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    return NextResponse.json({ messages: await getPendingMessages(session.deviceId) });
  } catch (error) {
    logger.error('Pending message retrieval failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return NextResponse.json({ error: 'Could not load pending messages.' }, { status: 500 });
  }
}
