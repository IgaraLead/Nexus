import { create } from 'zustand';

type ConversationDisplayType = 'condensed' | 'expanded';

type UiState = {
  activeConversationId?: number | string;
  conversationDisplayType: ConversationDisplayType;
  isContactSidebarOpen: boolean;
  setActiveConversationId: (conversationId?: number | string) => void;
  setConversationDisplayType: (displayType: ConversationDisplayType) => void;
  setContactSidebarOpen: (isOpen: boolean) => void;
};

export const useUiStore = create<UiState>(set => ({
  activeConversationId: undefined,
  conversationDisplayType: 'condensed',
  isContactSidebarOpen: true,
  setActiveConversationId: activeConversationId => set({ activeConversationId }),
  setConversationDisplayType: conversationDisplayType => set({ conversationDisplayType }),
  setContactSidebarOpen: isContactSidebarOpen => set({ isContactSidebarOpen }),
}));
