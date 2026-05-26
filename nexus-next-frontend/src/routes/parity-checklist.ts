export type ParityStatus = 'mocked' | 'wired' | 'production-ready';

export const routeParityChecklist = [
  { route: '/', status: 'wired', vueReference: 'dashboard/routes/dashboard/inbox/InboxList.vue' },
  { route: '/conversations', status: 'wired', vueReference: 'dashboard/routes/dashboard/conversation/ConversationView.vue' },
  { route: '/contacts', status: 'wired', vueReference: 'dashboard/components-next/Contacts/ContactsListLayout.vue' },
  { route: '/channels', status: 'wired', vueReference: 'dashboard/routes/dashboard/settings/inbox/' },
  { route: '/settings', status: 'wired', vueReference: 'dashboard/routes/dashboard/settings/account/Index.vue' },
  { route: '/reports', status: 'wired', vueReference: 'dashboard/routes/dashboard/settings/reports/' },
] satisfies Array<{ route: string; status: ParityStatus; vueReference: string }>;
