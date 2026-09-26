'use client';

import * as React from 'react';
import { Card, CardContent, EmptyState, ErrorState, Progress, Skeleton, cn } from '@apteez/ui';
import { LayoutGrid } from 'lucide-react';
import { SectionHeader } from '@apteez/ui';
import { usePracticeAreas } from '@/hooks/use-home';
import { usePrefetchProblemsFeed } from '@/hooks/use-problems';
import { FolderProblems } from './folder-problems';

function PracticeAreaSkeletons(): React.JSX.Element {
  return (
    <div
      className="flex gap-2.5 overflow-hidden"
      aria-busy="true"
      aria-label="Loading practice areas"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Card key={index} className="w-44 shrink-0">
          <CardContent className="space-y-2 p-3">
            <div className="flex items-start justify-between">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-1.5 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Practice areas: taxonomy categories with live problem counts and the
 * caller's solved progress from `GET /practice-areas`. Each card links to
 * its slice of the library.
 */
export function PracticeAreas(): React.JSX.Element {
  const { data, isPending, isError, refetch } = usePracticeAreas();
  const [openSlug, setOpenSlug] = React.useState<string | null>(null);
  const prefetchFeed = usePrefetchProblemsFeed();

  const areas = data ?? [];
  const open = areas.find((area) => area.slug === openSlug) ?? null;

  return (
    <section aria-label="Practice areas" className="space-y-4">
      <SectionHeader
        title="Practice Areas"
        description="Every category in the library, with your completion. Tap one to read its problems here."
      />
      {isPending ? (
        <PracticeAreaSkeletons />
      ) : isError ? (
        <ErrorState
          title="Could not load practice areas"
          description="The catalog did not respond. Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No practice areas yet"
          description="Areas appear here once categories hold published problems."
        />
      ) : (
        <div className="flex snap-x gap-2.5 overflow-x-auto px-0.5 pb-2 pt-2">
          {(data ?? []).map((area) => {
            const selected = area.slug === openSlug;
            return (
              <button
                key={area.id}
                type="button"
                onClick={() => setOpenSlug((current) => (current === area.slug ? null : area.slug))}
                onMouseEnter={() => prefetchFeed({ category: area.slug, sort: 'newest' }, 8)}
                onFocus={() => prefetchFeed({ category: area.slug, sort: 'newest' }, 8)}
                aria-expanded={selected}
                aria-label={`${area.name}, ${area.problemCount} problems, ${area.completionPct}% complete. ${selected ? 'Collapse.' : 'Show problems.'}`}
                className="w-44 shrink-0 snap-start text-left"
              >
                <Card
                  className={cn(
                    'glow-card h-full hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring',
                    selected && 'ring-1 ring-primary/30',
                  )}
                  data-selected={selected}
                >
                  <CardContent className="flex h-full flex-col gap-1.5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-base font-bold text-primary"
                        aria-hidden
                      >
                        {area.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="font-metric text-[11px] text-muted-foreground">
                        {area.problemCount.toLocaleString()}
                      </span>
                    </div>
                    <p
                      className="truncate text-[13px] font-semibold text-foreground"
                      title={area.name}
                    >
                      {area.name}
                    </p>
                    <div className="mt-auto space-y-1 pt-1">
                      <Progress
                        value={area.completionPct}
                        aria-label={`${area.completionPct}% complete`}
                      />
                      <p className="truncate text-[11px] text-muted-foreground">
                        {area.completionPct}% ·{' '}
                        <span className="font-metric">
                          {area.solvedCount}/{area.problemCount}
                        </span>
                        {selected ? ' · open' : ''}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}
      {open ? (
        <FolderProblems
          title={open.name}
          subtitle={`${open.problemCount.toLocaleString()} problems · ${open.completionPct}% complete`}
          filter={{ category: open.slug }}
          onClose={() => setOpenSlug(null)}
        />
      ) : null}
    </section>
  );
}
