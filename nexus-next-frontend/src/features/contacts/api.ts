import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../api/client';
import { queryKeys } from '../../api/query-keys';
import { getCurrentAccountId } from '../../auth/session';
import { contacts } from '../../screens/mock-data';

export type ContactRecord = (typeof contacts)[number];

const isLocalAccount = (accountId: string) => accountId === 'local-account';

export const contactsApi = {
  list: () => apiRequest<ContactRecord[]>('/contacts'),
  search: (query: string) => apiRequest<ContactRecord[]>('/contacts/search', { searchParams: { q: query } }),
};

export const useContacts = (search = '') => {
  const accountId = getCurrentAccountId();
  const filteredContacts = search
    ? contacts.filter(contact => contact.name.toLowerCase().includes(search.toLowerCase()))
    : contacts;

  return useQuery({
    enabled: !isLocalAccount(accountId),
    initialData: filteredContacts,
    queryFn: () => (search ? contactsApi.search(search) : contactsApi.list()),
    queryKey: queryKeys.contacts(accountId, { search }),
  });
};
