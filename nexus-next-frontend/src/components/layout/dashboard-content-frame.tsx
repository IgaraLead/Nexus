import type { ReactNode } from 'react';

type DashboardContentFrameProps = {
  children: ReactNode;
};

export const DashboardContentFrame = ({ children }: DashboardContentFrameProps) => (
  <div className="flex h-full min-h-0 w-full overflow-hidden bg-background text-foreground">{children}</div>
);
