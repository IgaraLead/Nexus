import { create } from 'zustand';

type FilterState = {
  contactSearch: string;
  conversationStatus: 'open' | 'resolved' | 'pending' | 'snoozed';
  notificationStatus: string;
  reportRange: '7d' | '30d' | '90d';
  setContactSearch: (contactSearch: string) => void;
  setConversationStatus: (conversationStatus: FilterState['conversationStatus']) => void;
  setNotificationStatus: (notificationStatus: string) => void;
  setReportRange: (reportRange: FilterState['reportRange']) => void;
};

export const useFilterStore = create<FilterState>(set => ({
  contactSearch: '',
  conversationStatus: 'open',
  notificationStatus: '',
  reportRange: '7d',
  setContactSearch: contactSearch => set({ contactSearch }),
  setConversationStatus: conversationStatus => set({ conversationStatus }),
  setNotificationStatus: notificationStatus => set({ notificationStatus }),
  setReportRange: reportRange => set({ reportRange }),
}));
