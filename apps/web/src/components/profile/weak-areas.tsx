'use client';

import { Crosshair } from 'lucide-react';
import Link from 'next/link';
import type { WeakAreaDto } from '@apteez/types';
import { Badge, Button, Card, CardContent, CardTitle, EmptyState, Skeleton } from '@apteez/ui';

const SEVERITY_TONE = { high: 'destructive', medium: 'warning', low: 'outline' } as const;

export function WeakAreas({
  items,
  isLoading,
}: {
  items: WeakAreaDto[] | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon={Crosshair}
        title="No weak areas detected"
        description="Keep solving — topics with enough attempts are evaluated on accuracy, recency, and pace."
      />
    );
  }
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <CardTitle className="text-card-title">Weak areas</CardTitle>
        <ul className="space-y-3">
          {items.slice(0, 5).map((row) => (
            <li key={row.topicSlug} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{row.topicName}</span>
                <Badge variant={SEVERITY_TONE[row.severity]}>{row.severity}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  <span className="font-metric">
                    {row.accuracy === null ? '—' : `${row.accuracy}%`}
                  </span>
                  {' · '}
                  <span className="font-metric">{row.attempts}</span> attempts
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{row.reason}</p>
              <p className="mt-1 text-xs text-subtle-foreground">{row.domainName}</p>
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" asChild>
          <Link href="/explore">Practice these topics</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
