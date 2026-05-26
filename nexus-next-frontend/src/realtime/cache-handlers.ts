import type { QueryClient } from '@tanstack/react-query';

import { getCurrentAccountId } from '../auth/session';
import { queryKeys } from '../api/query-keys';
import type { RealtimeEvent } from './events';

export const handleRealtimeEvent = (queryClient: QueryClient, event: RealtimeEvent) => {
  const accountId = getCurrentAccountId();

  if (event.event.startsWith('notification.')) {
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications(accountId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCount(accountId) });
  }

  if (event.event.startsWith('conversation.') || event.event.startsWith('message.')) {
    queryClient.invalidateQueries({ queryKey: queryKeys.conversations(accountId) });
  }

  if (event.event.startsWith('contact.')) {
    queryClient.invalidateQueries({ queryKey: queryKeys.contacts(accountId) });
  }

  if (event.event === 'account.cache_invalidated') {
    queryClient.invalidateQueries({ queryKey: queryKeys.account(accountId) });
  }
};
