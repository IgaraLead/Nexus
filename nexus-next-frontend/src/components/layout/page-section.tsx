import type { ReactNode } from 'react';

import { cn } from '@igaralead/ui';

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

type PageSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export const PageHeader = ({ title, description, actions }: PageHeaderProps) => (
  <header className="flex w-full items-start justify-between gap-4 border-b border-border pb-5 pt-2">
    <div className="min-w-0">
      <h1 className="truncate text-xl font-semibold text-foreground">{title}</h1>
      {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </header>
);

export const PageSection = ({ title, description, children, className }: PageSectionProps) => (
  <section className={cn('border-b border-border py-8', className)}>
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      <div>{children}</div>
    </div>
  </section>
);
