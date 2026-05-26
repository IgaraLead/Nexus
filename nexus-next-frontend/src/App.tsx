import { BrowserRouter, useLocation, useRoutes } from 'react-router-dom';

import { NexusShell } from './components/layout/nexus-shell';
import { ErrorBoundary } from './observability/error-boundary';
import { AppProviders } from './query/app-providers';
import { routes } from './routes/routes';

const RoutedApp = () => {
  const { pathname } = useLocation();
  const element = useRoutes(routes);

  return <NexusShell activePath={pathname}>{element}</NexusShell>;
};

export const App = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <AppProviders>
        <RoutedApp />
      </AppProviders>
    </BrowserRouter>
  </ErrorBoundary>
);
