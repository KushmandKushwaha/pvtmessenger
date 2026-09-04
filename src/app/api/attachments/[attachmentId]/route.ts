import { requireSameOrigin, rateLimitAuthenticated } from "@/lib/http-security";
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { deleteAttachment, getAttachmentForUser } from '@/lib/attachments/service';
import { isAttachmentPublicId } from '@/lib/attachments/validation';
import { getPrivateObject } from '@/lib/storage/s3';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

type Params = { params: Promise<{ attachmentId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
  if (rateLimit) return rateLimit;
  const { attachmentId } = await params;
  if (!isAttachmentPublicId(attachmentId)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  try {
    const attachment = await getAttachmentForUser(attachmentId, session.userId);
    if (!attachment) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    const object = await getPrivateObject(attachment.storage_key);
    if (!object.Body) return NextResponse.json({ error: 'Attachment unavailable.' }, { status: 404 });

    const body = object.Body.transformToWebStream();
    return new NextResponse(body as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': attachment.media_type,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.original_filename)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logger.error('Attachment download failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return NextResponse.json({ error: 'Could not download attachment.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
  if (rateLimit) return rateLimit;
  const { attachmentId } = await params;
  if (!isAttachmentPublicId(attachmentId)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  try {
    await deleteAttachment(session.userId, attachmentId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const status = error instanceof Error && error.message === 'NOT_AUTHORIZED' ? 404 : 500;
    if (status === 500) logger.error('Attachment deletion failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return NextResponse.json({ error: status === 404 ? 'Not found.' : 'Could not delete attachment.' }, { status });
  }
}
