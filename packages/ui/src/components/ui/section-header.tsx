import type * as React from 'react';
import { cn } from '../../lib/utils';

export interface SectionHeaderProps {
  title: string;
  description?: string;
  /** Trailing controls aligned to the right (links, buttons, tabs). */
  actions?: React.ReactNode;
  className?: string;
}

/** Section-level heading used between stacked page sections. */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: SectionHeaderProps): React.JSX.Element {
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-section-title text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
