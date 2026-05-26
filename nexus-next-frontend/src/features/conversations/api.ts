import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../api/client';
import { queryKeys } from '../../api/query-keys';
import { getCurrentAccountId } from '../../auth/session';
import { conversations, messages } from '../../screens/mock-data';

export type ConversationRecord = (typeof conversations)[number];
export type MessageRecord = (typeof messages)[number];

const isLocalAccount = (accountId: string) => accountId === 'local-account';

export const conversationsApi = {
  list: () => apiRequest<ConversationRecord[]>('/conversations'),
  resolve: (conversationId: number | string) =>
    apiRequest(`/conversations/${conversationId}/toggle_status`, { method: 'POST', body: { status: 'resolved' } }),
  togglePriority: (conversationId: number | string, priority: string) =>
    apiRequest(`/conversations/${conversationId}/toggle_priority`, { method: 'POST', body: { priority } }),
};

export const messagesApi = {
  create: ({ conversationId, content }: { conversationId: number | string; content: string }) =>
    apiRequest(`/conversations/${conversationId}/messages`, { method: 'POST', body: { content } }),
  list: (conversationId: number | string) => apiRequest<MessageRecord[]>(`/conversations/${conversationId}/messages`),
};

export const useConversationList = () => {
  const accountId = getCurrentAccountId();

  return useQuery({
    enabled: !isLocalAccount(accountId),
    initialData: conversations,
    queryFn: conversationsApi.list,
    queryKey: queryKeys.conversations(accountId),
  });
};

export const useConversationMessages = (conversationId: number | string) => {
  const accountId = getCurrentAccountId();

  return useQuery({
    enabled: !isLocalAccount(accountId),
    initialData: messages,
    queryFn: () => messagesApi.list(conversationId),
    queryKey: queryKeys.conversationMessages(accountId, conversationId),
  });
};

export const useConversationActions = () => {
  const accountId = getCurrentAccountId();
  const queryClient = useQueryClient();
  const invalidateConversations = () => queryClient.invalidateQueries({ queryKey: queryKeys.conversations(accountId) });

  return {
    resolve: useMutation({ mutationFn: conversationsApi.resolve, onSuccess: invalidateConversations }),
    sendMessage: useMutation({
      mutationFn: messagesApi.create,
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.conversationMessages(accountId, variables.conversationId) });
      },
    }),
  };
};
