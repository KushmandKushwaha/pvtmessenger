import { requireSameOrigin, rateLimitAuthenticated } from "@/lib/http-security";
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { uploadAttachment } from '@/lib/attachments/service';
import { MAX_ATTACHMENT_BYTES, validateAttachmentBytes, validateAttachmentInput } from '@/lib/attachments/validation';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
  if (rateLimit) return rateLimit;

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > MAX_ATTACHMENT_BYTES + 512_000) {
    return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) {
    return NextResponse.json({ error: 'multipart/form-data is required.' }, { status: 415 });
  }

  try {
    const form = await request.formData();
    if ([...form.keys()].some((key) => key !== 'messageId' && key !== 'file')) {
      return NextResponse.json({ error: 'Unknown form field.' }, { status: 400 });
    }
    const file = form.get('file');
    if (!(file instanceof File) || form.getAll('file').length !== 1 || form.getAll('messageId').length !== 1) {
      return NextResponse.json({ error: 'Exactly one file and messageId are required.' }, { status: 400 });
    }
    const validation = validateAttachmentInput(form.get('messageId'), file);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const bytes = Buffer.from(await (file as File).arrayBuffer());
    if (bytes.byteLength !== (file as File).size || bytes.byteLength > MAX_ATTACHMENT_BYTES || !validateAttachmentBytes(validation.value.mediaType, bytes)) {
      return NextResponse.json({ error: 'Attachment content or size is invalid.' }, { status: 400 });
    }

    const attachment = await uploadAttachment(session.userId, validation.value, bytes);
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === 'NOT_AUTHORIZED' ? 403 : 500;
    if (status === 500) logger.error('Attachment upload failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return NextResponse.json({ error: status === 403 ? 'Not authorized.' : 'Could not upload attachment.' }, { status });
  }
}
