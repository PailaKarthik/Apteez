'use client';

import { Check, X } from 'lucide-react';
import Link from 'next/link';
import { Badge, Button, Card, CardContent, EmptyState, Skeleton, cn } from '@apteez/ui';
import { useRecentPracticeFeed } from '@/hooks/use-practice';

const DIFFICULTY_TONE = { EASY: 'success', MEDIUM: 'warning', HARD: 'destructive' } as const;

/** Recent practice activity — lightweight rows with offset "show more" paging. */
export function RecentPractice(): React.JSX.Element {
  const {
    items,
    total,
    isPending,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useRecentPracticeFeed();

  if (isPending) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5" aria-busy="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
          <p>Could not load your practice history.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No practice yet"
        description="Solve your first problem and your recent activity will appear here."
      />
    );
  }

  return (
    <Card>
      <CardContent className={cn('p-2', isFetchingNextPage ? 'opacity-70' : null)}>
        <p className="px-3 pb-1 pt-2 text-xs text-muted-foreground" aria-live="polite">
          Showing <span className="font-metric">{items.length}</span> of{' '}
          <span className="font-metric">{total}</span>
        </p>
        <div className="divide-y divide-border">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/problems/${item.problem.id}`}
              className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50"
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full',
                  item.isCorrect
                    ? 'bg-success/15 text-success'
                    : 'bg-destructive/15 text-destructive',
                )}
                aria-label={item.isCorrect ? 'Correct' : 'Incorrect'}
              >
                {item.isCorrect ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <X className="size-4" aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {item.problem.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.category.name}
                  {item.topic ? ` · ${item.topic.name}` : ''}
                </span>
              </span>
              <Badge variant={DIFFICULTY_TONE[item.difficulty]}>{item.difficulty}</Badge>
            </Link>
          ))}
        </div>
        {hasNextPage ? (
          <div className="p-2">
            <Button
              variant="outline"
              className="w-full"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? 'Loading…' : 'Show more'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
