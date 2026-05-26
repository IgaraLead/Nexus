export const inboxNotifications = [
  {
    id: 'notif-1',
    title: 'Joana Lima',
    description: 'Preciso confirmar o status do pedido de hoje.',
    meta: 'Conversa atribuida',
    time: '2m',
    unread: true,
  },
  {
    id: 'notif-2',
    title: 'Mercado Sol',
    description: 'Nova mensagem recebida no canal WhatsApp.',
    meta: 'Inbox: Acme Support',
    time: '14m',
    unread: true,
  },
  {
    id: 'notif-3',
    title: 'Financeiro Acme',
    description: 'SLA proximo do vencimento.',
    meta: 'Mencao',
    time: '1h',
    unread: false,
  },
];

export const conversations = [
  {
    id: 1024,
    name: 'Joana Lima',
    channel: 'WhatsApp Baileys',
    preview: 'Oi, voces conseguem verificar a entrega de hoje?',
    assignee: 'Nina',
    status: 'open',
    priority: 'Alta',
    time: '2m',
    unread: 3,
  },
  {
    id: 1023,
    name: 'Mercado Sol',
    channel: 'WhatsApp Baileys',
    preview: 'Recebemos o comprovante, obrigado.',
    assignee: 'Rafael',
    status: 'open',
    priority: 'Media',
    time: '14m',
    unread: 0,
  },
  {
    id: 1022,
    name: 'Financeiro Acme',
    channel: 'Email',
    preview: 'Podem anexar a segunda via da nota?',
    assignee: 'Nina',
    status: 'pending',
    priority: 'Baixa',
    time: '1h',
    unread: 1,
  },
  {
    id: 1021,
    name: 'Rafael Costa',
    channel: 'Website',
    preview: 'Quero falar com um especialista comercial.',
    assignee: 'Sem agente',
    status: 'open',
    priority: 'Media',
    time: '3h',
    unread: 0,
  },
];

export const messages = [
  {
    id: 'msg-1',
    author: 'Joana Lima',
    body: 'Oi, voces conseguem verificar a entrega de hoje?',
    direction: 'incoming',
    time: '10:21',
  },
  {
    id: 'msg-2',
    author: 'Nina',
    body: 'Claro. Vou consultar o pedido e te retorno por aqui.',
    direction: 'outgoing',
    time: '10:22',
  },
  {
    id: 'msg-3',
    author: 'Joana Lima',
    body: 'Obrigada. O cliente esta aguardando no local.',
    direction: 'incoming',
    time: '10:24',
  },
];

export const channels = [
  { id: 'acme-support', name: 'Acme Support', type: 'WhatsApp Baileys', conversations: 24, status: 'ativo' },
  { id: 'teste', name: 'teste', type: 'Canal operacional', conversations: 8, status: 'ativo' },
  { id: 'website', name: 'Website', type: 'Widget web', conversations: 16, status: 'revisar' },
];

export const channelTypes = [
  { key: 'website', title: 'Website', description: 'Converse com visitantes via widget web.' },
  { key: 'whatsapp', title: 'WhatsApp', description: 'Conecte canais oficiais ou Baileys.' },
  { key: 'email', title: 'Email', description: 'Receba e responda conversas por email.' },
  { key: 'api', title: 'API', description: 'Integre canais proprietarios via API.' },
  { key: 'telegram', title: 'Telegram', description: 'Atenda conversas vindas do Telegram.' },
  { key: 'voice', title: 'Voice', description: 'Prepare canais de chamada quando habilitados.' },
];

export const contacts = [
  { id: 'ct-1', name: 'Joana Lima', email: 'joana@example.com', phone: '+55 11 94000-0012', company: 'Acme', lastSeen: '2m' },
  { id: 'ct-2', name: 'Mercado Sol', email: 'compras@mercadosol.com', phone: '+55 21 98888-1200', company: 'Mercado Sol', lastSeen: '14m' },
  { id: 'ct-3', name: 'Rafael Costa', email: 'rafael@example.com', phone: '+55 31 97777-3210', company: 'IgaraLead', lastSeen: '3h' },
  { id: 'ct-4', name: 'Financeiro Acme', email: 'financeiro@acme.com', phone: '+55 11 95555-9000', company: 'Acme', lastSeen: '1d' },
];

export const reportMetrics = [
  { label: 'Conversas', value: '1.284', delta: '+12%' },
  { label: 'Resolvidas', value: '918', delta: '+8%' },
  { label: 'Tempo medio', value: '4m 18s', delta: '-18%' },
  { label: 'CSAT', value: '92%', delta: '+3%' },
];

export const reportRows = [
  { queue: 'WhatsApp Baileys', conversations: 428, resolved: 312, response: '3m 12s' },
  { queue: 'Website', conversations: 216, resolved: 184, response: '5m 40s' },
  { queue: 'Email', conversations: 144, resolved: 96, response: '18m 10s' },
];
