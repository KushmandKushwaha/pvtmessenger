export type MessageSelection = ReadonlySet<string>;

export function toggleMessageSelection(selection: MessageSelection, messageId: string): Set<string> {
  const next = new Set(selection);
  if (next.has(messageId)) next.delete(messageId);
  else next.add(messageId);
  return next;
}

export function clearMessageSelection(): Set<string> {
  return new Set<string>();
}

/** Copies already-decrypted text locally. The server never receives this value. */
export async function copyDecryptedMessageText(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) throw new Error('CLIPBOARD_UNAVAILABLE');
  await navigator.clipboard.writeText(text);
}
