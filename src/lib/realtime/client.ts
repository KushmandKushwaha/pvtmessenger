export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

type Listener = (event: unknown) => void;

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private stopped = false;
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly statusListeners = new Set<(status: RealtimeStatus) => void>();

  constructor(private readonly url: string, private readonly ticket: string) {}

  connect() {
    this.stopped = false;
    this.open();
  }

  disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close(1000, 'client disconnect');
    this.socket = null;
    this.emitStatus('disconnected');
  }

  onEvent(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  onStatus(listener: (status: RealtimeStatus) => void) { this.statusListeners.add(listener); return () => this.statusListeners.delete(listener); }

  send(event: object) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('REALTIME_NOT_CONNECTED');
    this.socket.send(JSON.stringify(event));
  }

  sendMessage(conversationId: string, ciphertext: string, encryptionVersion: number, clientMessageId = crypto.randomUUID(), requestId = crypto.randomUUID(), mentionPublicIds: string[] = [], searchContent?: string) {
    this.send({ type: 'send_message', requestId, conversationId, clientMessageId, ciphertext, encryptionVersion, mentionPublicIds, searchContent });
    return { requestId, clientMessageId };
  }

  acknowledgeDelivery(messageId: string, requestId = crypto.randomUUID()) {
    this.send({ type: 'delivery_ack', requestId, messageId });
  }

  markRead(messageId: string, requestId = crypto.randomUUID()) {
    this.send({ type: 'read_receipt', requestId, messageId });
  }

  sendTyping(conversationId: string, isTyping: boolean, requestId = crypto.randomUUID()) {
    this.send({ type: 'typing', requestId, conversationId, isTyping });
  }

  replyMessage(messageId: string, ciphertext: string, encryptionVersion: number, clientMessageId = crypto.randomUUID(), requestId = crypto.randomUUID(), searchContent?: string) {
    this.send({ type: 'reply_message', requestId, messageId, clientMessageId, ciphertext, encryptionVersion, searchContent });
    return { requestId, clientMessageId };
  }

  editMessage(messageId: string, ciphertext: string, encryptionVersion: number, requestId = crypto.randomUUID(), searchContent?: string) {
    this.send({ type: 'edit_message', requestId, messageId, ciphertext, encryptionVersion, searchContent });
    return requestId;
  }

  deleteMessage(messageId: string, requestId = crypto.randomUUID()) {
    this.send({ type: 'delete_message', requestId, messageId });
    return requestId;
  }

  react(messageId: string, reaction: string, action: 'add' | 'remove', requestId = crypto.randomUUID()) {
    this.send({ type: 'reaction', requestId, messageId, reaction, action });
    return requestId;
  }

  forwardMessage(sourceMessageId: string, destinationConversationId: string, ciphertext: string, encryptionVersion: number, clientMessageId = crypto.randomUUID(), requestId = crypto.randomUUID(), searchContent?: string) {
    this.send({ type: 'forward_message', requestId, sourceMessageId, destinationConversationId, clientMessageId, ciphertext, encryptionVersion, searchContent });
    return { requestId, clientMessageId };
  }

  private open() {
    if (this.stopped) return;
    this.emitStatus('connecting');
    const socket = new WebSocket(this.url, ["privacy-messenger-v1", this.ticket]);
    this.socket = socket;
    socket.onopen = () => { this.retry = 0; this.emitStatus('connected'); };
    socket.onmessage = (event) => {
      try { this.listeners.forEach((listener) => listener(JSON.parse(event.data))); } catch { /* malformed server event is ignored */ }
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.emitStatus('disconnected');
      this.scheduleReconnect();
    };
    socket.onerror = () => socket.close();
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(30_000, 500 * 2 ** this.retry) + Math.floor(Math.random() * 250);
    this.retry += 1;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.open(); }, delay);
  }

  private emitStatus(status: RealtimeStatus) { this.statusListeners.forEach((listener) => listener(status)); }
}
