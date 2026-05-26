import {
  ChannelsPage,
  ContactsPage,
  ConversationsPage,
  InboxPage,
  PlaceholderPage,
  ReportsPage,
  SettingsPage,
} from '../screens/pages';

export const routes = [
  { element: <InboxPage />, path: '/' },
  { element: <ConversationsPage />, path: '/conversations' },
  { element: <ConversationsPage />, path: '/conversations/:view' },
  { element: <ChannelsPage />, path: '/channels' },
  { element: <ChannelsPage />, path: '/channels/:inboxId' },
  { element: <ContactsPage />, path: '/contacts' },
  { element: <ContactsPage />, path: '/contacts/:contactId' },
  { element: <ReportsPage />, path: '/reports' },
  { element: <ReportsPage />, path: '/reports/:reportType' },
  { element: <SettingsPage />, path: '/settings' },
  { element: <SettingsPage />, path: '/settings/:settingsSection' },
  { element: <PlaceholderPage />, path: '*' },
];
