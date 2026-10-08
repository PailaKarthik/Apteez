'use client';

import * as React from 'react';
import { Card, CardContent, EmptyState, ErrorState, Progress, cn } from '@apteez/ui';
import { LayoutGrid } from 'lucide-react';
import { SectionHeader } from '@apteez/ui';
import { usePracticeAreas } from '@/hooks/use-home';
import { usePrefetchProblemsFeed } from '@/hooks/use-problems';
import { FolderProblems } from './folder-problems';

function PracticeAreaSkeletons(): React.JSX.Element {
  return (
    <div
      className="flex snap-x gap-2.5 overflow-x-auto pb-1"
      aria-busy="true"
      aria-label="Loading practice areas"
      aria-hidden
    >
      {Array.from({ length: 6 }, (_, index) => (
        <Card
          key={index}
          className="w-48 shrink-0 animate-fade-up"
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <CardContent className="space-y-2.5 p-4">
            <div className="flex items-start justify-between">
              <div className="skeleton-shine size-9 rounded-xl" />
              <div className="skeleton-shine h-3 w-10 rounded-md" />
            </div>
            <div className="skeleton-shine h-3.5 w-3/4 rounded-md" />
            <div className="loading-rail h-1.5" aria-hidden>
              <span />
            </div>
            <div className="skeleton-shine h-3 w-1/2 rounded-md" />
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
        <div className="fade-x scrollbar-hide -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-3 pt-2">
          {(data ?? []).map((area, index) => {
            const selected = area.slug === openSlug;
            const complete = area.completionPct >= 100;
            return (
              <div
                key={area.id}
                className="animate-fade-up shrink-0"
                style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
              >
                <button
                  type="button"
                  onClick={() => setOpenSlug((current) => (current === area.slug ? null : area.slug))}
                  onMouseEnter={() => prefetchFeed({ category: area.slug, sort: 'newest' }, 8)}
                  onFocus={() => prefetchFeed({ category: area.slug, sort: 'newest' }, 8)}
                  aria-expanded={selected}
                  aria-label={`${area.name}, ${area.problemCount} problems, ${area.completionPct}% complete. ${selected ? 'Collapse.' : 'Show problems.'}`}
                  className="group w-48 snap-start text-left"
                >
                  <Card
                    className={cn(
                      'card-lift card-shine glow-card h-full focus-visible:ring-2 focus-visible:ring-ring',
                      selected && 'ring-1 ring-primary/40',
                    )}
                    data-selected={selected}
                  >
                    <CardContent className="flex h-full flex-col gap-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="icon-tile size-9 text-base font-extrabold" aria-hidden>
                          {area.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 font-metric text-[11px] font-semibold text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
                          {area.problemCount.toLocaleString()}
                        </span>
                      </div>
                      <p
                        className="truncate text-[13px] font-semibold text-foreground transition-colors group-hover:text-primary"
                        title={area.name}
                      >
                        {area.name}
                      </p>
                      <div className="mt-auto space-y-1.5 pt-1">
                        <Progress
                          value={area.completionPct}
                          tone={complete ? 'success' : 'brand'}
                          size="sm"
                          aria-label={`${area.completionPct}% complete`}
                        />
                        <p className="truncate text-[11px] text-muted-foreground">
                          {complete ? (
                            <span className="font-semibold text-success">✓ mastered · </span>
                          ) : (
                            <>{area.completionPct}% · </>
                          )}
                          <span className="font-metric">
                            {area.solvedCount}/{area.problemCount}
                          </span>
                          {selected ? ' · open' : ''}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              </div>
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
