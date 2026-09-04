export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const MIME_TYPES = new Map<string, { extension: string; category: 'image' | 'document' }>([
  ['image/jpeg', { extension: 'jpg', category: 'image' }],
  ['image/png', { extension: 'png', category: 'image' }],
  ['image/gif', { extension: 'gif', category: 'image' }],
  ['image/webp', { extension: 'webp', category: 'image' }],
  ['application/pdf', { extension: 'pdf', category: 'document' }],
  ['text/plain', { extension: 'txt', category: 'document' }],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', { extension: 'docx', category: 'document' }],
]);

const ATTACHMENT_ID = /^a_[A-Za-z0-9_-]{24}$/;
const MESSAGE_ID = /^[0-9a-fA-F-]{36}$/;

export type ValidatedAttachment = {
  messageId: string;
  mediaType: string;
  extension: string;
  category: 'image' | 'document';
  originalFilename: string;
};

export function sanitizeFilename(filename: string): string {
  const normalized = filename.normalize('NFKC').replace(/[\\/\x00-\x1F\x7F]/g, '_').trim();
  const basename = normalized.split(/[\\/]/).pop() || 'attachment';
  return basename.slice(0, 255) || 'attachment';
}

export function validateAttachmentBytes(mediaType: string, bytes: Buffer): boolean {
  if (mediaType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mediaType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mediaType === 'image/gif') return bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
  if (mediaType === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mediaType === 'application/pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (mediaType === 'text/plain') return !bytes.subarray(0, Math.min(bytes.length, 4096)).includes(0);
  return false;
}

export function validateAttachmentInput(messageId: unknown, file: unknown): { ok: true; value: ValidatedAttachment } | { ok: false; error: string } {
  if (typeof messageId !== 'string' || !MESSAGE_ID.test(messageId)) return { ok: false, error: 'Invalid message ID.' };
  if (!(file instanceof File)) return { ok: false, error: 'Attachment file is required.' };
  if (file.size < 1 || file.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'Attachment exceeds the 10 MB limit.' };

  const type = MIME_TYPES.get(file.type.toLowerCase());
  if (!type) return { ok: false, error: 'Unsupported attachment type.' };

  return {
    ok: true,
    value: {
      messageId,
      mediaType: file.type.toLowerCase(),
      extension: type.extension,
      category: type.category,
      originalFilename: sanitizeFilename(file.name),
    },
  };
}

export function isAttachmentPublicId(value: unknown): value is string {
  return typeof value === 'string' && ATTACHMENT_ID.test(value);
}
