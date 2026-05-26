export type RealtimeEventType =
  | 'account.cache_invalidated'
  | 'contact.deleted'
  | 'contact.updated'
  | 'conversation.created'
  | 'conversation.read'
  | 'conversation.status_changed'
  | 'conversation.typing_off'
  | 'conversation.typing_on'
  | 'conversation.updated'
  | 'message.created'
  | 'message.updated'
  | 'notification.created'
  | 'notification.deleted'
  | 'notification.updated'
  | 'presence.update';

export type RealtimeEvent<TPayload = unknown> = {
  event: RealtimeEventType;
  data: TPayload;
};
