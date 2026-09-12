import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface LoadingStateProps {
  title?: string;
  description?: string;
  className?: string;
}

/** Centered loading indicator used by route-level `loading.tsx` boundaries. */
export function LoadingState({
  title = 'Loading',
  description,
  className,
}: LoadingStateProps): React.JSX.Element {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
