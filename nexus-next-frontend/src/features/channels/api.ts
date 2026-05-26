import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../api/client';
import { queryKeys } from '../../api/query-keys';
import { getCurrentAccountId } from '../../auth/session';
import { channels } from '../../screens/mock-data';

export type ChannelRecord = (typeof channels)[number];

const isLocalAccount = (accountId: string) => accountId === 'local-account';

export const inboxesApi = {
  baileysDisconnect: (inboxId: string) => apiRequest(`/inboxes/${inboxId}/baileys_disconnect`, { method: 'POST' }),
  baileysQrCode: (inboxId: string) => apiRequest(`/inboxes/${inboxId}/baileys_qr_code`),
  baileysStatus: (inboxId: string) => apiRequest(`/inboxes/${inboxId}/baileys_status`),
  list: () => apiRequest<ChannelRecord[]>('/inboxes'),
  resetSecret: (inboxId: string) => apiRequest(`/inboxes/${inboxId}/reset_secret`, { method: 'POST' }),
  syncTemplates: (inboxId: string) => apiRequest(`/inboxes/${inboxId}/sync_templates`, { method: 'POST' }),
};

export const useInboxes = () => {
  const accountId = getCurrentAccountId();

  return useQuery({
    enabled: !isLocalAccount(accountId),
    initialData: channels,
    queryFn: inboxesApi.list,
    queryKey: queryKeys.channels(accountId),
  });
};
