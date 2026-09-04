import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) return NextResponse.json({ error: 'Push notifications are not configured.' }, { status: 503 });
  return NextResponse.json({ publicKey }, { headers: { 'Cache-Control': 'private, no-store' } });
}
