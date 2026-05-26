export const queryKeys = {
  account: (accountId: string) => ['accounts', accountId] as const,
  channels: (accountId: string) => ['accounts', accountId, 'channels'] as const,
  contacts: (accountId: string, filters?: unknown) => ['accounts', accountId, 'contacts', filters] as const,
  conversationMessages: (accountId: string, conversationId: number | string) =>
    ['accounts', accountId, 'conversations', conversationId, 'messages'] as const,
  conversations: (accountId: string, filters?: unknown) => ['accounts', accountId, 'conversations', filters] as const,
  notifications: (accountId: string, filters?: unknown) => ['accounts', accountId, 'notifications', filters] as const,
  notificationUnreadCount: (accountId: string) => ['accounts', accountId, 'notifications', 'unread-count'] as const,
  reports: (accountId: string, filters?: unknown) => ['accounts', accountId, 'reports', filters] as const,
  settings: (accountId: string) => ['accounts', accountId, 'settings'] as const,
};
