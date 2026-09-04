export type NotificationPreferences = {
  newMessage: boolean;
  mentions: boolean;
};

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type NotificationEvent = {
  type: 'notification';
  notificationType: 'new_message' | 'mention';
  conversationId: string;
  messageId: string;
  generic: true;
};
