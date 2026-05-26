import { getBootstrap } from '../config/bootstrap';

const messages = {
  en: {
    inbox: 'My Inbox',
    conversations: 'Conversations',
    channels: 'Channels',
    contacts: 'Contacts',
    reports: 'Reports',
    settings: 'Settings',
  },
  'pt-BR': {
    inbox: 'Minha caixa',
    conversations: 'Conversas',
    channels: 'Canais',
    contacts: 'Contatos',
    reports: 'Relatórios',
    settings: 'Configurações',
  },
};

export type MessageKey = keyof typeof messages.en;

export const getLocale = () => getBootstrap().locale;

export const t = (key: MessageKey) => {
  const locale = getLocale();
  const dictionary = messages[locale as keyof typeof messages] ?? messages.en;

  return dictionary[key] ?? messages.en[key];
};
