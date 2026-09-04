import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { type SocketSession } from '../src/lib/auth/session-token';
import { verifyRealtimeTicket } from '../src/lib/realtime/ticket';
import { env } from '../src/lib/env';
import { acknowledgeDeliveryWithState, getOutgoingMessageStates, getPendingMessages, markMessageRead, sendMessage } from '../src/lib/messages/service';
import { addReaction, deleteMessage, editMessage, forwardMessage, getReactions, removeReaction, replyToMessage } from '../src/lib/messages/features';
import { parseClientEvent } from '../src/lib/realtime/protocol';
import { validateSendMessageInput } from '../src/lib/messages/validation';
import { getConversationForMember } from '../src/lib/conversations/service';
import {
  getConversationMemberIdentities,
  getConversationPresence,
  markDeviceLastSeen,
} from '../src/lib/presence/service';
import { logger } from '../src/lib/logger';
import { getNotificationTargets } from '../src/lib/notifications/service';
import { sendPrivacyPreservingPush } from '../src/lib/notifications/push';
import { closeDb } from '../src/lib/db';

const PORT = Number(process.env.PORT ?? process.env.WS_PORT ?? 3001);
const MAX_CONNECTIONS_PER_USER = 10;
const MAX_CONNECTIONS_PER_DEVICE = 4;
const EVENT_RATE_LIMIT = 120;
const EVENT_RATE_WINDOW_MS = 10_000;
const connections = new Map<string, Set<WebSocket>>();
const userConnections = new Map<string, Set<WebSocket>>();
const onlinePublicIds = new Set<string>();
const messageRateWindows = new WeakMap<WebSocket, { count: number; resetAt: number }>();
const typingRateWindows = new WeakMap<WebSocket, { count: number; resetAt: number }>();
const eventRateWindows = new WeakMap<WebSocket, { count: number; resetAt: number }>();
const typingConnections = new Map<string, Set<WebSocket>>();
const typingTimers = new WeakMap<WebSocket, Map<string, ReturnType<typeof setTimeout>>>();
const MESSAGE_RATE_LIMIT = 30;
const MESSAGE_RATE_WINDOW_MS = 10_000;
const TYPING_RATE_LIMIT = 30;
const TYPING_RATE_WINDOW_MS = 10_000;
const TYPING_TTL_MS = 5_000;

const socketSession = new WeakMap<WebSocket, SocketSession>();
const upgradeRateWindows = new Map<string, { count: number; resetAt: number }>();
const UPGRADE_RATE_LIMIT = 30;
const UPGRADE_RATE_WINDOW_MS = 60_000;
let shuttingDown = false;

function allowUpgrade(remoteAddress: string): boolean {
  const now = Date.now();
  if (upgradeRateWindows.size > 10_000) {
    for (const [key, value] of upgradeRateWindows) if (value.resetAt <= now) upgradeRateWindows.delete(key);
  }
  const current = upgradeRateWindows.get(remoteAddress);
  if (!current || current.resetAt <= now) {
    upgradeRateWindows.set(remoteAddress, { count: 1, resetAt: now + UPGRADE_RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= UPGRADE_RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

function send(socket: WebSocket, event: unknown) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
}

async function broadcastPresenceChange(session: SocketSession, online: boolean, lastSeenAt: string | null) {
  const records = await getConversationPresence(session.userId);
  const identity = records.find((record) => record.publicId === session.publicId);
  if (!identity) return;

  const event = {
    type: 'presence_update' as const,
    user: {
      publicId: identity.publicId,
      username: identity.username,
      online,
      lastSeenAt: online ? null : lastSeenAt,
    },
  };

  for (const record of records) {
    if (record.publicId === session.publicId) continue;
    // Presence is only emitted to people who share at least one conversation.
    // Public IDs are resolved from PostgreSQL, never from client-provided IDs.
    for (const recipient of getSocketsByPublicId(record.publicId)) send(recipient, event);
  }
}

async function sendPresenceSnapshot(socket: WebSocket, userId: string) {
  const records = await getConversationPresence(userId);
  send(socket, {
    type: 'presence_sync',
    users: records.map((record) => ({
      publicId: record.publicId,
      username: record.username,
      online: onlinePublicIds.has(record.publicId),
      lastSeenAt: onlinePublicIds.has(record.publicId) ? null : record.lastSeenAt,
    })),
  });
}

function getSocketsByPublicId(publicId: string) {
  const result: WebSocket[] = [];
  for (const sockets of userConnections.values()) {
    for (const socket of sockets) {
      if (socketSession.get(socket)?.publicId === publicId) result.push(socket);
    }
  }
  return result;
}

function getRateLimitState(
  windows: WeakMap<WebSocket, { count: number; resetAt: number }>,
  socket: WebSocket,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const current = windows.get(socket);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    windows.set(socket, next);
    return { limited: false, state: next };
  }
  if (current.count >= limit) return { limited: true, state: current };
  current.count += 1;
  return { limited: false, state: current };
}

async function broadcastTypingState(session: SocketSession, conversationId: string, isTyping: boolean) {
  const members = await getConversationMemberIdentities(conversationId);
  const user = members.find((member) => member.publicId === session.publicId);
  if (!user) return;
  const event = { type: 'typing' as const, conversationId, user, isTyping };
  for (const member of members) {
    if (member.publicId === session.publicId) continue;
    for (const recipient of getSocketsByPublicId(member.publicId)) send(recipient, event);
  }
}

async function setTypingState(socket: WebSocket, session: SocketSession, conversationId: string, isTyping: boolean) {
  const key = `${session.userId}:${conversationId}`;
  const current = typingConnections.get(key) ?? new Set<WebSocket>();
  const wasActive = current.size > 0;

  if (isTyping) current.add(socket);
  else current.delete(socket);

  if (current.size > 0) typingConnections.set(key, current);
  else typingConnections.delete(key);

  const becameActive = !wasActive && current.size > 0;
  const becameInactive = wasActive && current.size === 0;
  if (becameActive || becameInactive) await broadcastTypingState(session, conversationId, isTyping);
}

function clearTypingForSocket(socket: WebSocket) {
  const timers = typingTimers.get(socket);
  for (const timer of timers?.values() ?? []) clearTimeout(timer);
  typingTimers.delete(socket);

  const session = socketSession.get(socket);
  if (!session) return;

  const affected: string[] = [];
  for (const [key, sockets] of typingConnections) {
    if (!key.startsWith(`${session.userId}:`)) continue;
    if (!sockets.delete(socket)) continue;
    if (sockets.size === 0) {
      typingConnections.delete(key);
      affected.push(key.slice(session.userId.length + 1));
    }
  }

  for (const conversationId of affected) {
    void broadcastTypingState(session, conversationId, false).catch(() => undefined);
  }
}

async function notifyMessageRecipients(message: Awaited<ReturnType<typeof sendMessage>>['message'], senderUserId: string, mentionPublicIds: string[] = []) {
  const targets = await getNotificationTargets(message.id, senderUserId, mentionPublicIds);
  for (const target of targets) {
    if (!target.enabled) continue;
    const notificationType = target.mention && target.mentions ? 'mention' : target.new_message ? 'new_message' : null;
    if (!notificationType) continue;
    const sockets = connections.get(target.device_id);
    if (sockets && sockets.size > 0) {
      for (const socket of sockets) send(socket, {
        type: 'notification', notificationType, conversationId: message.conversationId, messageId: message.id, generic: true,
      });
    } else if (target.endpoint) {
      await sendPrivacyPreservingPush({ endpoint: target.endpoint, p256dh: target.p256dh, auth: target.auth, notificationType, conversationId: message.conversationId, messageId: message.id });
    }
  }
}

async function broadcastConversationMessage(conversationId: string, event: unknown) {
  const members = await getConversationMemberIdentities(conversationId);
  for (const member of members) {
    for (const recipient of getSocketsByPublicId(member.publicId)) send(recipient, event);
  }
}

async function getMessageConversationId(messageId: string): Promise<string | null> {
  const { query } = await import('../src/lib/db');
  const result = await query<{ conversation_id: string }>('SELECT conversation_id FROM messages WHERE id = $1 LIMIT 1', [messageId]);
  return result.rows[0]?.conversation_id ?? null;
}

async function deliverMessage(message: Awaited<ReturnType<typeof sendMessage>>['message']) {
  const deliveryTargets = await import('../src/lib/db').then(({ query }) => query<{ device_id: string }>(
    `SELECT md.device_id FROM message_deliveries md
     INNER JOIN devices d ON d.id = md.device_id
     INNER JOIN conversation_members cm ON cm.user_id = d.user_id
     INNER JOIN conversations c ON c.id = cm.conversation_id
     INNER JOIN messages m ON m.conversation_id = c.id AND m.id = md.message_id
     WHERE md.message_id = $1 AND md.status = 'pending'`, [message.id],
  ));
  for (const target of deliveryTargets.rows) {
    for (const socket of connections.get(target.device_id) ?? []) send(socket, { type: 'message', message });
  }
}

async function handleConnection(socket: WebSocket, session: SocketSession) {
  socketSession.set(socket, session);
  (socket as WebSocket & { isAlive?: boolean }).isAlive = true;
  socket.on('pong', () => { (socket as WebSocket & { isAlive?: boolean }).isAlive = true; });

  const deviceSet = connections.get(session.deviceId) ?? new Set<WebSocket>();
  if (deviceSet.size >= MAX_CONNECTIONS_PER_DEVICE) { socket.close(1008, 'Too many device connections'); return; }
  deviceSet.add(socket);
  connections.set(session.deviceId, deviceSet);

  const userSet = userConnections.get(session.userId) ?? new Set<WebSocket>();
  if (userSet.size >= MAX_CONNECTIONS_PER_USER) {
    deviceSet.delete(socket);
    if (deviceSet.size === 0) connections.delete(session.deviceId);
    socket.close(1008, 'Too many connections');
    return;
  }
  const wasUserOnline = userSet.size > 0;
  userSet.add(socket);
  userConnections.set(session.userId, userSet);
  if (!wasUserOnline) onlinePublicIds.add(session.publicId);

  try {
    const pending = await getPendingMessages(session.deviceId);
    const outgoingStates = await getOutgoingMessageStates(session.userId);
    send(socket, { type: 'sync', messages: pending, outgoingStates });
    await sendPresenceSnapshot(socket, session.userId);
    if (!wasUserOnline) await broadcastPresenceChange(session, true, null);
  } catch (error) {
    logger.error('Realtime initial state sync failed', { error: error instanceof Error ? error.message : 'unknown error' });
    send(socket, { type: 'error', code: 'SYNC_FAILED' });
  }

  socket.on('message', async (data) => {
    const eventRate = getRateLimitState(eventRateWindows, socket, EVENT_RATE_LIMIT, EVENT_RATE_WINDOW_MS);
    if (eventRate.limited) { send(socket, { type: 'error', code: 'RATE_LIMITED' }); return; }
    const event = parseClientEvent(data.toString());
    if (!event) { send(socket, { type: 'error', code: 'INVALID_EVENT' }); return; }
    try {
      if (event.type === 'send_message') {
        const rate = getRateLimitState(messageRateWindows, socket, MESSAGE_RATE_LIMIT, MESSAGE_RATE_WINDOW_MS);
        if (rate.limited) { send(socket, { type: 'error', requestId: event.requestId, code: 'RATE_LIMITED' }); return; }
        const validation = validateSendMessageInput(event);
        if (!validation.ok) { send(socket, { type: 'error', requestId: event.requestId, code: 'INVALID_MESSAGE' }); return; }
        const result = await sendMessage(session.userId, session.deviceId, validation.value);
        if (!result.duplicate) {
          await deliverMessage(result.message);
          await notifyMessageRecipients(result.message, session.userId, event.mentionPublicIds ?? []);
        }
        send(socket, { type: 'message_accepted', requestId: event.requestId, message: result.message, duplicate: result.duplicate, status: 'sent' as const });
      } else if (event.type === 'delivery_ack') {
        const acknowledgement = await acknowledgeDeliveryWithState(session.deviceId, event.messageId);
        if (!acknowledgement) { send(socket, { type: 'error', requestId: event.requestId, code: 'DELIVERY_NOT_FOUND' }); return; }
        send(socket, { type: 'delivery_acknowledged', requestId: event.requestId, messageId: event.messageId });

        // Only notify the sender when this recipient transitions from not-delivered
        // to delivered. Device IDs are never exposed in the event.
        if (acknowledgement.newlyDeliveredForRecipient) {
          const sender = await import('../src/lib/db').then(({ query }) => query<{ user_id: string }>(
            `SELECT sd.user_id
             FROM messages m
             INNER JOIN devices sd ON sd.id = m.sender_device_id
             WHERE m.id = $1`, [event.messageId],
          ));
          const senderUserId = sender.rows[0]?.user_id;
          if (senderUserId) {
            for (const senderSocket of userConnections.get(senderUserId) ?? []) {
              send(senderSocket, { type: 'message_state', messageId: event.messageId, status: 'delivered', recipientPublicId: acknowledgement.state.recipientPublicId, at: acknowledgement.state.deliveredAt });
            }
          }
        }
      } else if (event.type === 'read_receipt') {
        const receipt = await markMessageRead(session.userId, session.deviceId, event.messageId);
        if (!receipt) { send(socket, { type: 'error', requestId: event.requestId, code: 'READ_NOT_AUTHORIZED' }); return; }
        send(socket, { type: 'read_receipt_acknowledged', requestId: event.requestId, messageId: event.messageId });
        const sender = await import('../src/lib/db').then(({ query }) => query<{ user_id: string }>(
          `SELECT sd.user_id
           FROM messages m
           INNER JOIN devices sd ON sd.id = m.sender_device_id
           INNER JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = $2
           WHERE m.id = $1`, [event.messageId, session.userId],
        ));
        const senderUserId = sender.rows[0]?.user_id;
        if (senderUserId) {
          for (const senderSocket of userConnections.get(senderUserId) ?? []) {
            send(senderSocket, { type: 'message_state', messageId: event.messageId, status: 'read', readerPublicId: receipt.readerPublicId, at: receipt.readAt });
          }
        }
      } else if (event.type === 'reply_message') {
        const message = await replyToMessage(session.userId, session.deviceId, {
          messageId: event.messageId, clientMessageId: event.clientMessageId, ciphertext: event.ciphertext, encryptionVersion: event.encryptionVersion, searchContent: event.searchContent,
        });
        await deliverMessage(message);
        await notifyMessageRecipients(message, session.userId);
        await broadcastConversationMessage(message.conversationId, { type: 'message_created', message });
        send(socket, { type: 'message_accepted', requestId: event.requestId, message, status: 'sent', duplicate: false });
      } else if (event.type === 'edit_message') {
        const conversationId = await getMessageConversationId(event.messageId);
        const message = await editMessage(session.userId, event.messageId, { ciphertext: event.ciphertext, encryptionVersion: event.encryptionVersion, searchContent: event.searchContent });
        if (conversationId) await broadcastConversationMessage(conversationId, { type: 'message_edited', message });
        send(socket, { type: 'message_edit_acknowledged', requestId: event.requestId, message });
      } else if (event.type === 'delete_message') {
        const conversationId = await getMessageConversationId(event.messageId);
        const result = await deleteMessage(session.userId, event.messageId);
        if (conversationId) await broadcastConversationMessage(conversationId, { type: 'message_deleted', messageId: result.messageId, deletedAt: result.deletedAt });
        send(socket, { type: 'message_delete_acknowledged', requestId: event.requestId, ...result });
      } else if (event.type === 'reaction') {
        const conversationId = await getMessageConversationId(event.messageId);
        if (event.action === 'add') await addReaction(session.userId, event.messageId, event.reaction);
        else await removeReaction(session.userId, event.messageId, event.reaction);
        const reactions = await getReactions(session.userId, event.messageId);
        if (conversationId) await broadcastConversationMessage(conversationId, { type: 'reactions_updated', messageId: event.messageId, reactions });
        send(socket, { type: 'reaction_acknowledged', requestId: event.requestId, messageId: event.messageId });
      } else if (event.type === 'forward_message') {
        const message = await forwardMessage(session.userId, session.deviceId, {
          sourceMessageId: event.sourceMessageId, destinationConversationId: event.destinationConversationId, clientMessageId: event.clientMessageId, ciphertext: event.ciphertext, encryptionVersion: event.encryptionVersion, searchContent: event.searchContent,
        });
        await deliverMessage(message);
        await notifyMessageRecipients(message, session.userId);
        await broadcastConversationMessage(message.conversationId, { type: 'message_created', message });
        send(socket, { type: 'message_accepted', requestId: event.requestId, message, status: 'sent', duplicate: false });
      } else if (event.type === 'typing') {
        const rate = getRateLimitState(typingRateWindows, socket, TYPING_RATE_LIMIT, TYPING_RATE_WINDOW_MS);
        if (rate.limited) { send(socket, { type: 'error', requestId: event.requestId, code: 'TYPING_RATE_LIMITED' }); return; }

        const conversation = await getConversationForMember(event.conversationId, session.userId);
        if (!conversation) { send(socket, { type: 'error', requestId: event.requestId, code: 'NOT_AUTHORIZED' }); return; }

        if (event.isTyping) {
          const timers = typingTimers.get(socket) ?? new Map<string, ReturnType<typeof setTimeout>>();
          const previous = timers.get(event.conversationId);
          if (previous) clearTimeout(previous);
          timers.set(event.conversationId, setTimeout(() => {
            timers.delete(event.conversationId);
            void setTypingState(socket, session, event.conversationId, false).catch(() => undefined);
          }, TYPING_TTL_MS));
          typingTimers.set(socket, timers);
        } else {
          const timer = typingTimers.get(socket)?.get(event.conversationId);
          if (timer) clearTimeout(timer);
          typingTimers.get(socket)?.delete(event.conversationId);
        }

        await setTypingState(socket, session, event.conversationId, event.isTyping);
      }
    } catch (error) {
      const code = error instanceof Error && error.message === 'NOT_MEMBER' ? 'NOT_AUTHORIZED' : 'REALTIME_OPERATION_FAILED';
      logger.error('Realtime operation failed', { code });
      send(socket, { type: 'error', requestId: event.requestId, code });
    }
  });

  socket.on('close', () => {
    clearTypingForSocket(socket);

    const currentDevice = connections.get(session.deviceId);
    currentDevice?.delete(socket);
    if (currentDevice?.size === 0) {
      connections.delete(session.deviceId);
      const lastSeenAt = new Date();
      void markDeviceLastSeen(session.deviceId, lastSeenAt)
        .catch((error) => logger.error('Presence last-seen update failed', { error: error instanceof Error ? error.message : 'unknown error' }));
    }

    const currentUser = userConnections.get(session.userId);
    currentUser?.delete(socket);
    if (currentUser?.size === 0) {
      userConnections.delete(session.userId);
      onlinePublicIds.delete(session.publicId);
      const lastSeenAt = new Date().toISOString();
      void broadcastPresenceChange(session, false, lastSeenAt)
        .catch((error) => logger.error('Presence offline broadcast failed', { error: error instanceof Error ? error.message : 'unknown error' }));
    }
  });
}

const server = createServer((req, res) => {
  if (req.url === '/healthz' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(JSON.stringify({ status: 'ok', service: 'privacy-messenger-realtime' }));
    return;
  }
  res.statusCode = 404;
  res.end('Not found');
});
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 100_000,
  handleProtocols: (protocols) => protocols.has('privacy-messenger-v1') ? 'privacy-messenger-v1' : false,
});
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    const state = socket as WebSocket & { isAlive?: boolean };
    if (state.isAlive === false) {
      socket.terminate();
      continue;
    }
    state.isAlive = false;
    socket.ping();
  }
}, 30_000);
heartbeat.unref();

server.on('upgrade', async (request, socket, head) => {
  if (shuttingDown) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

 try {
  const remoteAddress = request.socket.remoteAddress ?? 'unknown';

  if (!allowUpgrade(remoteAddress)) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\nRetry-After: 60\r\n\r\n');
    socket.destroy();
    return;
  }

  const origin = request.headers.origin;
  const allowedOrigin = env.appOrigin ?? env.appUrl;

  if (!origin || origin !== allowedOrigin) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  const protocolHeader = request.headers['sec-websocket-protocol'];
  const offeredProtocols = Array.isArray(protocolHeader)
    ? protocolHeader.flatMap((value) => value.split(',').map((item) => item.trim()).filter(Boolean))
    : protocolHeader?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
  const ticket = offeredProtocols.find((protocol) => protocol !== 'privacy-messenger-v1');

  if (!offeredProtocols.includes('privacy-messenger-v1') || !ticket) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const verified = verifyRealtimeTicket(ticket);
  if (!verified) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const session = await import('../src/lib/db').then(({ query }) => query<{ session_id: string; user_id: string; device_id: string; public_id: string }>(
    `SELECT s.id AS session_id, s.user_id, s.device_id, u.public_id
     FROM sessions s INNER JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > NOW() LIMIT 1`, [verified.sessionId],
  )).then((result) => {
    const row = result.rows[0];
    return row ? { sessionId: row.session_id, userId: row.user_id, deviceId: row.device_id, publicId: row.public_id } : null;
  });

  if (!session) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    void handleConnection(ws, session);
  });

} catch (error) {
  logger.error('Realtime connection authentication failed', {
    error: error instanceof Error ? error.message : 'unknown error'
  });
  socket.destroy();
}
}); // <-- closes server.on('upgrade', ...)

server.listen(PORT, '0.0.0.0', () => logger.info('WebSocket gateway listening', { port: PORT }));

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('WebSocket gateway shutting down', { signal });
  clearInterval(heartbeat);

  for (const socket of wss.clients) {
    try {
      socket.close(1001, 'Server shutting down');
    } catch {
      socket.terminate();
    }
  }

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  await new Promise<void>((resolve) => {
    if (wss.clients.size === 0) {
      resolve();
      return;
    }
    wss.close(() => resolve());
  });

  await closeDb();
}

process.once('SIGTERM', () => {
  void shutdown('SIGTERM').then(() => process.exit(0)).catch((error) => {
    logger.error('Graceful shutdown failed', { error: error instanceof Error ? error.message : 'unknown error' });
    process.exit(1);
  });
});

process.once('SIGINT', () => {
  void shutdown('SIGINT').then(() => process.exit(0)).catch((error) => {
    logger.error('Graceful shutdown failed', { error: error instanceof Error ? error.message : 'unknown error' });
    process.exit(1);
  });
});
