self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { return; }
  if (!data || data.generic !== true || typeof data.conversationId !== 'string') return;
  const title = data.notificationType === 'mention' ? 'You were mentioned' : 'New message';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.notificationType === 'mention' ? 'You have a new mention.' : 'You have a new message.',
    data: { conversationId: data.conversationId },
    tag: `conversation:${data.conversationId}`,
    renotify: false,
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId;
  if (!conversationId) return;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((window) => 'focus' in window);
    if (existing) return existing.focus();
    return clients.openWindow(`/`);
  }));
});
