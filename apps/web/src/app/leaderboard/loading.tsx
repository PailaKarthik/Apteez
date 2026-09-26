import { Skeleton } from '@apteez/ui';

export default function LeaderboardLoading(): React.JSX.Element {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading leaderboard">
      <Skeleton className="h-11 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid gap-2 rounded-2xl border border-border p-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
