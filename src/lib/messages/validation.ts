const CONVERSATION_ID = /^c_[A-Za-z0-9_-]{24}$/;
const CLIENT_MESSAGE_ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export type SendMessageInput = {
  conversationId: string;
  clientMessageId: string;
  ciphertext: string;
  encryptionVersion: number;
  mentionPublicIds?: string[];
  searchContent?: string;
};

export function validateSendMessageInput(value: unknown): { ok: true; value: SendMessageInput } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Invalid message payload.' };
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  const allowed = ['conversationId', 'clientMessageId', 'ciphertext', 'encryptionVersion', 'mentionPublicIds', 'searchContent'];
  if (keys.some((key) => !allowed.includes(key))) return { ok: false, error: 'Unknown message field.' };
  if (typeof input.conversationId !== 'string' || !CONVERSATION_ID.test(input.conversationId)) return { ok: false, error: 'Invalid conversation ID.' };
  if (typeof input.clientMessageId !== 'string' || !CLIENT_MESSAGE_ID.test(input.clientMessageId)) return { ok: false, error: 'Invalid client message ID.' };
  if (typeof input.ciphertext !== 'string' || input.ciphertext.length === 0 || input.ciphertext.length > 100_000) return { ok: false, error: 'Invalid ciphertext.' };
  if (!/^[A-Za-z0-9+/=_-]+$/.test(input.ciphertext)) return { ok: false, error: 'Ciphertext must be base64-compatible.' };
  if (input.mentionPublicIds !== undefined && (!Array.isArray(input.mentionPublicIds) || input.mentionPublicIds.length > 20 || input.mentionPublicIds.some((id) => typeof id !== 'string' || !/^u_[A-Za-z0-9_-]{24}$/.test(id)))) return { ok: false, error: 'Invalid mention targets.' };
  if (input.searchContent !== undefined && (typeof input.searchContent !== 'string' || input.searchContent.length > 65_536 || /[\u0000]/u.test(input.searchContent))) return { ok: false, error: 'Invalid search content.' };
  const encryptionVersion = input.encryptionVersion;
  if (typeof encryptionVersion !== 'number' || !Number.isInteger(encryptionVersion) || encryptionVersion < 1 || encryptionVersion > 32767) return { ok: false, error: 'Invalid encryption version.' };
  return { ok: true, value: { conversationId: input.conversationId, clientMessageId: input.clientMessageId, ciphertext: input.ciphertext, encryptionVersion, mentionPublicIds: input.mentionPublicIds ? [...new Set(input.mentionPublicIds as string[])] : [], searchContent: input.searchContent as string | undefined } };
}

export function decodeCiphertext(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const decoded = Buffer.from(padded, 'base64');
  if (!decoded.length || decoded.length > 65_536) throw new Error('INVALID_CIPHERTEXT');
  return decoded;
}
