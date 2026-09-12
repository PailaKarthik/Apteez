import type * as React from 'react';
import { cn } from '../../lib/utils';

/** Keyboard shortcut hint chip, e.g. inside menu items or search fields. */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>): React.JSX.Element {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-metric text-[10px] font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
