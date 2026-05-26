import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../api/client';
import { queryKeys } from '../../api/query-keys';
import { getCurrentAccountId } from '../../auth/session';
import { inboxNotifications } from '../../screens/mock-data';

export type NotificationRecord = (typeof inboxNotifications)[number];

const isLocalAccount = (accountId: string) => accountId === 'local-account';

export const notificationsApi = {
  deleteAllRead: () => apiRequest('/notifications/destroy_all', { method: 'DELETE', body: { status: 'read' } }),
  list: () => apiRequest<NotificationRecord[]>('/notifications'),
  markAllRead: () => apiRequest('/notifications/read_all', { method: 'POST' }),
  markRead: (notificationId: string) => apiRequest(`/notifications/${notificationId}/read`, { method: 'POST' }),
  markUnread: (notificationId: string) => apiRequest(`/notifications/${notificationId}/unread`, { method: 'POST' }),
  unreadCount: () => apiRequest<{ count: number }>('/notifications/unread_count'),
};

export const useNotifications = () => {
  const accountId = getCurrentAccountId();

  return useQuery({
    enabled: !isLocalAccount(accountId),
    initialData: inboxNotifications,
    queryFn: notificationsApi.list,
    queryKey: queryKeys.notifications(accountId),
  });
};

export const useNotificationActions = () => {
  const accountId = getCurrentAccountId();
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications(accountId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCount(accountId) });
  };

  return {
    markAllRead: useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate }),
    markRead: useMutation({ mutationFn: notificationsApi.markRead, onSuccess: invalidate }),
    markUnread: useMutation({ mutationFn: notificationsApi.markUnread, onSuccess: invalidate }),
  };
};
