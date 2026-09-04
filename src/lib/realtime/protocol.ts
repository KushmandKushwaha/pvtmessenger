export const MAX_FRAME_BYTES = 100_000;

export type ClientEvent =
  | { type: 'send_message'; requestId: string; conversationId: string; clientMessageId: string; ciphertext: string; encryptionVersion: number; mentionPublicIds?: string[]; searchContent?: string }
  | { type: 'delivery_ack'; requestId: string; messageId: string }
  | { type: 'typing'; requestId: string; conversationId: string; isTyping: boolean }
  | { type: 'reply_message'; requestId: string; messageId: string; clientMessageId: string; ciphertext: string; encryptionVersion: number; searchContent?: string }
  | { type: 'edit_message'; requestId: string; messageId: string; ciphertext: string; encryptionVersion: number; searchContent?: string }
  | { type: 'delete_message'; requestId: string; messageId: string }
  | { type: 'reaction'; requestId: string; messageId: string; reaction: string; action: 'add' | 'remove' }
  | { type: 'forward_message'; requestId: string; sourceMessageId: string; destinationConversationId: string; clientMessageId: string; ciphertext: string; encryptionVersion: number; searchContent?: string };

export function parseClientEvent(raw: string): ClientEvent | null {
  if (Buffer.byteLength(raw, 'utf8') > MAX_FRAME_BYTES) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (event.type === 'send_message') {
    if (typeof event.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(event.requestId)) return null;
    if (typeof event.conversationId !== 'string' || typeof event.clientMessageId !== 'string' || typeof event.ciphertext !== 'string' || typeof event.encryptionVersion !== 'number') return null;
    if (event.mentionPublicIds !== undefined && (!Array.isArray(event.mentionPublicIds) || event.mentionPublicIds.length > 20 || event.mentionPublicIds.some((id) => typeof id !== 'string' || !/^u_[A-Za-z0-9_-]{24}$/.test(id)))) return null;
    if (event.searchContent !== undefined && (typeof event.searchContent !== 'string' || event.searchContent.length > 65_536 || /[\u0000]/u.test(event.searchContent))) return null;
    return event as ClientEvent;
  }
  if (event.type === 'typing') {
    if (typeof event.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(event.requestId)) return null;
    if (typeof event.conversationId !== 'string' || !/^c_[A-Za-z0-9_-]{24}$/.test(event.conversationId)) return null;
    if (typeof event.isTyping !== 'boolean') return null;
    return event as ClientEvent;
  }
  if (event.type === 'read_receipt') {
    if (typeof event.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(event.requestId)) return null;
    if (typeof event.messageId !== 'string' || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(event.messageId)) return null;
    return event as ClientEvent;
  }
  if (event.type === 'delivery_ack') {
    if (typeof event.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(event.requestId)) return null;
    if (typeof event.messageId !== 'string' || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(event.messageId)) return null;
    return event as ClientEvent;
  }
  if (event.type === 'reply_message' || event.type === 'edit_message' || event.type === 'forward_message') {
    if (typeof event.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(event.requestId)) return null;
    const uuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (event.type !== 'forward_message' && (typeof event.messageId !== 'string' || !uuid.test(event.messageId))) return null;
    if (event.type === 'forward_message' && (typeof event.sourceMessageId !== 'string' || !uuid.test(event.sourceMessageId))) return null;
    if (event.type !== 'edit_message' && (typeof event.clientMessageId !== 'string' || !uuid.test(event.clientMessageId))) return null;
    if (event.type === 'forward_message' && (typeof event.destinationConversationId !== 'string' || !/^c_[A-Za-z0-9_-]{24}$/.test(event.destinationConversationId))) return null;
    if (typeof event.ciphertext !== 'string' || event.ciphertext.length === 0 || event.ciphertext.length > 100000 || !/^[A-Za-z0-9+/=_-]+$/.test(event.ciphertext)) return null;
    if (typeof event.encryptionVersion !== 'number' || !Number.isInteger(event.encryptionVersion) || event.encryptionVersion < 1 || event.encryptionVersion > 32767) return null;
    if (event.searchContent !== undefined && (typeof event.searchContent !== 'string' || event.searchContent.length > 65_536 || /[\u0000]/u.test(event.searchContent))) return null;
    return event as ClientEvent;
  }
  if (event.type === 'delete_message') {
    if (typeof event.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(event.requestId)) return null;
    if (typeof event.messageId !== 'string') return null;
    return event as ClientEvent;
  }
  if (event.type === 'reaction') {
    if (typeof event.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(event.requestId)) return null;
    if (typeof event.messageId !== 'string' || typeof event.reaction !== 'string') return null;
    if (event.action !== 'add' && event.action !== 'remove') return null;
    return event as ClientEvent;
  }
  return null;
}
