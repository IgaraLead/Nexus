import { createConsumer, type Channel, type Consumer } from '@rails/actioncable';
import type { QueryClient } from '@tanstack/react-query';

import { getBootstrap } from '../config/bootstrap';
import { useRealtimeStore } from '../stores/realtime-store';
import type { RealtimeEvent } from './events';

type RoomChannel = Channel & {
  update_presence?: () => void;
};

type RealtimeClientOptions = {
  queryClient: QueryClient;
  onEvent?: (event: RealtimeEvent) => void;
};

export class RealtimeClient {
  private channel?: RoomChannel;
  private consumer?: Consumer;
  private options: RealtimeClientOptions;

  constructor(options: RealtimeClientOptions) {
    this.options = options;
  }

  connect() {
    const { accountId, hostUrl, pubsubToken, user } = getBootstrap();

    if (!pubsubToken || !user?.id) {
      useRealtimeStore.getState().setStatus('idle');
      return;
    }

    useRealtimeStore.getState().setStatus('connecting');
    this.consumer = createConsumer(`${hostUrl.replace(/^http/, 'ws')}/cable`);
    this.channel = this.consumer.subscriptions.create(
      {
        account_id: accountId,
        channel: 'RoomChannel',
        pubsub_token: pubsubToken,
        user_id: user.id,
      },
      {
        connected: () => {
          useRealtimeStore.getState().setStatus('connected');
          this.channel?.update_presence?.();
        },
        disconnected: () => useRealtimeStore.getState().setDisconnected(),
        rejected: () => useRealtimeStore.getState().setStatus('failed'),
        received: (event: RealtimeEvent) => this.options.onEvent?.(event),
      }
    ) as RoomChannel;
  }

  disconnect() {
    this.channel?.unsubscribe();
    this.consumer?.disconnect();
    useRealtimeStore.getState().setDisconnected();
  }
}
