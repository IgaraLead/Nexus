import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';

import { queryClient } from './query-client';
import { RealtimeClient } from '../realtime/client';
import { handleRealtimeEvent } from '../realtime/cache-handlers';

type AppProvidersProps = {
  children: ReactNode;
};

export const AppProviders = ({ children }: AppProvidersProps) => {
  useEffect(() => {
    const realtimeClient = new RealtimeClient({
      queryClient,
      onEvent: event => handleRealtimeEvent(queryClient, event),
    });

    realtimeClient.connect();

    return () => realtimeClient.disconnect();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};
