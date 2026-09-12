'use client';

import { Check, X } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card, CardContent, EmptyState, Skeleton, cn } from '@apteez/ui';
import { useRecentPractice } from '@/hooks/use-practice';

const DIFFICULTY_TONE = { EASY: 'success', MEDIUM: 'warning', HARD: 'destructive' } as const;

/** Recent practice activity — lightweight rows, no question bodies. */
export function RecentPractice(): React.JSX.Element {
  const { data, isPending, isError } = useRecentPractice(10);

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
        <CardContent className="p-5 text-sm text-muted-foreground">
          Could not load your practice history.
        </CardContent>
      </Card>
    );
  }

  const items = data?.items ?? [];
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
      <CardContent className="divide-y divide-border p-2">
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
                {item.category.name} · {item.topic.name}
              </span>
            </span>
            <Badge variant={DIFFICULTY_TONE[item.difficulty]}>{item.difficulty}</Badge>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
