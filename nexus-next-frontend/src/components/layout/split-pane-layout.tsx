import type { ReactNode } from 'react';

import { cn } from '@igaralead/ui';

type SplitPaneLayoutProps = {
  list: ReactNode;
  detail: ReactNode;
  listClassName?: string;
  detailClassName?: string;
};

export const SplitPaneLayout = ({
  list,
  detail,
  listClassName = 'lg:min-w-[340px] lg:max-w-[340px]',
  detailClassName = '',
}: SplitPaneLayoutProps) => (
  <section className="flex h-full min-h-0 w-full overflow-hidden bg-background">
    <aside className={cn('flex h-full w-full shrink-0 flex-col border-r border-border bg-background', listClassName)}>
      {list}
    </aside>
    <main className={cn('hidden h-full min-w-0 flex-1 bg-background lg:flex', detailClassName)}>{detail}</main>
  </section>
);
