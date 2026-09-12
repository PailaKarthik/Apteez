'use client';

import { TriangleAlert } from 'lucide-react';
import type * as React from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
}

/** Friendly error panel used by route-level `error.tsx` boundaries. */
export function ErrorState({
  title = 'Something went wrong',
  description = 'An unexpected error interrupted this view. Try again — if it persists, the request id in the details helps support.',
  retryLabel = 'Try again',
  onRetry,
  className,
}: ErrorStateProps): React.JSX.Element {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}
      role="alert"
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
