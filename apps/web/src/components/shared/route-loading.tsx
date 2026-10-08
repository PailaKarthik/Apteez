import { Loader2 } from 'lucide-react';
import { cn } from '@apteez/ui';

export interface RouteLoadingProps {
  label: string;
  rows?: number;
  /** Skeleton layout: list rows, feature cards, or a hero + cards. */
  variant?: 'list' | 'cards' | 'hero';
}

/**
 * Rich navigation feedback: renders the instant a route transition starts.
 * Shimmer skeletons mirror the destination layout (no layout jump), a
 * sliding rail suggests forward motion, and the status label pulses.
 */
export function RouteLoading({
  label,
  rows = 6,
  variant = 'list',
}: RouteLoadingProps): React.JSX.Element {
  return (
    <div className="animate-fade-in space-y-5" aria-busy="true" aria-label={label} role="status">
      {/* Header skeleton + live status */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="glass flex size-10 items-center justify-center rounded-xl border border-border">
            <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton-shine h-6 w-52 max-w-[60%] rounded-lg" />
            <div className="skeleton-shine h-4 w-80 max-w-full rounded-md" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="loading-rail h-1.5 flex-1" aria-hidden>
            <span />
          </div>
          <p className="typing-dots shrink-0 text-xs font-medium text-muted-foreground">{label}</p>
        </div>
      </div>

      {variant === 'hero' ? (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-border">
            <div className="aurora-field" aria-hidden>
              <span className="aurora-orb -left-10 -top-16 size-56 bg-primary/25" />
              <span className="aurora-orb -right-10 top-0 size-64 bg-primary/20 [animation-delay:-6s]" />
            </div>
            <div className="relative space-y-3 p-6 sm:p-8">
              <div className="skeleton-shine h-5 w-32 rounded-full" />
              <div className="skeleton-shine h-8 w-2/3 rounded-lg" />
              <div className="skeleton-shine h-4 w-1/2 rounded-md" />
              <div className="flex gap-2 pt-1">
                <div className="skeleton-shine h-9 w-28 rounded-lg" />
                <div className="skeleton-shine h-9 w-28 rounded-lg" />
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="rounded-xl border border-border p-5" aria-hidden>
                <div className="skeleton-shine size-10 rounded-xl" />
                <div className="skeleton-shine mt-3 h-4 w-2/3 rounded-md" />
                <div className="skeleton-shine mt-2 h-3 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ) : variant === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              className="animate-fade-up rounded-xl border border-border p-5"
              style={{ animationDelay: `${Math.min(i, 5) * 70}ms` }}
              aria-hidden
            >
              <div className="flex items-start justify-between gap-2">
                <div className="skeleton-shine h-5 w-2/3 rounded-md" />
                <div className="skeleton-shine h-5 w-16 rounded-full" />
              </div>
              <div className="skeleton-shine mt-3 h-3 w-full rounded-md" />
              <div className="skeleton-shine mt-2 h-3 w-4/5 rounded-md" />
              <div className="mt-4 flex items-center gap-3">
                <div className="skeleton-shine size-8 rounded-lg" />
                <div className="skeleton-shine size-8 rounded-lg" />
                <div className="skeleton-shine size-8 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className={cn('divide-y divide-border')}>
            {Array.from({ length: rows }, (_, i) => (
              <div
                key={i}
                className="animate-fade-up flex items-center gap-3 p-3"
                style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
                aria-hidden
              >
                <div className="skeleton-shine size-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton-shine h-4 w-2/5 rounded-md" />
                  <div className="skeleton-shine h-3 w-3/5 rounded-md" />
                </div>
                <div className="skeleton-shine hidden h-6 w-16 rounded-full sm:block" />
                <div className="skeleton-shine h-8 w-8 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
