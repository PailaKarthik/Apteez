'use client';

import { Award, FileText, Flag, GraduationCap, Medal, Swords, Tent } from 'lucide-react';
import { Button, Card, CardContent, CardTitle, Skeleton } from '@apteez/ui';
import { useRecentActivity } from '@/hooks/use-profile';

const KIND_ICON = {
  solve: FileText,
  challenge: Swords,
  contest: Medal,
  event: Tent,
  achievement: Award,
  contribution: Flag,
  lesson: GraduationCap,
} as const;

export function RecentActivityFeed(): React.JSX.Element {
  const { items, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, isError, refetch } =
    useRecentActivity();

  if (isPending) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError && items.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6">
          <CardTitle className="text-card-title">Recent activity</CardTitle>
          <p className="text-sm text-muted-foreground">
            Could not load activity.{' '}
            <Button variant="link" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </p>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6">
          <CardTitle className="text-card-title">Recent activity</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your solves, matches, contests, events and unlocks appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-1 p-6">
        <CardTitle className="text-card-title">Recent activity</CardTitle>
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind] ?? FileText;
            return (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  {item.detail ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(item.occurredAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </li>
            );
          })}
        </ul>
        {hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? 'Loading…' : 'Show more'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
