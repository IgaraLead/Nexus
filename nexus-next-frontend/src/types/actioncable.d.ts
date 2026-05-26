declare module '@rails/actioncable' {
  export type Channel = {
    perform: (action: string, data?: unknown) => void;
    unsubscribe: () => void;
  };

  export type Consumer = {
    disconnect: () => void;
    subscriptions: {
      create: (params: Record<string, unknown>, callbacks: Record<string, unknown>) => Channel;
    };
  };

  export const createConsumer: (url?: string) => Consumer;
}
