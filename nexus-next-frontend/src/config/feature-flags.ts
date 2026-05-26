import { hasProductSurface } from './bootstrap';

export const reactRouteFlags = {
  channels: 'reactChannels',
  contacts: 'reactContacts',
  conversations: 'reactConversations',
  inbox: 'reactInbox',
  reports: 'reactReports',
  settings: 'reactSettings',
} as const;

export type ReactRouteFlag = (typeof reactRouteFlags)[keyof typeof reactRouteFlags];

export const isReactRouteEnabled = (flag: ReactRouteFlag) => {
  if (import.meta.env.DEV) return true;

  return hasProductSurface(flag);
};
