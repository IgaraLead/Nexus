import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../api/client';
import { queryKeys } from '../../api/query-keys';
import { getCurrentAccountId } from '../../auth/session';
import { getBootstrap } from '../../config/bootstrap';

export type AccountSettings = {
  id: string;
  locale: string;
  name: string;
  supportEmail?: string;
};

const getLocalSettings = (): AccountSettings => {
  const bootstrap = getBootstrap();

  return {
    id: bootstrap.accountId,
    locale: bootstrap.locale,
    name: bootstrap.installationName,
  };
};

const isLocalAccount = (accountId: string) => accountId === 'local-account';

export const settingsApi = {
  account: () => apiRequest<AccountSettings>(''),
  agents: () => apiRequest('/agents'),
  automationRules: () => apiRequest('/automation_rules'),
  customAttributes: () => apiRequest('/custom_attribute_definitions'),
  labels: () => apiRequest('/labels'),
  teams: () => apiRequest('/teams'),
  updateAccount: (payload: Partial<AccountSettings>) => apiRequest('', { method: 'PATCH', body: payload }),
  webhooks: () => apiRequest('/webhooks'),
};

export const useAccountSettings = () => {
  const accountId = getCurrentAccountId();

  return useQuery({
    enabled: !isLocalAccount(accountId),
    initialData: getLocalSettings(),
    queryFn: settingsApi.account,
    queryKey: queryKeys.settings(accountId),
  });
};

export const useUpdateAccountSettings = () => {
  const accountId = getCurrentAccountId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: settingsApi.updateAccount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.settings(accountId) }),
  });
};
