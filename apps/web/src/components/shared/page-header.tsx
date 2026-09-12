import type * as React from 'react';
import { cn } from '@apteez/ui';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Page title block. Typography comes from the centralized tokens
 * (`text-page-title`) so every page shares the same hierarchy.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps): React.JSX.Element {
  return (
    <div
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-page-title text-foreground">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
