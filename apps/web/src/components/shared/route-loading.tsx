import { Skeleton } from '@apteez/ui';

/**
 * Instant navigation feedback: Next.js renders this the moment a route
 * transition starts, so tapping a card/link never shows a dead frame.
 * Header skeleton + card rows mirror the real page layout (no layout jump).
 */
export function RouteLoading({
  label,
  rows = 5,
}: {
  label: string;
  rows?: number;
}): React.JSX.Element {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={label}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-2 rounded-2xl border border-border p-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
