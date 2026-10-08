import type * as React from 'react';
import { cn } from '@apteez/ui';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  /** Small uppercase eyebrow above the title (e.g. "Season 02 · Live"). */
  eyebrow?: string;
}

/**
 * Page title block with a smooth entrance: eyebrow, gradient-kissed title
 * and an accent underline. Typography still comes from the centralized
 * tokens (`text-page-title`) so hierarchy stays consistent.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  eyebrow,
}: PageHeaderProps): React.JSX.Element {
  return (
    <div
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}
    >
      <div className="page-enter min-w-0 space-y-1.5">
        {eyebrow ? (
          <p className="flex items-center gap-2 text-metadata uppercase tracking-[0.18em] text-primary">
            <span className="inline-block h-px w-6 bg-gradient-to-r from-primary to-transparent" aria-hidden />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-page-title text-foreground">{title}</h1>
        <span
          className="block h-1 w-16 rounded-full bg-gradient-to-r from-primary to-accent-foreground"
          aria-hidden
        />
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="page-enter-1 flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
