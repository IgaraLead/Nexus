import type { ReactNode } from 'react';

import { cn } from '@igaralead/ui';

type DocumentPageFrameProps = {
  children: ReactNode;
  maxWidthClassName?: string;
};

export const DocumentPageFrame = ({ children, maxWidthClassName = 'max-w-5xl' }: DocumentPageFrameProps) => (
  <div className="flex h-full w-full flex-col overflow-auto bg-background px-6 pb-12 pt-4">
    <div className={cn('mx-auto flex w-full flex-col', maxWidthClassName)}>{children}</div>
  </div>
);
