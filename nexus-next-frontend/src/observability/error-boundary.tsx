import { Button } from '@igaralead/ui';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { logger } from './logger';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error?: Error;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('React render error', { componentStack: errorInfo.componentStack, message: error.message });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center">
            <h1 className="text-lg font-semibold">Nao foi possivel carregar esta tela</h1>
            <p className="mt-2 text-sm text-muted-foreground">Tente recarregar ou volte temporariamente para o Nexus atual.</p>
            <Button type="button" className="mt-4" onClick={() => window.location.reload()}>
              Recarregar
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
